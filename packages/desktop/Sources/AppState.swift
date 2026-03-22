import SwiftUI
import Combine

// MARK: - Navigation

enum NavigationItem: String, CaseIterable, Identifiable {
    case overview
    case projects
    case search
    case sync
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .projects: return "Projects"
        case .search: return "Search"
        case .sync: return "Sync"
        case .settings: return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .projects: return "folder"
        case .search: return "magnifyingglass"
        case .sync: return "arrow.triangle.2.circlepath"
        case .settings: return "gearshape"
        }
    }
}

// MARK: - App State

@MainActor
final class AppState: ObservableObject {
    // MARK: - Published Properties

    @Published var daemonStatus: DaemonStatus = .unknown
    @Published var syncStatus: SyncState = .disabled
    @Published var pendingSummaryCount: Int = 0
    @Published var selectedNavigation: NavigationItem = .overview
    @Published var activeProjectId: String?
    @Published var selectedMemory: Memory?

    // Data
    @Published var projects: [Project] = []
    @Published var recentMemories: [Memory] = []
    @Published var analytics: AnalyticsResponse?
    @Published var syncStatusResponse: SyncStatusResponse?

    // Loading / Error
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Onboarding
    @Published var isOnboardingComplete: Bool {
        didSet {
            UserDefaults.standard.set(isOnboardingComplete, forKey: "isOnboardingComplete")
        }
    }

    // Services
    private let sseClient = SSEClient()
    private var sseTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init() {
        self.isOnboardingComplete = UserDefaults.standard.bool(forKey: "isOnboardingComplete")

        // Observe daemon manager status
        DaemonManager.shared.$status
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newStatus in
                self?.daemonStatus = newStatus
            }
            .store(in: &cancellables)
    }

    // MARK: - Startup

    func initialize() async {
        DaemonManager.shared.startMonitoring()
        await refreshAll()
        connectSSE()
    }

    func shutdown() {
        DaemonManager.shared.stopMonitoring()
        sseClient.disconnect()
        sseTask?.cancel()
    }

    // MARK: - Data Loading

    func refreshAll() async {
        isLoading = true
        errorMessage = nil

        async let projectsResult = loadProjects()
        async let memoriesResult = loadRecentMemories()
        async let analyticsResult = loadAnalytics()
        async let syncResult = loadSyncStatus()

        _ = await (projectsResult, memoriesResult, analyticsResult, syncResult)

        isLoading = false
    }

    func loadProjects() async {
        do {
            let response = try await APIClient.shared.listProjects()
            projects = response.projects
        } catch {
            handleError(error, context: "loading projects")
        }
    }

    func loadRecentMemories() async {
        do {
            let response = try await APIClient.shared.listMemories(limit: 20)
            recentMemories = response.memories
        } catch {
            handleError(error, context: "loading memories")
        }
    }

    func loadAnalytics() async {
        do {
            analytics = try await APIClient.shared.getAnalytics()
        } catch {
            handleError(error, context: "loading analytics")
        }
    }

    func loadSyncStatus() async {
        do {
            let response = try await APIClient.shared.syncStatus()
            syncStatusResponse = response
            syncStatus = response.status
        } catch is CortexAPIError {
            syncStatus = .disabled
        } catch {
            handleError(error, context: "loading sync status")
        }
    }

    // MARK: - SSE

    func connectSSE() {
        sseTask?.cancel()
        sseTask = Task {
            for await event in sseClient.events() {
                await handleSSEEvent(event)
            }
        }
    }

    private func handleSSEEvent(_ event: SSEEvent) async {
        switch event.eventType {
        case .memorySaved:
            await loadRecentMemories()
            await loadAnalytics()
            if let data = event.data.data(using: .utf8),
               let info = try? JSONDecoder().decode([String: String].self, from: data) {
                NotificationManager.shared.notifyMemorySaved(
                    projectName: info["project_name"] ?? "Unknown",
                    memoryType: info["type"] ?? "unknown"
                )
            }

        case .syncCompleted:
            await loadSyncStatus()
            if let data = event.data.data(using: .utf8),
               let info = try? JSONDecoder().decode([String: Int].self, from: data),
               let count = info["memories_affected"] {
                NotificationManager.shared.notifySyncCompleted(memoriesAffected: count)
            }

        case .syncConflict:
            await loadSyncStatus()
            if let data = event.data.data(using: .utf8),
               let info = try? JSONDecoder().decode([String: Int].self, from: data),
               let count = info["count"] {
                NotificationManager.shared.notifySyncConflict(count: count)
            }

        case .summaryReady:
            pendingSummaryCount += 1
            if let data = event.data.data(using: .utf8),
               let info = try? JSONDecoder().decode([String: String].self, from: data) {
                NotificationManager.shared.notifySummaryReady(
                    projectName: info["project_name"] ?? "Unknown"
                )
            }

        case .healthChanged:
            DaemonManager.shared.checkHealth()

        case .unknown:
            break
        }
    }

    // MARK: - Actions

    func triggerSync() async {
        do {
            let response = try await APIClient.shared.syncNow()
            syncStatusResponse = response
            syncStatus = response.status
        } catch {
            handleError(error, context: "triggering sync")
        }
    }

    func deleteMemory(_ memory: Memory) async {
        do {
            try await APIClient.shared.deleteMemory(id: memory.id)
            recentMemories.removeAll { $0.id == memory.id }
            if selectedMemory?.id == memory.id {
                selectedMemory = nil
            }
            await loadAnalytics()
        } catch {
            handleError(error, context: "deleting memory")
        }
    }

    // MARK: - Error Handling

    private func handleError(_ error: Error, context: String) {
        if let apiError = error as? CortexAPIError {
            switch apiError {
            case .daemonOffline:
                // Don't show error for offline daemon - status indicator handles it
                return
            default:
                errorMessage = "Error \(context): \(apiError.localizedDescription)"
            }
        } else {
            errorMessage = "Error \(context): \(error.localizedDescription)"
        }
    }

    func dismissError() {
        errorMessage = nil
    }
}

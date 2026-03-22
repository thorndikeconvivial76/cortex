import SwiftUI

@main
struct CortexDesktopApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var daemonManager = DaemonManager.shared
    @StateObject private var notificationManager = NotificationManager.shared

    var body: some Scene {
        // MARK: - Menu Bar Extra
        MenuBarExtra {
            MenuBarView()
                .environmentObject(appState)
                .environmentObject(daemonManager)
        } label: {
            menuBarLabel
        }

        // MARK: - Main Window
        WindowGroup {
            Group {
                if appState.isOnboardingComplete {
                    MainWindow()
                } else {
                    OnboardingView()
                }
            }
            .environmentObject(appState)
            .environmentObject(daemonManager)
            .environmentObject(notificationManager)
            .task {
                await notificationManager.requestAuthorization()
                notificationManager.registerCategories()
                await appState.initialize()
            }
            .onDisappear {
                appState.shutdown()
            }
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1100, height: 720)

        // MARK: - Settings
        Settings {
            SettingsView()
                .environmentObject(appState)
                .environmentObject(daemonManager)
                .environmentObject(notificationManager)
        }
    }

    // MARK: - Menu Bar Label

    private var menuBarLabel: some View {
        HStack(spacing: 2) {
            Image(systemName: "brain")
            Image(systemName: statusDotIcon)
                .font(.system(size: 6))
                .foregroundColor(statusDotColor)
        }
    }

    private var statusDotIcon: String {
        "circle.fill"
    }

    private var statusDotColor: Color {
        switch appState.daemonStatus {
        case .running:
            switch appState.syncStatus {
            case .syncing: return .orange
            case .synced: return .green
            case .conflict: return .red
            default: return .green
            }
        case .stopped: return .red
        case .starting, .installing: return .orange
        case .unknown: return .gray
        }
    }
}

// MARK: - Color Extension

extension Color {
    static let cortexAccent = Color(red: 0x7C / 255, green: 0x6F / 255, blue: 0xE0 / 255)
    static let cortexBackground = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0F / 255)
    static let cortexSurface = Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x1F / 255)
    static let cortexBorder = Color(red: 0x2A / 255, green: 0x2A / 255, blue: 0x3A / 255)
    static let cortexMuted = Color(red: 0x8A / 255, green: 0x8A / 255, blue: 0x9A / 255)
}

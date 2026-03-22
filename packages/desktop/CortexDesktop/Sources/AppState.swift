import SwiftUI

enum DaemonStatus: String {
    case running, stopped, installing, unknown
}

enum SyncStatus: String {
    case synced, pending, conflict, disabled
}

@MainActor
class AppState: ObservableObject {
    @Published var daemonStatus: DaemonStatus = .unknown
    @Published var syncStatus: SyncStatus = .disabled
    @Published var pendingSummaryCount: Int = 0
    @Published var isOnboardingComplete: Bool = UserDefaults.standard.bool(forKey: "onboardingComplete")
    @Published var activeProjectId: String?

    func completeOnboarding() {
        isOnboardingComplete = true
        UserDefaults.standard.set(true, forKey: "onboardingComplete")
    }
}

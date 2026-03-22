import Foundation
import UserNotifications

@MainActor
final class NotificationManager: ObservableObject {
    static let shared = NotificationManager()

    @Published private(set) var isAuthorized = false
    @Published var notificationsEnabled = true

    private let center = UNUserNotificationCenter.current()

    private init() {}

    // MARK: - Authorization

    func requestAuthorization() async {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            isAuthorized = granted
        } catch {
            isAuthorized = false
        }
    }

    func checkAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
    }

    // MARK: - Notifications

    func sendNotification(
        title: String,
        body: String,
        identifier: String = UUID().uuidString,
        categoryIdentifier: String? = nil
    ) {
        guard isAuthorized && notificationsEnabled else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        if let category = categoryIdentifier {
            content.categoryIdentifier = category
        }

        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: nil // Deliver immediately
        )

        center.add(request) { error in
            if let error = error {
                print("[NotificationManager] Failed to deliver notification: \(error)")
            }
        }
    }

    // MARK: - Convenience Methods

    func notifyMemorySaved(projectName: String, memoryType: String) {
        sendNotification(
            title: "Memory Saved",
            body: "New \(memoryType) memory captured in \(projectName)",
            categoryIdentifier: "MEMORY_SAVED"
        )
    }

    func notifySyncCompleted(memoriesAffected: Int) {
        sendNotification(
            title: "Sync Complete",
            body: "\(memoriesAffected) memories synchronized",
            categoryIdentifier: "SYNC_COMPLETED"
        )
    }

    func notifySyncConflict(count: Int) {
        sendNotification(
            title: "Sync Conflict",
            body: "\(count) conflict\(count == 1 ? "" : "s") detected. Review required.",
            categoryIdentifier: "SYNC_CONFLICT"
        )
    }

    func notifySummaryReady(projectName: String) {
        sendNotification(
            title: "Summary Ready",
            body: "New AI summary available for \(projectName)",
            categoryIdentifier: "SUMMARY_READY"
        )
    }

    func notifyDaemonOffline() {
        sendNotification(
            title: "Cortex Offline",
            body: "The Cortex daemon has stopped running",
            categoryIdentifier: "DAEMON_STATUS"
        )
    }

    // MARK: - Category Registration

    func registerCategories() {
        let viewAction = UNNotificationAction(
            identifier: "VIEW_ACTION",
            title: "View",
            options: .foreground
        )

        let dismissAction = UNNotificationAction(
            identifier: "DISMISS_ACTION",
            title: "Dismiss",
            options: .destructive
        )

        let memorySavedCategory = UNNotificationCategory(
            identifier: "MEMORY_SAVED",
            actions: [viewAction, dismissAction],
            intentIdentifiers: []
        )

        let syncConflictCategory = UNNotificationCategory(
            identifier: "SYNC_CONFLICT",
            actions: [viewAction, dismissAction],
            intentIdentifiers: []
        )

        center.setNotificationCategories([memorySavedCategory, syncConflictCategory])
    }

    // MARK: - Cleanup

    func removeAllDelivered() {
        center.removeAllDeliveredNotifications()
    }
}

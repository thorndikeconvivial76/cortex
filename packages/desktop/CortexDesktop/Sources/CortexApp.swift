import SwiftUI

@main
struct CortexApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var daemonManager = DaemonManager()

    var body: some Scene {
        // Main Window
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(daemonManager)
                .onAppear {
                    daemonManager.startHealthCheck()
                }
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 800)

        // Menu Bar
        MenuBarExtra("Cortex", systemImage: daemonManager.menuBarIcon) {
            MenuBarView()
                .environmentObject(appState)
                .environmentObject(daemonManager)
        }
        .menuBarExtraStyle(.menu)

        // Settings
        Settings {
            SettingsView()
                .environmentObject(appState)
                .environmentObject(daemonManager)
        }
    }
}

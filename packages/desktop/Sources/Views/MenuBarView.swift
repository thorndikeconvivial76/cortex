import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var daemonManager: DaemonManager

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Status Header
            HStack {
                Image(systemName: daemonManager.status.icon)
                    .foregroundColor(statusColor)
                Text("Cortex \(daemonManager.status.displayName)")
                    .font(.headline)
                Spacer()
                if !daemonManager.version.isEmpty {
                    Text("v\(daemonManager.version)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            // Open Main Window
            Button {
                NSApp.activate(ignoringOtherApps: true)
                if let window = NSApp.windows.first(where: { $0.title.contains("Cortex") || $0.isKeyWindow }) {
                    window.makeKeyAndOrderFront(nil)
                }
            } label: {
                Label("Open Cortex", systemImage: "macwindow")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)

            Divider()

            // Sync Status
            if let syncResponse = appState.syncStatusResponse {
                HStack {
                    Image(systemName: appState.syncStatus.icon)
                        .foregroundColor(syncStatusColor)
                    if let lastSync = syncResponse.lastSyncAt {
                        Text("Last sync: \(lastSync, style: .relative) ago")
                            .font(.caption)
                    } else {
                        Text("Never synced")
                            .font(.caption)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }

            // Sync Toggle
            Button {
                Task {
                    await appState.triggerSync()
                }
            } label: {
                Label(
                    appState.syncStatus == .syncing ? "Syncing..." : "Sync Now",
                    systemImage: "arrow.triangle.2.circlepath"
                )
            }
            .disabled(appState.syncStatus == .syncing || appState.syncStatus == .disabled)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)

            Divider()

            // Daemon Controls
            if daemonManager.status == .running {
                Button {
                    daemonManager.restartDaemon()
                } label: {
                    Label("Restart Daemon", systemImage: "arrow.clockwise")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)

                Button {
                    daemonManager.stopDaemon()
                } label: {
                    Label("Stop Daemon", systemImage: "stop.circle")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            } else if daemonManager.status == .stopped {
                Button {
                    daemonManager.startDaemon()
                } label: {
                    Label("Start Daemon", systemImage: "play.circle")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }

            Divider()

            // Stats
            if let analytics = appState.analytics {
                HStack {
                    Image(systemName: "brain.head.profile")
                    Text("\(analytics.totalMemories) memories")
                    Spacer()
                    Text("\(analytics.totalProjects) projects")
                }
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }

            Divider()

            // Preferences
            Button {
                NSApp.activate(ignoringOtherApps: true)
                if #available(macOS 14.0, *) {
                    NSApp.mainMenu?.items.first(where: { $0.title == "CortexDesktop" })?
                        .submenu?.items.first(where: { $0.title == "Settings..." })?
                        .performAction()
                } else {
                    NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                }
            } label: {
                Label("Preferences...", systemImage: "gearshape")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)

            Divider()

            // Quit
            Button {
                NSApp.terminate(nil)
            } label: {
                Text("Quit Cortex")
            }
            .keyboardShortcut("q")
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
        }
        .frame(width: 260)
    }

    private var statusColor: Color {
        switch daemonManager.status {
        case .running: return .green
        case .stopped: return .red
        case .starting, .installing: return .orange
        case .unknown: return .gray
        }
    }

    private var syncStatusColor: Color {
        switch appState.syncStatus {
        case .synced: return .green
        case .pending, .syncing: return .orange
        case .conflict, .error: return .red
        case .disabled: return .gray
        }
    }
}

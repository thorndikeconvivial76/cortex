import SwiftUI

struct SidebarView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var daemonManager: DaemonManager
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        List(selection: $appState.selectedNavigation) {
            Section {
                ForEach(NavigationItem.allCases) { item in
                    NavigationLink(value: item) {
                        Label {
                            Text(item.title)
                        } icon: {
                            Image(systemName: item.icon)
                                .foregroundColor(.cortexAccent)
                        }
                        .badge(badgeCount(for: item))
                    }
                }
            }

            Section("Quick Stats") {
                if let analytics = appState.analytics {
                    HStack {
                        Image(systemName: "brain.head.profile")
                            .foregroundColor(.cortexMuted)
                        Text("\(analytics.totalMemories) memories")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Image(systemName: "folder")
                            .foregroundColor(.cortexMuted)
                        Text("\(analytics.totalProjects) projects")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    if analytics.memoriesThisWeek > 0 {
                        HStack {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                                .foregroundColor(.cortexMuted)
                            Text("+\(analytics.memoriesThisWeek) this week")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            Section {
                daemonStatusRow
            }
        }
        .listStyle(.sidebar)
        .frame(minWidth: 200)
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    Task { await appState.refreshAll() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh")
            }
        }
    }

    private func badgeCount(for item: NavigationItem) -> Int {
        switch item {
        case .sync:
            return appState.syncStatusResponse?.conflicts.filter { !$0.isResolved }.count ?? 0
        default:
            return 0
        }
    }

    private var daemonStatusRow: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(daemonStatusColor)
                .frame(width: 8, height: 8)
            Text(daemonManager.status.displayName)
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
            if daemonManager.status == .running, !daemonManager.version.isEmpty {
                Text("v\(daemonManager.version)")
                    .font(.caption2)
                    .foregroundColor(.cortexMuted)
            }
        }
        .padding(.vertical, 2)
    }

    private var daemonStatusColor: Color {
        switch daemonManager.status {
        case .running: return .green
        case .stopped: return .red
        case .starting, .installing: return .orange
        case .unknown: return .gray
        }
    }
}

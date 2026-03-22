import SwiftUI

struct MainWindow: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        NavigationSplitView {
            SidebarView()
        } detail: {
            detailView
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 800, minHeight: 500)
        .background(backgroundColor)
        .overlay(alignment: .top) {
            errorBanner
        }
    }

    @ViewBuilder
    private var detailView: some View {
        switch appState.selectedNavigation {
        case .overview:
            OverviewView()
        case .projects:
            if let projectId = appState.activeProjectId {
                ProjectDetailView(projectId: projectId)
            } else {
                ProjectsView()
            }
        case .search:
            SearchView()
        case .sync:
            SyncView()
        case .settings:
            SettingsView()
        }
    }

    @ViewBuilder
    private var errorBanner: some View {
        if let error = appState.errorMessage {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                Text(error)
                    .font(.caption)
                Spacer()
                Button("Dismiss") {
                    appState.dismissError()
                }
                .buttonStyle(.plain)
                .font(.caption)
                .foregroundColor(.cortexAccent)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var backgroundColor: Color {
        colorScheme == .dark ? Color.cortexBackground : Color(.windowBackgroundColor)
    }
}

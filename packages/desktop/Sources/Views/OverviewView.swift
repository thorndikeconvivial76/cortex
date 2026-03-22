import SwiftUI

struct OverviewView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Overview")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        Text("Your AI memory at a glance")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Button {
                        Task { await appState.refreshAll() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .padding(.bottom, 4)

                // Stat Cards
                if let analytics = appState.analytics {
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible()),
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 16) {
                        StatCard(
                            label: "Total Memories",
                            value: "\(analytics.totalMemories)",
                            subtitle: "+\(analytics.memoriesThisWeek) this week",
                            icon: "brain.head.profile",
                            color: .cortexAccent
                        )

                        StatCard(
                            label: "Projects",
                            value: "\(analytics.totalProjects)",
                            subtitle: "\(appState.projects.filter { $0.lastActiveDescription == "Active now" || $0.lastActiveDescription.hasSuffix("h ago") }.count) active",
                            icon: "folder.fill",
                            color: .blue
                        )

                        StatCard(
                            label: "Sync Status",
                            value: appState.syncStatus.displayName,
                            subtitle: syncSubtitle,
                            icon: appState.syncStatus.icon,
                            color: syncColor
                        )

                        StatCard(
                            label: "Database",
                            value: analytics.dbSizeFormatted,
                            subtitle: "Avg importance: \(String(format: "%.1f", analytics.avgImportance))",
                            icon: "internaldrive.fill",
                            color: .orange
                        )
                    }
                } else {
                    statCardsPlaceholder
                }

                // Recent Activity
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Recent Activity")
                            .font(.title2)
                            .fontWeight(.semibold)
                        Spacer()
                        Button("View All") {
                            appState.selectedNavigation = .search
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(.cortexAccent)
                    }

                    if appState.recentMemories.isEmpty && !appState.isLoading {
                        emptyState
                    } else {
                        LazyVStack(spacing: 8) {
                            ForEach(appState.recentMemories.prefix(10)) { memory in
                                MemoryCard(memory: memory)
                                    .onTapGesture {
                                        appState.selectedMemory = memory
                                    }
                            }
                        }
                    }
                }

                // Quick Actions
                VStack(alignment: .leading, spacing: 12) {
                    Text("Quick Actions")
                        .font(.title2)
                        .fontWeight(.semibold)

                    HStack(spacing: 12) {
                        quickActionButton(
                            title: "Sync Now",
                            icon: "arrow.triangle.2.circlepath",
                            color: .blue
                        ) {
                            Task { await appState.triggerSync() }
                        }

                        quickActionButton(
                            title: "Search Memories",
                            icon: "magnifyingglass",
                            color: .cortexAccent
                        ) {
                            appState.selectedNavigation = .search
                        }

                        quickActionButton(
                            title: "View Projects",
                            icon: "folder",
                            color: .green
                        ) {
                            appState.selectedNavigation = .projects
                        }
                    }
                }

                // Top Tags
                if let analytics = appState.analytics, !analytics.topTags.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Top Tags")
                            .font(.title2)
                            .fontWeight(.semibold)

                        FlowLayout(spacing: 8) {
                            ForEach(analytics.topTags.prefix(15), id: \.tag) { tagCount in
                                HStack(spacing: 4) {
                                    Text(tagCount.tag)
                                        .font(.caption)
                                    Text("\(tagCount.count)")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.cortexAccent.opacity(0.15))
                                .clipShape(Capsule())
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
        .task {
            if appState.analytics == nil {
                await appState.refreshAll()
            }
        }
    }

    private var syncSubtitle: String {
        if let response = appState.syncStatusResponse {
            if response.pendingChanges > 0 {
                return "\(response.pendingChanges) pending"
            }
            if let lastSync = response.lastSyncAt {
                let formatter = RelativeDateTimeFormatter()
                formatter.unitsStyle = .abbreviated
                return formatter.localizedString(for: lastSync, relativeTo: Date())
            }
        }
        return "Not configured"
    }

    private var syncColor: Color {
        switch appState.syncStatus {
        case .synced: return .green
        case .pending, .syncing: return .orange
        case .conflict, .error: return .red
        case .disabled: return .gray
        }
    }

    private var statCardsPlaceholder: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 16) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.cortexSurface)
                    .frame(height: 100)
                    .overlay(ProgressView().scaleEffect(0.8))
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "brain.head.profile")
                .font(.system(size: 40))
                .foregroundColor(.cortexMuted)
            Text("No memories yet")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Start coding with Claude Code to capture memories automatically")
                .font(.caption)
                .foregroundColor(.cortexMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
        .background(Color.cortexSurface.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func quickActionButton(
        title: String,
        icon: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Text(title)
                    .font(.subheadline)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.cortexSurface)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: ProposedViewSize(result.sizes[index])
            )
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> LayoutResult {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var sizes: [CGSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            sizes.append(size)

            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }

            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return LayoutResult(
            size: CGSize(width: maxWidth, height: y + rowHeight),
            positions: positions,
            sizes: sizes
        )
    }

    struct LayoutResult {
        let size: CGSize
        let positions: [CGPoint]
        let sizes: [CGSize]
    }
}

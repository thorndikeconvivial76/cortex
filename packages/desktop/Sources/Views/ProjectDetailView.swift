import SwiftUI

struct ProjectDetailView: View {
    let projectId: String
    @EnvironmentObject var appState: AppState
    @State private var project: Project?
    @State private var memories: [Memory] = []
    @State private var selectedType: MemoryType?
    @State private var sortBy: MemorySortOrder = .newest
    @State private var isLoading = false
    @Environment(\.colorScheme) var colorScheme

    enum MemorySortOrder: String, CaseIterable {
        case newest = "Newest"
        case oldest = "Oldest"
        case importance = "Importance"
    }

    var body: some View {
        HSplitView {
            // Memory List
            VStack(alignment: .leading, spacing: 0) {
                // Header
                header
                    .padding(24)
                    .padding(.bottom, 0)

                // Filters
                filterBar
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)

                // Memory List
                if isLoading {
                    Spacer()
                    ProgressView()
                        .frame(maxWidth: .infinity)
                    Spacer()
                } else if sortedMemories.isEmpty {
                    Spacer()
                    emptyState
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(sortedMemories) { memory in
                                MemoryCard(memory: memory, showProject: false)
                                    .onTapGesture {
                                        appState.selectedMemory = memory
                                    }
                                    .background(
                                        appState.selectedMemory?.id == memory.id
                                            ? Color.cortexAccent.opacity(0.1)
                                            : Color.clear
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                    }
                }
            }
            .frame(minWidth: 400)

            // Detail Panel
            if let memory = appState.selectedMemory {
                MemoryDetailPanel(memory: memory)
                    .frame(minWidth: 300, idealWidth: 350)
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button {
                    appState.activeProjectId = nil
                } label: {
                    Image(systemName: "chevron.left")
                }
                .help("Back to Projects")
            }
        }
        .task {
            await loadData()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                if let project = project {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(project.name)
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        HStack(spacing: 12) {
                            Text("\(memories.count) memories")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            if let path = project.path {
                                Text(path)
                                    .font(.caption)
                                    .foregroundColor(.cortexMuted)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                        }
                    }
                } else {
                    ProgressView()
                }
                Spacer()
            }
        }
    }

    private var filterBar: some View {
        HStack(spacing: 8) {
            // Type filter
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    filterChip(title: "All", isSelected: selectedType == nil) {
                        selectedType = nil
                    }
                    ForEach(availableTypes, id: \.self) { type in
                        filterChip(
                            title: type.displayName,
                            isSelected: selectedType == type,
                            color: typeColor(type)
                        ) {
                            selectedType = selectedType == type ? nil : type
                        }
                    }
                }
            }

            Spacer()

            // Sort
            Picker("Sort", selection: $sortBy) {
                ForEach(MemorySortOrder.allCases, id: \.self) { order in
                    Text(order.rawValue).tag(order)
                }
            }
            .frame(width: 130)
        }
    }

    private func filterChip(
        title: String,
        isSelected: Bool,
        color: Color = .cortexAccent,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(isSelected ? color.opacity(0.2) : Color.cortexSurface)
                .foregroundColor(isSelected ? color : .secondary)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .strokeBorder(isSelected ? color.opacity(0.5) : Color.clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private var availableTypes: [MemoryType] {
        let types = Set(memories.map(\.type))
        return MemoryType.allCases.filter { types.contains($0) }
    }

    private var sortedMemories: [Memory] {
        var result = memories
        if let type = selectedType {
            result = result.filter { $0.type == type }
        }
        switch sortBy {
        case .newest: result.sort { $0.createdAt > $1.createdAt }
        case .oldest: result.sort { $0.createdAt < $1.createdAt }
        case .importance: result.sort { $0.importance > $1.importance }
        }
        return result
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundColor(.cortexMuted)
            Text("No memories found")
                .font(.headline)
                .foregroundColor(.secondary)
            if selectedType != nil {
                Text("Try removing the type filter")
                    .font(.caption)
                    .foregroundColor(.cortexMuted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }

    private func typeColor(_ type: MemoryType) -> Color {
        switch type.color {
        case "purple": return .purple
        case "blue": return .blue
        case "teal": return .teal
        case "orange": return .orange
        case "red": return .red
        case "green": return .green
        case "indigo": return .indigo
        case "cyan": return .cyan
        case "yellow": return .yellow
        case "pink": return .pink
        case "mint": return .mint
        default: return .gray
        }
    }

    private func loadData() async {
        isLoading = true
        do {
            project = try await APIClient.shared.getProject(id: projectId)
            let response = try await APIClient.shared.listMemories(projectId: projectId, limit: 200)
            memories = response.memories
        } catch {
            // Handled by AppState error display
        }
        isLoading = false
    }
}

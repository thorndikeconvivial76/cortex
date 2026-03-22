import SwiftUI

struct ProjectsView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var sortOrder: ProjectSortOrder = .lastActive
    @Environment(\.colorScheme) var colorScheme

    enum ProjectSortOrder: String, CaseIterable {
        case lastActive = "Last Active"
        case name = "Name"
        case memoryCount = "Memory Count"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Projects")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("\(appState.projects.count) projects")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Spacer()

                Picker("Sort", selection: $sortOrder) {
                    ForEach(ProjectSortOrder.allCases, id: \.self) { order in
                        Text(order.rawValue).tag(order)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 300)
            }
            .padding(24)
            .padding(.bottom, 0)

            // Search
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.cortexMuted)
                TextField("Filter projects...", text: $searchText)
                    .textFieldStyle(.plain)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.cortexMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Color.cortexSurface)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 24)
            .padding(.bottom, 16)

            // Project List
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(filteredProjects) { project in
                        ProjectRow(project: project)
                            .onTapGesture {
                                appState.activeProjectId = project.id
                            }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
        }
        .task {
            await appState.loadProjects()
        }
    }

    private var filteredProjects: [Project] {
        var result = appState.projects

        if !searchText.isEmpty {
            result = result.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                $0.techStack.contains(where: { $0.localizedCaseInsensitiveContains(searchText) })
            }
        }

        switch sortOrder {
        case .lastActive:
            result.sort { ($0.lastSessionAt ?? .distantPast) > ($1.lastSessionAt ?? .distantPast) }
        case .name:
            result.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case .memoryCount:
            result.sort { $0.memoryCount > $1.memoryCount }
        }

        return result
    }
}

// MARK: - Project Row

struct ProjectRow: View {
    let project: Project
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        HStack(spacing: 16) {
            // Icon
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.cortexAccent.opacity(0.15))
                .frame(width: 44, height: 44)
                .overlay {
                    Image(systemName: "folder.fill")
                        .font(.title3)
                        .foregroundColor(.cortexAccent)
                }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(project.name)
                    .font(.headline)

                if let path = project.path {
                    Text(path)
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Spacer()

            // Tech stack tags
            HStack(spacing: 4) {
                ForEach(project.techStack.prefix(3), id: \.self) { tech in
                    Text(tech)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.cortexSurface)
                        .clipShape(Capsule())
                }
            }

            // Memory count
            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: 4) {
                    Text("\(project.memoryCount)")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Image(systemName: "brain.head.profile")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                }
                Text(project.lastActiveDescription)
                    .font(.caption2)
                    .foregroundColor(.cortexMuted)
            }

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.cortexMuted)
        }
        .padding(12)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .contentShape(Rectangle())
    }

    private var cardBackground: some ShapeStyle {
        colorScheme == .dark
            ? AnyShapeStyle(Color.cortexSurface)
            : AnyShapeStyle(Color(.controlBackgroundColor))
    }
}

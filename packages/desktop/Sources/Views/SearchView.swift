import SwiftUI
import Combine

struct SearchView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var selectedType: MemoryType?
    @State private var results: [SearchResult] = []
    @State private var isSearching = false
    @State private var hasSearched = false
    @State private var searchTask: Task<Void, Never>?
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Search")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text("Search across all your memories")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(24)
            .padding(.bottom, 0)

            // Search Bar
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.cortexMuted)
                    .font(.title3)

                TextField("Search memories...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .onSubmit {
                        performSearch()
                    }

                if isSearching {
                    ProgressView()
                        .scaleEffect(0.7)
                }

                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        results = []
                        hasSearched = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.cortexMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
            .background(Color.cortexSurface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
            .onChange(of: searchText) { newValue in
                debounceSearch(query: newValue)
            }

            // Type Filter
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    typeFilterChip(title: "All Types", type: nil)
                    ForEach(MemoryType.allCases) { type in
                        typeFilterChip(title: type.displayName, type: type)
                    }
                }
                .padding(.horizontal, 24)
            }
            .padding(.bottom, 16)

            // Results
            ScrollView {
                LazyVStack(spacing: 8) {
                    if hasSearched && results.isEmpty && !isSearching {
                        noResultsView
                    } else if !hasSearched && results.isEmpty {
                        searchPromptView
                    } else {
                        // Result count
                        HStack {
                            Text("\(results.count) results")
                                .font(.caption)
                                .foregroundColor(.cortexMuted)
                            Spacer()
                        }
                        .padding(.horizontal, 24)

                        ForEach(results) { result in
                            SearchResultRow(result: result)
                                .onTapGesture {
                                    appState.selectedMemory = result.memory
                                }
                                .padding(.horizontal, 24)
                        }
                    }
                }
                .padding(.bottom, 24)
            }
        }
    }

    // MARK: - Components

    private func typeFilterChip(title: String, type: MemoryType?) -> some View {
        Button {
            selectedType = type
            if hasSearched { performSearch() }
        } label: {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(selectedType == type ? Color.cortexAccent.opacity(0.2) : Color.cortexSurface)
                .foregroundColor(selectedType == type ? .cortexAccent : .secondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var noResultsView: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 36))
                .foregroundColor(.cortexMuted)
            Text("No results found")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Try a different search term or remove filters")
                .font(.caption)
                .foregroundColor(.cortexMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(60)
    }

    private var searchPromptView: some View {
        VStack(spacing: 12) {
            Image(systemName: "text.magnifyingglass")
                .font(.system(size: 36))
                .foregroundColor(.cortexMuted)
            Text("Search your memories")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Type to search across all projects and memory types")
                .font(.caption)
                .foregroundColor(.cortexMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(60)
    }

    // MARK: - Search Logic

    private func debounceSearch(query: String) {
        searchTask?.cancel()
        guard !query.isEmpty else {
            results = []
            hasSearched = false
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms debounce
            guard !Task.isCancelled else { return }
            performSearch()
        }
    }

    private func performSearch() {
        guard !searchText.isEmpty else { return }
        Task {
            isSearching = true
            do {
                let response = try await APIClient.shared.searchMemories(
                    query: searchText,
                    type: selectedType
                )
                results = response.results
            } catch {
                results = []
            }
            hasSearched = true
            isSearching = false
        }
    }
}

// MARK: - Search Result Row

struct SearchResultRow: View {
    let result: SearchResult
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TypeBadge(type: result.memory.type)

                Spacer()

                // Relevance score
                HStack(spacing: 4) {
                    Image(systemName: "target")
                        .font(.caption2)
                    Text(String(format: "%.0f%%", result.score * 100))
                        .font(.caption)
                }
                .foregroundColor(.cortexMuted)

                Text(result.memory.ageDescription)
                    .font(.caption)
                    .foregroundColor(.cortexMuted)
            }

            Text(result.memory.contentPreview)
                .font(.callout)
                .lineLimit(3)

            // Highlights
            if let highlights = result.highlights, !highlights.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "text.quote")
                        .font(.caption2)
                        .foregroundColor(.cortexAccent)
                    Text(highlights.first ?? "")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            // Tags
            if !result.memory.tags.isEmpty {
                HStack(spacing: 4) {
                    ForEach(result.memory.tags.prefix(4), id: \.self) { tag in
                        Text(tag)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.cortexAccent.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }
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

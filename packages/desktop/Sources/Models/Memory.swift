import Foundation

// MARK: - Memory Type

enum MemoryType: String, Codable, CaseIterable, Identifiable {
    case decision
    case pattern
    case preference
    case architecture
    case bug
    case context
    case workflow
    case snippet
    case documentation
    case learning
    case todo
    case review

    var id: String { rawValue }

    var displayName: String {
        rawValue.capitalized
    }

    var icon: String {
        switch self {
        case .decision: return "arrow.triangle.branch"
        case .pattern: return "square.grid.3x3"
        case .preference: return "slider.horizontal.3"
        case .architecture: return "building.columns"
        case .bug: return "ladybug"
        case .context: return "text.quote"
        case .workflow: return "arrow.triangle.turn.up.right.diamond"
        case .snippet: return "chevron.left.forwardslash.chevron.right"
        case .documentation: return "doc.text"
        case .learning: return "lightbulb"
        case .todo: return "checklist"
        case .review: return "eye"
        }
    }

    var color: String {
        switch self {
        case .decision: return "purple"
        case .pattern: return "blue"
        case .preference: return "teal"
        case .architecture: return "orange"
        case .bug: return "red"
        case .context: return "gray"
        case .workflow: return "green"
        case .snippet: return "indigo"
        case .documentation: return "cyan"
        case .learning: return "yellow"
        case .todo: return "pink"
        case .review: return "mint"
        }
    }
}

// MARK: - Memory Model

struct Memory: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String
    let type: MemoryType
    var content: String
    var reason: String?
    var tags: [String]
    var importance: Double
    var confidence: Double
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case projectId = "project_id"
        case type
        case content
        case reason
        case tags
        case importance
        case confidence
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var ageDescription: String {
        let interval = Date().timeIntervalSince(createdAt)
        let minutes = Int(interval / 60)
        let hours = Int(interval / 3600)
        let days = Int(interval / 86400)
        let weeks = Int(interval / 604800)

        if minutes < 1 { return "Just now" }
        if minutes < 60 { return "\(minutes)m ago" }
        if hours < 24 { return "\(hours)h ago" }
        if days < 7 { return "\(days)d ago" }
        return "\(weeks)w ago"
    }

    var contentPreview: String {
        let maxLength = 200
        if content.count <= maxLength { return content }
        return String(content.prefix(maxLength)) + "..."
    }

    var importanceLevel: String {
        if importance >= 0.8 { return "Critical" }
        if importance >= 0.6 { return "High" }
        if importance >= 0.4 { return "Medium" }
        return "Low"
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Memory, rhs: Memory) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Memory Create/Update

struct MemoryCreateRequest: Codable {
    let projectId: String
    let type: MemoryType
    let content: String
    let reason: String?
    let tags: [String]
    let importance: Double

    enum CodingKeys: String, CodingKey {
        case projectId = "project_id"
        case type
        case content
        case reason
        case tags
        case importance
    }
}

struct MemoryUpdateRequest: Codable {
    var content: String?
    var reason: String?
    var tags: [String]?
    var importance: Double?
}

// MARK: - Memory List Response

struct MemoryListResponse: Codable {
    let memories: [Memory]
    let total: Int
    let page: Int
    let limit: Int
}

// MARK: - Search Response

struct SearchResult: Codable, Identifiable {
    let memory: Memory
    let score: Double
    let highlights: [String]?

    var id: String { memory.id }
}

struct SearchResponse: Codable {
    let results: [SearchResult]
    let total: Int
    let query: String
}

import Foundation

struct Project: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let path: String?
    let gitRemote: String?
    let techStack: [String]
    let memoryCount: Int
    let lastSessionAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case path
        case gitRemote = "git_remote"
        case techStack = "tech_stack"
        case memoryCount = "memory_count"
        case lastSessionAt = "last_session_at"
    }

    var lastActiveDescription: String {
        guard let lastSession = lastSessionAt else { return "Never" }
        let interval = Date().timeIntervalSince(lastSession)
        let hours = Int(interval / 3600)
        let days = Int(interval / 86400)

        if hours < 1 { return "Active now" }
        if hours < 24 { return "\(hours)h ago" }
        if days < 7 { return "\(days)d ago" }
        if days < 30 { return "\(days / 7)w ago" }
        return "\(days / 30)mo ago"
    }

    var directoryName: String {
        if let path = path {
            return (path as NSString).lastPathComponent
        }
        return name
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Project, rhs: Project) -> Bool {
        lhs.id == rhs.id
    }
}

struct ProjectListResponse: Codable {
    let projects: [Project]
    let total: Int
}

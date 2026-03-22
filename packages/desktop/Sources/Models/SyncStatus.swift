import Foundation

// MARK: - Sync Status

enum SyncState: String, Codable {
    case synced
    case pending
    case syncing
    case conflict
    case disabled
    case error

    var displayName: String {
        switch self {
        case .synced: return "Synced"
        case .pending: return "Pending"
        case .syncing: return "Syncing..."
        case .conflict: return "Conflict"
        case .disabled: return "Local Only"
        case .error: return "Error"
        }
    }

    var icon: String {
        switch self {
        case .synced: return "checkmark.circle.fill"
        case .pending: return "arrow.triangle.2.circlepath"
        case .syncing: return "arrow.triangle.2.circlepath.circle.fill"
        case .conflict: return "exclamationmark.triangle.fill"
        case .disabled: return "externaldrive.fill"
        case .error: return "xmark.circle.fill"
        }
    }

    var colorName: String {
        switch self {
        case .synced: return "green"
        case .pending: return "orange"
        case .syncing: return "blue"
        case .conflict: return "red"
        case .disabled: return "gray"
        case .error: return "red"
        }
    }
}

struct SyncStatusResponse: Codable {
    let status: SyncState
    let lastSyncAt: Date?
    let pendingChanges: Int
    let machines: [SyncMachine]
    let conflicts: [SyncConflict]

    enum CodingKeys: String, CodingKey {
        case status
        case lastSyncAt = "last_sync_at"
        case pendingChanges = "pending_changes"
        case machines
        case conflicts
    }
}

struct SyncMachine: Codable, Identifiable {
    let id: String
    let name: String
    let platform: String
    let lastSeen: Date
    let memoryCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case platform
        case lastSeen = "last_seen"
        case memoryCount = "memory_count"
    }

    var platformIcon: String {
        switch platform.lowercased() {
        case "macos", "darwin": return "laptopcomputer"
        case "linux": return "server.rack"
        case "windows": return "pc"
        default: return "desktopcomputer"
        }
    }

    var isOnline: Bool {
        Date().timeIntervalSince(lastSeen) < 300 // 5 minutes
    }
}

struct SyncConflict: Codable, Identifiable {
    let id: String
    let memoryId: String
    let localContent: String
    let remoteContent: String
    let localUpdatedAt: Date
    let remoteUpdatedAt: Date
    let resolvedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case memoryId = "memory_id"
        case localContent = "local_content"
        case remoteContent = "remote_content"
        case localUpdatedAt = "local_updated_at"
        case remoteUpdatedAt = "remote_updated_at"
        case resolvedAt = "resolved_at"
    }

    var isResolved: Bool {
        resolvedAt != nil
    }
}

struct SyncEvent: Codable, Identifiable {
    let id: String
    let type: String
    let message: String
    let timestamp: Date
    let memoriesAffected: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case message
        case timestamp
        case memoriesAffected = "memories_affected"
    }
}

struct SyncSetupRequest: Codable {
    let url: String
    let token: String
}

// MARK: - Analytics

struct AnalyticsResponse: Codable {
    let totalMemories: Int
    let totalProjects: Int
    let memoriesByType: [String: Int]
    let memoriesThisWeek: Int
    let avgImportance: Double
    let dbSizeBytes: Int
    let topTags: [TagCount]

    enum CodingKeys: String, CodingKey {
        case totalMemories = "total_memories"
        case totalProjects = "total_projects"
        case memoriesByType = "memories_by_type"
        case memoriesThisWeek = "memories_this_week"
        case avgImportance = "avg_importance"
        case dbSizeBytes = "db_size_bytes"
        case topTags = "top_tags"
    }

    var dbSizeFormatted: String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(dbSizeBytes))
    }
}

struct TagCount: Codable {
    let tag: String
    let count: Int
}

// MARK: - Config

struct CortexConfig: Codable {
    var syncEnabled: Bool
    var syncUrl: String?
    var summarizeEnabled: Bool
    var summarizeModel: String?
    var notificationsEnabled: Bool
    var autoStartDaemon: Bool
    var logLevel: String

    enum CodingKeys: String, CodingKey {
        case syncEnabled = "sync_enabled"
        case syncUrl = "sync_url"
        case summarizeEnabled = "summarize_enabled"
        case summarizeModel = "summarize_model"
        case notificationsEnabled = "notifications_enabled"
        case autoStartDaemon = "auto_start_daemon"
        case logLevel = "log_level"
    }
}

// MARK: - Health

struct HealthResponse: Codable {
    let status: String
    let version: String
    let uptime: Int
    let memoryCount: Int?

    enum CodingKeys: String, CodingKey {
        case status
        case version
        case uptime
        case memoryCount = "memory_count"
    }

    var isHealthy: Bool {
        status == "ok" || status == "healthy"
    }
}

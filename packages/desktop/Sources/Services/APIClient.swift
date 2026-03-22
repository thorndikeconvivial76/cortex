import Foundation

// MARK: - API Error

enum CortexAPIError: LocalizedError {
    case invalidURL
    case networkError(Error)
    case httpError(statusCode: Int, message: String?)
    case decodingError(Error)
    case daemonOffline
    case unknown(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .httpError(let code, let message):
            return "HTTP \(code): \(message ?? "Unknown error")"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .daemonOffline:
            return "Cortex daemon is not running"
        case .unknown(let message):
            return message
        }
    }
}

// MARK: - API Client

actor APIClient {
    static let shared = APIClient()

    private let baseURL = "http://127.0.0.1:7434"
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO8601 with fractional seconds
            let iso8601Formatter = ISO8601DateFormatter()
            iso8601Formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso8601Formatter.date(from: dateString) {
                return date
            }

            // Try ISO8601 without fractional seconds
            iso8601Formatter.formatOptions = [.withInternetDateTime]
            if let date = iso8601Formatter.date(from: dateString) {
                return date
            }

            // Try Unix timestamp
            if let timestamp = Double(dateString) {
                return Date(timeIntervalSince1970: timestamp)
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(dateString)"
            )
        }

        self.encoder = JSONEncoder()
        self.encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    // MARK: - Health

    func health() async throws -> HealthResponse {
        return try await get("/api/health")
    }

    func isHealthy() async -> Bool {
        do {
            let response: HealthResponse = try await get("/api/health")
            return response.isHealthy
        } catch {
            return false
        }
    }

    // MARK: - Projects

    func listProjects() async throws -> ProjectListResponse {
        return try await get("/api/projects")
    }

    func getProject(id: String) async throws -> Project {
        return try await get("/api/projects/\(id)")
    }

    // MARK: - Memories

    func listMemories(
        projectId: String? = nil,
        type: MemoryType? = nil,
        limit: Int = 50,
        page: Int = 1
    ) async throws -> MemoryListResponse {
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "page", value: String(page))
        ]
        if let projectId = projectId {
            queryItems.append(URLQueryItem(name: "project_id", value: projectId))
        }
        if let type = type {
            queryItems.append(URLQueryItem(name: "type", value: type.rawValue))
        }
        return try await get("/api/memories", queryItems: queryItems)
    }

    func getMemory(id: String) async throws -> Memory {
        return try await get("/api/memories/\(id)")
    }

    func createMemory(body: MemoryCreateRequest) async throws -> Memory {
        return try await post("/api/memories", body: body)
    }

    func updateMemory(id: String, body: MemoryUpdateRequest) async throws -> Memory {
        return try await patch("/api/memories/\(id)", body: body)
    }

    func deleteMemory(id: String) async throws {
        let _: EmptyResponse = try await delete("/api/memories/\(id)")
    }

    func searchMemories(query: String, type: MemoryType? = nil) async throws -> SearchResponse {
        var queryItems = [URLQueryItem(name: "q", value: query)]
        if let type = type {
            queryItems.append(URLQueryItem(name: "type", value: type.rawValue))
        }
        return try await get("/api/memories/search", queryItems: queryItems)
    }

    // MARK: - Sync

    func syncStatus() async throws -> SyncStatusResponse {
        return try await get("/api/sync/status")
    }

    func syncNow() async throws -> SyncStatusResponse {
        return try await post("/api/sync/now", body: EmptyBody())
    }

    func syncSetup(url: String, token: String) async throws -> SyncStatusResponse {
        let request = SyncSetupRequest(url: url, token: token)
        return try await post("/api/sync/setup", body: request)
    }

    // MARK: - Analytics

    func getAnalytics() async throws -> AnalyticsResponse {
        return try await get("/api/analytics")
    }

    // MARK: - Config

    func getConfig() async throws -> CortexConfig {
        return try await get("/api/config")
    }

    func updateConfig(_ config: CortexConfig) async throws -> CortexConfig {
        return try await put("/api/config", body: config)
    }

    // MARK: - HTTP Methods

    private func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem] = []) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await execute(request)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = try buildRequest(path: path, method: "POST")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = try buildRequest(path: path, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func delete<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "DELETE")
        return try await execute(request)
    }

    // MARK: - Request Building

    private func buildRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = []
    ) throws -> URLRequest {
        guard var components = URLComponents(string: baseURL + path) else {
            throw CortexAPIError.invalidURL
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw CortexAPIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError where urlError.code == .cannotConnectToHost
            || urlError.code == .networkConnectionLost
            || urlError.code == .timedOut {
            throw CortexAPIError.daemonOffline
        } catch {
            throw CortexAPIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw CortexAPIError.unknown("Invalid response type")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8)
            throw CortexAPIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }

        // Handle empty responses
        if data.isEmpty, let emptyResponse = EmptyResponse() as? T {
            return emptyResponse
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw CortexAPIError.decodingError(error)
        }
    }
}

// MARK: - Helper Types

private struct EmptyBody: Encodable {}

struct EmptyResponse: Codable {
    init() {}
}

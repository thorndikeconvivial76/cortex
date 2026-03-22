import Foundation

// MARK: - SSE Event

struct SSEEvent {
    let event: String
    let data: String
    let id: String?

    enum EventType: String {
        case memorySaved = "memory.saved"
        case syncCompleted = "sync.completed"
        case syncConflict = "sync.conflict"
        case summaryReady = "summary.ready"
        case healthChanged = "health.changed"
        case unknown
    }

    var eventType: EventType {
        EventType(rawValue: event) ?? .unknown
    }
}

// MARK: - SSE Client

final class SSEClient: NSObject, @unchecked Sendable {
    private let url: URL
    private var task: URLSessionDataTask?
    private var session: URLSession?
    private var buffer = ""
    private var retryCount = 0
    private let maxRetries = Int.max
    private let baseDelay: TimeInterval = 1.0
    private let maxDelay: TimeInterval = 60.0
    private var isConnected = false
    private var shouldReconnect = true

    private var continuation: AsyncStream<SSEEvent>.Continuation?

    init(baseURL: String = "http://127.0.0.1:7434") {
        self.url = URL(string: "\(baseURL)/api/events")!
        super.init()
    }

    // MARK: - Public API

    func events() -> AsyncStream<SSEEvent> {
        AsyncStream { [weak self] continuation in
            guard let self = self else {
                continuation.finish()
                return
            }
            self.continuation = continuation
            continuation.onTermination = { [weak self] @Sendable _ in
                self?.disconnect()
            }
            self.connect()
        }
    }

    func connect() {
        guard !isConnected else { return }
        shouldReconnect = true

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = TimeInterval.infinity
        config.timeoutIntervalForResource = TimeInterval.infinity

        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

        task = session?.dataTask(with: request)
        task?.resume()
        isConnected = true
        retryCount = 0
    }

    func disconnect() {
        shouldReconnect = false
        isConnected = false
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        continuation?.finish()
        continuation = nil
    }

    // MARK: - Reconnection

    func resetRetryCount() {
        retryCount = 0
    }

    private func scheduleReconnect() {
        guard shouldReconnect else {
            continuation?.finish()
            return
        }

        isConnected = false
        task?.cancel()
        task = nil

        // Cap backoff at maxDelay, then keep retrying indefinitely at that interval
        let delay = min(baseDelay * pow(2.0, Double(retryCount)), maxDelay)
        retryCount += 1

        DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self else { return }
            self.connect()
        }
    }

    // MARK: - Parsing

    private func processBuffer() {
        let lines = buffer.components(separatedBy: "\n")
        var currentEvent = ""
        var currentData = ""
        var currentId: String?

        for line in lines {
            if line.isEmpty {
                // Empty line = end of event
                if !currentData.isEmpty {
                    let event = SSEEvent(
                        event: currentEvent.isEmpty ? "message" : currentEvent,
                        data: currentData.trimmingCharacters(in: .whitespacesAndNewlines),
                        id: currentId
                    )
                    continuation?.yield(event)
                }
                currentEvent = ""
                currentData = ""
                currentId = nil
            } else if line.hasPrefix("event:") {
                currentEvent = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                let data = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                if currentData.isEmpty {
                    currentData = data
                } else {
                    currentData += "\n" + data
                }
            } else if line.hasPrefix("id:") {
                currentId = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            }
            // Ignore retry: and comments (:)
        }

        // Keep incomplete event in buffer
        if let lastNewline = buffer.lastIndex(of: "\n") {
            buffer = String(buffer[buffer.index(after: lastNewline)...])
        }
    }
}

// MARK: - URLSessionDataDelegate

extension SSEClient: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        buffer += text
        processBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        isConnected = false
        if let error = error as? URLError, error.code == .cancelled {
            return // Intentional disconnect
        }
        scheduleReconnect()
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
            resetRetryCount()
            completionHandler(.allow)
        } else {
            completionHandler(.cancel)
            scheduleReconnect()
        }
    }
}

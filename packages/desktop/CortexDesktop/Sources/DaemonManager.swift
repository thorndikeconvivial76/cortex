import SwiftUI
import Foundation

@MainActor
class DaemonManager: ObservableObject {
    @Published var isHealthy: Bool = false
    @Published var healthCheckCount: Int = 0
    @Published var consecutiveFailures: Int = 0

    private var healthTimer: Timer?
    private let daemonURL = "http://127.0.0.1:7434"

    var menuBarIcon: String {
        isHealthy ? "brain.filled.head.profile" : "brain.head.profile"
    }

    // MARK: - Health Check

    func startHealthCheck() {
        checkHealth()
        healthTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.checkHealth()
            }
        }
    }

    func stopHealthCheck() {
        healthTimer?.invalidate()
        healthTimer = nil
    }

    func checkHealth() {
        guard let url = URL(string: "\(daemonURL)/api/health") else { return }

        var request = URLRequest(url: url)
        request.timeoutInterval = 2

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self = self else { return }

                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    self.isHealthy = true
                    self.consecutiveFailures = 0
                } else {
                    self.consecutiveFailures += 1
                    if self.consecutiveFailures >= 3 {
                        self.isHealthy = false
                    }
                }
                self.healthCheckCount += 1
            }
        }.resume()
    }

    // MARK: - Daemon Lifecycle

    func startDaemon() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/local/bin/cortex")
        process.arguments = ["init"]
        try? process.run()
    }

    func restartDaemon() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/local/bin/cortex")
        process.arguments = ["init"]
        try? process.run()

        // Check health after restart
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.checkHealth()
        }
    }
}

import Foundation

// MARK: - Daemon Status

enum DaemonStatus: String {
    case running
    case stopped
    case installing
    case starting
    case unknown

    var displayName: String {
        switch self {
        case .running: return "Running"
        case .stopped: return "Stopped"
        case .installing: return "Installing..."
        case .starting: return "Starting..."
        case .unknown: return "Unknown"
        }
    }

    var icon: String {
        switch self {
        case .running: return "circle.fill"
        case .stopped: return "circle.fill"
        case .installing: return "arrow.down.circle"
        case .starting: return "circle.dotted"
        case .unknown: return "questionmark.circle"
        }
    }

    var colorName: String {
        switch self {
        case .running: return "green"
        case .stopped: return "red"
        case .installing: return "orange"
        case .starting: return "yellow"
        case .unknown: return "gray"
        }
    }
}

// MARK: - Daemon Manager

@MainActor
final class DaemonManager: ObservableObject {
    static let shared = DaemonManager()

    @Published private(set) var status: DaemonStatus = .unknown
    @Published private(set) var version: String = ""
    @Published private(set) var uptime: Int = 0
    @Published private(set) var lastHealthCheck: Date?

    private var healthTimer: Timer?
    private let healthInterval: TimeInterval = 15.0
    private var daemonProcess: Process?

    private let supportDir: URL = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("Cortex", isDirectory: true)
    }()

    private let daemonBinaryName = "cortex-server"

    private init() {}

    // MARK: - Health Checking

    func startMonitoring() {
        checkHealth()
        healthTimer = Timer.scheduledTimer(withTimeInterval: healthInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.checkHealth()
            }
        }
    }

    func stopMonitoring() {
        healthTimer?.invalidate()
        healthTimer = nil
    }

    func checkHealth() {
        Task {
            do {
                let health = try await APIClient.shared.health()
                if health.isHealthy {
                    status = .running
                    version = health.version
                    uptime = health.uptime
                } else {
                    status = .stopped
                }
            } catch {
                if status != .installing && status != .starting {
                    status = .stopped
                }
            }
            lastHealthCheck = Date()
        }
    }

    // MARK: - Daemon Lifecycle

    func startDaemon() {
        guard status != .running && status != .starting else { return }
        status = .starting

        let daemonPath = daemonBinaryPath()

        guard FileManager.default.fileExists(atPath: daemonPath) else {
            status = .stopped
            return
        }

        Task.detached { [daemonPath] in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: daemonPath)
            process.arguments = ["serve"]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice

            // Set environment
            var env = ProcessInfo.processInfo.environment
            env["CORTEX_PORT"] = "7434"
            process.environment = env

            do {
                try process.run()
                await MainActor.run {
                    self.daemonProcess = process
                }

                // Wait a moment then check health
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await MainActor.run {
                    self.checkHealth()
                }
            } catch {
                await MainActor.run {
                    self.status = .stopped
                }
            }
        }
    }

    func stopDaemon() {
        daemonProcess?.terminate()
        daemonProcess = nil

        // Also try to kill by port
        let killProcess = Process()
        killProcess.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        killProcess.arguments = ["-f", daemonBinaryName]
        killProcess.standardOutput = FileHandle.nullDevice
        killProcess.standardError = FileHandle.nullDevice
        try? killProcess.run()
        killProcess.waitUntilExit()

        status = .stopped
    }

    func restartDaemon() {
        stopDaemon()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.startDaemon()
        }
    }

    // MARK: - Installation

    func installDaemon() async {
        status = .installing

        // Create support directory
        try? FileManager.default.createDirectory(
            at: supportDir,
            withIntermediateDirectories: true
        )

        // Check if bundled daemon exists in app resources
        if let bundledPath = Bundle.main.path(forResource: daemonBinaryName, ofType: nil) {
            let destPath = daemonBinaryPath()
            do {
                if FileManager.default.fileExists(atPath: destPath) {
                    try FileManager.default.removeItem(atPath: destPath)
                }
                try FileManager.default.copyItem(atPath: bundledPath, toPath: destPath)

                // Make executable
                try FileManager.default.setAttributes(
                    [.posixPermissions: 0o755],
                    ofItemAtPath: destPath
                )
                status = .stopped
            } catch {
                status = .unknown
            }
        } else {
            status = .unknown
        }
    }

    func isDaemonInstalled() -> Bool {
        FileManager.default.fileExists(atPath: daemonBinaryPath())
    }

    // MARK: - Launch Agent

    func registerLaunchAgent() throws {
        let plistPath = launchAgentPlistPath()
        let plistDir = (plistPath as NSString).deletingLastPathComponent

        try FileManager.default.createDirectory(
            atPath: plistDir,
            withIntermediateDirectories: true
        )

        let plistContent: [String: Any] = [
            "Label": "com.k2n2studio.cortex-daemon",
            "ProgramArguments": [daemonBinaryPath(), "serve"],
            "RunAtLoad": true,
            "KeepAlive": [
                "SuccessfulExit": false
            ],
            "EnvironmentVariables": [
                "CORTEX_PORT": "7434"
            ],
            "StandardOutPath": supportDir.appendingPathComponent("daemon.log").path,
            "StandardErrorPath": supportDir.appendingPathComponent("daemon-error.log").path
        ]

        let data = try PropertyListSerialization.data(
            fromPropertyList: plistContent,
            format: .xml,
            options: 0
        )
        try data.write(to: URL(fileURLWithPath: plistPath))

        // Load the launch agent
        let loadProcess = Process()
        loadProcess.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        loadProcess.arguments = ["load", plistPath]
        try loadProcess.run()
        loadProcess.waitUntilExit()
    }

    func unregisterLaunchAgent() throws {
        let plistPath = launchAgentPlistPath()
        guard FileManager.default.fileExists(atPath: plistPath) else { return }

        let unloadProcess = Process()
        unloadProcess.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        unloadProcess.arguments = ["unload", plistPath]
        try unloadProcess.run()
        unloadProcess.waitUntilExit()

        try FileManager.default.removeItem(atPath: plistPath)
    }

    // MARK: - Paths

    private func daemonBinaryPath() -> String {
        supportDir.appendingPathComponent(daemonBinaryName).path
    }

    private func launchAgentPlistPath() -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appendingPathComponent("Library/LaunchAgents/com.k2n2studio.cortex-daemon.plist")
            .path
    }
}

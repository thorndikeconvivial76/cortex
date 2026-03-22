import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var daemonManager: DaemonManager
    @EnvironmentObject var notificationManager: NotificationManager

    @State private var config: CortexConfig?
    @State private var syncUrl = ""
    @State private var syncToken = ""
    @State private var isLoading = false
    @State private var isSaving = false

    @AppStorage("appearance") private var appearance: AppearanceMode = .system
    @AppStorage("autoStartDaemon") private var autoStartDaemon = true
    @AppStorage("showMenuBarIcon") private var showMenuBarIcon = true
    @AppStorage("cortex.notifications.memorySaved") private var notifyMemorySaved = true
    @AppStorage("cortex.notifications.syncCompleted") private var notifySyncCompleted = true
    @AppStorage("cortex.notifications.syncConflicts") private var notifySyncConflicts = true
    @AppStorage("cortex.notifications.summaryReady") private var notifySummaryReady = true
    @AppStorage("cortex.notifications.daemonStatus") private var notifyDaemonStatus = true

    enum AppearanceMode: String, CaseIterable {
        case system = "System"
        case light = "Light"
        case dark = "Dark"
    }

    var body: some View {
        TabView {
            daemonTab
                .tabItem {
                    Label("Daemon", systemImage: "server.rack")
                }

            syncTab
                .tabItem {
                    Label("Sync", systemImage: "arrow.triangle.2.circlepath")
                }

            aiTab
                .tabItem {
                    Label("AI", systemImage: "brain")
                }

            appearanceTab
                .tabItem {
                    Label("Appearance", systemImage: "paintbrush")
                }

            notificationsTab
                .tabItem {
                    Label("Notifications", systemImage: "bell")
                }

            advancedTab
                .tabItem {
                    Label("Advanced", systemImage: "gearshape.2")
                }
        }
        .frame(width: 500, height: 400)
        .task {
            await loadConfig()
        }
    }

    // MARK: - Daemon Tab

    private var daemonTab: some View {
        Form {
            Section("Status") {
                HStack {
                    Text("Daemon Status")
                    Spacer()
                    Circle()
                        .fill(daemonStatusColor)
                        .frame(width: 10, height: 10)
                    Text(daemonManager.status.displayName)
                        .foregroundColor(.secondary)
                }

                if !daemonManager.version.isEmpty {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(daemonManager.version)
                            .foregroundColor(.secondary)
                    }
                }

                if daemonManager.uptime > 0 {
                    HStack {
                        Text("Uptime")
                        Spacer()
                        Text(formatUptime(daemonManager.uptime))
                            .foregroundColor(.secondary)
                    }
                }
            }

            Section("Controls") {
                Toggle("Auto-start daemon on login", isOn: $autoStartDaemon)
                    .onChange(of: autoStartDaemon) { newValue in
                        if newValue {
                            try? daemonManager.registerLaunchAgent()
                        } else {
                            try? daemonManager.unregisterLaunchAgent()
                        }
                    }

                Toggle("Show menu bar icon", isOn: $showMenuBarIcon)

                HStack {
                    Button("Start") {
                        daemonManager.startDaemon()
                    }
                    .disabled(daemonManager.status == .running)

                    Button("Stop") {
                        daemonManager.stopDaemon()
                    }
                    .disabled(daemonManager.status == .stopped)

                    Button("Restart") {
                        daemonManager.restartDaemon()
                    }
                    .disabled(daemonManager.status == .stopped)
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Sync Tab

    private var syncTab: some View {
        Form {
            Section("Configuration") {
                Toggle("Enable Sync", isOn: Binding(
                    get: { config?.syncEnabled ?? false },
                    set: { newValue in
                        config?.syncEnabled = newValue
                        Task { await saveConfig() }
                    }
                ))

                TextField("Sync Server URL", text: $syncUrl)
                    .textFieldStyle(.roundedBorder)

                SecureField("Authentication Token", text: $syncToken)
                    .textFieldStyle(.roundedBorder)

                Button("Connect") {
                    Task {
                        _ = try? await APIClient.shared.syncSetup(url: syncUrl, token: syncToken)
                        await appState.loadSyncStatus()
                    }
                }
                .disabled(syncUrl.isEmpty || syncToken.isEmpty)
            }

            Section("Status") {
                HStack {
                    Text("Sync State")
                    Spacer()
                    Text(appState.syncStatus.displayName)
                        .foregroundColor(.secondary)
                }

                if let response = appState.syncStatusResponse {
                    HStack {
                        Text("Connected Machines")
                        Spacer()
                        Text("\(response.machines.count)")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Pending Changes")
                        Spacer()
                        Text("\(response.pendingChanges)")
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - AI Tab

    private var aiTab: some View {
        Form {
            Section("Summarizer") {
                Toggle("Enable AI Summaries", isOn: Binding(
                    get: { config?.summarizeEnabled ?? false },
                    set: { newValue in
                        config?.summarizeEnabled = newValue
                        Task { await saveConfig() }
                    }
                ))

                if config?.summarizeEnabled == true {
                    Picker("Model", selection: Binding(
                        get: { config?.summarizeModel ?? "gpt-4o-mini" },
                        set: { newValue in
                            config?.summarizeModel = newValue
                            Task { await saveConfig() }
                        }
                    )) {
                        Text("GPT-4o Mini").tag("gpt-4o-mini")
                        Text("GPT-4o").tag("gpt-4o")
                        Text("Claude 3.5 Sonnet").tag("claude-3-5-sonnet")
                        Text("Claude 3 Haiku").tag("claude-3-haiku")
                    }
                }
            }

            Section("Privacy") {
                Text("AI summaries process memory content to generate concise overviews. Content is sent to the selected model provider.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Appearance Tab

    private var appearanceTab: some View {
        Form {
            Section("Theme") {
                Picker("Appearance", selection: $appearance) {
                    ForEach(AppearanceMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section("Accent Color") {
                HStack {
                    Text("Cortex Purple")
                    Spacer()
                    Circle()
                        .fill(Color.cortexAccent)
                        .frame(width: 20, height: 20)
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Notifications Tab

    private var notificationsTab: some View {
        Form {
            Section("Permissions") {
                HStack {
                    Text("Notification Access")
                    Spacer()
                    Text(notificationManager.isAuthorized ? "Granted" : "Not Granted")
                        .foregroundColor(notificationManager.isAuthorized ? .green : .red)
                }

                if !notificationManager.isAuthorized {
                    Button("Request Permission") {
                        Task { await notificationManager.requestAuthorization() }
                    }
                }
            }

            Section("Notification Types") {
                Toggle("Memory Saved", isOn: $notifyMemorySaved)
                Toggle("Sync Completed", isOn: $notifySyncCompleted)
                Toggle("Sync Conflicts", isOn: $notifySyncConflicts)
                Toggle("Summary Ready", isOn: $notifySummaryReady)
                Toggle("Daemon Status Changes", isOn: $notifyDaemonStatus)
            }

            Section {
                Toggle("Enable All Notifications", isOn: $notificationManager.notificationsEnabled)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Advanced Tab

    private var advancedTab: some View {
        Form {
            Section("Logging") {
                Picker("Log Level", selection: Binding(
                    get: { config?.logLevel ?? "info" },
                    set: { newValue in
                        config?.logLevel = newValue
                        Task { await saveConfig() }
                    }
                )) {
                    Text("Error").tag("error")
                    Text("Warn").tag("warn")
                    Text("Info").tag("info")
                    Text("Debug").tag("debug")
                }
            }

            Section("Database") {
                if let analytics = appState.analytics {
                    HStack {
                        Text("Database Size")
                        Spacer()
                        Text(analytics.dbSizeFormatted)
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Total Memories")
                        Spacer()
                        Text("\(analytics.totalMemories)")
                            .foregroundColor(.secondary)
                    }
                }
            }

            Section("Data") {
                Button("Open Data Directory") {
                    let appSupport = FileManager.default.urls(
                        for: .applicationSupportDirectory,
                        in: .userDomainMask
                    ).first!
                    let cortexDir = appSupport.appendingPathComponent("Cortex")
                    NSWorkspace.shared.open(cortexDir)
                }

                Button("View Logs") {
                    let appSupport = FileManager.default.urls(
                        for: .applicationSupportDirectory,
                        in: .userDomainMask
                    ).first!
                    let logFile = appSupport.appendingPathComponent("Cortex/daemon.log")
                    NSWorkspace.shared.open(logFile)
                }
            }

            Section("Reset") {
                Button("Reset Onboarding") {
                    appState.isOnboardingComplete = false
                }
                .foregroundColor(.red)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Helpers

    private var daemonStatusColor: Color {
        switch daemonManager.status {
        case .running: return .green
        case .stopped: return .red
        case .starting, .installing: return .orange
        case .unknown: return .gray
        }
    }

    private func formatUptime(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }

    private func loadConfig() async {
        isLoading = true
        do {
            config = try await APIClient.shared.getConfig()
            syncUrl = config?.syncUrl ?? ""
        } catch {
            // Config may not be available if daemon is offline
        }
        isLoading = false
    }

    private func saveConfig() async {
        guard var config = config else { return }
        isSaving = true
        do {
            self.config = try await APIClient.shared.updateConfig(config)
        } catch {
            // Handled by API error display
        }
        isSaving = false
    }
}

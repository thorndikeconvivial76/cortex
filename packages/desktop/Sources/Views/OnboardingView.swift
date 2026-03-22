import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var daemonManager: DaemonManager
    @State private var currentStep = 0
    @State private var syncUrl = ""
    @State private var syncToken = ""
    @State private var enableAI = false
    @State private var isDaemonHealthy = false
    @State private var isCheckingHealth = false
    @Environment(\.colorScheme) var colorScheme

    private let totalSteps = 5

    var body: some View {
        VStack(spacing: 0) {
            // Progress
            progressBar
                .padding(.top, 20)

            Spacer()

            // Step Content
            Group {
                switch currentStep {
                case 0: welcomeStep
                case 1: daemonStep
                case 2: syncStep
                case 3: aiStep
                case 4: doneStep
                default: EmptyView()
                }
            }
            .transition(.asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            ))
            .animation(.easeInOut(duration: 0.3), value: currentStep)

            Spacer()

            // Navigation
            navigationBar
                .padding(.bottom, 20)
        }
        .frame(width: 600, height: 500)
        .background(backgroundColor)
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        HStack(spacing: 4) {
            ForEach(0..<totalSteps, id: \.self) { step in
                RoundedRectangle(cornerRadius: 2)
                    .fill(step <= currentStep ? Color.cortexAccent : Color.cortexSurface)
                    .frame(height: 4)
            }
        }
        .padding(.horizontal, 40)
    }

    // MARK: - Step 1: Welcome

    private var welcomeStep: some View {
        VStack(spacing: 24) {
            Image(systemName: "brain.head.profile")
                .font(.system(size: 60))
                .foregroundColor(.cortexAccent)

            Text("Welcome to Cortex")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Your AI-powered development memory.\nCortex captures, organizes, and syncs your coding knowledge across machines.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 400)

            HStack(spacing: 24) {
                featureItem(icon: "brain", title: "Smart Capture", description: "Auto-captures decisions and patterns")
                featureItem(icon: "arrow.triangle.2.circlepath", title: "Multi-Machine", description: "Sync across all your devices")
                featureItem(icon: "magnifyingglass", title: "Instant Search", description: "Find any memory in milliseconds")
            }
            .padding(.top, 8)
        }
        .padding(40)
    }

    private func featureItem(icon: String, title: String, description: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.cortexAccent)
                .frame(width: 44, height: 44)
                .background(Color.cortexAccent.opacity(0.1))
                .clipShape(Circle())
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
            Text(description)
                .font(.caption2)
                .foregroundColor(.cortexMuted)
                .multilineTextAlignment(.center)
        }
        .frame(width: 140)
    }

    // MARK: - Step 2: Daemon Check

    private var daemonStep: some View {
        VStack(spacing: 24) {
            Image(systemName: isDaemonHealthy ? "checkmark.circle.fill" : "server.rack")
                .font(.system(size: 50))
                .foregroundColor(isDaemonHealthy ? .green : .cortexAccent)

            Text("Daemon Setup")
                .font(.title)
                .fontWeight(.bold)

            Text("Cortex needs a local daemon running to capture and serve memories.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)

            if isCheckingHealth {
                ProgressView("Checking daemon health...")
            } else if isDaemonHealthy {
                VStack(spacing: 8) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Daemon is running")
                            .fontWeight(.medium)
                    }
                    if !daemonManager.version.isEmpty {
                        Text("Version \(daemonManager.version)")
                            .font(.caption)
                            .foregroundColor(.cortexMuted)
                    }
                }
                .padding()
                .background(Color.green.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                VStack(spacing: 12) {
                    HStack {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                        Text("Daemon not detected")
                            .fontWeight(.medium)
                    }

                    Button {
                        daemonManager.startDaemon()
                        checkDaemonHealth()
                    } label: {
                        Label("Start Daemon", systemImage: "play.circle")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cortexAccent)

                    Button("Check Again") {
                        checkDaemonHealth()
                    }
                    .buttonStyle(.bordered)
                }
                .padding()
                .background(Color.red.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(40)
        .onAppear {
            checkDaemonHealth()
        }
    }

    // MARK: - Step 3: Sync Setup

    private var syncStep: some View {
        VStack(spacing: 24) {
            Image(systemName: "arrow.triangle.2.circlepath.circle")
                .font(.system(size: 50))
                .foregroundColor(.cortexAccent)

            Text("Multi-Machine Sync")
                .font(.title)
                .fontWeight(.bold)

            Text("Optional: Set up sync to share memories across machines.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)

            VStack(alignment: .leading, spacing: 12) {
                TextField("Sync Server URL", text: $syncUrl)
                    .textFieldStyle(.roundedBorder)
                SecureField("Authentication Token", text: $syncToken)
                    .textFieldStyle(.roundedBorder)
            }
            .frame(maxWidth: 350)

            Text("You can configure this later in Settings")
                .font(.caption)
                .foregroundColor(.cortexMuted)
        }
        .padding(40)
    }

    // MARK: - Step 4: AI Config

    private var aiStep: some View {
        VStack(spacing: 24) {
            Image(systemName: "sparkles")
                .font(.system(size: 50))
                .foregroundColor(.cortexAccent)

            Text("AI Summaries")
                .font(.title)
                .fontWeight(.bold)

            Text("Optional: Enable AI-powered memory summaries to keep your knowledge concise and actionable.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)

            Toggle("Enable AI Summaries", isOn: $enableAI)
                .toggleStyle(.switch)
                .frame(maxWidth: 300)

            if enableAI {
                Text("Summaries will be generated using your configured LLM provider. Memory content will be processed through the AI model.")
                    .font(.caption)
                    .foregroundColor(.cortexMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 350)
            }

            Text("You can configure this later in Settings")
                .font(.caption)
                .foregroundColor(.cortexMuted)
        }
        .padding(40)
    }

    // MARK: - Step 5: Done

    private var doneStep: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("You're All Set!")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Cortex is ready to capture your development memories.\nStart coding with Claude Code and watch your knowledge grow.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 400)

            VStack(alignment: .leading, spacing: 8) {
                summaryRow(icon: "server.rack", text: "Daemon: \(isDaemonHealthy ? "Running" : "Not configured")", ok: isDaemonHealthy)
                summaryRow(icon: "arrow.triangle.2.circlepath", text: "Sync: \(syncUrl.isEmpty ? "Skipped" : "Configured")", ok: !syncUrl.isEmpty)
                summaryRow(icon: "sparkles", text: "AI Summaries: \(enableAI ? "Enabled" : "Skipped")", ok: enableAI)
            }
            .padding()
            .background(Color.cortexSurface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding(40)
    }

    private func summaryRow(icon: String, text: String, ok: Bool) -> some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 20)
                .foregroundColor(.cortexAccent)
            Text(text)
                .font(.callout)
            Spacer()
            Image(systemName: ok ? "checkmark.circle.fill" : "minus.circle")
                .foregroundColor(ok ? .green : .cortexMuted)
        }
    }

    // MARK: - Navigation

    private var navigationBar: some View {
        HStack {
            if currentStep > 0 {
                Button("Back") {
                    withAnimation { currentStep -= 1 }
                }
                .buttonStyle(.bordered)
            }

            Spacer()

            if currentStep == 2 || currentStep == 3 {
                Button("Skip") {
                    withAnimation { currentStep += 1 }
                }
                .buttonStyle(.plain)
                .foregroundColor(.cortexMuted)
            }

            if currentStep < totalSteps - 1 {
                Button("Continue") {
                    withAnimation { currentStep += 1 }
                }
                .buttonStyle(.borderedProminent)
                .tint(.cortexAccent)
            } else {
                Button("Get Started") {
                    finishOnboarding()
                }
                .buttonStyle(.borderedProminent)
                .tint(.cortexAccent)
            }
        }
        .padding(.horizontal, 40)
    }

    // MARK: - Helpers

    private var backgroundColor: Color {
        colorScheme == .dark ? Color.cortexBackground : Color(.windowBackgroundColor)
    }

    private func checkDaemonHealth() {
        isCheckingHealth = true
        Task {
            isDaemonHealthy = await APIClient.shared.isHealthy()
            isCheckingHealth = false
        }
    }

    private func finishOnboarding() {
        // Apply sync if configured
        if !syncUrl.isEmpty && !syncToken.isEmpty {
            Task {
                _ = try? await APIClient.shared.syncSetup(url: syncUrl, token: syncToken)
            }
        }

        // Apply AI config
        if enableAI {
            Task {
                var config = (try? await APIClient.shared.getConfig()) ?? CortexConfig(
                    syncEnabled: !syncUrl.isEmpty,
                    syncUrl: syncUrl.isEmpty ? nil : syncUrl,
                    summarizeEnabled: true,
                    summarizeModel: "gpt-4o-mini",
                    notificationsEnabled: true,
                    autoStartDaemon: true,
                    logLevel: "info"
                )
                config.summarizeEnabled = true
                _ = try? await APIClient.shared.updateConfig(config)
            }
        }

        appState.isOnboardingComplete = true
        Task { await appState.refreshAll() }
    }
}

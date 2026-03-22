import SwiftUI
import WebKit

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var daemonManager: DaemonManager

    enum SidebarItem: String, CaseIterable {
        case overview = "Overview"
        case projects = "Projects"
        case search = "Search"
        case timeline = "Timeline"
        case review = "Review"
        case sync = "Sync"
        case analytics = "Analytics"
        case settings = "Settings"

        var icon: String {
            switch self {
            case .overview: return "house.fill"
            case .projects: return "folder.fill"
            case .search: return "magnifyingglass"
            case .timeline: return "calendar"
            case .review: return "checkmark.circle.fill"
            case .sync: return "arrow.triangle.2.circlepath"
            case .analytics: return "chart.bar.fill"
            case .settings: return "gearshape.fill"
            }
        }

        var route: String {
            switch self {
            case .overview: return "/"
            case .projects: return "/projects"
            case .search: return "/search"
            case .timeline: return "/timeline"
            case .review: return "/review"
            case .sync: return "/sync"
            case .analytics: return "/analytics"
            case .settings: return "/settings"
            }
        }
    }

    @State private var selectedItem: SidebarItem = .overview

    var body: some View {
        if !appState.isOnboardingComplete {
            OnboardingView()
        } else if !daemonManager.isHealthy {
            DaemonDownView()
        } else {
            NavigationSplitView {
                List(SidebarItem.allCases, id: \.self, selection: $selectedItem) { item in
                    Label(item.rawValue, systemImage: item.icon)
                        .tag(item)
                }
                .listStyle(.sidebar)
                .navigationTitle("Cortex")
            } detail: {
                DashboardWebView(route: selectedItem.route)
            }
        }
    }
}

// MARK: - Dashboard Web View

struct DashboardWebView: NSViewRepresentable {
    let route: String

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if let url = URL(string: "http://127.0.0.1:7434\(route)") {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }
}

// MARK: - Daemon Down View

struct DaemonDownView: View {
    @EnvironmentObject var daemonManager: DaemonManager
    @State private var isRestarting = false

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "brain.head.profile")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Cortex is offline")
                .font(.title2)
                .fontWeight(.bold)

            Text("The Cortex daemon is not running.")
                .foregroundColor(.secondary)

            Button(action: {
                isRestarting = true
                daemonManager.restartDaemon()
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    isRestarting = false
                }
            }) {
                if isRestarting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .frame(width: 100)
                } else {
                    Text("Start Cortex")
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Onboarding View

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var daemonManager: DaemonManager
    @State private var step = 0

    var body: some View {
        VStack(spacing: 30) {
            switch step {
            case 0:
                welcomeStep
            case 1:
                setupStep
            default:
                doneStep
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(60)
    }

    var welcomeStep: some View {
        VStack(spacing: 16) {
            Text("C●rtex")
                .font(.system(size: 42, weight: .bold, design: .serif))

            Text("Your AI memory, natively on Mac.")
                .font(.title3)
                .foregroundColor(.secondary)

            Button("Get Started") { step = 1 }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .padding(.top, 20)
        }
    }

    var setupStep: some View {
        VStack(spacing: 16) {
            Text("Setting up Cortex...")
                .font(.title2)
                .fontWeight(.bold)

            ProgressView()
                .scaleEffect(1.2)
                .padding()

            Text("Installing daemon and configuring Claude Code")
                .foregroundColor(.secondary)

            Button("Continue") { step = 2 }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .padding(.top, 20)
        }
    }

    var doneStep: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.green)

            Text("Cortex is ready!")
                .font(.title2)
                .fontWeight(.bold)

            Text("Open Claude Code in any project to start building memory.")
                .foregroundColor(.secondary)

            Button("Open Cortex") {
                appState.completeOnboarding()
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
            .padding(.top, 20)
        }
    }
}

// MARK: - Menu Bar View

struct MenuBarView: View {
    @EnvironmentObject var daemonManager: DaemonManager

    var body: some View {
        VStack {
            Text(daemonManager.isHealthy ? "● Running" : "○ Offline")
            Divider()
            Button("Open Dashboard") { NSWorkspace.shared.open(URL(string: "http://127.0.0.1:7434")!) }
            Button("Restart Daemon") { daemonManager.restartDaemon() }
            Divider()
            Button("Quit") { NSApplication.shared.terminate(nil) }
        }
    }
}

// MARK: - Settings View

struct SettingsView: View {
    var body: some View {
        Form {
            Section("Daemon") {
                LabeledContent("Port", value: "7434")
                LabeledContent("Status", value: "Check dashboard")
            }
            Section("Appearance") {
                LabeledContent("Theme", value: "System")
            }
        }
        .formStyle(.grouped)
        .frame(width: 400, height: 300)
    }
}

import SwiftUI

struct SyncView: View {
    @EnvironmentObject var appState: AppState
    @State private var syncEvents: [SyncEvent] = []
    @State private var isLoadingEvents = false
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Sync")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        Text("Multi-machine synchronization")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()

                    Button {
                        Task { await appState.triggerSync() }
                    } label: {
                        Label("Sync Now", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cortexAccent)
                    .disabled(appState.syncStatus == .disabled || appState.syncStatus == .syncing)
                }

                // Status Card
                syncStatusCard

                // Machines
                if let response = appState.syncStatusResponse, !response.machines.isEmpty {
                    machinesSection(machines: response.machines)
                }

                // Conflicts
                if let response = appState.syncStatusResponse {
                    let unresolvedConflicts = response.conflicts.filter { !$0.isResolved }
                    if !unresolvedConflicts.isEmpty {
                        conflictsSection(conflicts: unresolvedConflicts)
                    }
                }

                // Sync History
                syncHistorySection
            }
            .padding(24)
        }
        .task {
            await appState.loadSyncStatus()
        }
    }

    // MARK: - Status Card

    private var syncStatusCard: some View {
        HStack(spacing: 20) {
            // Status Icon
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: appState.syncStatus.icon)
                    .font(.title)
                    .foregroundColor(statusColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(appState.syncStatus.displayName)
                    .font(.title2)
                    .fontWeight(.semibold)

                if let response = appState.syncStatusResponse {
                    if let lastSync = response.lastSyncAt {
                        Text("Last synced \(lastSync, style: .relative) ago")
                            .font(.caption)
                            .foregroundColor(.cortexMuted)
                    }
                    if response.pendingChanges > 0 {
                        Text("\(response.pendingChanges) changes pending")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let response = appState.syncStatusResponse {
                    Text("\(response.machines.count) machines")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                    Text("\(response.conflicts.filter { !$0.isResolved }.count) conflicts")
                        .font(.caption)
                        .foregroundColor(
                            response.conflicts.contains(where: { !$0.isResolved })
                                ? .red : .cortexMuted
                        )
                }
            }
        }
        .padding(20)
        .background(Color.cortexSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Machines Section

    private func machinesSection(machines: [SyncMachine]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Machines")
                .font(.title2)
                .fontWeight(.semibold)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(machines) { machine in
                    machineCard(machine)
                }
            }
        }
    }

    private func machineCard(_ machine: SyncMachine) -> some View {
        HStack(spacing: 12) {
            Image(systemName: machine.platformIcon)
                .font(.title2)
                .foregroundColor(.cortexAccent)
                .frame(width: 40)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(machine.name)
                        .font(.headline)
                    Circle()
                        .fill(machine.isOnline ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                }
                Text("\(machine.memoryCount) memories")
                    .font(.caption)
                    .foregroundColor(.cortexMuted)
                Text("Last seen \(machine.lastSeen, style: .relative) ago")
                    .font(.caption2)
                    .foregroundColor(.cortexMuted)
            }
            Spacer()
        }
        .padding(16)
        .background(Color.cortexSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Conflicts Section

    private func conflictsSection(conflicts: [SyncConflict]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Conflicts")
                    .font(.title2)
                    .fontWeight(.semibold)
                Text("\(conflicts.count)")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.red.opacity(0.2))
                    .foregroundColor(.red)
                    .clipShape(Capsule())
            }

            ForEach(conflicts) { conflict in
                conflictRow(conflict)
            }
        }
    }

    private func conflictRow(_ conflict: SyncConflict) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
                Text("Memory \(String(conflict.memoryId.prefix(8)))...")
                    .font(.subheadline)
                    .fontWeight(.medium)
                Spacer()
            }

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Local")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                    Text(conflict.localContent)
                        .font(.caption)
                        .lineLimit(3)
                        .padding(8)
                        .background(Color.blue.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Remote")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                    Text(conflict.remoteContent)
                        .font(.caption)
                        .lineLimit(3)
                        .padding(8)
                        .background(Color.orange.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }

            HStack {
                Button("Keep Local") {}
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                Button("Keep Remote") {}
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                Button("Keep Both") {}
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding(12)
        .background(Color.red.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(Color.red.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Sync History

    private var syncHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sync History")
                .font(.title2)
                .fontWeight(.semibold)

            if syncEvents.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "clock")
                        .font(.title)
                        .foregroundColor(.cortexMuted)
                    Text("No sync events yet")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(40)
                .background(Color.cortexSurface.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                ForEach(syncEvents) { event in
                    HStack(spacing: 12) {
                        Image(systemName: syncEventIcon(event.type))
                            .foregroundColor(.cortexAccent)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.message)
                                .font(.callout)
                            Text(event.timestamp, style: .relative)
                                .font(.caption2)
                                .foregroundColor(.cortexMuted)
                        }
                        Spacer()
                        if let count = event.memoriesAffected {
                            Text("\(count) memories")
                                .font(.caption)
                                .foregroundColor(.cortexMuted)
                        }
                    }
                    .padding(.vertical, 4)
                    if event.id != syncEvents.last?.id {
                        Divider()
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private var statusColor: Color {
        switch appState.syncStatus {
        case .synced: return .green
        case .pending, .syncing: return .orange
        case .conflict, .error: return .red
        case .disabled: return .gray
        }
    }

    private func syncEventIcon(_ type: String) -> String {
        switch type {
        case "push": return "arrow.up.circle"
        case "pull": return "arrow.down.circle"
        case "conflict": return "exclamationmark.triangle"
        case "resolve": return "checkmark.circle"
        default: return "arrow.triangle.2.circlepath"
        }
    }
}

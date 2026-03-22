import SwiftUI

struct MemoryDetailPanel: View {
    let memory: Memory
    @EnvironmentObject var appState: AppState
    @State private var isEditing = false
    @State private var editedContent: String = ""
    @State private var editedReason: String = ""
    @State private var editedImportance: Double = 0.5
    @State private var isSaving = false
    @State private var showDeleteConfirmation = false
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    TypeBadge(type: memory.type)
                    Spacer()
                    Text(memory.ageDescription)
                        .font(.caption)
                        .foregroundColor(.cortexMuted)

                    Menu {
                        Button {
                            startEditing()
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        Button {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(memory.content, forType: .string)
                        } label: {
                            Label("Copy Content", systemImage: "doc.on.doc")
                        }
                        Divider()
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundColor(.cortexMuted)
                    }
                    .menuStyle(.borderlessButton)
                    .frame(width: 24)
                }

                // Importance
                HStack {
                    Text("Importance")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                    Spacer()
                    importanceIndicator
                }

                Divider()

                // Content
                VStack(alignment: .leading, spacing: 8) {
                    Text("Content")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                        .textCase(.uppercase)

                    if isEditing {
                        TextEditor(text: $editedContent)
                            .font(.body)
                            .frame(minHeight: 150)
                            .padding(8)
                            .background(Color.cortexSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } else {
                        Text(memory.content)
                            .font(.body)
                            .textSelection(.enabled)
                    }
                }

                // Reason
                if let reason = memory.reason, !reason.isEmpty {
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Reason")
                            .font(.caption)
                            .foregroundColor(.cortexMuted)
                            .textCase(.uppercase)

                        if isEditing {
                            TextEditor(text: $editedReason)
                                .font(.body)
                                .frame(minHeight: 60)
                                .padding(8)
                                .background(Color.cortexSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        } else {
                            Text(reason)
                                .font(.callout)
                                .foregroundColor(.secondary)
                                .textSelection(.enabled)
                        }
                    }
                }

                // Importance Slider (edit mode)
                if isEditing {
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Importance: \(String(format: "%.1f", editedImportance))")
                            .font(.caption)
                            .foregroundColor(.cortexMuted)
                            .textCase(.uppercase)
                        Slider(value: $editedImportance, in: 0...1, step: 0.1)
                            .tint(.cortexAccent)
                    }
                }

                // Tags
                if !memory.tags.isEmpty {
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Tags")
                            .font(.caption)
                            .foregroundColor(.cortexMuted)
                            .textCase(.uppercase)

                        FlowLayout(spacing: 6) {
                            ForEach(memory.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.cortexAccent.opacity(0.15))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                // Metadata
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    Text("Details")
                        .font(.caption)
                        .foregroundColor(.cortexMuted)
                        .textCase(.uppercase)

                    metadataRow(label: "ID", value: String(memory.id.prefix(12)) + "...")
                    metadataRow(label: "Project", value: memory.projectId)
                    metadataRow(label: "Confidence", value: String(format: "%.0f%%", memory.confidence * 100))
                    metadataRow(label: "Created", value: formatDate(memory.createdAt))
                    metadataRow(label: "Updated", value: formatDate(memory.updatedAt))
                }

                // Edit Actions
                if isEditing {
                    HStack {
                        Button("Cancel") {
                            isEditing = false
                        }
                        .keyboardShortcut(.escape)

                        Spacer()

                        Button {
                            Task { await saveEdits() }
                        } label: {
                            if isSaving {
                                ProgressView()
                                    .scaleEffect(0.7)
                            } else {
                                Text("Save Changes")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.cortexAccent)
                        .disabled(isSaving)
                        .keyboardShortcut(.return, modifiers: .command)
                    }
                    .padding(.top, 8)
                }
            }
            .padding(20)
        }
        .background(panelBackground)
        .alert("Delete Memory", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await appState.deleteMemory(memory) }
            }
        } message: {
            Text("This will permanently delete this memory. This action cannot be undone.")
        }
    }

    // MARK: - Components

    private var importanceIndicator: some View {
        HStack(spacing: 2) {
            ForEach(0..<5, id: \.self) { index in
                Circle()
                    .fill(index < Int(memory.importance * 5) ? Color.cortexAccent : Color.cortexSurface)
                    .frame(width: 8, height: 8)
            }
            Text(memory.importanceLevel)
                .font(.caption2)
                .foregroundColor(.cortexMuted)
                .padding(.leading, 4)
        }
    }

    private func metadataRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(.cortexMuted)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.caption)
                .textSelection(.enabled)
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private var panelBackground: Color {
        Color.cortexSurface.opacity(0.3)
    }

    // MARK: - Actions

    private func startEditing() {
        editedContent = memory.content
        editedReason = memory.reason ?? ""
        editedImportance = memory.importance
        isEditing = true
    }

    private func saveEdits() async {
        isSaving = true
        let update = MemoryUpdateRequest(
            content: editedContent,
            reason: editedReason.isEmpty ? nil : editedReason,
            importance: editedImportance
        )
        do {
            let updated = try await APIClient.shared.updateMemory(id: memory.id, body: update)
            appState.selectedMemory = updated
            isEditing = false
        } catch {
            // Error handled by API client
        }
        isSaving = false
    }
}

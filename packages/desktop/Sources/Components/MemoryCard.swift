import SwiftUI

struct MemoryCard: View {
    let memory: Memory
    var showProject: Bool = true
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header Row
            HStack(spacing: 8) {
                TypeBadge(type: memory.type)

                // Importance dots
                HStack(spacing: 2) {
                    ForEach(0..<5, id: \.self) { index in
                        Circle()
                            .fill(index < Int(memory.importance * 5) ? Color.cortexAccent : Color.cortexSurface)
                            .frame(width: 5, height: 5)
                    }
                }

                Spacer()

                Text(memory.ageDescription)
                    .font(.caption2)
                    .foregroundColor(.cortexMuted)
            }

            // Content Preview
            Text(memory.contentPreview)
                .font(.callout)
                .lineLimit(3)
                .foregroundColor(colorScheme == .dark ? .white.opacity(0.9) : .primary)

            // Footer
            HStack(spacing: 8) {
                // Tags
                if !memory.tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(memory.tags.prefix(3), id: \.self) { tag in
                            Text(tag)
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.cortexAccent.opacity(0.1))
                                .foregroundColor(.cortexAccent)
                                .clipShape(Capsule())
                        }
                        if memory.tags.count > 3 {
                            Text("+\(memory.tags.count - 3)")
                                .font(.caption2)
                                .foregroundColor(.cortexMuted)
                        }
                    }
                }

                Spacer()

                // Project ID (if showing)
                if showProject {
                    Text(String(memory.projectId.prefix(8)))
                        .font(.caption2)
                        .foregroundColor(.cortexMuted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.cortexSurface)
                        .clipShape(Capsule())
                }

                // Confidence indicator
                if memory.confidence < 0.5 {
                    HStack(spacing: 2) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.caption2)
                        Text("Low confidence")
                            .font(.caption2)
                    }
                    .foregroundColor(.orange)
                }
            }
        }
        .padding(12)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(Color.cortexBorder.opacity(0.5), lineWidth: 0.5)
        )
        .contentShape(Rectangle())
    }

    private var cardBackground: some ShapeStyle {
        colorScheme == .dark
            ? AnyShapeStyle(Color.cortexSurface)
            : AnyShapeStyle(Color(.controlBackgroundColor))
    }
}

// MARK: - Preview Helpers

#if DEBUG
extension Memory {
    static var preview: Memory {
        Memory(
            id: "mem-001",
            projectId: "proj-001",
            type: .decision,
            content: "Chose PostgreSQL over MongoDB for the main database because the data model is highly relational with complex joins needed for analytics queries.",
            reason: "Relational data model with complex analytics needs",
            tags: ["database", "architecture", "postgresql"],
            importance: 0.8,
            confidence: 0.9,
            createdAt: Date().addingTimeInterval(-3600),
            updatedAt: Date().addingTimeInterval(-1800)
        )
    }
}
#endif

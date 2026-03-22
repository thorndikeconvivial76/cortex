import SwiftUI

struct StatCard: View {
    let label: String
    let value: String
    var subtitle: String = ""
    var icon: String = "chart.bar"
    var color: Color = .cortexAccent
    var trend: Trend? = nil
    @Environment(\.colorScheme) var colorScheme

    enum Trend {
        case up(String)
        case down(String)
        case neutral(String)

        var icon: String {
            switch self {
            case .up: return "arrow.up.right"
            case .down: return "arrow.down.right"
            case .neutral: return "arrow.right"
            }
        }

        var color: Color {
            switch self {
            case .up: return .green
            case .down: return .red
            case .neutral: return .gray
            }
        }

        var text: String {
            switch self {
            case .up(let s), .down(let s), .neutral(let s): return s
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Icon + Label
            HStack {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundColor(color)
                    .frame(width: 28, height: 28)
                    .background(color.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                Spacer()

                if let trend = trend {
                    HStack(spacing: 2) {
                        Image(systemName: trend.icon)
                            .font(.caption2)
                        Text(trend.text)
                            .font(.caption2)
                    }
                    .foregroundColor(trend.color)
                }
            }

            // Value
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .lineLimit(1)

            // Label + Subtitle
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.cortexMuted)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.cortexBorder.opacity(0.5), lineWidth: 0.5)
        )
    }

    private var cardBackground: some ShapeStyle {
        colorScheme == .dark
            ? AnyShapeStyle(Color.cortexSurface)
            : AnyShapeStyle(Color(.controlBackgroundColor))
    }
}

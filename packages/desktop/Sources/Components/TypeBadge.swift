import SwiftUI

struct TypeBadge: View {
    let type: MemoryType
    var size: BadgeSize = .regular

    enum BadgeSize {
        case small
        case regular
        case large

        var fontSize: Font {
            switch self {
            case .small: return .caption2
            case .regular: return .caption
            case .large: return .callout
            }
        }

        var horizontalPadding: CGFloat {
            switch self {
            case .small: return 5
            case .regular: return 8
            case .large: return 12
            }
        }

        var verticalPadding: CGFloat {
            switch self {
            case .small: return 2
            case .regular: return 4
            case .large: return 6
            }
        }

        var iconSize: Font {
            switch self {
            case .small: return .caption2
            case .regular: return .caption
            case .large: return .callout
            }
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: type.icon)
                .font(size.iconSize)
            Text(type.displayName)
                .font(size.fontSize)
                .fontWeight(.medium)
        }
        .padding(.horizontal, size.horizontalPadding)
        .padding(.vertical, size.verticalPadding)
        .background(badgeColor.opacity(0.15))
        .foregroundColor(badgeColor)
        .clipShape(Capsule())
    }

    private var badgeColor: Color {
        switch type.color {
        case "purple": return .purple
        case "blue": return .blue
        case "teal": return .teal
        case "orange": return .orange
        case "red": return .red
        case "green": return .green
        case "indigo": return .indigo
        case "cyan": return .cyan
        case "yellow": return .yellow
        case "pink": return .pink
        case "mint": return .mint
        default: return .gray
        }
    }
}

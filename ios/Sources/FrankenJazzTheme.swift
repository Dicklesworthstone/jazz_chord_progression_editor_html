import SwiftUI
import UIKit

enum JazzAppearance: String {
    static let storageKey = "frankenjazz.appearance"

    case dark
    case light

    var colorScheme: ColorScheme { self == .dark ? .dark : .light }
}

enum JazzTheme {
    static let background = adaptive(
        dark: UIColor(red: 0.010, green: 0.022, blue: 0.030, alpha: 1),
        light: UIColor(red: 0.965, green: 0.945, blue: 0.885, alpha: 1)
    )
    static let panel = adaptive(
        dark: UIColor(red: 0.024, green: 0.046, blue: 0.055, alpha: 1),
        light: UIColor(red: 1.0, green: 0.992, blue: 0.955, alpha: 1)
    )
    static let raised = adaptive(
        dark: UIColor(red: 0.040, green: 0.070, blue: 0.080, alpha: 1),
        light: UIColor(red: 0.915, green: 0.895, blue: 0.825, alpha: 1)
    )
    static let paper = adaptive(
        dark: UIColor(red: 0.94, green: 0.92, blue: 0.84, alpha: 1),
        light: UIColor(red: 0.985, green: 0.965, blue: 0.895, alpha: 1)
    )
    static let text = adaptive(
        dark: UIColor(red: 0.94, green: 0.97, blue: 0.98, alpha: 1),
        light: UIColor(red: 0.115, green: 0.095, blue: 0.075, alpha: 1)
    )
    static let secondary = adaptive(
        dark: UIColor(red: 0.62, green: 0.70, blue: 0.75, alpha: 1),
        light: UIColor(red: 0.385, green: 0.345, blue: 0.290, alpha: 1)
    )
    static let brass = adaptive(
        dark: UIColor(red: 0.96, green: 0.72, blue: 0.28, alpha: 1),
        light: UIColor(red: 0.635, green: 0.345, blue: 0.025, alpha: 1)
    )
    static let emerald = adaptive(
        dark: UIColor(red: 0.23, green: 0.89, blue: 0.64, alpha: 1),
        light: UIColor(red: 0.025, green: 0.435, blue: 0.255, alpha: 1)
    )
    static let cyan = adaptive(
        dark: UIColor(red: 0.21, green: 0.79, blue: 0.95, alpha: 1),
        light: UIColor(red: 0.025, green: 0.390, blue: 0.535, alpha: 1)
    )
    static let violet = adaptive(
        dark: UIColor(red: 0.61, green: 0.47, blue: 0.97, alpha: 1),
        light: UIColor(red: 0.385, green: 0.225, blue: 0.675, alpha: 1)
    )
    static let coral = adaptive(
        dark: UIColor(red: 0.97, green: 0.42, blue: 0.48, alpha: 1),
        light: UIColor(red: 0.675, green: 0.145, blue: 0.205, alpha: 1)
    )
    static let stroke = adaptive(
        dark: UIColor(white: 1, alpha: 0.08),
        light: UIColor(red: 0.30, green: 0.20, blue: 0.08, alpha: 0.16)
    )

    private static func adaptive(dark: UIColor, light: UIColor) -> Color {
        Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light })
    }

    static func size(_ base: CGFloat) -> CGFloat {
#if targetEnvironment(macCatalyst)
        base * 1.18
#else
        UIFontMetrics(forTextStyle: .body).scaledValue(for: base)
#endif
    }
}

struct JazzAppearanceButton: View {
    @Binding var selection: String

    private var appearance: JazzAppearance { JazzAppearance(rawValue: selection) ?? .dark }

    var body: some View {
        Button {
            selection = appearance == .dark ? JazzAppearance.light.rawValue : JazzAppearance.dark.rawValue
        } label: {
            Image(systemName: appearance == .dark ? "sun.max.fill" : "moon.stars.fill")
                .frame(width: 44, height: 44)
        }
        .accessibilityIdentifier("appearance-toggle")
        .accessibilityLabel(appearance == .dark ? "Switch to light mode" : "Switch to dark mode")
        .accessibilityValue(appearance == .dark ? "Dark mode" : "Light mode")
        .accessibilityHint("Remembers this choice for future launches")
    }
}

struct JazzForgeBackground: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ZStack {
            JazzTheme.background
            RadialGradient(
                colors: [JazzTheme.brass.opacity(reduceTransparency ? 0.035 : 0.10), .clear],
                center: .topTrailing,
                startRadius: 0,
                endRadius: 720
            )
            RadialGradient(
                colors: [JazzTheme.emerald.opacity(reduceTransparency ? 0.04 : 0.13), .clear],
                center: .topLeading,
                startRadius: 0,
                endRadius: 760
            )
            Canvas { context, size in
                let step: CGFloat = 44
                var path = Path()
                stride(from: CGFloat.zero, through: size.width, by: step).forEach { horizontal in
                    path.move(to: CGPoint(x: horizontal, y: 0))
                    path.addLine(to: CGPoint(x: horizontal, y: size.height))
                }
                stride(from: CGFloat.zero, through: size.height, by: step).forEach { vertical in
                    path.move(to: CGPoint(x: 0, y: vertical))
                    path.addLine(to: CGPoint(x: size.width, y: vertical))
                }
                context.stroke(path, with: .color(JazzTheme.cyan.opacity(0.025)), lineWidth: 0.6)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
struct JazzPanel<Content: View>: View {
    let accent: Color
    let padding: CGFloat
    let content: Content

    init(accent: Color = JazzTheme.brass, padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.accent = accent
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(JazzTheme.panel.opacity(0.94), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [accent.opacity(0.42), JazzTheme.stroke, JazzTheme.emerald.opacity(0.14)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .shadow(color: accent.opacity(0.06), radius: 20, y: 8)
    }
}

struct FrankenJazzWordmark: View {
    var compact = false

    var body: some View {
        (Text("F")
            .font(.system(size: JazzTheme.size(compact ? 20 : 25), weight: .black, design: .rounded))
            .foregroundColor(JazzTheme.text)
        + Text("RANKEN")
            .font(.system(size: JazzTheme.size(compact ? 13 : 16), weight: .black, design: .rounded))
            .foregroundColor(JazzTheme.text)
        + Text("J")
            .font(.system(size: JazzTheme.size(compact ? 20 : 25), weight: .black, design: .rounded))
            .foregroundColor(JazzTheme.brass)
        + Text("AZZ")
            .font(.system(size: JazzTheme.size(compact ? 13 : 16), weight: .black, design: .rounded))
            .foregroundColor(JazzTheme.brass))
        .kerning(0.65)
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("FrankenJazz")
    }
}

struct JazzPrimaryButtonStyle: ButtonStyle {
    var tint = JazzTheme.brass
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: JazzTheme.size(13.5), weight: .bold, design: .rounded))
            .foregroundStyle(JazzTheme.background)
            .padding(.horizontal, 17)
            .frame(minHeight: 48)
            .background(tint.opacity(configuration.isPressed ? 0.78 : 1), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(isEnabled ? 1 : 0.38)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct JazzSecondaryButtonStyle: ButtonStyle {
    var tint = JazzTheme.cyan

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: JazzTheme.size(12.5), weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(tint.opacity(configuration.isPressed ? 0.18 : 0.07), in: Capsule())
            .overlay(Capsule().stroke(tint.opacity(0.34), lineWidth: 1))
    }
}

struct JazzSectionLabel: View {
    let number: String
    let title: String
    let tint: Color

    var body: some View {
        Text("\(number) · \(title.uppercased())")
            .font(.system(size: JazzTheme.size(10.5), weight: .bold, design: .monospaced))
            .kerning(1.7)
            .foregroundStyle(tint)
            .accessibilityAddTraits(.isHeader)
    }
}

struct JazzAppIdentity: View {
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 10 : 13) {
            Image("MonsterIcon")
                .resizable()
                .scaledToFill()
                .frame(width: compact ? 48 : 62, height: compact ? 48 : 62)
                .clipShape(RoundedRectangle(cornerRadius: compact ? 12 : 16, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: compact ? 12 : 16)
                        .stroke(JazzTheme.brass.opacity(0.55), lineWidth: 1)
                }
            VStack(alignment: .leading, spacing: 3) {
                FrankenJazzWordmark(compact: compact)
                Text("CHANGES_LAB · PRIVATE · OFFLINE")
                    .font(.system(size: JazzTheme.size(compact ? 8.2 : 9.2), weight: .bold, design: .monospaced))
                    .kerning(1.1)
                    .foregroundStyle(JazzTheme.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
        }
    }
}

struct CatalystWindowFreedom: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller, context: Context) { controller.configure() }

    final class Controller: UIViewController {
        override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); configure() }
        override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); configure() }

        func configure() {
#if targetEnvironment(macCatalyst)
            guard let restrictions = view.window?.windowScene?.sizeRestrictions else { return }
            restrictions.minimumSize = CGSize(width: 860, height: 600)
            restrictions.maximumSize = CGSize(width: 10_000, height: 10_000)
#endif
        }
    }
}

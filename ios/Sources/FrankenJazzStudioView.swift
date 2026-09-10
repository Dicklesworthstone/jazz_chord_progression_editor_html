import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct FrankenJazzStudioView: View {
    @ObservedObject var store: JazzStudioStore
    @Environment(\.dynamicTypeSize) private var systemDynamicTypeSize
    @AppStorage(JazzAppearance.storageKey) private var appearance = JazzAppearance.dark.rawValue
    @AppStorage(JazzTheme.textScaleStorageKey) private var textScale = JazzTheme.defaultTextScale
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
#if DEBUG
    @State private var didApplyDebugLaunch = false
#endif

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                JazzForgeBackground()
                if horizontalSizeClass == .compact || proxy.size.width < 760 {
                    compactWorkspace
                } else {
                    expandedWorkspace(width: proxy.size.width)
                }
            }
        }
        .preferredColorScheme((JazzAppearance(rawValue: appearance) ?? .dark).colorScheme)
        .environment(\.dynamicTypeSize, JazzTheme.dynamicTypeSize(from: systemDynamicTypeSize, for: textScale))
        .tint(JazzTheme.brass)
        .sheet(isPresented: $store.isInspectorPresented) { NavigationStack { ChordInspectorView(store: store, sheetMode: true) } }
        .sheet(isPresented: $store.isLibraryPresented) { NavigationStack { LibraryView(store: store, sheetMode: true) } }
        .sheet(isPresented: $store.isDocumentPresented) { NavigationStack { DocumentCenterView(store: store) } }
        .fileExporter(
            isPresented: $store.isSaveCopyPresented,
            document: store.saveCopyDocument,
            contentType: .frankenJazz,
            defaultFilename: store.nativeExportFilename,
            onCompletion: store.finishSaveCopy
        )
        .overlay(alignment: .top) { noticeBanner }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                store.audio.pause()
                store.audio.stopPreview()
            }
        }
#if DEBUG
        .task { applyDebugLaunchIfNeeded() }
#endif
    }

#if DEBUG
    /// Deterministic simulator entry points for visual QA and storefront
    /// capture. These switches do not exist in release builds and still drive
    /// the same sheets and real audio renderer as user interaction.
    private func applyDebugLaunchIfNeeded() {
        guard !didApplyDebugLaunch else { return }
        didApplyDebugLaunch = true
        let environment = ProcessInfo.processInfo.environment
        switch environment["FJAZZ_INITIAL_DESTINATION"]?.lowercased() {
        case "library": store.isLibraryPresented = true
        case "inspector": store.isInspectorPresented = true
        case "documents": store.isDocumentPresented = true
        default: break
        }
        if environment["FJAZZ_AUTOPLAY"] == "1" {
            store.audio.play(chart: store.chart)
        }
    }
#endif

    private var compactWorkspace: some View {
        NavigationStack {
            ChartEditorView(store: store, compact: true, presentsInspectorOnSelection: true)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        JazzAppearanceButton(selection: $appearance)
                        Button { store.isLibraryPresented = true } label: { Image(systemName: "books.vertical") }
                            .accessibilityLabel("Progression library")
                        Button { store.isDocumentPresented = true } label: { Image(systemName: "ellipsis.circle") }
                            .accessibilityLabel("Document actions")
                    }
                }
                .safeAreaInset(edge: .bottom, spacing: 0) { TransportBar(store: store, compact: true) }
        }
    }

    private func expandedWorkspace(width: CGFloat) -> some View {
        NavigationSplitView {
            LibraryView(store: store, sheetMode: false)
                .navigationSplitViewColumnWidth(min: 245, ideal: 292, max: 360)
        } detail: {
            HStack(alignment: .top, spacing: 14) {
                ChartEditorView(store: store, compact: false, presentsInspectorOnSelection: width < 1_080)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if width >= 1_080 {
                    ChordInspectorView(store: store, sheetMode: false)
                        .frame(width: min(380, width * 0.29))
                        .transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))
                }
            }
            .padding(.horizontal, width > 1_250 ? 18 : 12)
            .padding(.top, 12)
            .safeAreaInset(edge: .bottom, spacing: 0) { TransportBar(store: store, compact: false) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    JazzAppearanceButton(selection: $appearance)
                }
                if width < 1_080 {
                    ToolbarItem(placement: .primaryAction) {
                        Button { store.isInspectorPresented = true } label: { Label("Harmony", systemImage: "waveform.path.ecg") }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { store.isDocumentPresented = true } label: { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Document actions")
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder private var noticeBanner: some View {
        if let notice = store.notice {
            Text(notice)
                .font(.system(size: JazzTheme.size(12), weight: .semibold, design: .rounded))
                .foregroundStyle(JazzTheme.text)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(JazzTheme.emerald.opacity(0.35)))
                .padding(.top, 8)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .onTapGesture { withAnimation(reduceMotion ? nil : .default) { store.notice = nil } }
                .task(id: notice) {
                    try? await Task.sleep(for: .seconds(3.5))
                    if store.notice == notice { withAnimation(reduceMotion ? nil : .default) { store.notice = nil } }
                }
        }
    }
}

private struct ChartEditorView: View {
    @ObservedObject var store: JazzStudioStore
    let compact: Bool
    let presentsInspectorOnSelection: Bool
    @FocusState private var editorFocused: Bool
    @State private var quickEntryExpanded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: compact ? 142 : 165, maximum: compact ? 220 : 260), spacing: 10)]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: compact ? 12 : 14) {
                if compact { JazzAppIdentity(compact: true).frame(maxWidth: .infinity, alignment: .leading) }
                documentHeader
                settingsStrip
                chartCanvas
                quickEntry
                privacyFooter
            }
            .frame(maxWidth: 940)
            .padding(.horizontal, compact ? 12 : 4)
            .padding(.vertical, compact ? 10 : 4)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .onTapGesture { editorFocused = false }
    }

    private var documentHeader: some View {
        JazzPanel(accent: JazzTheme.brass, padding: compact ? 14 : 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    JazzSectionLabel(number: "01", title: "The chart", tint: JazzTheme.brass)
                    Spacer()
                    Text("\(store.chart.barCount) bars · \(store.chart.chordCount) changes")
                        .font(.system(size: JazzTheme.size(10), design: .monospaced))
                        .foregroundStyle(JazzTheme.secondary)
                }
                TextField("Chart title", text: Binding(get: { store.chart.title }, set: store.updateTitle))
                    .font(.system(size: JazzTheme.size(compact ? 24 : 29), weight: .bold, design: .rounded))
                    .foregroundStyle(JazzTheme.text)
                    .textFieldStyle(.plain)
                    .submitLabel(.done)
                    .accessibilityLabel("Chart title")
            }
        }
    }

    private var settingsStrip: some View {
        JazzPanel(accent: JazzTheme.cyan, padding: 11) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { settingControls }
                VStack(spacing: 9) {
                    HStack(spacing: 8) { keyControl; tempoControl }
                    HStack(spacing: 8) { grooveControl; instrumentControl }
                }
            }
        }
    }

    @ViewBuilder private var settingControls: some View {
        keyControl
        Divider().overlay(.white.opacity(0.08)).frame(height: 31)
        tempoControl
        Divider().overlay(.white.opacity(0.08)).frame(height: 31)
        grooveControl
        instrumentControl
    }

    private var keyControl: some View {
        Picker("Key", selection: Binding(get: { store.chart.key }, set: store.updateKey)) {
            ForEach(JazzKey.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.menu)
        .frame(minWidth: 74)
    }

    private var tempoControl: some View {
        HStack(spacing: 6) {
            Image(systemName: "metronome").foregroundStyle(JazzTheme.brass)
            TextField("Tempo", value: Binding(get: { store.chart.tempoBPM }, set: store.updateTempo), format: .number.precision(.fractionLength(0)))
                .keyboardType(.numberPad)
                .textFieldStyle(.plain)
                .frame(width: 42)
            Text("BPM").font(.system(size: JazzTheme.size(9), weight: .bold, design: .monospaced)).foregroundStyle(JazzTheme.secondary)
        }
        .padding(.horizontal, 10).frame(minHeight: 38)
        .background(JazzTheme.raised, in: Capsule())
    }

    private var grooveControl: some View {
        Menu {
            ForEach(GrooveStyle.allCases) { groove in
                Button { store.updateGroove(groove) } label: {
                    Label(groove.rawValue, systemImage: groove.symbol)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: store.chart.groove.symbol)
                Text(store.chart.groove.rawValue).lineLimit(1).minimumScaleFactor(0.72)
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
            }
            .font(.system(size: JazzTheme.size(12.5), weight: .semibold, design: .rounded))
            .foregroundStyle(JazzTheme.brass)
            .frame(maxWidth: .infinity, minHeight: 38)
            .padding(.horizontal, 8)
            .background(JazzTheme.raised, in: Capsule())
        }
    }

    private var instrumentControl: some View {
        Menu {
            ForEach(InstrumentTone.allCases) { instrument in
                Button { store.updateInstrument(instrument) } label: {
                    Label(instrument.displayName, systemImage: instrument.symbol)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: store.chart.instrument.symbol)
                Text(store.chart.instrument.displayName).lineLimit(1).minimumScaleFactor(0.68)
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
            }
            .font(.system(size: JazzTheme.size(12.5), weight: .semibold, design: .rounded))
            .foregroundStyle(JazzTheme.brass)
            .frame(maxWidth: .infinity, minHeight: 38)
            .padding(.horizontal, 8)
            .background(JazzTheme.raised, in: Capsule())
        }
    }

    private var chartCanvas: some View {
        JazzPanel(accent: JazzTheme.emerald, padding: compact ? 11 : 14) {
            VStack(alignment: .leading, spacing: 11) {
                HStack {
                    JazzSectionLabel(number: "02", title: "Lead sheet", tint: JazzTheme.emerald)
                    Spacer()
                    if !compact {
                        Text("TOUCH EDITING")
                            .font(.system(size: JazzTheme.size(9), weight: .bold, design: .monospaced))
                            .kerning(1.1)
                            .foregroundStyle(JazzTheme.secondary)
                    }
                }
                HStack(spacing: 8) {
                    Button { store.undo() } label: {
                        Label("Undo", systemImage: "arrow.uturn.backward")
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
                    .disabled(!store.canUndo)
                    .opacity(store.canUndo ? 1 : 0.38)
                    .accessibilityIdentifier("undo-chart-change")
                    .accessibilityHint("Restores the chart before its most recent edit")

                    Button { store.redo() } label: {
                        Label("Redo", systemImage: "arrow.uturn.forward")
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
                    .disabled(!store.canRedo)
                    .opacity(store.canRedo ? 1 : 0.38)
                    .accessibilityIdentifier("redo-chart-change")
                    .accessibilityHint("Reapplies the chart edit that was just undone")

                    Spacer(minLength: 4)

                    Button { store.transpose(-1) } label: {
                        if compact {
                            Image(systemName: "minus")
                        } else {
                            Label("Down", systemImage: "minus")
                        }
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
                    .accessibilityIdentifier("transpose-chart-down")
                    .accessibilityLabel("Transpose down one semitone")

                    Button { store.transpose(1) } label: {
                        if compact {
                            Image(systemName: "plus")
                        } else {
                            Label("Up", systemImage: "plus")
                        }
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
                    .accessibilityIdentifier("transpose-chart-up")
                    .accessibilityLabel("Transpose up one semitone")
                }
                if let sections = store.chart.sections, !sections.isEmpty {
                    VStack(spacing: 12) {
                        ForEach(store.chart.sectionGroups) { group in
                            VStack(alignment: .leading, spacing: 9) {
                                if let section = group.section {
                                    NativeSectionHeader(section: section, store: store, compact: compact)
                                } else {
                                    Text("Opening bars")
                                        .font(.system(size: JazzTheme.size(11), weight: .bold, design: .rounded))
                                        .foregroundStyle(JazzTheme.secondary)
                                }
                                measureGrid(group.indexedMeasures)
                            }
                            .padding(10)
                            .background(JazzTheme.editorSurface.opacity(0.54), in: RoundedRectangle(cornerRadius: 15))
                            .overlay(RoundedRectangle(cornerRadius: 15).stroke(JazzTheme.stroke))
                        }
                    }
                } else {
                    measureGrid(Array(store.chart.measures.enumerated()))
                }
            }
        }
    }

    private func measureGrid(_ measures: [(offset: Int, element: JazzMeasure)]) -> some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(measures, id: \.element.id) { item in
                MeasureCard(
                    index: item.offset,
                    measure: item.element,
                    store: store,
                    presentsInspector: presentsInspectorOnSelection
                )
            }
        }
    }

    private var quickEntry: some View {
        JazzPanel(accent: JazzTheme.violet, padding: compact ? 13 : 16) {
            VStack(alignment: .leading, spacing: 10) {
                if compact {
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy) { quickEntryExpanded.toggle() }
                    } label: {
                        HStack {
                            JazzSectionLabel(number: "03", title: "Quick entry", tint: JazzTheme.violet)
                            Spacer()
                            Text(quickEntryExpanded ? "Done" : "Build or edit")
                                .font(.system(size: JazzTheme.size(12), weight: .semibold, design: .rounded))
                            Image(systemName: quickEntryExpanded ? "chevron.up" : "chevron.down")
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("quick-entry-toggle")
                } else {
                    HStack {
                        JazzSectionLabel(number: "03", title: "Quick entry", tint: JazzTheme.violet)
                        Spacer()
                        Label("Live source", systemImage: "bolt.fill")
                            .font(.system(size: JazzTheme.size(10.5), weight: .semibold, design: .rounded))
                            .foregroundStyle(JazzTheme.secondary)
                    }
                }
                if quickEntryExpanded || !compact {
                    ChordPaletteView(store: store)
                    TextEditor(text: Binding(get: { store.draftText }, set: store.setDraft))
                        .focused($editorFocused)
                        .font(.system(size: JazzTheme.size(15), weight: .medium, design: .monospaced))
                        .foregroundStyle(JazzTheme.text)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: compact ? 112 : 92, maxHeight: compact ? 180 : 150)
                        .padding(10)
                        .background(JazzTheme.editorSurface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(draftColor.opacity(0.42)))
                        .accessibilityLabel("Bar-delimited chart text")
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: draftSymbol).foregroundStyle(draftColor)
                        Text(draftMessage)
                            .font(.system(size: JazzTheme.size(11.5), weight: .medium, design: .rounded))
                            .foregroundStyle(draftColor)
                        Spacer()
                        if case .valid = store.draftState {
                            Button("Apply now") { store.applyDraftNow() }
                                .buttonStyle(.borderless)
                        }
                    }
                    Text("Separate bars with | and chords with spaces. Two chords in one bar split its four beats evenly.")
                        .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                        .foregroundStyle(JazzTheme.secondary)
                }
            }
        }
    }

    private var draftColor: Color {
        switch store.draftState {
        case .current: JazzTheme.secondary
        case .waiting, .valid: JazzTheme.emerald
        case .invalid: JazzTheme.coral
        }
    }

    private var draftSymbol: String {
        switch store.draftState {
        case .current: "checkmark.circle"
        case .waiting: "clock"
        case .valid: "bolt.circle"
        case .invalid: "exclamationmark.triangle"
        }
    }

    private var draftMessage: String {
        switch store.draftState {
        case .current: "Lead sheet and source agree."
        case .waiting: "Reading the changes…"
        case let .valid(count): "Valid · \(count) bar\(count == 1 ? "" : "s") · applying automatically"
        case let .invalid(message): message
        }
    }

    private var privacyFooter: some View {
        HStack(spacing: 7) {
            Image(systemName: "lock.shield")
            Text("Every chord, sound, and file stays on this device.")
        }
        .font(.system(size: JazzTheme.size(10.5), weight: .medium, design: .rounded))
        .foregroundStyle(JazzTheme.secondary)
        .padding(.bottom, 6)
    }
}

private struct NativeSectionHeader: View {
    let section: JazzChartSection
    @ObservedObject var store: JazzStudioStore
    let compact: Bool

    private var isLooping: Bool { store.loopedSectionID == section.id }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 9) { identity; metadata; controls }
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 9) { identity; Spacer(); controls }
                metadata
            }
        }
        .padding(.bottom, 2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("chart-section-\(section.id.uuidString)")
    }

    private var identity: some View {
        Text(section.name.prefix(2).uppercased())
            .font(.system(size: JazzTheme.size(compact ? 14 : 15), weight: .black, design: .rounded))
            .foregroundStyle(JazzTheme.background)
            .frame(width: 44, height: 44)
            .background(JazzTheme.emerald, in: RoundedRectangle(cornerRadius: 11))
            .accessibilityHidden(true)
    }

    private var metadata: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Section name", text: Binding(
                get: { section.name },
                set: { store.updateSectionName(section.id, name: $0) }
            ))
            .font(.system(size: JazzTheme.size(13), weight: .bold, design: .rounded))
            .textFieldStyle(.plain)
            .accessibilityIdentifier("section-name-\(section.id.uuidString)")
            TextField("Section note", text: Binding(
                get: { section.annotation },
                set: { store.updateSectionAnnotation(section.id, annotation: $0) }
            ))
            .font(.system(size: JazzTheme.size(10.5), design: .rounded))
            .foregroundStyle(JazzTheme.secondary)
            .textFieldStyle(.plain)
            .accessibilityIdentifier("section-note-\(section.id.uuidString)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var controls: some View {
        HStack(spacing: 7) {
            Menu {
                ForEach(JazzSectionVoiceLeadingBoundary.allCases, id: \.self) { boundary in
                    Button {
                        store.updateSectionBoundary(section.id, boundary: boundary)
                    } label: {
                        if boundary == section.voiceLeadingBoundary {
                            Label(boundary.label, systemImage: "checkmark")
                        } else {
                            Text(boundary.label)
                        }
                    }
                }
            } label: {
                Image(systemName: section.voiceLeadingBoundary == .reset ? "arrow.down.to.line" : "point.forward.to.point.capsulepath")
                    .frame(width: 44, height: 44)
                    .background(JazzTheme.raised, in: Circle())
            }
            .accessibilityLabel("Voice leading at section \(section.name)")
            .accessibilityValue(section.voiceLeadingBoundary.label)

            Menu {
                Button { store.transposeSection(section.id, semitones: -1) } label: {
                    Label("Down one semitone", systemImage: "arrow.down")
                }
                Button { store.transposeSection(section.id, semitones: 1) } label: {
                    Label("Up one semitone", systemImage: "arrow.up")
                }
            } label: {
                Image(systemName: "music.note")
                    .frame(width: 44, height: 44)
                    .background(JazzTheme.raised, in: Circle())
            }
            .accessibilityIdentifier("section-transpose-\(section.id.uuidString)")
            .accessibilityLabel("Transpose section \(section.name)")
            .accessibilityHint("Changes only this section; exact stored voicings stay at their saved pitches.")

            Button { store.toggleSectionLoop(section.id) } label: {
                Image(systemName: "repeat")
                    .frame(width: 44, height: 44)
                    .background(isLooping ? JazzTheme.brass.opacity(0.24) : JazzTheme.raised, in: Circle())
                    .overlay(Circle().stroke(isLooping ? JazzTheme.brass : Color.clear))
            }
            .buttonStyle(.plain)
            .foregroundStyle(isLooping ? JazzTheme.brass : JazzTheme.secondary)
            .accessibilityIdentifier("section-loop-\(section.id.uuidString)")
            .accessibilityLabel("Loop section \(section.name)")
            .accessibilityValue(isLooping ? "On" : "Off")
        }
    }
}

private struct ChordPaletteView: View {
    @ObservedObject var store: JazzStudioStore
    @State private var selectedRootID = "c"

    private var selectedRoot: JazzChordPaletteRoot {
        JazzChordPalette.roots.first(where: { $0.id == selectedRootID })
            ?? JazzChordPalette.roots[0]
    }

    private let qualityColumns = [
        GridItem(.adaptive(minimum: 68, maximum: 104), spacing: 8)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label("Chord palette", systemImage: "square.grid.3x3.fill")
                    .font(.system(size: JazzTheme.size(13), weight: .bold, design: .rounded))
                    .foregroundStyle(JazzTheme.paper)
                Spacer()
                Text("Tap a quality to add a bar")
                    .font(.system(size: JazzTheme.size(9.5), weight: .medium, design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }

            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ForEach(JazzChordPalette.roots) { root in
                        Button {
                            selectedRootID = root.id
                        } label: {
                            Text(root.label)
                                .font(.system(size: JazzTheme.size(13), weight: .bold, design: .rounded))
                                .frame(minWidth: 44, minHeight: 44)
                                .padding(.horizontal, 5)
                                .foregroundStyle(root.id == selectedRootID ? JazzTheme.background : JazzTheme.text)
                                .background(
                                    root.id == selectedRootID ? JazzTheme.brass : JazzTheme.raised,
                                    in: RoundedRectangle(cornerRadius: 11)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 11)
                                        .stroke(root.id == selectedRootID ? JazzTheme.brass : JazzTheme.stroke)
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("chord-palette-root-\(root.id)")
                        .accessibilityLabel("Palette root \(root.label)")
                        .accessibilityValue(root.id == selectedRootID ? "Selected" : "Not selected")
                    }
                }
            }
            .scrollIndicators(.hidden)

            LazyVGrid(columns: qualityColumns, spacing: 8) {
                ForEach(JazzChordPalette.qualities) { quality in
                    let symbol = JazzChordPalette.symbol(root: selectedRoot, quality: quality)
                    Button {
                        store.appendPaletteChord(root: selectedRoot, quality: quality)
                    } label: {
                        Text(quality.label)
                            .font(.system(size: JazzTheme.size(11.5), weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(JazzTheme.violet)
                            .background(JazzTheme.raised, in: RoundedRectangle(cornerRadius: 11))
                            .overlay(RoundedRectangle(cornerRadius: 11).stroke(JazzTheme.violet.opacity(0.34)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("chord-palette-quality-\(quality.id)")
                    .accessibilityLabel("Add \(symbol) as a new bar")
                }
            }
        }
        .padding(12)
        .background(JazzTheme.editorSurface.opacity(0.78), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(JazzTheme.violet.opacity(0.34)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("chord-palette")
    }
}

private struct MeasureCard: View {
    let index: Int
    let measure: JazzMeasure
    @ObservedObject var store: JazzStudioStore
    let presentsInspector: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var active: Bool { measure.chords.contains { $0.id == store.audio.activeChordID } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(String(format: "%02d", index + 1))
                    .font(.system(size: JazzTheme.size(9.5), weight: .bold, design: .monospaced))
                    .foregroundStyle(active ? JazzTheme.brass : JazzTheme.secondary)
                Spacer()
                if active {
                    HStack(spacing: 3) {
                        ForEach(0..<3, id: \.self) { bar in
                            Capsule().fill(JazzTheme.brass).frame(width: 3, height: CGFloat(7 + bar * 4))
                        }
                    }
                    .accessibilityHidden(true)
                }
                Menu {
                    if let section = store.sectionStarting(at: measure.id) {
                        Button(role: .destructive) {
                            store.removeSectionStarting(at: measure.id)
                        } label: {
                            Label("Remove section \(section.name)", systemImage: "rectangle.split.1x2")
                        }
                    } else {
                        Button {
                            store.startSection(at: measure.id)
                        } label: {
                            Label("Start section here", systemImage: "text.badge.plus")
                        }
                    }
                    Divider()
                    Button {
                        store.insertMeasure(after: measure.id)
                    } label: {
                        Label("Insert bar after", systemImage: "plus.rectangle.on.rectangle")
                    }
                    Button(role: .destructive) {
                        store.deleteMeasure(measure.id)
                    } label: {
                        Label("Delete bar", systemImage: "trash")
                    }
                    .disabled(store.chart.measures.count == 1)
                } label: {
                    Image(systemName: "ellipsis.circle")
                        // Leave real margin above the 44-point accessibility floor;
                        // exact-point frames can round infinitesimally below 44 in
                        // XCTest's cross-process coordinate conversion.
                        .frame(width: 48, height: 48)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Actions for bar \(index + 1)")
                .accessibilityHint(
                    store.sectionStarting(at: measure.id) == nil
                        ? "Includes starting a named section here"
                        : "Includes removing this section boundary"
                )
            }
            HStack(spacing: 5) {
                ForEach(measure.chords) { chord in
                    Button {
                        store.select(chord, showInspector: presentsInspector)
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Text(chord.symbol)
                                .font(.system(
                                    size: JazzTheme.size(measure.chords.count > 2 ? 15 : 19),
                                    weight: .bold,
                                    design: .serif
                                ))
                                .foregroundStyle(
                                    chord.id == store.selectedChordID ? JazzTheme.background : JazzTheme.text
                                )
                                .lineLimit(1)
                                .minimumScaleFactor(0.68)
                                .frame(maxWidth: .infinity, minHeight: 38)
                                .padding(.horizontal, 5)
                            if !chord.annotation.isEmpty {
                                Image(systemName: "note.text")
                                    .font(.system(size: JazzTheme.size(8), weight: .bold))
                                    .foregroundStyle(
                                        chord.id == store.selectedChordID ? JazzTheme.background : JazzTheme.violet
                                    )
                                    .padding(4)
                                    .accessibilityHidden(true)
                            }
                        }
                        .background(
                            chord.id == store.selectedChordID ? JazzTheme.brass : Color.clear,
                            in: RoundedRectangle(cornerRadius: 9)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(chordAccessibilityLabel(chord))
                    .contextMenu {
                        Button {
                            store.select(chord)
                            store.duplicateSelectedChord()
                        } label: {
                            Label("Duplicate change", systemImage: "plus.square.on.square")
                        }
                        Button {
                            store.select(chord)
                            store.moveSelectedChord(by: -1)
                        } label: {
                            Label("Move earlier", systemImage: "arrow.left")
                        }
                        Button {
                            store.select(chord)
                            store.moveSelectedChord(by: 1)
                        } label: {
                            Label("Move later", systemImage: "arrow.right")
                        }
                        Button(role: .destructive) {
                            store.select(chord)
                            store.deleteSelectedChord()
                        } label: {
                            Label("Delete change", systemImage: "trash")
                        }
                    }
                    .accessibilityAction(named: "Duplicate change") {
                        store.select(chord)
                        store.duplicateSelectedChord()
                    }
                    .accessibilityAction(named: "Delete change") {
                        store.select(chord)
                        store.deleteSelectedChord()
                    }
                }
            }
            Rectangle().fill(active ? JazzTheme.brass : JazzTheme.emerald.opacity(0.28)).frame(height: active ? 2 : 1)
        }
        .padding(10)
        .background(active ? JazzTheme.brass.opacity(0.08) : JazzTheme.raised.opacity(0.72), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(active ? JazzTheme.brass.opacity(0.55) : JazzTheme.stroke))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.16), value: active)
    }

    private func chordAccessibilityLabel(_ chord: JazzChordEvent) -> String {
        var label = "Measure \(index + 1), \(chord.symbol), \(chord.beats.formatted()) beats"
        if !chord.annotation.isEmpty { label += ", note: \(chord.annotation)" }
        return label
    }
}

private struct LibraryView: View {
    @ObservedObject var store: JazzStudioStore
    let sheetMode: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            JazzForgeBackground()
            List {
                Section {
                    JazzAppIdentity(compact: false)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 8, leading: 3, bottom: 14, trailing: 3))
                }
                Section("Your chart") {
                    Button { store.newChart(); if sheetMode { dismiss() } } label: {
                        Label("New blank chart", systemImage: "plus.square")
                    }
                    Button {
                        if sheetMode {
                            dismiss()
                            Task {
                                try? await Task.sleep(for: .milliseconds(350))
                                store.isDocumentPresented = true
                            }
                        } else {
                            store.isDocumentPresented = true
                        }
                    } label: {
                        Label("Open or export", systemImage: "folder")
                    }
                }
                Section("Progression library") {
                    ForEach(store.filteredLibrary) { entry in
                        Button { store.replaceChart(with: entry); if sheetMode { dismiss() } } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(entry.kicker)
                                    .font(.system(size: JazzTheme.size(8.5), weight: .bold, design: .monospaced))
                                    .kerning(1.1).foregroundStyle(JazzTheme.brass)
                                Text(entry.title)
                                    .font(.system(size: JazzTheme.size(15), weight: .bold, design: .rounded))
                                    .foregroundStyle(JazzTheme.text)
                                Text(entry.note)
                                    .font(.system(size: JazzTheme.size(11), design: .rounded))
                                    .foregroundStyle(JazzTheme.secondary)
                                    .lineLimit(3)
                                HStack {
                                    Text(entry.provenance.rawValue)
                                    Spacer()
                                    if let tempo = entry.tempo {
                                        Text("\(Int(tempo)) BPM")
                                    } else {
                                        Text("Keeps tempo")
                                    }
                                }
                                .font(.system(size: JazzTheme.size(8.5), design: .monospaced))
                                .foregroundStyle(JazzTheme.secondary.opacity(0.8))
                            }
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(JazzTheme.panel.opacity(0.65))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .listStyle(.sidebar)
            .searchable(text: $store.librarySearch, prompt: "Cadence, color, or composer")
        }
        .navigationTitle(sheetMode ? "Progression library" : "")
        .toolbar {
            if sheetMode {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}

private struct ChordInspectorView: View {
    @ObservedObject var store: JazzStudioStore
    let sheetMode: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            JazzForgeBackground()
            ScrollView {
                VStack(spacing: 14) {
                    if let chord = store.selectedChord, let description = store.selectedDescription {
                        inspectorHeader(chord, description)
                        annotationCard(chord)
                        pianoCard(description)
                        voicingCard()
                        continuationCard()
                        evidenceCard(description)
                    } else {
                        ContentUnavailableView("Select a chord", systemImage: "music.quarternote.3", description: Text("Tap any change in the lead sheet to inspect its sound and motion."))
                            .foregroundStyle(JazzTheme.secondary)
                    }
                }
                .padding(sheetMode ? 16 : 2)
            }
            .scrollIndicators(.hidden)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .toolbar {
            if sheetMode { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func inspectorHeader(_ chord: JazzChordEvent, _ description: ChordDescription) -> some View {
        JazzPanel(accent: JazzTheme.brass) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        JazzSectionLabel(number: "04", title: "Harmony lens", tint: JazzTheme.brass)
                        Text(chord.symbol)
                            .font(.system(size: JazzTheme.size(34), weight: .bold, design: .serif))
                            .foregroundStyle(JazzTheme.paper)
                    }
                    Spacer()
                    Text(description.romanNumeral)
                        .font(.system(size: JazzTheme.size(24), weight: .black, design: .rounded))
                        .foregroundStyle(JazzTheme.background)
                        .padding(.horizontal, 13).padding(.vertical, 8)
                        .background(JazzTheme.brass, in: RoundedRectangle(cornerRadius: 12))
                }
                Text(description.function)
                    .font(.system(size: JazzTheme.size(15), weight: .semibold, design: .rounded))
                    .foregroundStyle(JazzTheme.text)
                Text(description.colorNote)
                    .font(.system(size: JazzTheme.size(12), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
                SelectedChordSymbolEditor(store: store, chord: chord)
                    .id(chord.id.uuidString + "-" + chord.symbol)
                Menu {
                    Button("Duplicate change") { store.duplicateSelectedChord() }
                        .disabled(!store.canDuplicateSelectedChord)
                    Button("Move earlier") { store.moveSelectedChord(by: -1) }
                        .disabled(!store.canMoveSelectedChordEarlier)
                    Button("Move later") { store.moveSelectedChord(by: 1) }
                        .disabled(!store.canMoveSelectedChordLater)
                    Button(role: .destructive) {
                        store.deleteSelectedChord()
                    } label: {
                        Text("Delete change")
                    }
                    .disabled(!store.canDeleteSelectedChord)
                    Divider()
                    Button("Insert bar after") {
                        if let id = store.selectedMeasureID { store.insertMeasure(after: id) }
                    }
                    Button(role: .destructive) {
                        if let id = store.selectedMeasureID { store.deleteMeasure(id) }
                    } label: {
                        Text("Delete bar")
                    }
                    .disabled(!store.canDeleteSelectedMeasure)
                } label: {
                    Label("More change actions", systemImage: "ellipsis.circle")
                        .frame(minHeight: 44)
                }
                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
            }
        }
    }

    private func annotationCard(_ chord: JazzChordEvent) -> some View {
        JazzPanel(accent: JazzTheme.violet) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    JazzSectionLabel(number: "05", title: "Chord note", tint: JazzTheme.violet)
                    Spacer()
                    Text("\(chord.annotation.count)/500")
                        .font(.system(size: JazzTheme.size(9), weight: .semibold, design: .monospaced))
                        .foregroundStyle(JazzTheme.secondary)
                }
                TextEditor(text: Binding(
                    get: { store.selectedChord?.annotation ?? "" },
                    set: store.updateSelectedChordAnnotation
                ))
                .font(.system(size: JazzTheme.size(13), design: .rounded))
                .foregroundStyle(JazzTheme.text)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 78, maxHeight: 112)
                .padding(9)
                .background(JazzTheme.editorSurface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(JazzTheme.violet.opacity(0.3)))
                .accessibilityLabel("Note for \(chord.symbol)")
                Text("Saved only in the private FrankenJazz document; text and MIDI exports omit chord notes.")
                    .font(.system(size: JazzTheme.size(10), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }
        }
    }

    private func pianoCard(_ description: ChordDescription) -> some View {
        let exactPitches = Set(store.selectedMIDIPitches)
        return JazzPanel(accent: JazzTheme.cyan) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    JazzSectionLabel(number: "06", title: "Literal tones", tint: JazzTheme.cyan)
                    Spacer()
                    Text(description.toneNames.joined(separator: " · "))
                        .font(.system(size: JazzTheme.size(10), weight: .semibold, design: .monospaced))
                        .foregroundStyle(JazzTheme.text)
                }
                HStack(spacing: 6) {
                    Label("Press, glide, or play several keys", systemImage: "hand.tap")
                    Spacer(minLength: 8)
                    Text(store.chart.instrument.displayName)
                }
                .font(.system(size: JazzTheme.size(9.5), weight: .semibold, design: .rounded))
                .foregroundStyle(JazzTheme.secondary)
                Text(store.chart.instrument.nativeAudioSourceNote)
                    .font(.system(size: JazzTheme.size(8.5), weight: .medium, design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
                Button {
                    store.previewSelectedChord()
                } label: {
                    Label("Hear this voicing", systemImage: "speaker.wave.2.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
                .accessibilityIdentifier("preview-selected-chord")
                .accessibilityHint("Plays every highlighted key together using \(store.chart.instrument.displayName).")
                MiniPiano(
                    highlightedMIDIPitches: exactPitches,
                    accent: JazzTheme.cyan,
                    instrumentName: store.chart.instrument.displayName,
                    onKeyPress: store.previewKey,
                    onActiveKeysChanged: store.previewKeys
                )
                .frame(height: 96)
                if let issue = store.audio.previewIssue {
                    Label(issue, systemImage: "exclamationmark.triangle")
                        .font(.system(size: JazzTheme.size(9.5), weight: .semibold, design: .rounded))
                        .foregroundStyle(JazzTheme.coral)
                }
            }
        }
    }

    private func voicingCard() -> some View {
        let mode = store.selectedVoicingMode
        let midi = store.selectedMIDIPitches
        return JazzPanel(accent: JazzTheme.emerald) {
            VStack(alignment: .leading, spacing: 11) {
                JazzSectionLabel(number: "07", title: "Voicing bench", tint: JazzTheme.emerald)
                Menu {
                    ForEach(VoicingFamily.allCases) { family in
                        Button { store.updateVoicing(family) } label: {
                            if family == store.chart.voicingFamily {
                                Label(family.rawValue, systemImage: "checkmark")
                            } else {
                                Text(family.rawValue)
                            }
                        }
                    }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(voicingTitle(mode))
                                .font(.system(size: JazzTheme.size(14), weight: .bold, design: .rounded))
                            Text(voicingNote(mode))
                                .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                                .foregroundStyle(JazzTheme.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down")
                    }
                    .foregroundStyle(JazzTheme.text)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 48)
                    .background(JazzTheme.raised, in: RoundedRectangle(cornerRadius: 12))
                }
                ScrollView(.horizontal) {
                    HStack(spacing: 7) {
                        ForEach(Array(midi.enumerated()), id: \.offset) { index, pitch in
                            if mode == .automatic {
                                voicingPitchLabel(pitch)
                            } else {
                                Menu {
                                    Button("Down one octave") { store.moveSelectedVoice(at: index, semitones: -12) }
                                    Button("Down one semitone") { store.moveSelectedVoice(at: index, semitones: -1) }
                                    Button("Up one semitone") { store.moveSelectedVoice(at: index, semitones: 1) }
                                    Button("Up one octave") { store.moveSelectedVoice(at: index, semitones: 12) }
                                    Divider()
                                    Button("Remove voice", role: .destructive) { store.removeSelectedVoice(at: index) }
                                        .disabled(midi.count == 1)
                                } label: {
                                    voicingPitchLabel(pitch)
                                }
                                .accessibilityLabel("Edit voice \(index + 1), \(midiName(pitch))")
                                .accessibilityHint("Moves or removes this exact voice; editing a frozen voicing makes it manual")
                            }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                if mode == .automatic {
                    Button("Edit exact voicing") { store.beginManualSelectedVoicing() }
                        .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.emerald))
                        .accessibilityHint("Copies these pitches into a note-by-note manual voicing")
                    Button("Freeze exact voicing") { store.freezeSelectedVoicing() }
                        .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.emerald))
                        .accessibilityHint("Keeps these exact pitches when the chart voicing family changes")
                } else {
                    Button("Add voice") { store.addSelectedVoice() }
                        .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.emerald))
                        .accessibilityHint("Adds the next available chord tone as an editable manual voice")
                    Button("Use automatic \(store.chart.voicingFamily.rawValue)") {
                        store.clearSelectedStoredVoicing()
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.emerald))
                    .accessibilityHint("Discards the exact pitches and follows the chart voicing family")
                }
            }
        }
    }

    private func voicingTitle(_ mode: JazzVoicingMode) -> String {
        switch mode {
        case .automatic: "Automatic · \(store.chart.voicingFamily.rawValue)"
        case .frozen: "Frozen exact voicing"
        case .manual: "Manual exact voicing"
        }
    }

    private func voicingNote(_ mode: JazzVoicingMode) -> String {
        switch mode {
        case .automatic: store.chart.voicingFamily.note
        case .frozen: "Family changes leave these pitches untouched; edit a note to make it Manual"
        case .manual: "User-authored order, octaves, and doublings play and export exactly"
        }
    }

    private func voicingPitchLabel(_ pitch: Int) -> some View {
        Text(midiName(pitch))
            .font(.system(size: JazzTheme.size(11), weight: .bold, design: .monospaced))
            .foregroundStyle(JazzTheme.background)
            .padding(.horizontal, 8).padding(.vertical, 6)
            .background(JazzTheme.emerald, in: Capsule())
    }

    private func evidenceCard(_ description: ChordDescription) -> some View {
        JazzPanel(accent: JazzTheme.violet) {
            VStack(alignment: .leading, spacing: 10) {
                JazzSectionLabel(number: "09", title: "What is factual", tint: JazzTheme.violet)
                evidenceRow("Literal", "The symbol resolves to \(description.toneNames.joined(separator: ", ")).")
                evidenceRow(
                    "Context",
                    "In \(store.chart.key.rawValue), the root reads as "
                        + "\(description.romanNumeral): \(description.function.lowercased())."
                )
                evidenceRow(
                    "Motion",
                    store.selectedTransitionSummary
                )
                Text("Contextual readings explain one useful interpretation; they do not claim a single authorial intent.")
                    .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }
        }
    }

    private func continuationCard() -> some View {
        JazzPanel(accent: JazzTheme.brass) {
            VStack(alignment: .leading, spacing: 11) {
                HStack(alignment: .firstTextBaseline) {
                    JazzSectionLabel(number: "08", title: "Next changes", tint: JazzTheme.brass)
                    Spacer()
                    Text("G2 · BOUNDED")
                        .font(.system(size: JazzTheme.size(8), weight: .bold, design: .monospaced))
                        .foregroundStyle(JazzTheme.secondary)
                }

                Text("Options from the source-owned continuation engine—not predictions or rules you must follow.")
                    .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)

                if let issue = store.continuationIssue {
                    Label(issue, systemImage: "info.circle")
                        .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                        .foregroundStyle(JazzTheme.secondary)
                } else {
                    ForEach(store.continuationOptions) { option in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(option.candidate.chordSymbol)
                                    .font(.system(size: JazzTheme.size(22), weight: .bold, design: .serif))
                                    .foregroundStyle(JazzTheme.paper)
                                Spacer()
                                Text(option.candidate.category.replacingOccurrences(of: "-", with: " ").uppercased())
                                    .font(.system(size: JazzTheme.size(7.5), weight: .bold, design: .monospaced))
                                    .foregroundStyle(JazzTheme.brass)
                            }
                            Text(option.candidate.whyExplanation)
                                .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                                .foregroundStyle(JazzTheme.text)
                                .lineSpacing(2)
                            HStack(spacing: 12) {
                                Label(
                                    option.candidate.expectedMotion.replacingOccurrences(of: "-", with: " "),
                                    systemImage: "arrow.triangle.swap"
                                )
                                Label(
                                    option.candidate.preservedGuideTones ? "guide tones kept" : "new guide-tone color",
                                    systemImage: option.candidate.preservedGuideTones ? "link" : "sparkles"
                                )
                            }
                            .font(.system(size: JazzTheme.size(8.5), weight: .semibold, design: .rounded))
                            .foregroundStyle(JazzTheme.secondary)
                            Button("Use for next change") { store.applyContinuation(option) }
                                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
                                .accessibilityHint("Applies this option as one undoable edit if the chart has not changed")
                        }
                        .padding(12)
                        .background(JazzTheme.raised, in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("continuation-option-\(option.candidate.rank)")
                    }
                }
            }
        }
        .accessibilityIdentifier("continuation-lab")
    }

    private func evidenceRow(_ label: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Text(label.uppercased())
                .font(.system(size: JazzTheme.size(8), weight: .bold, design: .monospaced))
                .foregroundStyle(JazzTheme.violet)
                .frame(width: 52, alignment: .leading)
            Text(text)
                .font(.system(size: JazzTheme.size(11.5), design: .rounded))
                .foregroundStyle(JazzTheme.text)
        }
    }

    private func midiName(_ midi: Int) -> String {
        JazzTheory.noteName(midi % 12, flats: store.chart.key.prefersFlats) + String(midi / 12 - 1)
    }
}

private struct SelectedChordSymbolEditor: View {
    @ObservedObject var store: JazzStudioStore
    let chord: JazzChordEvent
    @State private var draft: String
    @State private var keepExactPitches = false
    @State private var issue: String?

    init(store: JazzStudioStore, chord: JazzChordEvent) {
        self.store = store
        self.chord = chord
        _draft = State(initialValue: chord.symbol)
    }

    private var hasStoredPitches: Bool {
        chord.manualMIDIPitches != nil || chord.frozenMIDIPitches != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TextField("Chord symbol", text: $draft)
                    .font(.system(size: JazzTheme.size(16), weight: .bold, design: .monospaced))
                    .foregroundStyle(JazzTheme.text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit(apply)
                    .padding(.horizontal, 11)
                    .frame(minHeight: 44)
                    .background(JazzTheme.editorSurface, in: RoundedRectangle(cornerRadius: 11))
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(JazzTheme.brass.opacity(0.35)))
                    .accessibilityLabel("Selected chord symbol")
                Button("Apply symbol", action: apply)
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines) == chord.symbol)
            }
            if hasStoredPitches {
                Toggle("Keep exact pitches as Manual", isOn: $keepExactPitches)
                    .font(.system(size: JazzTheme.size(11), weight: .semibold, design: .rounded))
                    .tint(JazzTheme.emerald)
                Text("Off returns the renamed chord to Automatic. On keeps the current pitches intentionally; Frozen becomes Manual.")
                    .font(.system(size: JazzTheme.size(9.5), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }
            if let issue {
                Text(issue)
                    .font(.system(size: JazzTheme.size(10), weight: .semibold, design: .rounded))
                    .foregroundStyle(JazzTheme.coral)
                    .accessibilityLabel("Symbol edit refused: \(issue)")
            }
        }
    }

    private func apply() {
        issue = store.updateSelectedChordSymbol(draft, keepExactPitches: keepExactPitches)
        guard issue == nil else { return }
        draft = store.selectedChord?.symbol ?? draft
        keepExactPitches = false
    }
}

private struct MiniPiano: View {
    let highlightedMIDIPitches: Set<Int>
    let accent: Color
    let instrumentName: String
    let onKeyPress: (Int) -> Void
    let onActiveKeysChanged: (Set<Int>) -> Void
    @State private var activeTouchMIDIs = Set<Int>()

    private let whiteWidth: CGFloat = 46
    private let whiteSpacing: CGFloat = 1
    private let blackTouchWidth: CGFloat = 44
    private let blackVisualWidth: CGFloat = 30

    private var bounds: (start: Int, end: Int) {
        let valid = highlightedMIDIPitches.filter { (21...108).contains($0) }
        let lowest = valid.min() ?? 60
        let highest = valid.max() ?? 72
        let start = max(24, min(84, (lowest / 12) * 12))
        let end = min(108, max(start + 24, ((highest + 11) / 12) * 12))
        return (start, end)
    }

    private var whitePitches: [Int] {
        (bounds.start...bounds.end).filter { [0, 2, 4, 5, 7, 9, 11].contains($0 % 12) }
    }

    private var blackPitches: [Int] {
        guard bounds.end > bounds.start else { return [] }
        return (bounds.start..<bounds.end).filter { [1, 3, 6, 8, 10].contains($0 % 12) }
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            ZStack(alignment: .topLeading) {
                HStack(spacing: whiteSpacing) {
                    ForEach(whitePitches, id: \.self) { midi in
                        Button { onKeyPress(midi) } label: {
                            ZStack(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 5)
                                    .fill(whiteKeyColor(midi))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 5)
                                            .stroke(JazzTheme.background.opacity(0.45), lineWidth: 1)
                                    )
                                Text(noteName(midi))
                                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                                    .foregroundStyle(Color.black.opacity(0.70))
                                    .padding(.bottom, 5)
                            }
                            .frame(width: whiteWidth, height: 96)
                        }
                        .buttonStyle(PianoKeyPressStyle())
                        .accessibilityIdentifier("piano-key-\(midi)")
                        .accessibilityLabel(accessibilityLabel(for: midi))
                        .accessibilityHint("Plays this note using \(instrumentName).")
                    }
                }
                ForEach(blackPitches, id: \.self) { midi in
                    let precedingWhiteKeys = whitePitches.lazy.filter { $0 < midi }.count
                    Button { onKeyPress(midi) } label: {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                activeTouchMIDIs.contains(midi)
                                    ? accent
                                    : highlightedMIDIPitches.contains(midi)
                                    ? JazzTheme.brass
                                    : Color(red: 0.055, green: 0.05, blue: 0.07)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(JazzTheme.paper.opacity(0.18), lineWidth: 1)
                            )
                            .frame(width: blackVisualWidth, height: 60)
                            .shadow(color: .black.opacity(0.24), radius: 2, y: 2)
                    }
                    .buttonStyle(PianoKeyPressStyle())
                    .frame(width: blackTouchWidth, height: 60)
                    .position(
                        x: CGFloat(precedingWhiteKeys) * (whiteWidth + whiteSpacing) - whiteSpacing / 2,
                        y: 30
                    )
                    .accessibilityIdentifier("piano-key-\(midi)")
                    .accessibilityLabel(accessibilityLabel(for: midi))
                    .accessibilityHint("Plays this note using \(instrumentName).")
                }
            }
            .frame(width: keyboardWidth, height: 96, alignment: .leading)
            .overlay {
                PianoMultiTouchSurface(
                    whitePitches: whitePitches,
                    blackPitches: blackPitches,
                    whiteWidth: whiteWidth,
                    whiteSpacing: whiteSpacing,
                    blackTouchWidth: blackTouchWidth,
                    onActiveKeysChanged: { pitches in
                        guard pitches != activeTouchMIDIs else { return }
                        activeTouchMIDIs = pitches
                        onActiveKeysChanged(pitches)
                    }
                )
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Playable chord keyboard")
    }

    private var keyboardWidth: CGFloat {
        CGFloat(whitePitches.count) * whiteWidth
            + CGFloat(max(0, whitePitches.count - 1)) * whiteSpacing
    }

    private func accessibilityLabel(for midi: Int) -> String {
        highlightedMIDIPitches.contains(midi)
            ? "\(noteName(midi)), selected chord voice"
            : noteName(midi)
    }

    private func whiteKeyColor(_ midi: Int) -> Color {
        if activeTouchMIDIs.contains(midi) { return accent }
        return highlightedMIDIPitches.contains(midi) ? accent.opacity(0.88) : JazzTheme.paper
    }

    private func noteName(_ midi: Int) -> String {
        let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
        return "\(names[(midi % 12 + 12) % 12])\(midi / 12 - 1)"
    }
}

/// Geometry is kept separate from UIKit event ownership so the black-key-first
/// hit law can be exercised without starting an audio device.
struct JazzPianoTouchLayout {
    var whitePitches: [Int]
    var blackPitches: [Int]
    var whiteWidth: CGFloat
    var whiteSpacing: CGFloat
    var blackTouchWidth: CGFloat

    func midi(at point: CGPoint) -> Int? {
        guard point.x >= 0, point.y >= 0, point.y <= 96 else { return nil }
        if point.y <= 60 {
            for midi in blackPitches {
                let preceding = whitePitches.lazy.filter { $0 < midi }.count
                let center = CGFloat(preceding) * (whiteWidth + whiteSpacing) - whiteSpacing / 2
                if abs(point.x - center) <= blackTouchWidth / 2 { return midi }
            }
        }
        let stride = whiteWidth + whiteSpacing
        let index = Int(floor(point.x / stride))
        guard whitePitches.indices.contains(index), point.x - CGFloat(index) * stride <= whiteWidth else {
            return nil
        }
        return whitePitches[index]
    }
}

private struct PianoMultiTouchSurface: UIViewRepresentable {
    var whitePitches: [Int]
    var blackPitches: [Int]
    var whiteWidth: CGFloat
    var whiteSpacing: CGFloat
    var blackTouchWidth: CGFloat
    var onActiveKeysChanged: (Set<Int>) -> Void

    func makeUIView(context: Context) -> PianoTouchView {
        let view = PianoTouchView()
        view.isMultipleTouchEnabled = true
        view.isAccessibilityElement = false
        view.accessibilityElementsHidden = true
        update(view)
        return view
    }

    func updateUIView(_ uiView: PianoTouchView, context: Context) {
        update(uiView)
    }

    private func update(_ view: PianoTouchView) {
        view.layout = JazzPianoTouchLayout(
            whitePitches: whitePitches,
            blackPitches: blackPitches,
            whiteWidth: whiteWidth,
            whiteSpacing: whiteSpacing,
            blackTouchWidth: blackTouchWidth
        )
        view.onActiveKeysChanged = onActiveKeysChanged
    }
}

private final class PianoTouchView: UIView {
    var layout = JazzPianoTouchLayout(
        whitePitches: [], blackPitches: [], whiteWidth: 46,
        whiteSpacing: 1, blackTouchWidth: 44
    )
    var onActiveKeysChanged: ((Set<Int>) -> Void)?
    private var pitchByTouch = [ObjectIdentifier: Int]()

    override func didMoveToWindow() {
        super.didMoveToWindow()
        var ancestor = superview
        while let current = ancestor {
            if let scroll = current as? UIScrollView {
                scroll.delaysContentTouches = false
                break
            }
            ancestor = current.superview
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        update(touches)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        update(touches)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        remove(touches)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        remove(touches)
    }

    private func update(_ touches: Set<UITouch>) {
        for touch in touches {
            let identity = ObjectIdentifier(touch)
            if let midi = layout.midi(at: touch.location(in: self)) {
                pitchByTouch[identity] = midi
            } else {
                pitchByTouch.removeValue(forKey: identity)
            }
        }
        publish()
    }

    private func remove(_ touches: Set<UITouch>) {
        for touch in touches { pitchByTouch.removeValue(forKey: ObjectIdentifier(touch)) }
        publish()
    }

    private func publish() {
        onActiveKeysChanged?(Set(pitchByTouch.values))
    }
}

private struct PianoKeyPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .brightness(configuration.isPressed ? -0.12 : 0)
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

private struct TransportBar: View {
    @ObservedObject var store: JazzStudioStore
    let compact: Bool

    var body: some View {
        VStack(spacing: 7) {
            if compact {
                HStack(spacing: 6) { transportButtons }
                    .frame(maxWidth: .infinity)
                HStack(spacing: 10) {
                    playheadSummary
                    progressSlider
                }
                HStack(spacing: 8) {
                    countInControl
                    metronomeControl
                    loopControl
                    muteControl
                }
                mixControls
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        transportButtons
                        playheadSummary
                        progressSlider.frame(maxWidth: .infinity)
                        countInControl
                        metronomeControl
                        loopControl
                        muteControl
                        volumeControl.frame(width: 120)
                    }
                    VStack(spacing: 7) {
                        HStack(spacing: 10) {
                            transportButtons
                            playheadSummary
                            progressSlider.frame(maxWidth: .infinity)
                        }
                        HStack(spacing: 10) {
                            countInControl
                            metronomeControl
                            loopControl
                            muteControl
                            mixControls.frame(maxWidth: 330)
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
            }
        }
        .padding(.horizontal, compact ? 12 : 18)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(JazzTheme.brass.opacity(0.32)).frame(height: 1) }
    }

    @ViewBuilder private var transportButtons: some View {
        Button { store.audio.stepChord(.previous, chart: store.chart) } label: {
            Image(systemName: "backward.end.fill")
                .frame(width: 34, height: 42)
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .foregroundStyle(JazzTheme.text)
        .disabled(store.audio.chordTargetBeat(.previous, chart: store.chart) == nil || store.audio.isPreparing)
        .opacity(store.audio.chordTargetBeat(.previous, chart: store.chart) == nil ? 0.34 : 1)
        .accessibilityIdentifier("transport-previous-chord")
        .accessibilityLabel("Previous chord")

        Button { store.audio.toggle(chart: store.chart) } label: {
            ZStack {
                Circle().fill(store.audio.isPreparing ? JazzTheme.violet : JazzTheme.brass).frame(width: 48, height: 48)
                if store.audio.isPreparing {
                    ProgressView().tint(JazzTheme.background)
                } else {
                    Image(systemName: store.audio.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: JazzTheme.size(18), weight: .bold)).foregroundStyle(JazzTheme.background)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(store.audio.isPlaying ? "Pause" : store.audio.isPreparing ? "Preparing local audio" : "Play")
        .accessibilityIdentifier("transport-play-pause")

        Button { store.audio.stop() } label: {
            Image(systemName: "stop.fill")
                .font(.system(size: JazzTheme.size(14), weight: .bold))
                .frame(width: 42, height: 42)
                .background(JazzTheme.coral.opacity(0.10), in: Circle())
                .overlay(Circle().stroke(JazzTheme.coral.opacity(0.34)))
        }
        .foregroundStyle(JazzTheme.coral)
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .accessibilityLabel("Stop and return to the beginning")
        .accessibilityIdentifier("transport-stop")

        Button { store.audio.restart(chart: store.chart) } label: {
            Image(systemName: "arrow.counterclockwise")
                .font(.system(size: JazzTheme.size(14), weight: .bold))
                .frame(width: 38, height: 42)
                .background(JazzTheme.raised, in: Circle())
        }
        .foregroundStyle(JazzTheme.cyan)
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .disabled(store.audio.isPreparing)
        .accessibilityIdentifier("transport-restart")
        .accessibilityLabel("Restart from the beginning")

        Button { store.audio.stepChord(.next, chart: store.chart) } label: {
            Image(systemName: "forward.end.fill")
                .frame(width: 34, height: 42)
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .foregroundStyle(JazzTheme.text)
        .disabled(store.audio.chordTargetBeat(.next, chart: store.chart) == nil || store.audio.isPreparing)
        .opacity(store.audio.chordTargetBeat(.next, chart: store.chart) == nil ? 0.34 : 1)
        .accessibilityIdentifier("transport-next-chord")
        .accessibilityLabel("Next chord")
    }

    private var loopControl: some View {
        Button { store.toggleWholeChartLoop() } label: {
            Image(systemName: "repeat")
                .font(.system(size: JazzTheme.size(14), weight: .bold))
                .frame(width: 42, height: 42)
                .background(store.audio.loops ? JazzTheme.brass.opacity(0.22) : JazzTheme.raised, in: Circle())
                .overlay(Circle().stroke(store.audio.loops ? JazzTheme.brass.opacity(0.72) : Color.clear))
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .foregroundStyle(store.audio.loops ? JazzTheme.brass : JazzTheme.secondary)
        .accessibilityIdentifier("transport-loop")
        .accessibilityLabel("Loop the whole chart")
        .accessibilityValue(store.audio.loops ? "On" : "Off")
    }

    private var countInControl: some View {
        Button { store.audio.setCountInEnabled(!store.audio.countInEnabled) } label: {
            Text("1·2")
                .font(.system(size: JazzTheme.size(11), weight: .black, design: .rounded))
                .frame(width: 42, height: 42)
                .background(store.audio.countInEnabled ? JazzTheme.cyan.opacity(0.18) : JazzTheme.raised, in: Circle())
                .overlay(Circle().stroke(store.audio.countInEnabled ? JazzTheme.cyan.opacity(0.70) : Color.clear))
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .foregroundStyle(store.audio.countInEnabled ? JazzTheme.cyan : JazzTheme.secondary)
        .disabled(store.audio.isPreparing || store.audio.isCountingIn)
        .accessibilityIdentifier("transport-count-in")
        .accessibilityLabel("One-bar count-in")
        .accessibilityHint("Plays four clicks before the next Play or Restart")
        .accessibilityValue(store.audio.countInEnabled ? "On" : "Off")
    }

    private var metronomeControl: some View {
        Button { store.audio.setMetronomeEnabled(!store.audio.metronomeEnabled) } label: {
            Image(systemName: "metronome")
                .font(.system(size: JazzTheme.size(14), weight: .bold))
                .frame(width: 42, height: 42)
                .background(store.audio.metronomeEnabled ? JazzTheme.brass.opacity(0.22) : JazzTheme.raised, in: Circle())
                .overlay(Circle().stroke(store.audio.metronomeEnabled ? JazzTheme.brass.opacity(0.72) : Color.clear))
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .foregroundStyle(store.audio.metronomeEnabled ? JazzTheme.brass : JazzTheme.secondary)
        .disabled(store.audio.isPreparing || store.audio.isCountingIn)
        .accessibilityIdentifier("transport-metronome")
        .accessibilityLabel("Metronome")
        .accessibilityHint("Plays a click on every beat while the chart plays")
        .accessibilityValue(store.audio.metronomeEnabled ? "On" : "Off")
    }

    private var muteControl: some View {
        Button { store.audio.toggleMute() } label: {
            Image(systemName: store.audio.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: JazzTheme.size(14), weight: .bold))
                .frame(width: 42, height: 42)
                .background(store.audio.isMuted ? JazzTheme.coral.opacity(0.16) : JazzTheme.raised, in: Circle())
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .foregroundStyle(store.audio.isMuted ? JazzTheme.coral : JazzTheme.secondary)
        .accessibilityIdentifier("transport-mute")
        .accessibilityLabel(store.audio.isMuted ? "Unmute" : "Mute")
        .accessibilityValue(store.audio.isMuted ? "Muted" : "Sound on")
    }

    private var volumeControl: some View {
        Slider(
            value: Binding(get: { store.audio.masterVolume }, set: store.updateMasterVolume),
            in: 0...1,
            step: 0.05
        )
        .frame(minWidth: compact ? 120 : 90, minHeight: 44)
        .accessibilityIdentifier("transport-master-volume")
        .accessibilityLabel("Master volume")
        .accessibilityValue("\(Int((store.audio.masterVolume * 100).rounded())) percent")
    }

    private var reverbControl: some View {
        Slider(
            value: Binding(get: { store.audio.reverbAmount }, set: store.updateReverbAmount),
            in: 0...1,
            step: 0.05
        )
        .frame(minWidth: compact ? 112 : 90, minHeight: 44)
        .tint(JazzTheme.cyan)
        .accessibilityIdentifier("transport-reverb-amount")
        .accessibilityLabel("Room amount")
        .accessibilityHint("Blends the shared native jazz hall into playback and previews")
        .accessibilityValue("\(Int((store.audio.reverbAmount * 100).rounded())) percent")
    }

    private var mixControls: some View {
        HStack(spacing: 7) {
            Image(systemName: "speaker.wave.2.fill")
                .foregroundStyle(JazzTheme.brass)
                .accessibilityHidden(true)
            volumeControl
            Image(systemName: "water.waves")
                .foregroundStyle(JazzTheme.cyan)
                .accessibilityHidden(true)
            reverbControl
        }
    }

    private var playheadSummary: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(activeSymbol)
                .font(.system(size: JazzTheme.size(14), weight: .bold, design: .serif))
                .foregroundStyle(JazzTheme.text)
                .lineLimit(1)
            Text("\(time(store.audio.playheadBeat)) / \(time(store.audio.totalBeats == 0 ? store.chart.durationBeats : store.audio.totalBeats))")
                .font(.system(size: JazzTheme.size(9.5), design: .monospaced))
                .foregroundStyle(JazzTheme.secondary)
        }
        .frame(minWidth: compact ? 86 : 112, alignment: .leading)
    }

    private var progressSlider: some View {
        PlaybackRail(
            progress: store.audio.progress,
            active: store.audio.isPlaying,
            seek: { store.audio.seek(to: $0) }
        )
    }

    private var activeSymbol: String {
        if store.audio.isCountingIn { return "Count-in…" }
        guard let id = store.audio.activeChordID else {
            switch store.audio.state {
            case .preparing: return "Forging audio…"
            case .paused: return "Paused"
            case .failed: return "Audio unavailable"
            case .ready, .playing: return "Ready to play"
            }
        }
        return store.chart.measures.lazy.flatMap(\.chords).first(where: { $0.id == id })?.symbol ?? "Playing"
    }

    private func time(_ beats: Double) -> String {
        let seconds = Int((beats * 60 / store.chart.tempoBPM).rounded())
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private struct PlaybackRail: View {
    let progress: Double
    let active: Bool
    let seek: (Double) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Canvas { context, size in
                    let count = max(24, Int(size.width / 10))
                    let spacing = size.width / CGFloat(count)
                    let completedX = size.width * progress
                    var baseline = Path()
                    baseline.move(to: CGPoint(x: 0, y: size.height / 2))
                    baseline.addLine(to: CGPoint(x: size.width, y: size.height / 2))
                    context.stroke(baseline, with: .color(JazzTheme.secondary.opacity(0.22)), lineWidth: 2)
                    for index in 0..<count {
                        let horizontal = (CGFloat(index) + 0.5) * spacing
                        let phase = Double(index) * 1.618
                        let amplitude = CGFloat(5 + Int(abs(sin(phase)) * 10))
                        let rect = CGRect(
                            x: horizontal - 1.5,
                            y: size.height / 2 - amplitude / 2,
                            width: 3,
                            height: amplitude
                        )
                        let tint = horizontal <= completedX
                            ? JazzTheme.brass
                            : JazzTheme.emerald.opacity(0.34)
                        context.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(tint))
                    }
                    let marker = CGRect(x: min(max(0, completedX - 2), max(0, size.width - 4)), y: 2, width: 4, height: max(0, size.height - 4))
                    context.fill(Path(roundedRect: marker, cornerRadius: 2), with: .color(active ? JazzTheme.brass : JazzTheme.paper.opacity(0.8)))
                }
                .drawingGroup()
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                        guard proxy.size.width > 0 else { return }
                        seek(min(1, max(0, value.location.x / proxy.size.width)))
                    })
            }
        }
        .frame(minWidth: 80, minHeight: 30, maxHeight: 34)
        .accessibilityElement()
        .accessibilityLabel("Playback position")
        .accessibilityValue("\(Int(progress * 100)) percent")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: seek(min(1, progress + 0.05))
            case .decrement: seek(max(0, progress - 0.05))
            @unknown default: break
            }
        }
    }
}

private enum MyChartsConfirmation: Identifiable {
    case open(record: JazzKeptChart, studioRevision: Int)
    case replace(record: JazzKeptChart, chart: JazzChart, generation: UInt64, studioRevision: Int)
    case remove(record: JazzKeptChart, generation: UInt64)

    var id: String {
        switch self {
        case let .open(record, _): "open-\(record.id)"
        case let .replace(record, _, _, _): "replace-\(record.id)"
        case let .remove(record, _): "remove-\(record.id)"
        }
    }
}

private enum MyChartsExportKind {
    case selectedChart
    case collectionBackup

    var successLabel: String {
        switch self {
        case .selectedChart: "the selected chart"
        case .collectionBackup: "the collection backup"
        }
    }
}

private struct MyChartsView: View {
    @ObservedObject var store: JazzStudioStore
    @ObservedObject private var library: JazzMyChartsStore
    @State private var titleDraft = ""
    @State private var confirmation: MyChartsConfirmation?
    @State private var importingBackup = false
    @State private var exporting = false
    @State private var exportDocument: JazzExportDocument?
    @State private var exportContentType = UTType.json
    @State private var exportFilename = "FrankenJazz My Charts"
    @State private var exportKind = MyChartsExportKind.collectionBackup

    init(store: JazzStudioStore) {
        self.store = store
        _library = ObservedObject(wrappedValue: store.myCharts)
    }

    var body: some View {
        ZStack {
            JazzForgeBackground()
            ScrollView {
                LazyVStack(spacing: 14) {
                    introduction
                    collectionStatus
                    if let preview = library.restorePreview {
                        restorePreview(preview)
                    }
                    keptCharts
                    if let selected = library.selected {
                        selectedChart(selected)
                    }
                    portableCopies
                }
                .frame(maxWidth: 620)
                .padding(18)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle("My Charts")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $library.search, prompt: "Search title or key")
        .safeAreaInset(edge: .bottom, spacing: 0) { actionFeedback }
        .onChange(of: library.selectedID) { _, _ in
            titleDraft = library.selected?.chart.title ?? ""
        }
        .alert(item: $confirmation, content: confirmationAlert)
        .fileExporter(
            isPresented: $exporting,
            document: exportDocument,
            contentType: exportContentType,
            defaultFilename: exportFilename
        ) { result in
            library.finishExport(result, label: exportKind.successLabel)
            exportDocument = nil
        }
        .fileImporter(
            isPresented: $importingBackup,
            allowedContentTypes: [.json],
            allowsMultipleSelection: false
        ) { result in
            guard case let .success(urls) = result, let url = urls.first else { return }
            Task { await library.prepareRestore(from: url) }
        }
        .onDisappear {
            if library.hasPendingRestore { library.cancelRestore() }
        }
    }

    @ViewBuilder
    private var actionFeedback: some View {
        if let message = library.message {
            HStack(spacing: 10) {
                Image(systemName: library.messageIsError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(library.messageIsError ? JazzTheme.coral : JazzTheme.emerald)
                    .accessibilityHidden(true)
                Text(message)
                .font(.system(size: JazzTheme.size(10.5), weight: .semibold, design: .rounded))
                .foregroundStyle(library.messageIsError ? JazzTheme.coral : JazzTheme.emerald)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("my-charts-action-feedback")

                Button { library.dismissMessage() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: JazzTheme.size(18), weight: .semibold))
                        .foregroundStyle(JazzTheme.secondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss message")
                .accessibilityIdentifier("my-charts-dismiss-feedback")
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill((library.messageIsError ? JazzTheme.coral : JazzTheme.emerald).opacity(0.35))
                    .frame(height: 1)
            }
        }
    }

    private var introduction: some View {
        JazzPanel(accent: JazzTheme.emerald) {
            VStack(alignment: .leading, spacing: 12) {
                JazzSectionLabel(number: "08", title: "Your repertoire", tint: JazzTheme.emerald)
                Text("Keep charts you want to return to")
                    .font(.system(size: JazzTheme.size(20), weight: .black, design: .rounded))
                    .foregroundStyle(JazzTheme.text)
                Text("Keep captures the complete published chart now—including durations, annotations, instrument, and exact voicings. Later edits do not silently change that copy.")
                    .font(.system(size: JazzTheme.size(11.5), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
                Button { library.keep(store.chart) } label: {
                    Label("Keep current chart", systemImage: "bookmark.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JazzPrimaryButtonStyle(tint: JazzTheme.emerald))
                .disabled(collectionLocked)
                .accessibilityIdentifier("my-charts-keep-current")
            }
        }
    }

    @ViewBuilder
    private var collectionStatus: some View {
        JazzPanel(accent: library.messageIsError ? JazzTheme.coral : JazzTheme.cyan, padding: 13) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Label(
                        "\(library.records.count) of \(JazzMyChartsPersistence.maximumRecords) charts",
                        systemImage: library.recoveredFromPrevious ? "exclamationmark.shield.fill" : "internaldrive.fill"
                    )
                    .font(.system(size: JazzTheme.size(11.5), weight: .bold, design: .rounded))
                    .foregroundStyle(library.recoveredFromPrevious ? JazzTheme.coral : JazzTheme.cyan)
                    Spacer()
                    Text(String(format: "%.2f of 32 MiB", Double(library.collectionBytes) / 1_048_576))
                        .font(.system(size: JazzTheme.size(9.5), weight: .semibold, design: .monospaced))
                        .foregroundStyle(JazzTheme.secondary)
                }
                Text("Collection version \(library.generation) · kept privately on this device")
                    .font(.system(size: JazzTheme.size(9.5), design: .monospaced))
                    .foregroundStyle(JazzTheme.secondary)
                if let message = library.message {
                    Text(message)
                        .font(.system(size: JazzTheme.size(11), weight: .semibold, design: .rounded))
                        .foregroundStyle(library.messageIsError ? JazzTheme.coral : JazzTheme.text)
                        .accessibilityIdentifier("my-charts-message")
                }
                Button { library.reload() } label: {
                    Label("Refresh collection", systemImage: "arrow.clockwise")
                }
                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
                .disabled(library.hasPendingRestore)
            }
        }
    }

    private var keptCharts: some View {
        JazzPanel(accent: JazzTheme.brass) {
            VStack(alignment: .leading, spacing: 12) {
                JazzSectionLabel(number: "09", title: "Kept charts", tint: JazzTheme.brass)
                if library.records.isEmpty {
                    Label("No charts are kept yet", systemImage: "music.note.house")
                        .font(.system(size: JazzTheme.size(13), weight: .semibold, design: .rounded))
                        .foregroundStyle(JazzTheme.secondary)
                        .frame(maxWidth: .infinity, minHeight: 72)
                } else if library.filteredRecords.isEmpty {
                    Text("No chart title or key matches this search.")
                        .font(.system(size: JazzTheme.size(12), design: .rounded))
                        .foregroundStyle(JazzTheme.secondary)
                        .frame(maxWidth: .infinity, minHeight: 72)
                } else {
                    ForEach(library.filteredRecords) { record in
                        Button { library.select(record.id) } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(record.chart.title)
                                        .font(.system(size: JazzTheme.size(15), weight: .bold, design: .rounded))
                                        .foregroundStyle(JazzTheme.text)
                                        .lineLimit(2)
                                    Text("\(record.chart.key.rawValue) · \(record.chart.barCount) bars · \(record.chart.chordCount) changes")
                                        .font(.system(size: JazzTheme.size(10.5), weight: .semibold, design: .monospaced))
                                        .foregroundStyle(JazzTheme.secondary)
                                    Text(record.updatedAt.formatted(date: .abbreviated, time: .shortened))
                                        .font(.system(size: JazzTheme.size(10), design: .rounded))
                                        .foregroundStyle(JazzTheme.secondary)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: library.selectedID == record.id ? "checkmark.circle.fill" : "chevron.right")
                                    .foregroundStyle(library.selectedID == record.id ? JazzTheme.emerald : JazzTheme.brass)
                            }
                            .padding(13)
                            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                            .background(
                                (library.selectedID == record.id ? JazzTheme.emerald : JazzTheme.raised).opacity(0.10),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(
                                        (library.selectedID == record.id ? JazzTheme.emerald : JazzTheme.stroke).opacity(0.65),
                                        lineWidth: 1
                                    )
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(library.hasPendingRestore)
                        .accessibilityIdentifier("my-charts-row-\(record.id.uuidString)")
                        .accessibilityLabel("\(record.chart.title), key \(record.chart.key.rawValue), \(record.chart.barCount) bars")
                        .accessibilityValue(library.selectedID == record.id ? "Selected" : "Not selected")
                    }
                }
            }
        }
    }

    private func selectedChart(_ record: JazzKeptChart) -> some View {
        JazzPanel(accent: JazzTheme.violet) {
            VStack(alignment: .leading, spacing: 13) {
                JazzSectionLabel(number: "10", title: "Selected copy", tint: JazzTheme.violet)
                Text(record.chart.title)
                    .font(.system(size: JazzTheme.size(18), weight: .black, design: .rounded))
                    .foregroundStyle(JazzTheme.text)
                Button {
                    confirmation = .open(record: record, studioRevision: store.revision)
                } label: {
                    Label("Open chart…", systemImage: "arrow.up.forward.app.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JazzPrimaryButtonStyle(tint: JazzTheme.violet))
                .disabled(library.hasPendingRestore)
                .accessibilityIdentifier("my-charts-open-selected")

                VStack(spacing: 9) {
                    Button { requestSelectedExport(record) } label: {
                        Label("Export selected chart", systemImage: "doc.badge.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.violet))
                    .disabled(collectionLocked)
                    .accessibilityIdentifier("my-charts-export-selected")

                    Button {
                        library.duplicate(recordID: record.id, expectedGeneration: library.generation)
                    } label: {
                        Label("Duplicate with fresh identities", systemImage: "plus.square.on.square")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.emerald))
                    .disabled(collectionLocked)
                    .accessibilityIdentifier("my-charts-duplicate-selected")

                    Button {
                        confirmation = .replace(
                            record: record,
                            chart: store.chart,
                            generation: library.generation,
                            studioRevision: store.revision
                        )
                    } label: {
                        Label("Replace with current chart…", systemImage: "arrow.triangle.2.circlepath")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
                    .disabled(collectionLocked)

                    Button {
                        confirmation = .remove(record: record, generation: library.generation)
                    } label: {
                        Label("Remove kept copy…", systemImage: "trash")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.coral))
                    .disabled(collectionLocked)
                }

                Divider().overlay(JazzTheme.stroke)
                TextField("Kept chart title", text: $titleDraft)
                    .textFieldStyle(.roundedBorder)
                    .disabled(collectionLocked)
                    .accessibilityIdentifier("my-charts-rename-field")
                Button {
                    library.rename(
                        recordID: record.id,
                        title: titleDraft,
                        expectedGeneration: library.generation
                    )
                } label: {
                    Label("Rename kept copy", systemImage: "pencil")
                }
                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
                .disabled(collectionLocked)
                Text("Rename changes only this kept snapshot. Your open chart keeps its own title.")
                    .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }
        }
    }

    private var portableCopies: some View {
        JazzPanel(accent: JazzTheme.cyan) {
            VStack(alignment: .leading, spacing: 12) {
                JazzSectionLabel(number: "11", title: "Portable native copies", tint: JazzTheme.cyan)
                Text("Export the whole displayed collection or prepare a bounded restore preview. Native backups preserve FrankenJazz chart data but do not claim the web studio’s E0 interchange schema.")
                    .font(.system(size: JazzTheme.size(11), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
                Button(action: requestBackupExport) {
                    Label("Export collection backup", systemImage: "externaldrive.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JazzPrimaryButtonStyle(tint: JazzTheme.cyan))
                .disabled(collectionLocked)
                .accessibilityIdentifier("my-charts-export-backup")

                Button { importingBackup = true } label: {
                    Label("Restore from native backup…", systemImage: "arrow.down.doc.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.brass))
                .disabled(collectionLocked)
                .accessibilityIdentifier("my-charts-restore-backup")
                Text("Selecting a file changes nothing until you review every addition and conflict, then confirm one atomic merge.")
                    .font(.system(size: JazzTheme.size(10), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }
        }
    }

    private func restorePreview(_ preview: JazzMyChartsRestorePreview) -> some View {
        JazzPanel(accent: JazzTheme.brass) {
            VStack(alignment: .leading, spacing: 12) {
                JazzSectionLabel(number: "R", title: "Restore preview", tint: JazzTheme.brass)
                Text("\(preview.additions) additions · \(preview.identical) already identical · \(preview.conflicts.count) conflicts")
                    .font(.system(size: JazzTheme.size(13), weight: .bold, design: .rounded))
                    .foregroundStyle(JazzTheme.text)
                Text("No collection bytes have changed. Timestamps never choose a winner.")
                    .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)

                ForEach(preview.conflicts) { conflict in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Choose the version for \(conflict.localTitle)")
                            .font(.system(size: JazzTheme.size(12), weight: .bold, design: .rounded))
                            .foregroundStyle(JazzTheme.text)
                        restoreChoice(
                            title: "Keep local copy: \(conflict.localTitle)",
                            selected: conflict.choice == .local,
                            tint: JazzTheme.emerald
                        ) {
                            library.chooseRestoreConflict(recordID: conflict.recordID, choice: .local)
                        }
                        restoreChoice(
                            title: "Use backup copy: \(conflict.backupTitle)",
                            selected: conflict.choice == .backup,
                            tint: JazzTheme.brass
                        ) {
                            library.chooseRestoreConflict(recordID: conflict.recordID, choice: .backup)
                        }
                    }
                    .padding(12)
                    .background(JazzTheme.raised.opacity(0.72), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                Button { library.confirmRestore() } label: {
                    Label("Confirm one-step restore", systemImage: "checkmark.shield.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JazzPrimaryButtonStyle(tint: JazzTheme.emerald))
                .disabled(!preview.isResolved)
                .accessibilityIdentifier("my-charts-confirm-restore")

                Button { library.cancelRestore() } label: {
                    Label("Cancel restore", systemImage: "xmark.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.coral))
                .accessibilityIdentifier("my-charts-cancel-restore")
            }
        }
    }

    private func restoreChoice(
        title: String,
        selected: Bool,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                Text(title).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
        }
        .buttonStyle(JazzSecondaryButtonStyle(tint: tint))
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    private var collectionLocked: Bool {
        library.recoveredFromPrevious || library.hasPendingRestore
    }

    private func requestBackupExport() {
        guard let data = library.prepareBackup() else { return }
        exportDocument = JazzExportDocument(data: data)
        exportContentType = .json
        exportFilename = "FrankenJazz My Charts v\(library.generation).frankenjazz-library"
        exportKind = .collectionBackup
        exporting = true
    }

    private func requestSelectedExport(_ record: JazzKeptChart) {
        guard let data = library.prepareSelectedChartExport() else { return }
        exportDocument = JazzExportDocument(data: data)
        exportContentType = .frankenJazz
        exportFilename = safeFilename(record.chart.title)
        exportKind = .selectedChart
        exporting = true
    }

    private func safeFilename(_ title: String) -> String {
        let safe = title
            .replacingOccurrences(of: #"[/:]"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return safe.isEmpty ? "FrankenJazz chart" : safe
    }

    private func confirmationAlert(_ request: MyChartsConfirmation) -> Alert {
        switch request {
        case let .open(record, studioRevision):
            Alert(
                title: Text("Open \(record.chart.title)?"),
                message: Text("This replaces the chart being edited as one undoable action. The kept copy stays unchanged."),
                primaryButton: .destructive(Text("Open chart")) {
                    guard store.revision == studioRevision else {
                        library.reportStaleOpen()
                        return
                    }
                    store.openKeptChart(record.chart, expectedRevision: studioRevision)
                },
                secondaryButton: .cancel()
            )
        case let .replace(record, chart, generation, studioRevision):
            Alert(
                title: Text("Replace kept copy?"),
                message: Text("Replace “\(record.chart.title)” with the confirmed current chart? The chart being edited stays unchanged."),
                primaryButton: .destructive(Text("Replace copy")) {
                    library.replace(
                        recordID: record.id,
                        with: chart,
                        expectedGeneration: generation,
                        expectedStudioRevision: studioRevision,
                        currentStudioRevision: store.revision
                    )
                },
                secondaryButton: .cancel()
            )
        case let .remove(record, generation):
            Alert(
                title: Text("Remove kept copy?"),
                message: Text("Remove “\(record.chart.title)” from My Charts? The chart being edited and recovery stay unchanged."),
                primaryButton: .destructive(Text("Remove copy")) {
                    library.remove(recordID: record.id, expectedGeneration: generation)
                },
                secondaryButton: .cancel()
            )
        }
    }
}

private struct DocumentCenterView: View {
    @ObservedObject var store: JazzStudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var exportURLs: [ExportKind: URL] = [:]

    var body: some View {
        ZStack {
            JazzForgeBackground()
            ScrollView {
                VStack(spacing: 14) {
                    JazzAppIdentity()
                    JazzPanel(accent: JazzTheme.emerald) {
                        VStack(alignment: .leading, spacing: 12) {
                            JazzSectionLabel(number: "08", title: "My Charts", tint: JazzTheme.emerald)
                            Text("Build a private, searchable repertoire of complete chart snapshots on this device.")
                                .font(.system(size: JazzTheme.size(11.5), design: .rounded))
                                .foregroundStyle(JazzTheme.secondary)
                            NavigationLink { MyChartsView(store: store) } label: {
                                Label("Open My Charts", systemImage: "music.note.house.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(JazzPrimaryButtonStyle(tint: JazzTheme.emerald))
                            .accessibilityIdentifier("open-my-charts")
                        }
                    }
                    JazzPanel(accent: JazzTheme.cyan) {
                        VStack(alignment: .leading, spacing: 14) {
                            JazzSectionLabel(number: "09", title: "Open", tint: JazzTheme.cyan)
                            Button { importing = true } label: {
                                Label("Import a chart, text, or MIDI file", systemImage: "folder.badge.plus")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(JazzPrimaryButtonStyle(tint: JazzTheme.cyan))
                            Text("MIDI chord stacks become editable 4/4 symbols with exact Manual pitches. Common DAW retriggers, stray note-offs, open notes, and missing end markers are repaired and reported; structural corruption, another meter, an out-of-range/oversized stack, or no nameable harmony is refused instead of guessed.")
                                .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                                .foregroundStyle(JazzTheme.secondary)
                            Button { store.newChart(); dismiss() } label: {
                                Label("Start a blank chart", systemImage: "doc.badge.plus")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.emerald))
                        }
                    }
                    JazzPanel(accent: JazzTheme.brass) {
                        VStack(alignment: .leading, spacing: 12) {
                            JazzSectionLabel(number: "10", title: "Export real files", tint: JazzTheme.brass)
                            ForEach(ExportKind.allCases) { kind in
                                if let url = exportURLs[kind] {
                                    ShareLink(item: url) {
                                        HStack {
                                            Label(kind.rawValue, systemImage: kind.symbol)
                                            Spacer()
                                            Image(systemName: "square.and.arrow.up")
                                        }
                                        .frame(minHeight: 44)
                                    }
                                    .buttonStyle(JazzSecondaryButtonStyle(tint: kind == .midi ? JazzTheme.brass : JazzTheme.emerald))
                                }
                            }
                            Text("Exports are files—not pasted text. The FrankenJazz format preserves every chart setting; MIDI contains the current realized voicings.")
                                .font(.system(size: JazzTheme.size(10.5), design: .rounded))
                                .foregroundStyle(JazzTheme.secondary)
                        }
                    }
                    JazzPanel(accent: JazzTheme.violet) {
                        VStack(alignment: .leading, spacing: 9) {
                            JazzSectionLabel(number: "11", title: "Privacy", tint: JazzTheme.violet)
                            Label("No account, analytics, telemetry, upload, or third-party AI service", systemImage: "lock.shield.fill")
                                .font(.system(size: JazzTheme.size(12.5), weight: .semibold, design: .rounded))
                                .foregroundStyle(JazzTheme.text)
                            Text("Recovery lives in this app’s private Application Support folder. Files leave only when you explicitly share them.")
                                .font(.system(size: JazzTheme.size(11), design: .rounded))
                                .foregroundStyle(JazzTheme.secondary)
                        }
                    }
                }
                .frame(maxWidth: 570)
                .padding(18)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle("Chart files")
        .task {
            for kind in ExportKind.allCases {
                if let url = store.exportURL(kind: kind) { exportURLs[kind] = url }
            }
        }
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.frankenJazz, .json, .plainText, .midi], allowsMultipleSelection: false) { result in
            guard case let .success(urls) = result, let url = urls.first else { return }
            Task { await store.importFile(url) }
        }
    }
}

extension UTType {
    static let frankenJazz = UTType(exportedAs: "com.frankenjazz.chart", conformingTo: .json)
}

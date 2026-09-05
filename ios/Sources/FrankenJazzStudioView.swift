import SwiftUI
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
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(Array(store.chart.measures.enumerated()), id: \.element.id) { index, measure in
                        MeasureCard(
                            index: index,
                            measure: measure,
                            store: store,
                            presentsInspector: presentsInspectorOnSelection
                        )
                    }
                }
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
                            Text(quickEntryExpanded ? "Done" : "Edit chart")
                                .font(.system(size: JazzTheme.size(12), weight: .semibold, design: .rounded))
                            Image(systemName: quickEntryExpanded ? "chevron.up" : "chevron.down")
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
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
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Actions for bar \(index + 1)")
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
                    Label("Tap any key to hear it", systemImage: "hand.tap")
                    Spacer(minLength: 8)
                    Text(store.chart.instrument.displayName)
                }
                .font(.system(size: JazzTheme.size(9.5), weight: .semibold, design: .rounded))
                .foregroundStyle(JazzTheme.secondary)
                Text(store.chart.instrument.nativeAudioSourceNote)
                    .font(.system(size: JazzTheme.size(8.5), weight: .medium, design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
                MiniPiano(
                    highlightedMIDIPitches: exactPitches,
                    accent: JazzTheme.cyan,
                    instrumentName: store.chart.instrument.displayName,
                    onKeyPress: store.previewKey
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
                                    .fill(highlightedMIDIPitches.contains(midi) ? accent.opacity(0.88) : JazzTheme.paper)
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
                        .buttonStyle(.plain)
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
                                highlightedMIDIPitches.contains(midi)
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
                    .buttonStyle(.plain)
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

    private func noteName(_ midi: Int) -> String {
        let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
        return "\(names[(midi % 12 + 12) % 12])\(midi / 12 - 1)"
    }
}

private struct TransportBar: View {
    @ObservedObject var store: JazzStudioStore
    let compact: Bool

    var body: some View {
        VStack(spacing: 7) {
            if compact {
                HStack(spacing: 10) { transportButtons; playheadSummary }
                progressSlider
            } else {
                HStack(spacing: 12) {
                    transportButtons
                    playheadSummary
                    progressSlider.frame(maxWidth: .infinity)
                    Toggle(isOn: Binding(get: { store.audio.loops }, set: { store.audio.loops = $0 })) { Image(systemName: "repeat") }
                        .toggleStyle(.button)
                        .accessibilityLabel("Loop chart")
                }
            }
        }
        .padding(.horizontal, compact ? 12 : 18)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(JazzTheme.brass.opacity(0.32)).frame(height: 1) }
    }

    @ViewBuilder private var transportButtons: some View {
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

        Button { store.audio.stop() } label: {
            Image(systemName: "stop.fill")
                .font(.system(size: JazzTheme.size(14), weight: .bold))
                .frame(width: 42, height: 42)
                .background(JazzTheme.coral.opacity(0.10), in: Circle())
                .overlay(Circle().stroke(JazzTheme.coral.opacity(0.34)))
        }
        .foregroundStyle(JazzTheme.coral)
        .buttonStyle(.plain)
        .accessibilityLabel("Stop and return to the beginning")
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
        PlaybackRail(progress: store.audio.progress, active: store.audio.isPlaying, seek: store.audio.seek)
    }

    private var activeSymbol: String {
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
                    JazzPanel(accent: JazzTheme.cyan) {
                        VStack(alignment: .leading, spacing: 14) {
                            JazzSectionLabel(number: "08", title: "Open", tint: JazzTheme.cyan)
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
                            JazzSectionLabel(number: "09", title: "Export real files", tint: JazzTheme.brass)
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
                            JazzSectionLabel(number: "10", title: "Privacy", tint: JazzTheme.violet)
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

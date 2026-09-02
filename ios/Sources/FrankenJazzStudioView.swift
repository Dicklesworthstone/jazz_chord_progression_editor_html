import SwiftUI
import UniformTypeIdentifiers

struct FrankenJazzStudioView: View {
    @ObservedObject var store: JazzStudioStore
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
        .preferredColorScheme(.dark)
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
        .onChange(of: scenePhase) { _, phase in if phase != .active { store.audio.pause() } }
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
                    Label(instrument.rawValue, systemImage: instrument.symbol)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: store.chart.instrument.symbol)
                Text(store.chart.instrument.rawValue).lineLimit(1).minimumScaleFactor(0.68)
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
                    Button { store.transpose(-1) } label: { Label("Down", systemImage: "minus") }
                        .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
                        .accessibilityLabel("Transpose down one semitone")
                    Button { store.transpose(1) } label: { Label("Up", systemImage: "plus") }
                        .buttonStyle(JazzSecondaryButtonStyle(tint: JazzTheme.cyan))
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
                        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 14))
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
                                    chord.id == store.selectedChordID ? JazzTheme.background : JazzTheme.paper
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
        .background(active ? JazzTheme.brass.opacity(0.08) : Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(active ? JazzTheme.brass.opacity(0.55) : .white.opacity(0.055)))
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
                        voicingCard(description)
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
                    Label("Edit change", systemImage: "ellipsis.circle")
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
                .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(JazzTheme.violet.opacity(0.3)))
                .accessibilityLabel("Note for \(chord.symbol)")
                Text("Saved only in the private FrankenJazz document; text and MIDI exports omit chord notes.")
                    .font(.system(size: JazzTheme.size(10), design: .rounded))
                    .foregroundStyle(JazzTheme.secondary)
            }
        }
    }

    private func pianoCard(_ description: ChordDescription) -> some View {
        JazzPanel(accent: JazzTheme.cyan) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    JazzSectionLabel(number: "06", title: "Literal tones", tint: JazzTheme.cyan)
                    Spacer()
                    Text(description.toneNames.joined(separator: " · "))
                        .font(.system(size: JazzTheme.size(10), weight: .semibold, design: .monospaced))
                        .foregroundStyle(JazzTheme.text)
                }
                MiniPiano(highlights: Set(description.pitchClasses), accent: JazzTheme.cyan)
                    .frame(height: 82)
                    .accessibilityLabel("Chord tones: \(description.toneNames.joined(separator: ", "))")
            }
        }
    }

    private func voicingCard(_ description: ChordDescription) -> some View {
        JazzPanel(accent: JazzTheme.emerald) {
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
                            Text(store.chart.voicingFamily.rawValue)
                                .font(.system(size: JazzTheme.size(14), weight: .bold, design: .rounded))
                            Text(store.chart.voicingFamily.note)
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
                let midi = JazzTheory.voicing(for: description, family: store.chart.voicingFamily)
                HStack(spacing: 7) {
                    ForEach(Array(midi.enumerated()), id: \.offset) { _, pitch in
                        Text(midiName(pitch))
                            .font(.system(size: JazzTheme.size(11), weight: .bold, design: .monospaced))
                            .foregroundStyle(JazzTheme.background)
                            .padding(.horizontal, 8).padding(.vertical, 6)
                            .background(JazzTheme.emerald, in: Capsule())
                    }
                }
            }
        }
    }

    private func evidenceCard(_ description: ChordDescription) -> some View {
        JazzPanel(accent: JazzTheme.violet) {
            VStack(alignment: .leading, spacing: 10) {
                JazzSectionLabel(number: "08", title: "What is factual", tint: JazzTheme.violet)
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

private struct MiniPiano: View {
    let highlights: Set<Int>
    let accent: Color

    var body: some View {
        GeometryReader { proxy in
            let whitePitches = [0, 2, 4, 5, 7, 9, 11, 12]
            let whiteWidth = proxy.size.width / CGFloat(whitePitches.count)
            ZStack(alignment: .topLeading) {
                HStack(spacing: 1) {
                    ForEach(whitePitches, id: \.self) { pitch in
                        RoundedRectangle(cornerRadius: 4)
                            .fill(highlights.contains(pitch % 12) ? accent.opacity(0.88) : JazzTheme.paper)
                    }
                }
                ForEach(0..<5, id: \.self) { index in
                    let keys: [(pitch: Int, offset: CGFloat)] = [(1, 0.70), (3, 1.70), (6, 3.70), (8, 4.70), (10, 5.70)]
                    let key = keys[index]
                    RoundedRectangle(cornerRadius: 3)
                        .fill(highlights.contains(key.pitch) ? JazzTheme.brass : JazzTheme.background)
                        .frame(width: whiteWidth * 0.62, height: proxy.size.height * 0.61)
                        .offset(x: whiteWidth * key.offset)
                }
            }
        }
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
                        .font(.system(size: 18, weight: .bold)).foregroundStyle(JazzTheme.background)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(store.audio.isPlaying ? "Pause" : store.audio.isPreparing ? "Preparing local audio" : "Play")

        Button { store.audio.stop() } label: {
            Image(systemName: "stop.fill")
                .font(.system(size: 14, weight: .bold))
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
                .foregroundStyle(JazzTheme.paper)
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
                            Text("MIDI chord stacks become editable 4/4 symbols. Common DAW retriggers, stray note-offs, open notes, and missing end markers are repaired and reported; structural corruption, another meter, or no nameable harmony is refused instead of guessed.")
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

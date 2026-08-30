import Foundation
import Combine
import SwiftUI
import UniformTypeIdentifiers

/// Monotonic ownership for asynchronous document reads. File-provider reads
/// can finish in any order; only the newest request may publish, and an edit
/// made while a read is in flight invalidates that request as well.
struct JazzImportFence {
    struct Token: Equatable {
        let request: Int
        let revision: Int
    }

    private var nextRequest = 0

    mutating func claim(revision: Int) -> Token {
        nextRequest &+= 1
        return Token(request: nextRequest, revision: revision)
    }

    mutating func invalidatePendingRequest() {
        nextRequest &+= 1
    }

    func owns(_ token: Token, currentRevision: Int) -> Bool {
        token.request == nextRequest && token.revision == currentRevision
    }
}

@MainActor
final class JazzStudioStore: ObservableObject {
    enum DraftState: Equatable {
        case current
        case waiting
        case valid(Int)
        case invalid(String)
    }

    @Published private(set) var chart: JazzChart
    @Published var draftText: String
    @Published private(set) var draftState: DraftState = .current
    @Published var selectedChordID: UUID?
    @Published var librarySearch = ""
    @Published var notice: String?
    @Published var isInspectorPresented = false
    @Published var isLibraryPresented = false
    @Published var isDocumentPresented = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published private(set) var revision = 0

    let audio = JazzAudioEngine()

    private var undoStack: [JazzChart] = []
    private var redoStack: [JazzChart] = []
    private var coalescingKey: String?
    private var coalescingDeadline = Date.distantPast
    private var draftTask: Task<Void, Never>?
    private var primeTask: Task<Void, Never>?
    private var importFence = JazzImportFence()
    private var audioChanges: AnyCancellable?
    private let recovery = JazzRecoveryStore()
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-reset") {
            let seed = Self.chart(from: JazzLibrary.starter)
            chart = seed
            draftText = seed.chartText
            selectedChordID = seed.measures.first?.chords.first?.id
        } else if let recovered = recovery.load() {
            chart = recovered
            draftText = recovered.chartText
            selectedChordID = recovered.measures.first?.chords.first?.id
            notice = "Recovered your last local chart."
        } else {
            let seed = Self.chart(from: JazzLibrary.starter)
            chart = seed
            draftText = seed.chartText
            selectedChordID = seed.measures.first?.chords.first?.id
        }
        audioChanges = audio.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        audio.prime(chart: chart)
    }

    deinit {
        draftTask?.cancel()
        primeTask?.cancel()
    }

    var selectedChord: JazzChordEvent? {
        chart.measures.lazy.flatMap(\.chords).first(where: { $0.id == selectedChordID })
    }

    var selectedDescription: ChordDescription? {
        guard let selectedChord else { return nil }
        return JazzTheory.parseChord(selectedChord.symbol, in: chart.key)
    }

    var filteredLibrary: [LibraryEntry] {
        let query = librarySearch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return JazzLibrary.entries }
        return JazzLibrary.entries.filter {
            $0.title.localizedCaseInsensitiveContains(query) ||
            $0.kicker.localizedCaseInsensitiveContains(query) ||
            $0.note.localizedCaseInsensitiveContains(query)
        }
    }

    func setDraft(_ text: String) {
        // Typing is visible user work before the debounced chart commit bumps
        // `revision`. Invalidate an in-flight file-provider read immediately so
        // it cannot erase the draft during that debounce window.
        importFence.invalidatePendingRequest()
        draftText = String(text.prefix(JazzTheory.maximumChartCharacters + 1))
        draftTask?.cancel()
        do {
            let parsed = try JazzTheory.parseChart(draftText)
            draftState = .valid(parsed.measures.count)
            draftTask = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(520))
                guard !Task.isCancelled else { return }
                self?.applyParsedDraft(parsed)
            }
        } catch {
            draftState = .invalid(error.localizedDescription)
        }
    }

    func applyDraftNow() {
        draftTask?.cancel()
        do {
            applyParsedDraft(try JazzTheory.parseChart(draftText))
        } catch {
            draftState = .invalid(error.localizedDescription)
        }
    }

    func replaceChart(with entry: LibraryEntry) {
        let newChart = Self.chart(from: entry)
        commit(newChart, notice: "Loaded “\(entry.title)”.")
        draftText = newChart.chartText
        draftState = .current
        selectedChordID = newChart.measures.first?.chords.first?.id
        isLibraryPresented = false
    }

    func newChart() {
        let measure = JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])
        let newChart = JazzChart(title: "Untitled changes", key: .c, measures: [measure])
        commit(newChart, notice: "New chart ready.")
        draftText = newChart.chartText
        selectedChordID = measure.chords.first?.id
    }

    func updateTitle(_ title: String) {
        let bounded = String(title.prefix(120)).trimmingCharacters(in: .newlines)
        guard bounded != chart.title else { return }
        mutate(coalescing: "title") { $0.title = bounded.isEmpty ? "Untitled changes" : bounded }
    }

    func updateKey(_ key: JazzKey) {
        guard key != chart.key else { return }
        mutate { $0.key = key }
    }

    func updateTempo(_ tempo: Double) {
        let bounded = min(320, max(30, tempo.rounded()))
        guard bounded != chart.tempoBPM else { return }
        mutate(coalescing: "tempo") { $0.tempoBPM = bounded }
    }

    func updateGroove(_ groove: GrooveStyle) {
        guard groove != chart.groove else { return }
        mutate { $0.groove = groove }
    }

    func updateInstrument(_ instrument: InstrumentTone) {
        guard instrument != chart.instrument else { return }
        audio.stop()
        mutate { $0.instrument = instrument }
    }

    func updateVoicing(_ family: VoicingFamily) {
        guard family != chart.voicingFamily else { return }
        audio.stop()
        mutate { $0.voicingFamily = family }
    }

    func transpose(_ semitones: Int) {
        guard semitones != 0 else { return }
        audio.stop()
        mutate { chart in
            let keyPitch = chart.key.pitchClass + semitones
            if let newKey = JazzKey.allCases.first(where: { $0.pitchClass == (keyPitch % 12 + 12) % 12 }) {
                chart.key = newKey
            }
            for measureIndex in chart.measures.indices {
                for chordIndex in chart.measures[measureIndex].chords.indices {
                    let old = chart.measures[measureIndex].chords[chordIndex].symbol
                    chart.measures[measureIndex].chords[chordIndex].symbol = JazzTheory.transpose(symbol: old, semitones: semitones, preferFlats: chart.key.prefersFlats)
                }
            }
        }
        draftText = chart.chartText
        draftState = .current
        notice = semitones > 0 ? "Transposed up \(semitones) semitone\(semitones == 1 ? "" : "s")." : "Transposed down \(-semitones) semitone\(-semitones == 1 ? "" : "s")."
    }

    func select(_ chord: JazzChordEvent, showInspector: Bool = false) {
        selectedChordID = chord.id
        if showInspector { isInspectorPresented = true }
    }

    func undo() {
        guard let previous = undoStack.popLast() else { return }
        audio.stop()
        redoStack.append(chart)
        coalescingKey = nil
        chart = previous
        finishStateChange(notice: "Undid the last chart change.")
    }

    func redo() {
        guard let next = redoStack.popLast() else { return }
        audio.stop()
        undoStack.append(chart)
        coalescingKey = nil
        chart = next
        finishStateChange(notice: "Redid the chart change.")
    }

    func exportURL(kind: ExportKind) -> URL? {
        let slug = chart.title
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let base = slug.isEmpty ? "frankenjazz-chart" : slug
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(base).appendingPathExtension(kind.extensionName)
        do {
            let data: Data
            switch kind {
            case .nativeJSON: data = try encoder.encode(chart)
            case .chartText: data = Data(("# \(chart.title)\n# key \(chart.key.rawValue) · \(Int(chart.tempoBPM)) BPM · \(chart.groove.rawValue)\n\n" + chart.chartText + "\n").utf8)
            case .midi: data = MIDIFileWriter.makeFile(chart: chart)
            }
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            notice = "Export failed: \(error.localizedDescription)"
            return nil
        }
    }

    func importFile(_ url: URL) async {
        let importToken = importFence.claim(revision: revision)
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try await Task.detached(priority: .userInitiated) {
                let values = try url.resourceValues(forKeys: [.fileSizeKey])
                guard (values.fileSize ?? 0) <= 2_000_000 else { throw ImportError.tooLarge }
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                guard data.count <= 2_000_000 else { throw ImportError.tooLarge }
                return data
            }.value
            try Task.checkCancellation()
            guard importFence.owns(importToken, currentRevision: revision) else { return }
            let imported: JazzChart
            if url.pathExtension.lowercased() == "txt" || url.pathExtension.lowercased() == "md" {
                guard let text = String(data: data, encoding: .utf8) else { throw ImportError.notUTF8 }
                let content = text.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("#") }.joined(separator: "\n")
                let parsed = try JazzTheory.parseChart(content)
                imported = JazzChart(title: url.deletingPathExtension().lastPathComponent, measures: parsed.measures)
            } else {
                imported = try decoder.decode(JazzChart.self, from: data)
            }
            try JazzDocumentValidator.validate(imported)
            guard importFence.owns(importToken, currentRevision: revision) else { return }
            commit(imported, notice: "Imported “\(imported.title)”.")
            draftText = imported.chartText
            selectedChordID = imported.measures.first?.chords.first?.id
            isDocumentPresented = false
        } catch is CancellationError {
            return
        } catch {
            guard importFence.owns(importToken, currentRevision: revision) else { return }
            notice = "Import refused: \(error.localizedDescription)"
        }
    }

    private func applyParsedDraft(_ parsed: ParsedChart) {
        let oldFlat = chart.measures.flatMap(\.chords)
        var cursor = 0
        var preserved: [JazzMeasure] = []
        for (measureIndex, parsedMeasure) in parsed.measures.enumerated() {
            var chords: [JazzChordEvent] = []
            for parsedChord in parsedMeasure.chords {
                if cursor < oldFlat.count, oldFlat[cursor].symbol == parsedChord.symbol {
                    var chord = oldFlat[cursor]
                    chord.beats = parsedChord.beats
                    chords.append(chord)
                } else {
                    chords.append(parsedChord)
                }
                cursor += 1
            }
            let id = measureIndex < chart.measures.count ? chart.measures[measureIndex].id : UUID()
            preserved.append(JazzMeasure(id: id, chords: chords))
        }
        guard preserved != chart.measures else {
            draftState = .current
            return
        }
        audio.stop()
        mutate { $0.measures = preserved }
        draftText = parsed.normalizedText
        draftState = .current
        if selectedChord == nil { selectedChordID = preserved.first?.chords.first?.id }
    }

    private func mutate(coalescing key: String? = nil, _ edit: (inout JazzChart) -> Void) {
        var next = chart
        edit(&next)
        next.updatedAt = Date()
        guard next != chart else { return }
        let now = Date()
        let continuesCoalescing = key != nil && key == coalescingKey && now < coalescingDeadline
        if !continuesCoalescing {
            undoStack.append(chart)
            if undoStack.count > 80 { undoStack.removeFirst(undoStack.count - 80) }
        }
        coalescingKey = key
        coalescingDeadline = key == nil ? .distantPast : now.addingTimeInterval(0.8)
        redoStack.removeAll(keepingCapacity: true)
        chart = next
        finishStateChange(notice: nil)
    }

    private func commit(_ next: JazzChart, notice: String?) {
        audio.stop()
        undoStack.append(chart)
        redoStack.removeAll(keepingCapacity: true)
        coalescingKey = nil
        chart = next
        finishStateChange(notice: notice)
    }

    private func finishStateChange(notice: String?) {
        revision += 1
        canUndo = !undoStack.isEmpty
        canRedo = !redoStack.isEmpty
        if let notice { self.notice = notice }
        if selectedChord == nil { selectedChordID = chart.measures.first?.chords.first?.id }
        draftText = chart.chartText
        draftState = .current
        recovery.save(chart)
        primeTask?.cancel()
        primeTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(280))
            guard !Task.isCancelled, let self else { return }
            self.audio.prime(chart: self.chart)
        }
    }

    private static func chart(from entry: LibraryEntry) -> JazzChart {
        let parsed = (try? JazzTheory.parseChart(entry.chartText)) ?? ParsedChart(measures: [JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])], normalizedText: "| Cmaj7 |")
        return JazzChart(title: entry.title, key: entry.key, tempoBPM: entry.tempo, groove: entry.groove, measures: parsed.measures)
    }
}

enum ExportKind: String, CaseIterable, Identifiable, Hashable {
    case nativeJSON = "FrankenJazz chart"
    case chartText = "Lead-sheet text"
    case midi = "Standard MIDI File"

    var id: String { rawValue }
    var extensionName: String {
        switch self {
        case .nativeJSON: "frankenjazz"
        case .chartText: "txt"
        case .midi: "mid"
        }
    }
    var symbol: String {
        switch self {
        case .nativeJSON: "doc.badge.gearshape"
        case .chartText: "doc.plaintext"
        case .midi: "pianokeys"
        }
    }
}

enum ImportError: LocalizedError {
    case tooLarge
    case notUTF8
    case invalidDocument
    case invalidMeasure(Int)

    var errorDescription: String? {
        switch self {
        case .tooLarge: "The file is larger than the 2 MB import limit."
        case .notUTF8: "The text file is not valid UTF-8."
        case .invalidDocument: "The file is not a valid FrankenJazz chart."
        case let .invalidMeasure(index): "Measure \(index) contains invalid timing or chord data."
        }
    }
}

private final class JazzRecoveryStore {
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let fileURL: URL
    private let previousURL: URL

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        let directory = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)) ?? FileManager.default.temporaryDirectory
        fileURL = directory.appendingPathComponent("FrankenJazz-Recovery.json")
        previousURL = directory.appendingPathComponent("FrankenJazz-Recovery.previous.json")
    }

    func save(_ chart: JazzChart) {
        guard let data = try? encoder.encode(chart) else { return }
        if FileManager.default.fileExists(atPath: fileURL.path), let current = try? Data(contentsOf: fileURL), (try? decoder.decode(JazzChart.self, from: current)) != nil {
            try? current.write(to: previousURL, options: .atomic)
        }
        try? data.write(to: fileURL, options: .atomic)
    }

    func load() -> JazzChart? {
        for url in [fileURL, previousURL] {
            guard let data = try? Data(contentsOf: url),
                  data.count <= 2_000_000,
                  let chart = try? decoder.decode(JazzChart.self, from: data),
                  (try? JazzDocumentValidator.validate(chart)) != nil else { continue }
            return chart
        }
        return nil
    }

}

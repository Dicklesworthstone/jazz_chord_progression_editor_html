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
    @Published var isSaveCopyPresented = false
    @Published var saveCopyDocument: JazzExportDocument?
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
    private let recovery: JazzRecoveryStore
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(recovery: JazzRecoveryStore = JazzRecoveryStore()) {
        self.recovery = recovery
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

    var selectedMIDIPitches: [Int] {
        guard let selectedChord, let selectedDescription else { return [] }
        return selectedChord.frozenMIDIPitches
            ?? JazzTheory.voicing(for: selectedDescription, family: chart.voicingFamily)
    }

    var selectedTransitionSummary: String {
        let chords = chart.measures.flatMap(\.chords)
        guard let selectedChordID,
              let index = chords.firstIndex(where: { $0.id == selectedChordID }),
              chords.indices.contains(index + 1),
              let source = JazzTheory.parseChord(chords[index].symbol, in: chart.key),
              let destination = JazzTheory.parseChord(chords[index + 1].symbol, in: chart.key) else {
            return "This is the final change; there is no following chord to compare."
        }
        return JazzTheory.transitionMotion(from: source, to: destination, flats: chart.key.prefersFlats)
    }

    var selectedMeasureID: UUID? {
        guard let location = selectedLocation else { return nil }
        return chart.measures[location.measure].id
    }

    var canDuplicateSelectedChord: Bool {
        guard let location = selectedLocation else { return false }
        return chart.measures[location.measure].chords.count < JazzTheory.maximumChordsPerMeasure
    }

    var canDeleteSelectedChord: Bool {
        guard let location = selectedLocation else { return false }
        return chart.measures[location.measure].chords.count > 1
    }

    var canMoveSelectedChordEarlier: Bool { selectedLocation?.chord ?? 0 > 0 }

    var canMoveSelectedChordLater: Bool {
        guard let location = selectedLocation else { return false }
        return location.chord + 1 < chart.measures[location.measure].chords.count
    }

    var canDeleteSelectedMeasure: Bool { selectedLocation != nil && chart.measures.count > 1 }

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
        let newChart = Self.chart(from: entry, fallbackTempo: chart.tempoBPM)
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

    func freezeSelectedVoicing() {
        guard let location = selectedLocation,
              chart.measures[location.measure].chords[location.chord].frozenMIDIPitches == nil,
              let description = selectedDescription else { return }
        let pitches = JazzTheory.voicing(for: description, family: chart.voicingFamily)
        guard !pitches.isEmpty else { return }
        audio.stop()
        mutate { chart in
            chart.measures[location.measure].chords[location.chord].frozenMIDIPitches = pitches
        }
        notice = "Frozen \(description.symbol) at \(pitches.count) exact pitches."
    }

    func clearSelectedFrozenVoicing() {
        guard let location = selectedLocation,
              chart.measures[location.measure].chords[location.chord].frozenMIDIPitches != nil else { return }
        let symbol = chart.measures[location.measure].chords[location.chord].symbol
        audio.stop()
        mutate { chart in
            chart.measures[location.measure].chords[location.chord].frozenMIDIPitches = nil
        }
        notice = "\(symbol) now follows the \(chart.voicingFamily.rawValue) family."
    }

    func updateSelectedChordAnnotation(_ annotation: String) {
        guard let selectedChordID else { return }
        let bounded = String(annotation.prefix(500))
        guard selectedChord?.annotation != bounded else { return }
        mutate(coalescing: "annotation-\(selectedChordID.uuidString)") { chart in
            for measureIndex in chart.measures.indices {
                guard let chordIndex = chart.measures[measureIndex].chords.firstIndex(where: {
                    $0.id == selectedChordID
                }) else { continue }
                chart.measures[measureIndex].chords[chordIndex].annotation = bounded
                return
            }
        }
    }

    func transpose(_ semitones: Int) {
        guard semitones != 0 else { return }
        let frozenCount = chart.measures.flatMap(\.chords).filter { $0.frozenMIDIPitches != nil }.count
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
        let direction = semitones > 0
            ? "Transposed up \(semitones) semitone\(semitones == 1 ? "" : "s")."
            : "Transposed down \(-semitones) semitone\(-semitones == 1 ? "" : "s")."
        let frozenNotice = frozenCount == 0
            ? ""
            : " \(frozenCount) frozen voicing\(frozenCount == 1 ? "" : "s") stayed at its exact pitches."
        notice = direction + frozenNotice
    }

    func select(_ chord: JazzChordEvent, showInspector: Bool = false) {
        selectedChordID = chord.id
        if showInspector { isInspectorPresented = true }
    }

    func duplicateSelectedChord() {
        guard let location = selectedLocation else { return }
        guard canDuplicateSelectedChord else {
            notice = "A bar can contain at most \(JazzTheory.maximumChordsPerMeasure) changes."
            return
        }
        let source = chart.measures[location.measure].chords[location.chord]
        let firstDuration = source.beats / 2
        let secondDuration = source.beats - firstDuration
        guard firstDuration.isFinite, secondDuration.isFinite, firstDuration > 0, secondDuration > 0 else {
            notice = "This change's beat slot is too small to split safely."
            return
        }
        audio.stop()
        let duplicateID = UUID()
        mutate { chart in
            chart.measures[location.measure].chords[location.chord].beats = firstDuration
            var duplicate = source
            duplicate.id = duplicateID
            duplicate.beats = secondDuration
            chart.measures[location.measure].chords.insert(duplicate, at: location.chord + 1)
        }
        selectedChordID = duplicateID
        notice = "Duplicated \(source.symbol) and split its beat slot."
    }

    func deleteSelectedChord() {
        guard let location = selectedLocation else { return }
        guard canDeleteSelectedChord else {
            notice = "A bar needs at least one change. Delete the bar instead."
            return
        }
        audio.stop()
        let chords = chart.measures[location.measure].chords
        let removed = chords[location.chord]
        let survivorIndex = location.chord < chords.count - 1 ? location.chord + 1 : location.chord - 1
        let survivorID = chords[survivorIndex].id
        mutate { chart in
            chart.measures[location.measure].chords.remove(at: location.chord)
            let adjustedIndex = survivorIndex > location.chord ? survivorIndex - 1 : survivorIndex
            chart.measures[location.measure].chords[adjustedIndex].beats += removed.beats
        }
        selectedChordID = survivorID
        notice = "Deleted \(removed.symbol) and preserved the four-beat bar."
    }

    func moveSelectedChord(by offset: Int) {
        guard offset == -1 || offset == 1, let location = selectedLocation else { return }
        let destination = location.chord + offset
        guard chart.measures[location.measure].chords.indices.contains(destination) else {
            notice = offset < 0 ? "This change is already first in its bar." : "This change is already last in its bar."
            return
        }
        audio.stop()
        mutate { chart in
            chart.measures[location.measure].chords.swapAt(location.chord, destination)
        }
        notice = offset < 0 ? "Moved the change earlier." : "Moved the change later."
    }

    func insertMeasure(after measureID: UUID) {
        guard let index = chart.measures.firstIndex(where: { $0.id == measureID }),
              chart.measures.count < JazzTheory.maximumMeasures else {
            notice = "The chart is already at its measure limit."
            return
        }
        audio.stop()
        let chord = JazzChordEvent(symbol: "Cmaj7")
        let measure = JazzMeasure(chords: [chord])
        mutate { $0.measures.insert(measure, at: index + 1) }
        selectedChordID = chord.id
        notice = "Inserted a new bar after bar \(index + 1)."
    }

    func deleteMeasure(_ measureID: UUID) {
        guard chart.measures.count > 1,
              let index = chart.measures.firstIndex(where: { $0.id == measureID }) else {
            notice = "A chart needs at least one bar."
            return
        }
        audio.stop()
        let selectionIndex = index < chart.measures.count - 1 ? index + 1 : index - 1
        let selectionID = chart.measures[selectionIndex].chords.first?.id
        mutate { $0.measures.remove(at: index) }
        selectedChordID = selectionID
        notice = "Deleted bar \(index + 1)."
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
            let data = try exportData(kind: kind)
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            notice = "Export failed: \(error.localizedDescription)"
            return nil
        }
    }

    func requestSaveCopy() {
        do {
            saveCopyDocument = JazzExportDocument(data: try exportData(kind: .nativeJSON))
            isSaveCopyPresented = true
        } catch {
            notice = "Save Copy failed: \(error.localizedDescription)"
        }
    }

    func finishSaveCopy(_ result: Result<URL, Error>) {
        isSaveCopyPresented = false
        saveCopyDocument = nil
        switch result {
        case let .success(url): notice = "Saved a copy as “\(url.lastPathComponent)”."
        case let .failure(error): notice = "Save Copy failed: \(error.localizedDescription)"
        }
    }

    var nativeExportFilename: String {
        let slug = chart.title
            .replacingOccurrences(of: #"[/:]"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return slug.isEmpty ? "FrankenJazz chart" : slug
    }

    private func exportData(kind: ExportKind) throws -> Data {
        switch kind {
        case .nativeJSON: try encoder.encode(chart)
        case .chartText: Data(("# \(chart.title)\n# key \(chart.key.rawValue) · \(Int(chart.tempoBPM)) BPM · \(chart.groove.rawValue)\n\n" + chart.chartText + "\n").utf8)
        case .midi: MIDIFileWriter.makeFile(chart: chart)
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
            let importNotice: String
            let pathExtension = url.pathExtension.lowercased()
            if pathExtension == "txt" || pathExtension == "md" {
                guard let text = String(data: data, encoding: .utf8) else { throw ImportError.notUTF8 }
                let content = text.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("#") }.joined(separator: "\n")
                let parsed = try JazzTheory.parseChart(content)
                imported = JazzChart(title: url.deletingPathExtension().lastPathComponent, measures: parsed.measures)
                importNotice = "Imported “\(imported.title)”."
            } else if pathExtension == "mid" || pathExtension == "midi" {
                let title = url.deletingPathExtension().lastPathComponent
                let result = try await Task.detached(priority: .userInitiated) {
                    try MIDIFileImporter.importChart(data: data, title: title)
                }.value
                imported = result.chart
                importNotice = result.notice
            } else {
                imported = try decoder.decode(JazzChart.self, from: data)
                importNotice = "Imported “\(imported.title)”."
            }
            try JazzDocumentValidator.validate(imported)
            guard importFence.owns(importToken, currentRevision: revision) else { return }
            commit(imported, notice: importNotice)
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

    private var selectedLocation: (measure: Int, chord: Int)? {
        guard let selectedChordID else { return nil }
        for measureIndex in chart.measures.indices {
            if let chordIndex = chart.measures[measureIndex].chords.firstIndex(where: { $0.id == selectedChordID }) {
                return (measureIndex, chordIndex)
            }
        }
        return nil
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

    private static func chart(from entry: LibraryEntry, fallbackTempo: Double = 132) -> JazzChart {
        let parsed = (try? JazzTheory.parseChart(entry.chartText)) ?? ParsedChart(measures: [JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])], normalizedText: "| Cmaj7 |")
        return JazzChart(title: entry.title, key: entry.key, tempoBPM: entry.tempo ?? fallbackTempo, groove: entry.groove, measures: parsed.measures)
    }
}

struct JazzExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.frankenJazz] }
    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw ImportError.invalidDocument }
        self.data = data
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
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

final class JazzRecoveryStore {
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let fileURL: URL
    private let previousURL: URL

    init(directory requestedDirectory: URL? = nil) {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        let directory = requestedDirectory
            ?? (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
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

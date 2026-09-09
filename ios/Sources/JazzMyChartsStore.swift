import Combine
import CryptoKit
import Foundation

struct JazzKeptChart: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    var updatedAt: Date
    var chart: JazzChart

    init(id: UUID = UUID(), updatedAt: Date = Date(), chart: JazzChart) {
        self.id = id
        self.updatedAt = updatedAt
        self.chart = chart
    }
}

enum JazzMyChartsIssue: LocalizedError, Equatable {
    case unavailable
    case corrupt
    case conflict
    case recordLimit
    case documentLimit
    case collectionLimit
    case generationExhausted
    case invalidTitle
    case missingSelection

    var errorDescription: String? {
        switch self {
        case .unavailable:
            "My Charts is unavailable. Your current chart is unchanged; export a copy if you need a portable save."
        case .corrupt:
            "My Charts contains unreadable data. It was preserved, and no collection changes were written."
        case .conflict:
            "My Charts changed since this view loaded. Refresh and try again; this attempt overwrote nothing."
        case .recordLimit:
            "My Charts holds at most 128 charts. No existing chart was removed."
        case .documentLimit:
            "This chart exceeds the 2 MiB kept-chart limit. The collection is unchanged."
        case .collectionLimit:
            "This collection would exceed 32 MiB. No existing chart was removed."
        case .generationExhausted:
            "This collection cannot accept another version. Export your charts before changing it."
        case .invalidTitle:
            "Enter a nonblank title of at most 120 characters. The kept copy is unchanged."
        case .missingSelection:
            "That kept chart is no longer in the displayed collection. Refresh and choose it again."
        }
    }
}

struct JazzMyChartsSnapshot: Equatable, Sendable {
    var token: Data?
    var generation: UInt64
    var records: [JazzKeptChart]
    var collectionBytes: Int
    var recoveredFromPrevious: Bool
}

/// A compare-and-swap file store for explicit repertoire snapshots. This is
/// deliberately independent from recovery: edits never update a kept chart.
final class JazzMyChartsPersistence {
    static let maximumRecords = 128
    static let maximumDocumentBytes = 2_097_152
    static let maximumCollectionBytes = 33_554_432

    private struct Payload: Codable {
        var schema: String
        var generation: UInt64
        var records: [JazzKeptChart]
    }

    private struct Envelope: Codable {
        var payload: Payload
        var checksum: String
    }

    private static let schema = "frankenjazz.my-charts.v1"

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let directory: URL
    private let currentURL: URL
    private let previousURL: URL
    private let recordLimit: Int
    private let documentByteLimit: Int
    private let collectionByteLimit: Int
    private let envelopeByteLimit: Int

    init(
        directory requestedDirectory: URL? = nil,
        maximumRecords: Int = JazzMyChartsPersistence.maximumRecords,
        maximumDocumentBytes: Int = JazzMyChartsPersistence.maximumDocumentBytes,
        maximumCollectionBytes: Int = JazzMyChartsPersistence.maximumCollectionBytes
    ) {
        encoder.outputFormatting = [.sortedKeys]
        let base = requestedDirectory
            ?? (try? FileManager.default.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ))
            ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent("FrankenJazz", isDirectory: true)
        currentURL = directory.appendingPathComponent("MyCharts.json")
        previousURL = directory.appendingPathComponent("MyCharts.previous.json")
        recordLimit = maximumRecords
        documentByteLimit = maximumDocumentBytes
        collectionByteLimit = maximumCollectionBytes
        envelopeByteLimit = maximumCollectionBytes + 2_097_152
    }

    func read() throws -> JazzMyChartsSnapshot {
        let manager = FileManager.default
        if manager.fileExists(atPath: currentURL.path) {
            do {
                return try decodeSnapshot(at: currentURL, recoveredFromPrevious: false)
            } catch {
                guard manager.fileExists(atPath: previousURL.path),
                      let fallback = try? decodeSnapshot(at: previousURL, recoveredFromPrevious: true) else {
                    throw JazzMyChartsIssue.corrupt
                }
                return fallback
            }
        }
        if manager.fileExists(atPath: previousURL.path) {
            guard let fallback = try? decodeSnapshot(at: previousURL, recoveredFromPrevious: true) else {
                throw JazzMyChartsIssue.corrupt
            }
            return fallback
        }
        return JazzMyChartsSnapshot(
            token: nil,
            generation: 0,
            records: [],
            collectionBytes: 0,
            recoveredFromPrevious: false
        )
    }

    func compareAndSwap(
        expected: JazzMyChartsSnapshot,
        records: [JazzKeptChart]
    ) throws -> JazzMyChartsSnapshot {
        guard !expected.recoveredFromPrevious else { throw JazzMyChartsIssue.corrupt }
        guard expected.generation < UInt64.max else { throw JazzMyChartsIssue.generationExhausted }
        let collectionBytes = try validate(records)
        let manager = FileManager.default
        let actual: Data?
        if manager.fileExists(atPath: currentURL.path) {
            actual = try boundedData(at: currentURL)
        } else {
            actual = nil
        }
        guard actual == expected.token else { throw JazzMyChartsIssue.conflict }

        let payload = Payload(
            schema: Self.schema,
            generation: expected.generation + 1,
            records: records
        )
        let payloadData = try encoder.encode(payload)
        let envelope = Envelope(payload: payload, checksum: Self.digest(payloadData))
        let nextData = try encoder.encode(envelope)
        guard nextData.count <= envelopeByteLimit else { throw JazzMyChartsIssue.collectionLimit }
        do {
            try manager.createDirectory(at: directory, withIntermediateDirectories: true)
            if let actual {
                try actual.write(to: previousURL, options: [.atomic])
            }
            try nextData.write(to: currentURL, options: [.atomic])
        } catch {
            throw JazzMyChartsIssue.unavailable
        }
        return JazzMyChartsSnapshot(
            token: nextData,
            generation: payload.generation,
            records: records,
            collectionBytes: collectionBytes,
            recoveredFromPrevious: false
        )
    }

    func resetForUITesting() {
        try? FileManager.default.removeItem(at: currentURL)
        try? FileManager.default.removeItem(at: previousURL)
    }

    private func decodeSnapshot(at url: URL, recoveredFromPrevious: Bool) throws -> JazzMyChartsSnapshot {
        let data = try boundedData(at: url)
        let envelope: Envelope
        do {
            envelope = try decoder.decode(Envelope.self, from: data)
        } catch {
            throw JazzMyChartsIssue.corrupt
        }
        guard envelope.payload.schema == Self.schema,
              let payloadData = try? encoder.encode(envelope.payload),
              Self.digest(payloadData) == envelope.checksum else {
            throw JazzMyChartsIssue.corrupt
        }
        let collectionBytes = try validate(envelope.payload.records)
        return JazzMyChartsSnapshot(
            token: data,
            generation: envelope.payload.generation,
            records: envelope.payload.records,
            collectionBytes: collectionBytes,
            recoveredFromPrevious: recoveredFromPrevious
        )
    }

    private func boundedData(at url: URL) throws -> Data {
        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey])
            guard let count = values.fileSize, count <= envelopeByteLimit else {
                throw JazzMyChartsIssue.corrupt
            }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard data.count <= envelopeByteLimit else { throw JazzMyChartsIssue.corrupt }
            return data
        } catch let issue as JazzMyChartsIssue {
            throw issue
        } catch {
            throw JazzMyChartsIssue.unavailable
        }
    }

    private func validate(_ records: [JazzKeptChart]) throws -> Int {
        guard records.count <= recordLimit else { throw JazzMyChartsIssue.recordLimit }
        var identifiers = Set<UUID>()
        var bytes = 0
        for record in records {
            guard identifiers.insert(record.id).inserted else { throw JazzMyChartsIssue.corrupt }
            do {
                try JazzDocumentValidator.validate(record.chart)
            } catch {
                throw JazzMyChartsIssue.corrupt
            }
            let documentData: Data
            do {
                documentData = try encoder.encode(record.chart)
            } catch {
                throw JazzMyChartsIssue.corrupt
            }
            guard documentData.count <= documentByteLimit else {
                throw JazzMyChartsIssue.documentLimit
            }
            bytes += documentData.count
            guard bytes <= collectionByteLimit else {
                throw JazzMyChartsIssue.collectionLimit
            }
        }
        return bytes
    }

    private static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

@MainActor
final class JazzMyChartsStore: ObservableObject {
    @Published private(set) var records: [JazzKeptChart] = []
    @Published private(set) var generation: UInt64 = 0
    @Published private(set) var collectionBytes = 0
    @Published private(set) var recoveredFromPrevious = false
    @Published private(set) var message: String?
    @Published private(set) var messageIsError = false
    @Published var selectedID: UUID?
    @Published var search = ""

    private let persistence: JazzMyChartsPersistence
    private var snapshot = JazzMyChartsSnapshot(
        token: nil,
        generation: 0,
        records: [],
        collectionBytes: 0,
        recoveredFromPrevious: false
    )

    init(
        persistence: JazzMyChartsPersistence = JazzMyChartsPersistence(),
        resetForUITesting: Bool = false
    ) {
        self.persistence = persistence
        if resetForUITesting { persistence.resetForUITesting() }
        reload()
    }

    var filteredRecords: [JazzKeptChart] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidates = records.sorted {
            if $0.updatedAt != $1.updatedAt { return $0.updatedAt > $1.updatedAt }
            return $0.id.uuidString < $1.id.uuidString
        }
        guard !query.isEmpty else { return candidates }
        return candidates.filter {
            $0.chart.title.localizedCaseInsensitiveContains(query)
                || $0.chart.key.rawValue.localizedCaseInsensitiveContains(query)
        }
    }

    var selected: JazzKeptChart? {
        guard let selectedID else { return nil }
        return records.first { $0.id == selectedID }
    }

    func select(_ id: UUID) {
        guard records.contains(where: { $0.id == id }) else { return }
        selectedID = id
        clearMessage()
    }

    func reload() {
        do {
            publish(try persistence.read())
            if recoveredFromPrevious {
                message = "The newest collection is damaged. Showing the previous validated copy read-only; your current chart is unchanged."
                messageIsError = true
            } else {
                clearMessage()
            }
        } catch {
            records = []
            generation = 0
            collectionBytes = 0
            recoveredFromPrevious = true
            selectedID = nil
            fail(error)
        }
    }

    @discardableResult
    func keep(_ chart: JazzChart) -> Bool {
        do {
            try JazzDocumentValidator.validate(chart)
            let record = JazzKeptChart(chart: chart)
            try write(records + [record])
            selectedID = record.id
            succeed("Kept “\(chart.title)” as an explicit snapshot. Later edits are not included.")
            return true
        } catch {
            fail(error)
            return false
        }
    }

    @discardableResult
    func rename(recordID: UUID, title: String, expectedGeneration: UInt64) -> Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 120 else {
            fail(JazzMyChartsIssue.invalidTitle)
            return false
        }
        return edit(recordID: recordID, expectedGeneration: expectedGeneration) { record in
            record.chart.title = trimmed
            record.chart.updatedAt = Date()
            record.updatedAt = Date()
        } success: {
            "Renamed the kept copy. The chart being edited is unchanged."
        }
    }

    @discardableResult
    func duplicate(recordID: UUID, expectedGeneration: UInt64) -> Bool {
        guard generation == expectedGeneration,
              let source = records.first(where: { $0.id == recordID }) else {
            fail(generation == expectedGeneration ? JazzMyChartsIssue.missingSelection : JazzMyChartsIssue.conflict)
            return false
        }
        do {
            let duplicate = JazzKeptChart(chart: Self.duplicateChartWithFreshIdentities(source.chart))
            try write(records + [duplicate])
            selectedID = duplicate.id
            succeed("Duplicated the kept chart with fresh chart, bar, and chord identities.")
            return true
        } catch {
            fail(error)
            return false
        }
    }

    @discardableResult
    func replace(
        recordID: UUID,
        with chart: JazzChart,
        expectedGeneration: UInt64,
        expectedStudioRevision: Int,
        currentStudioRevision: Int
    ) -> Bool {
        guard expectedStudioRevision == currentStudioRevision else {
            fail(JazzMyChartsIssue.conflict)
            return false
        }
        return edit(recordID: recordID, expectedGeneration: expectedGeneration) { record in
            record.chart = chart
            record.updatedAt = Date()
        } success: {
            "Replaced the kept copy with the confirmed current chart snapshot."
        }
    }

    @discardableResult
    func remove(recordID: UUID, expectedGeneration: UInt64) -> Bool {
        guard generation == expectedGeneration else {
            fail(JazzMyChartsIssue.conflict)
            return false
        }
        guard records.contains(where: { $0.id == recordID }) else {
            fail(JazzMyChartsIssue.missingSelection)
            return false
        }
        do {
            try write(records.filter { $0.id != recordID })
            if selectedID == recordID { selectedID = nil }
            succeed("Removed the kept copy. The current chart and recovery are unchanged.")
            return true
        } catch {
            fail(error)
            return false
        }
    }

    func reportStaleOpen() {
        message = "The chart being edited changed after this confirmation opened. Review the kept copy and try again."
        messageIsError = true
    }

    static func duplicateChartWithFreshIdentities(_ source: JazzChart) -> JazzChart {
        var duplicate = source
        duplicate.id = UUID()
        duplicate.updatedAt = Date()
        duplicate.measures = source.measures.map { measure in
            var copiedMeasure = measure
            copiedMeasure.id = UUID()
            copiedMeasure.chords = measure.chords.map { chord in
                var copiedChord = chord
                copiedChord.id = UUID()
                return copiedChord
            }
            return copiedMeasure
        }
        return duplicate
    }

    private func edit(
        recordID: UUID,
        expectedGeneration: UInt64,
        mutation: (inout JazzKeptChart) -> Void,
        success: () -> String
    ) -> Bool {
        guard generation == expectedGeneration else {
            fail(JazzMyChartsIssue.conflict)
            return false
        }
        guard let index = records.firstIndex(where: { $0.id == recordID }) else {
            fail(JazzMyChartsIssue.missingSelection)
            return false
        }
        do {
            var next = records
            mutation(&next[index])
            try write(next)
            succeed(success())
            return true
        } catch {
            fail(error)
            return false
        }
    }

    private func write(_ next: [JazzKeptChart]) throws {
        publish(try persistence.compareAndSwap(expected: snapshot, records: next))
    }

    private func publish(_ next: JazzMyChartsSnapshot) {
        snapshot = next
        records = next.records
        generation = next.generation
        collectionBytes = next.collectionBytes
        recoveredFromPrevious = next.recoveredFromPrevious
        if let selectedID, !records.contains(where: { $0.id == selectedID }) {
            self.selectedID = nil
        }
    }

    private func succeed(_ text: String) {
        message = text
        messageIsError = false
    }

    private func fail(_ error: Error) {
        message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        messageIsError = true
    }

    private func clearMessage() {
        message = nil
        messageIsError = false
    }
}

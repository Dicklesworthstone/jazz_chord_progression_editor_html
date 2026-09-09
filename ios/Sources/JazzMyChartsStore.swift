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
    case backupLimit
    case invalidBackup
    case unresolvedConflict
    case operationPending

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
        case .backupLimit:
            "This backup exceeds the 64 MiB plus 128 KiB safety limit. My Charts is unchanged."
        case .invalidBackup:
            "That file is not a canonical FrankenJazz My Charts backup. My Charts is unchanged."
        case .unresolvedConflict:
            "Choose Keep local or Use backup for every conflict before restoring."
        case .operationPending:
            "Finish or cancel the restore preview before changing My Charts."
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

enum JazzMyChartsConflictChoice: String, CaseIterable, Identifiable, Sendable {
    case local
    case backup

    var id: String { rawValue }
}

struct JazzMyChartsRestoreConflict: Equatable, Identifiable, Sendable {
    var recordID: UUID
    var localTitle: String
    var backupTitle: String
    var choice: JazzMyChartsConflictChoice?

    var id: UUID { recordID }
}

struct JazzMyChartsRestorePreview: Equatable, Sendable {
    var additions: Int
    var identical: Int
    var conflicts: [JazzMyChartsRestoreConflict]

    var isResolved: Bool { conflicts.allSatisfy { $0.choice != nil } }
}

/// The portable native collection format intentionally has its own schema.
/// Its embedded document text is canonical `frankenjazz.chart.v1`, not the
/// web studio's E0 document format, so the UI never implies cross-format
/// compatibility that does not exist.
enum JazzMyChartsBackupCodec {
    static let maximumBackupBytes = 67_239_936
    static let schema = "frankenjazz.my-charts.backup.v1"

    private struct AnyCodingKey: CodingKey {
        var stringValue: String
        var intValue: Int?

        init(_ string: String) {
            stringValue = string
            intValue = nil
        }

        init?(stringValue: String) { self.init(stringValue) }

        init?(intValue: Int) {
            stringValue = String(intValue)
            self.intValue = intValue
        }
    }

    private struct BackupRecord: Codable {
        var recordID: String
        var updatedAt: String
        var documentText: String

        init(recordID: String, updatedAt: String, documentText: String) {
            self.recordID = recordID
            self.updatedAt = updatedAt
            self.documentText = documentText
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: AnyCodingKey.self)
            let expected = Set(["recordId", "updatedAt", "documentText"])
            guard Set(container.allKeys.map(\.stringValue)) == expected else {
                throw JazzMyChartsIssue.invalidBackup
            }
            recordID = try container.decode(String.self, forKey: AnyCodingKey("recordId"))
            updatedAt = try container.decode(String.self, forKey: AnyCodingKey("updatedAt"))
            documentText = try container.decode(String.self, forKey: AnyCodingKey("documentText"))
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: AnyCodingKey.self)
            try container.encode(recordID, forKey: AnyCodingKey("recordId"))
            try container.encode(updatedAt, forKey: AnyCodingKey("updatedAt"))
            try container.encode(documentText, forKey: AnyCodingKey("documentText"))
        }
    }

    private struct BackupEnvelope: Codable {
        var schema: String
        var records: [BackupRecord]

        init(schema: String, records: [BackupRecord]) {
            self.schema = schema
            self.records = records
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: AnyCodingKey.self)
            guard Set(container.allKeys.map(\.stringValue)) == Set(["schema", "records"]) else {
                throw JazzMyChartsIssue.invalidBackup
            }
            schema = try container.decode(String.self, forKey: AnyCodingKey("schema"))
            records = try container.decode([BackupRecord].self, forKey: AnyCodingKey("records"))
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: AnyCodingKey.self)
            try container.encode(schema, forKey: AnyCodingKey("schema"))
            try container.encode(records, forKey: AnyCodingKey("records"))
        }
    }

    static func encode(_ records: [JazzKeptChart]) throws -> Data {
        let sorted = records.sorted { canonicalRecordID($0.id) < canonicalRecordID($1.id) }
        let rows = try sorted.map {
            BackupRecord(
                recordID: canonicalRecordID($0.id),
                updatedAt: canonicalTimestamp($0.updatedAt),
                documentText: try canonicalDocumentText($0.chart)
            )
        }
        var data = try outerEncoder().encode(BackupEnvelope(schema: schema, records: rows))
        data.append(0x0A)
        guard data.count <= maximumBackupBytes else { throw JazzMyChartsIssue.backupLimit }
        return data
    }

    static func decode(
        _ data: Data,
        persistence: JazzMyChartsPersistence
    ) throws -> [JazzKeptChart] {
        guard data.count <= maximumBackupBytes,
              !data.starts(with: [0xEF, 0xBB, 0xBF]),
              StrictJSONScanner.validate(data, maximumDepth: 32) else {
            throw data.count > maximumBackupBytes ? JazzMyChartsIssue.backupLimit : JazzMyChartsIssue.invalidBackup
        }
        let envelope: BackupEnvelope
        do {
            envelope = try outerDecoder().decode(BackupEnvelope.self, from: data)
        } catch let issue as JazzMyChartsIssue {
            throw issue
        } catch {
            throw JazzMyChartsIssue.invalidBackup
        }
        guard envelope.schema == schema,
              envelope.records.count <= JazzMyChartsPersistence.maximumRecords else {
                        throw envelope.records.count > JazzMyChartsPersistence.maximumRecords
                ? JazzMyChartsIssue.recordLimit
                : JazzMyChartsIssue.invalidBackup
        }

        var recordIDs = Set<UUID>()
        var records: [JazzKeptChart] = []
        records.reserveCapacity(envelope.records.count)
        for row in envelope.records {
            guard let recordID = UUID(uuidString: row.recordID),
                  row.recordID == canonicalRecordID(recordID),
                  recordIDs.insert(recordID).inserted,
                  let updatedAt = parseCanonicalTimestamp(row.updatedAt) else {
                throw JazzMyChartsIssue.invalidBackup
            }
            let documentData = Data(row.documentText.utf8)
            guard documentData.count <= JazzMyChartsPersistence.maximumDocumentBytes else {
                throw JazzMyChartsIssue.documentLimit
            }
            guard StrictJSONScanner.validate(documentData, maximumDepth: 32) else {
                throw JazzMyChartsIssue.invalidBackup
            }
            let chart: JazzChart
            do {
                chart = try documentDecoder().decode(JazzChart.self, from: documentData)
                try JazzDocumentValidator.validate(chart)
            } catch {
                throw JazzMyChartsIssue.invalidBackup
            }
            guard try canonicalDocumentText(chart) == row.documentText else {
                throw JazzMyChartsIssue.invalidBackup
            }
            records.append(JazzKeptChart(id: recordID, updatedAt: updatedAt, chart: chart))
        }
        _ = try persistence.validateCandidate(records)
        return records
    }

    static func canonicalDocumentText(_ chart: JazzChart) throws -> String {
        try JazzDocumentValidator.validate(chart)
        let data = try documentEncoder().encode(chart)
        guard let text = String(data: data, encoding: .utf8) else {
            throw JazzMyChartsIssue.invalidBackup
        }
        return text
    }

    static func selectedChartData(_ chart: JazzChart) throws -> Data {
        try JazzDocumentValidator.validate(chart)
        let encoder = documentEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(chart)
    }

    private static func canonicalRecordID(_ id: UUID) -> String {
        id.uuidString.lowercased()
    }

    private static func timestampFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }

    private static func canonicalTimestamp(_ date: Date) -> String {
        timestampFormatter().string(from: date)
    }

    private static func parseCanonicalTimestamp(_ text: String) -> Date? {
        let formatter = timestampFormatter()
        guard let date = formatter.date(from: text), formatter.string(from: date) == text else { return nil }
        return date
    }

    private static func outerEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    private static func outerDecoder() -> JSONDecoder { JSONDecoder() }

    private static func documentEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private static func documentDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

/// A bounded recursive-descent JSON grammar check used before Foundation's
/// host parser. It rejects excessive nesting and duplicate object keys after
/// decoding escapes, so `recordId` and `record\u0049d` cannot alias silently.
private struct StrictJSONScanner {
    private let bytes: [UInt8]
    private let maximumDepth: Int
    private var index = 0

    static func validate(_ data: Data, maximumDepth: Int) -> Bool {
        guard String(data: data, encoding: .utf8) != nil else { return false }
        var scanner = Self(bytes: Array(data), maximumDepth: maximumDepth)
        scanner.skipWhitespace()
        guard scanner.parseValue(depth: 0) else { return false }
        scanner.skipWhitespace()
        return scanner.index == scanner.bytes.count
    }

    private mutating func parseValue(depth: Int) -> Bool {
        skipWhitespace()
        guard let byte = current else { return false }
        switch byte {
        case 0x7B: return parseObject(depth: depth)
        case 0x5B: return parseArray(depth: depth)
        case 0x22: return parseString(decode: false) != nil
        case 0x74: return consume("true")
        case 0x66: return consume("false")
        case 0x6E: return consume("null")
        case 0x2D, 0x30...0x39: return parseNumber()
        default: return false
        }
    }

    private mutating func parseObject(depth: Int) -> Bool {
        guard depth < maximumDepth else { return false }
        index += 1
        skipWhitespace()
        if consumeByte(0x7D) { return true }
        var keys = Set<String>()
        while true {
            skipWhitespace()
            guard let key = parseString(decode: true), keys.insert(key).inserted else { return false }
            skipWhitespace()
            guard consumeByte(0x3A), parseValue(depth: depth + 1) else { return false }
            skipWhitespace()
            if consumeByte(0x7D) { return true }
            guard consumeByte(0x2C) else { return false }
        }
    }

    private mutating func parseArray(depth: Int) -> Bool {
        guard depth < maximumDepth else { return false }
        index += 1
        skipWhitespace()
        if consumeByte(0x5D) { return true }
        while true {
            guard parseValue(depth: depth + 1) else { return false }
            skipWhitespace()
            if consumeByte(0x5D) { return true }
            guard consumeByte(0x2C) else { return false }
        }
    }

    private mutating func parseString(decode: Bool) -> String? {
        guard current == 0x22 else { return nil }
        let start = index
        index += 1
        while let byte = current {
            if byte == 0x22 {
                index += 1
                if !decode { return "" }
                let token = Data(bytes[start..<index])
                return try? JSONDecoder().decode(String.self, from: token)
            }
            if byte < 0x20 { return nil }
            if byte == 0x5C {
                index += 1
                guard let escaped = current else { return nil }
                if escaped == 0x75 {
                    index += 1
                    for _ in 0..<4 {
                        guard let hex = current,
                              (0x30...0x39).contains(hex) || (0x41...0x46).contains(hex) || (0x61...0x66).contains(hex) else {
                            return nil
                        }
                        index += 1
                    }
                    continue
                }
                guard [0x22, 0x5C, 0x2F, 0x62, 0x66, 0x6E, 0x72, 0x74].contains(escaped) else { return nil }
            }
            index += 1
        }
        return nil
    }

    private mutating func parseNumber() -> Bool {
        if current == 0x2D { index += 1 }
        guard let first = current else { return false }
        if first == 0x30 {
            index += 1
            if let next = current, (0x30...0x39).contains(next) { return false }
        } else {
            guard (0x31...0x39).contains(first) else { return false }
            repeat { index += 1 } while current.map { (0x30...0x39).contains($0) } == true
        }
        if current == 0x2E {
            index += 1
            guard current.map({ (0x30...0x39).contains($0) }) == true else { return false }
            repeat { index += 1 } while current.map { (0x30...0x39).contains($0) } == true
        }
        if current == 0x65 || current == 0x45 {
            index += 1
            if current == 0x2B || current == 0x2D { index += 1 }
            guard current.map({ (0x30...0x39).contains($0) }) == true else { return false }
            repeat { index += 1 } while current.map { (0x30...0x39).contains($0) } == true
        }
        return true
    }

    private mutating func consume(_ literal: StaticString) -> Bool {
        let expected = Array(String(describing: literal).utf8)
        guard index + expected.count <= bytes.count,
              Array(bytes[index..<(index + expected.count)]) == expected else { return false }
        index += expected.count
        return true
    }

    private mutating func skipWhitespace() {
        while let byte = current, [0x20, 0x09, 0x0A, 0x0D].contains(byte) { index += 1 }
    }

    private mutating func consumeByte(_ byte: UInt8) -> Bool {
        guard current == byte else { return false }
        index += 1
        return true
    }

    private var current: UInt8? { index < bytes.count ? bytes[index] : nil }
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

    func validateCandidate(_ records: [JazzKeptChart]) throws -> Int {
        try validate(records)
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
    @Published private(set) var restorePreview: JazzMyChartsRestorePreview?
    @Published var selectedID: UUID?
    @Published var search = ""

    private let persistence: JazzMyChartsPersistence
    private var restoreBase: JazzMyChartsSnapshot?
    private var restoreIncoming: [JazzKeptChart] = []
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

    var hasPendingRestore: Bool { restorePreview != nil }

    func dismissMessage() {
        clearMessage()
    }

    func select(_ id: UUID) {
        guard restorePreview == nil,
              records.contains(where: { $0.id == id }) else { return }
        selectedID = id
        clearMessage()
    }

    func reload() {
        guard restorePreview == nil else {
            fail(JazzMyChartsIssue.operationPending)
            return
        }
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
        guard requireNoPendingRestore() else { return false }
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
        guard requireNoPendingRestore() else { return false }
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
        guard requireNoPendingRestore() else { return false }
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

    func prepareBackup() -> Data? {
        guard requireNoPendingRestore() else { return nil }
        guard !recoveredFromPrevious else {
            fail(JazzMyChartsIssue.corrupt)
            return nil
        }
        do {
            let current = try persistence.read()
            guard current.token == snapshot.token,
                  current.generation == snapshot.generation,
                  !current.recoveredFromPrevious else {
                throw JazzMyChartsIssue.conflict
            }
            let data = try JazzMyChartsBackupCodec.encode(records)
            succeed("Prepared collection version \(generation). Choose where to save the native backup.")
            return data
        } catch {
            fail(error)
            return nil
        }
    }

    func prepareSelectedChartExport() -> Data? {
        guard requireNoPendingRestore() else { return nil }
        guard let selected else {
            fail(JazzMyChartsIssue.missingSelection)
            return nil
        }
        do {
            let current = try persistence.read()
            guard current.token == snapshot.token,
                  current.generation == snapshot.generation,
                  !current.recoveredFromPrevious else {
                throw JazzMyChartsIssue.conflict
            }
            let data = try JazzMyChartsBackupCodec.selectedChartData(selected.chart)
            succeed("Prepared “\(selected.chart.title)” as an exact native FrankenJazz chart. Choose where to save it.")
            return data
        } catch {
            fail(error)
            return nil
        }
    }

    func finishExport(_ result: Result<URL, Error>, label: String) {
        switch result {
        case let .success(url):
            succeed("Saved \(label) as “\(url.lastPathComponent)”.")
        case let .failure(error):
            let cocoa = error as NSError
            if cocoa.domain == NSCocoaErrorDomain,
               cocoa.code == CocoaError.userCancelled.rawValue {
                succeed("Save canceled. My Charts is unchanged.")
            } else {
                fail(error)
            }
        }
    }

    func prepareRestore(data: Data) {
        guard requireNoPendingRestore() else { return }
        guard !recoveredFromPrevious else {
            fail(JazzMyChartsIssue.corrupt)
            return
        }
        do {
            let incoming = try JazzMyChartsBackupCodec.decode(data, persistence: persistence)
            try beginRestore(with: incoming)
        } catch {
            fail(error)
        }
    }

    func prepareRestore(from url: URL) async {
        guard requireNoPendingRestore() else { return }
        guard !recoveredFromPrevious else {
            fail(JazzMyChartsIssue.corrupt)
            return
        }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try await Task.detached(priority: .userInitiated) {
                let values = try url.resourceValues(forKeys: [.fileSizeKey])
                if let size = values.fileSize,
                   size > JazzMyChartsBackupCodec.maximumBackupBytes {
                    throw JazzMyChartsIssue.backupLimit
                }
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                guard data.count <= JazzMyChartsBackupCodec.maximumBackupBytes else {
                    throw JazzMyChartsIssue.backupLimit
                }
                return data
            }.value
            try Task.checkCancellation()
            prepareRestore(data: data)
        } catch is CancellationError {
            return
        } catch {
            fail(error)
        }
    }

    func chooseRestoreConflict(recordID: UUID, choice: JazzMyChartsConflictChoice) {
        guard var preview = restorePreview,
              let index = preview.conflicts.firstIndex(where: { $0.recordID == recordID }) else {
            fail(JazzMyChartsIssue.missingSelection)
            return
        }
        preview.conflicts[index].choice = choice
        restorePreview = preview
        succeed(preview.isResolved
            ? "Every conflict has an explicit choice. Review the summary, then confirm once."
            : "Choice recorded. Resolve every remaining conflict before confirming.")
    }

    @discardableResult
    func confirmRestore() -> Bool {
        guard let preview = restorePreview,
              let base = restoreBase else {
            fail(JazzMyChartsIssue.missingSelection)
            return false
        }
        guard preview.isResolved else {
            fail(JazzMyChartsIssue.unresolvedConflict)
            return false
        }
        guard snapshot.token == base.token,
              snapshot.generation == base.generation else {
            fail(JazzMyChartsIssue.conflict)
            return false
        }
        do {
            var merged = Dictionary(uniqueKeysWithValues: base.records.map { ($0.id, $0) })
            let choices = Dictionary(uniqueKeysWithValues: preview.conflicts.compactMap {
                conflict in conflict.choice.map { (conflict.recordID, $0) }
            })
            for incoming in restoreIncoming {
                if let local = merged[incoming.id] {
                    let localText = try JazzMyChartsBackupCodec.canonicalDocumentText(local.chart)
                    let backupText = try JazzMyChartsBackupCodec.canonicalDocumentText(incoming.chart)
                    if localText == backupText { continue }
                    if choices[incoming.id] == .backup { merged[incoming.id] = incoming }
                } else {
                    merged[incoming.id] = incoming
                }
            }
            let next = merged.values.sorted { $0.id.uuidString < $1.id.uuidString }
            try write(next)
            clearRestore()
            succeed("Restored \(preview.additions) additions and resolved \(preview.conflicts.count) conflicts in one collection update.")
            return true
        } catch {
            fail(error)
            return false
        }
    }

    func cancelRestore() {
        guard restorePreview != nil else { return }
        clearRestore()
        succeed("Restore canceled. The committed collection is unchanged.")
    }

    private func beginRestore(with incoming: [JazzKeptChart]) throws {
        let current = try persistence.read()
        guard current.token == snapshot.token,
              current.generation == snapshot.generation,
              !current.recoveredFromPrevious else {
            throw JazzMyChartsIssue.conflict
        }
        let localByID = Dictionary(uniqueKeysWithValues: records.map { ($0.id, $0) })
        var additions = 0
        var identical = 0
        var conflicts: [JazzMyChartsRestoreConflict] = []
        for row in incoming.sorted(by: { $0.id.uuidString < $1.id.uuidString }) {
            guard let local = localByID[row.id] else {
                additions += 1
                continue
            }
            if try JazzMyChartsBackupCodec.canonicalDocumentText(local.chart)
                == JazzMyChartsBackupCodec.canonicalDocumentText(row.chart) {
                identical += 1
            } else {
                conflicts.append(JazzMyChartsRestoreConflict(
                    recordID: row.id,
                    localTitle: local.chart.title,
                    backupTitle: row.chart.title,
                    choice: nil
                ))
            }
        }
        restoreBase = snapshot
        restoreIncoming = incoming
        restorePreview = JazzMyChartsRestorePreview(
            additions: additions,
            identical: identical,
            conflicts: conflicts
        )
        succeed("Prepared a read-only restore preview. No collection bytes have changed.")
    }

    private func clearRestore() {
        restorePreview = nil
        restoreBase = nil
        restoreIncoming = []
    }

    private func requireNoPendingRestore() -> Bool {
        guard restorePreview == nil else {
            fail(JazzMyChartsIssue.operationPending)
            return false
        }
        return true
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
        guard requireNoPendingRestore() else { return false }
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

import XCTest
@testable import FrankenJazz

final class JazzMyChartsTests: XCTestCase {
    @MainActor
    func testKeepIsAnExplicitSnapshotSeparateFromLaterEditsAndRecovery() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let library = JazzMyChartsStore(persistence: persistence)
        var live = makeChart(title: "Night changes")
        let kept = live

        XCTAssertTrue(library.keep(live))
        live.title = "A later live edit"
        live.measures[0].chords[0].annotation = "changed after keep"

        XCTAssertEqual(library.records.count, 1)
        XCTAssertEqual(library.records[0].chart, kept)
        XCTAssertNotEqual(library.records[0].chart, live)

        let reloaded = JazzMyChartsStore(persistence: persistence)
        XCTAssertEqual(reloaded.records[0].chart, kept)
        XCTAssertFalse(reloaded.recoveredFromPrevious)
    }

    @MainActor
    func testRenameChangesOnlyKeptTitleAndDuplicateRemapsEveryIdentity() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = JazzMyChartsStore(
            persistence: JazzMyChartsPersistence(directory: directory)
        )
        let source = makeChart(title: "Identity source")
        XCTAssertTrue(library.keep(source))
        let recordID = try XCTUnwrap(library.selectedID)
        let generation = library.generation

        XCTAssertTrue(library.rename(recordID: recordID, title: "Renamed copy", expectedGeneration: generation))
        XCTAssertEqual(library.selected?.chart.title, "Renamed copy")
        XCTAssertEqual(source.title, "Identity source")

        let renamed = try XCTUnwrap(library.selected?.chart)
        XCTAssertTrue(library.duplicate(recordID: recordID, expectedGeneration: library.generation))
        let duplicate = try XCTUnwrap(library.selected?.chart)

        XCTAssertNotEqual(duplicate.id, renamed.id)
        XCTAssertTrue(Set(duplicate.measures.map(\.id)).isDisjoint(with: Set(renamed.measures.map(\.id))))
        XCTAssertTrue(Set(duplicate.measures.flatMap(\.chords).map(\.id)).isDisjoint(
            with: Set(renamed.measures.flatMap(\.chords).map(\.id))
        ))

        var normalized = duplicate
        normalized.id = renamed.id
        normalized.updatedAt = renamed.updatedAt
        for measureIndex in normalized.measures.indices {
            normalized.measures[measureIndex].id = renamed.measures[measureIndex].id
            for chordIndex in normalized.measures[measureIndex].chords.indices {
                normalized.measures[measureIndex].chords[chordIndex].id = renamed.measures[measureIndex].chords[chordIndex].id
            }
        }
        XCTAssertEqual(normalized, renamed, "Duplication must preserve every non-identity chart field exactly.")
    }

    func testPersistenceRefusesAStaleGenerationWithoutChangingCommittedRecords() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let firstReader = try persistence.read()
        let staleReader = try persistence.read()
        let firstRecord = JazzKeptChart(chart: makeChart(title: "First writer"))

        let committed = try persistence.compareAndSwap(expected: firstReader, records: [firstRecord])
        XCTAssertEqual(committed.generation, 1)
        XCTAssertThrowsError(
            try persistence.compareAndSwap(
                expected: staleReader,
                records: [JazzKeptChart(chart: makeChart(title: "Stale writer"))]
            )
        ) { error in
            XCTAssertEqual(error as? JazzMyChartsIssue, .conflict)
        }
        XCTAssertEqual(try persistence.read().records, [firstRecord])
    }

    func testCorruptCurrentEnvelopeFallsBackToPreviousValidatedCopyReadOnly() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let firstRecord = JazzKeptChart(chart: makeChart(title: "Known good"))
        let first = try persistence.compareAndSwap(expected: persistence.read(), records: [firstRecord])
        _ = try persistence.compareAndSwap(
            expected: first,
            records: [firstRecord, JazzKeptChart(chart: makeChart(title: "Newest"))]
        )

        let currentURL = directory
            .appendingPathComponent("FrankenJazz", isDirectory: true)
            .appendingPathComponent("MyCharts.json")
        try Data("not valid JSON".utf8).write(to: currentURL, options: .atomic)

        let fallback = try persistence.read()
        XCTAssertTrue(fallback.recoveredFromPrevious)
        XCTAssertEqual(fallback.generation, 1)
        XCTAssertEqual(fallback.records, [firstRecord])
        XCTAssertThrowsError(try persistence.compareAndSwap(expected: fallback, records: [])) { error in
            XCTAssertEqual(error as? JazzMyChartsIssue, .corrupt)
        }
        XCTAssertEqual(try Data(contentsOf: currentURL), Data("not valid JSON".utf8))
    }

    @MainActor
    func testRecordDocumentAndCollectionLimitsRefuseWithoutEviction() throws {
        let recordDirectory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: recordDirectory) }
        let recordStore = JazzMyChartsStore(
            persistence: JazzMyChartsPersistence(directory: recordDirectory, maximumRecords: 1)
        )
        XCTAssertTrue(recordStore.keep(makeChart(title: "One")))
        XCTAssertFalse(recordStore.keep(makeChart(title: "Two")))
        XCTAssertEqual(recordStore.records.map(\.chart.title), ["One"])
        XCTAssertEqual(recordStore.message, JazzMyChartsIssue.recordLimit.errorDescription)

        let documentDirectory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: documentDirectory) }
        let documentStore = JazzMyChartsStore(
            persistence: JazzMyChartsPersistence(directory: documentDirectory, maximumDocumentBytes: 1)
        )
        XCTAssertFalse(documentStore.keep(makeChart(title: "Too large")))
        XCTAssertTrue(documentStore.records.isEmpty)
        XCTAssertEqual(documentStore.message, JazzMyChartsIssue.documentLimit.errorDescription)

        let collectionDirectory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: collectionDirectory) }
        let collectionStore = JazzMyChartsStore(
            persistence: JazzMyChartsPersistence(directory: collectionDirectory, maximumCollectionBytes: 1)
        )
        XCTAssertFalse(collectionStore.keep(makeChart(title: "Too much collection")))
        XCTAssertTrue(collectionStore.records.isEmpty)
        XCTAssertEqual(collectionStore.message, JazzMyChartsIssue.collectionLimit.errorDescription)
    }

    @MainActor
    func testOpenIsRevisionBoundAndOneStepUndoable() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)
        let library = JazzMyChartsStore(
            persistence: JazzMyChartsPersistence(directory: directory)
        )
        let studio = JazzStudioStore(recovery: recovery, myCharts: library)
        let original = studio.chart
        let kept = makeChart(title: "Opened from repertoire")

        studio.openKeptChart(kept, expectedRevision: studio.revision + 1)
        XCTAssertEqual(studio.chart, original, "A stale confirmation must not replace the live chart.")

        studio.openKeptChart(kept, expectedRevision: studio.revision)
        XCTAssertEqual(studio.chart, kept)
        XCTAssertTrue(studio.canUndo)
        studio.undo()
        XCTAssertEqual(studio.chart, original)
    }

    @MainActor
    func testReplaceAndRemoveAreBoundToDisplayedCollectionAndStudioVersions() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = JazzMyChartsStore(
            persistence: JazzMyChartsPersistence(directory: directory)
        )
        XCTAssertTrue(library.keep(makeChart(title: "Kept")))
        let recordID = try XCTUnwrap(library.selectedID)
        let generation = library.generation

        XCTAssertFalse(library.replace(
            recordID: recordID,
            with: makeChart(title: "Current"),
            expectedGeneration: generation,
            expectedStudioRevision: 4,
            currentStudioRevision: 5
        ))
        XCTAssertEqual(library.selected?.chart.title, "Kept")
        XCTAssertFalse(library.remove(recordID: recordID, expectedGeneration: generation - 1))
        XCTAssertEqual(library.records.count, 1)

        XCTAssertTrue(library.replace(
            recordID: recordID,
            with: makeChart(title: "Current"),
            expectedGeneration: library.generation,
            expectedStudioRevision: 5,
            currentStudioRevision: 5
        ))
        XCTAssertEqual(library.selected?.chart.title, "Current")
        XCTAssertTrue(library.remove(recordID: recordID, expectedGeneration: library.generation))
        XCTAssertTrue(library.records.isEmpty)
    }

    func testNativeBackupIsDeterministicIDOrderedAndRoundTripsEveryChartField() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let first = JazzKeptChart(
            id: try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000002")),
            updatedAt: Date(timeIntervalSince1970: 1_725_000_000.125),
            chart: makeChart(title: "Second by ID")
        )
        let second = JazzKeptChart(
            id: try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000001")),
            updatedAt: Date(timeIntervalSince1970: 1_725_000_001.250),
            chart: makeChart(title: "First by ID")
        )

        let encoded = try JazzMyChartsBackupCodec.encode([first, second])
        let decoded = try JazzMyChartsBackupCodec.decode(encoded, persistence: persistence)

        XCTAssertLessThan(encoded.count, JazzMyChartsBackupCodec.maximumBackupBytes)
        XCTAssertEqual(decoded.map(\.id), [second.id, first.id])
        XCTAssertEqual(decoded.map(\.chart), [second.chart, first.chart])
        XCTAssertEqual(
            decoded.map { ISO8601DateFormatter.withFractionalSeconds.string(from: $0.updatedAt) },
            [second, first].map { ISO8601DateFormatter.withFractionalSeconds.string(from: $0.updatedAt) }
        )
        XCTAssertEqual(try JazzMyChartsBackupCodec.encode(decoded), encoded)

        let selected = try JazzMyChartsBackupCodec.selectedChartData(first.chart)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        XCTAssertEqual(try decoder.decode(JazzChart.self, from: selected), first.chart)
    }

    func testBackupDecoderRejectsHostileOuterAndEmbeddedJSONWithoutPartialAcceptance() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let record = JazzKeptChart(
            id: try XCTUnwrap(UUID(uuidString: "10000000-0000-0000-0000-000000000001")),
            updatedAt: Date(timeIntervalSince1970: 1_725_000_000),
            chart: makeChart(title: "Validated")
        )
        let valid = try JazzMyChartsBackupCodec.encode([record])

        var bom = Data([0xEF, 0xBB, 0xBF])
        bom.append(valid)
        assertBackupRefused(bom, persistence: persistence, as: .invalidBackup)
        assertBackupRefused(Data([0x7B, 0x22, 0x78, 0x22, 0x3A, 0x22, 0xFF, 0x22, 0x7D]), persistence: persistence, as: .invalidBackup)

        let escapedDuplicate = Data(
            #"{"schema":"frankenjazz.my-charts.backup.v1","schem\u0061":"frankenjazz.my-charts.backup.v1","records":[]}"#.utf8
        )
        assertBackupRefused(escapedDuplicate, persistence: persistence, as: .invalidBackup)

        let unknownField = try mutateBackup(valid) { root in root["unexpected"] = true }
        assertBackupRefused(unknownField, persistence: persistence, as: .invalidBackup)

        let duplicateRecord = try JazzMyChartsBackupCodec.encode([record, record])
        assertBackupRefused(duplicateRecord, persistence: persistence, as: .invalidBackup)

        let noncanonicalDocument = try mutateBackupDocument(valid) { " \($0)" }
        assertBackupRefused(noncanonicalDocument, persistence: persistence, as: .invalidBackup)

        let futureDocument = try mutateBackupDocument(valid) {
            $0.replacingOccurrences(of: JazzChart.schema, with: "frankenjazz.chart.v999")
        }
        assertBackupRefused(futureDocument, persistence: persistence, as: .invalidBackup)

        let invalidDocument = try mutateBackupDocument(valid) { documentText in
            var document = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(documentText.utf8)) as? [String: Any])
            document["title"] = ""
            let data = try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys])
            return try XCTUnwrap(String(data: data, encoding: .utf8))
        }
        assertBackupRefused(invalidDocument, persistence: persistence, as: .invalidBackup)

        let tooDeep = Data((String(repeating: "[", count: 33) + "0" + String(repeating: "]", count: 33)).utf8)
        assertBackupRefused(tooDeep, persistence: persistence, as: .invalidBackup)

        let tooLarge = Data(count: JazzMyChartsBackupCodec.maximumBackupBytes + 1)
        assertBackupRefused(tooLarge, persistence: persistence, as: .backupLimit)
    }

    @MainActor
    func testRestorePreviewClassifiesAndRequiresExplicitConflictChoiceThenCommitsOnce() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let library = JazzMyChartsStore(persistence: persistence)
        XCTAssertTrue(library.keep(makeChart(title: "Identical local")))
        XCTAssertTrue(library.keep(makeChart(title: "Conflicting local")))
        let identicalLocal = library.records[0]
        let conflictLocal = library.records[1]
        let baseGeneration = library.generation

        let identicalIncoming = JazzKeptChart(
            id: identicalLocal.id,
            updatedAt: identicalLocal.updatedAt.addingTimeInterval(500),
            chart: identicalLocal.chart
        )
        let conflictIncoming = JazzKeptChart(
            id: conflictLocal.id,
            updatedAt: conflictLocal.updatedAt.addingTimeInterval(500),
            chart: makeChart(title: "Conflicting backup")
        )
        let addition = JazzKeptChart(chart: makeChart(title: "Backup addition"))

        library.prepareRestore(data: try JazzMyChartsBackupCodec.encode([
            conflictIncoming, addition, identicalIncoming,
        ]))
        let preview = try XCTUnwrap(library.restorePreview)
        XCTAssertEqual(preview.additions, 1)
        XCTAssertEqual(preview.identical, 1)
        XCTAssertEqual(preview.conflicts.count, 1)
        XCTAssertFalse(preview.isResolved)
        XCTAssertFalse(library.confirmRestore())
        XCTAssertEqual(library.generation, baseGeneration)

        library.chooseRestoreConflict(recordID: conflictLocal.id, choice: .backup)
        XCTAssertTrue(library.restorePreview?.isResolved == true)
        XCTAssertTrue(library.confirmRestore())
        XCTAssertNil(library.restorePreview)
        XCTAssertEqual(library.generation, baseGeneration + 1)
        XCTAssertEqual(library.records.count, 3)
        XCTAssertEqual(library.records.first(where: { $0.id == identicalLocal.id })?.updatedAt, identicalLocal.updatedAt)
        XCTAssertEqual(library.records.first(where: { $0.id == conflictLocal.id })?.chart.title, "Conflicting backup")
        XCTAssertEqual(library.records.first(where: { $0.id == addition.id })?.chart, addition.chart)
    }

    @MainActor
    func testRestoreLocalChoiceCancelPendingGuardAndStalePreviewNeverWrite() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = JazzMyChartsPersistence(directory: directory)
        let first = JazzMyChartsStore(persistence: persistence)
        XCTAssertTrue(first.keep(makeChart(title: "Local authority")))
        let local = try XCTUnwrap(first.records.first)
        let incoming = JazzKeptChart(
            id: local.id,
            updatedAt: local.updatedAt.addingTimeInterval(100),
            chart: makeChart(title: "Backup candidate")
        )
        let backup = try JazzMyChartsBackupCodec.encode([incoming])

        first.prepareRestore(data: backup)
        XCTAssertNil(first.prepareBackup())
        XCTAssertEqual(first.message, JazzMyChartsIssue.operationPending.errorDescription)
        XCTAssertNil(first.prepareSelectedChartExport())
        XCTAssertEqual(first.message, JazzMyChartsIssue.operationPending.errorDescription)
        XCTAssertFalse(first.keep(makeChart(title: "Blocked while previewing")))
        XCTAssertEqual(first.records.count, 1)
        first.chooseRestoreConflict(recordID: local.id, choice: .local)
        XCTAssertTrue(first.confirmRestore())
        XCTAssertEqual(first.records[0].chart.title, "Local authority")

        first.prepareRestore(data: backup)
        first.cancelRestore()
        XCTAssertNil(first.restorePreview)
        XCTAssertEqual(try persistence.read().records[0].chart.title, "Local authority")

        first.prepareRestore(data: backup)
        let second = JazzMyChartsStore(persistence: persistence)
        XCTAssertTrue(second.keep(makeChart(title: "Concurrent addition")))
        first.chooseRestoreConflict(recordID: local.id, choice: .backup)
        XCTAssertFalse(first.confirmRestore())
        XCTAssertEqual(first.message, JazzMyChartsIssue.conflict.errorDescription)
        let committed = try persistence.read()
        XCTAssertEqual(committed.records.count, 2)
        XCTAssertEqual(committed.records.first(where: { $0.id == local.id })?.chart.title, "Local authority")
    }

    private func makeChart(title: String) -> JazzChart {
        var chart = JazzChart(
            title: title,
            key: .eb,
            tempoBPM: 146,
            groove: .bossaNova,
            instrument: .clarinet,
            voicingFamily: .spread,
            measures: [
                JazzMeasure(chords: [
                    JazzChordEvent(
                        symbol: "Fm9",
                        beats: 2,
                        annotation: "keep the inner line",
                        manualMIDIPitches: [53, 60, 67, 68]
                    ),
                    JazzChordEvent(
                        symbol: "Bb13",
                        beats: 2,
                        annotation: "resolve softly",
                        frozenMIDIPitches: [46, 56, 62, 68]
                    ),
                ]),
                JazzMeasure(chords: [JazzChordEvent(symbol: "Ebmaj9", beats: 4)]),
            ]
        )
        chart.updatedAt = Date(timeIntervalSince1970: 1_725_000_000)
        return chart
    }

    private func assertBackupRefused(
        _ data: Data,
        persistence: JazzMyChartsPersistence,
        as expected: JazzMyChartsIssue,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertThrowsError(
            try JazzMyChartsBackupCodec.decode(data, persistence: persistence),
            file: file,
            line: line
        ) { error in
            XCTAssertEqual(error as? JazzMyChartsIssue, expected, file: file, line: line)
        }
    }

    private func mutateBackup(
        _ data: Data,
        mutation: (inout [String: Any]) throws -> Void
    ) throws -> Data {
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        try mutation(&root)
        return try JSONSerialization.data(withJSONObject: root, options: [.sortedKeys])
    }

    private func mutateBackupDocument(
        _ data: Data,
        mutation: (String) throws -> String
    ) throws -> Data {
        try mutateBackup(data) { root in
            var records = try XCTUnwrap(root["records"] as? [[String: Any]])
            var first = try XCTUnwrap(records.first)
            let document = try XCTUnwrap(first["documentText"] as? String)
            first["documentText"] = try mutation(document)
            records[0] = first
            root["records"] = records
        }
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazz-MyCharts-Tests-\(UUID().uuidString)", isDirectory: true)
    }
}

private extension ISO8601DateFormatter {
    static var withFractionalSeconds: ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }
}

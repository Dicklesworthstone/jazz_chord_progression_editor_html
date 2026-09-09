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

    private func makeChart(title: String) -> JazzChart {
        JazzChart(
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
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazz-MyCharts-Tests-\(UUID().uuidString)", isDirectory: true)
    }
}

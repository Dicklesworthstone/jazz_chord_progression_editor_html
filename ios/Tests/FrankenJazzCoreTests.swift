import XCTest
@testable import FrankenJazz

final class FrankenJazzCoreTests: XCTestCase {
    func testImportFenceRejectsOlderCompletionAndInterveningEdit() {
        var fence = JazzImportFence()
        let older = fence.claim(revision: 4)
        let newer = fence.claim(revision: 4)

        XCTAssertFalse(fence.owns(older, currentRevision: 4))
        XCTAssertTrue(fence.owns(newer, currentRevision: 4))
        XCTAssertFalse(fence.owns(newer, currentRevision: 5))

        let draftRace = fence.claim(revision: 5)
        fence.invalidatePendingRequest()
        XCTAssertFalse(fence.owns(draftRace, currentRevision: 5))
    }

    func testQuickEntryAssignsExactBarBeats() throws {
        let parsed = try JazzTheory.parseChart("| Dm7 G7 | Cmaj7 |")
        XCTAssertEqual(parsed.measures.count, 2)
        XCTAssertEqual(parsed.measures[0].chords.map(\.beats), [2, 2])
        XCTAssertEqual(parsed.measures[1].chords.map(\.beats), [4])
        XCTAssertEqual(parsed.normalizedText, "| Dm7 G7 | Cmaj7 |")
    }

    func testQuickEntryPreservesExplicitBeatDurations() throws {
        let parsed = try JazzTheory.parseChart("| Dm9:1 G13:3 | Cmaj9:2 A7alt:2 |")
        XCTAssertEqual(parsed.measures[0].chords.map(\.beats), [1, 3])
        XCTAssertEqual(parsed.measures[1].chords.map(\.beats), [2, 2])
        XCTAssertEqual(parsed.normalizedText, "| Dm9:1 G13:3 | Cmaj9 A7alt |")

        let chart = JazzChart(title: "Exact rhythm", measures: parsed.measures)
        XCTAssertEqual(chart.chartText, parsed.normalizedText)
        XCTAssertEqual(try JazzTheory.parseChart(chart.chartText).measures.map { $0.chords.map(\.beats) }, [[1, 3], [2, 2]])
    }

    func testQuickEntryDistributesUnspecifiedRemainderAndRefusesOverfill() throws {
        let parsed = try JazzTheory.parseChart("| Cmaj7:2 Dm7 G7 |")
        XCTAssertEqual(parsed.measures[0].chords.map(\.beats), [2, 1, 1])
        XCTAssertThrowsError(try JazzTheory.parseChart("| Cmaj7:3 Dm7:2 |")) { error in
            XCTAssertEqual(error as? ChartParseIssue, .invalidMeasureDuration(measure: 1))
        }
    }

    func testEveryBundledLibraryChartParsesAndCompilesToSound() throws {
        XCTAssertEqual(JazzLibrary.entries.count, 25)
        for entry in JazzLibrary.entries + [JazzLibrary.starter] {
            let parsed = try JazzTheory.parseChart(entry.chartText)
            let chart = JazzChart(title: entry.title, key: entry.key, tempoBPM: entry.tempo, groove: entry.groove, measures: parsed.measures)
            let events = JazzTheory.compilePlayback(chart)
            XCTAssertEqual(events.count, chart.chordCount, entry.id)
            XCTAssertTrue(events.allSatisfy { !$0.midiPitches.isEmpty }, entry.id)
            XCTAssertTrue(events.flatMap(\.midiPitches).allSatisfy { (21...108).contains($0) }, entry.id)
        }
    }

    func testChordEvidenceSeparatesLiteralAndContextualInformation() throws {
        let chord = try XCTUnwrap(JazzTheory.parseChord("G7b9", in: .c))
        XCTAssertEqual(chord.root, "G")
        XCTAssertEqual(chord.romanNumeral, "V")
        XCTAssertEqual(chord.function, "Dominant pull")
        XCTAssertTrue(chord.toneNames.contains("Ab"))
        XCTAssertFalse(chord.guideToneNames.isEmpty)
    }

    func testTransposeMovesRootAndSlashBassWithoutChangingQuality() {
        XCTAssertEqual(JazzTheory.transpose(symbol: "Cm7/Bb", semitones: 2, preferFlats: true), "Dm7/C")
        XCTAssertEqual(JazzTheory.transpose(symbol: "F#maj7", semitones: 1, preferFlats: false), "Gmaj7")
    }

    func testBoundedParserRefusesOversizedInputAndInvalidSymbol() {
        XCTAssertThrowsError(try JazzTheory.parseChart(String(repeating: "C", count: JazzTheory.maximumChartCharacters + 1)))
        XCTAssertThrowsError(try JazzTheory.parseChart("| Cmaj7 definitely-not-a-chord |"))
    }

    func testParserDoesNotEraseAnEmptyInteriorMeasure() {
        XCTAssertThrowsError(try JazzTheory.parseChart("| Cmaj7 || G7 |")) { error in
            XCTAssertEqual(error as? ChartParseIssue, .emptyMeasure(index: 2))
        }
    }

    func testDocumentValidatorRefusesDuplicateIdentityAndOverfilledTiming() throws {
        let sharedID = UUID()
        var duplicate = JazzChart(
            title: "Duplicate",
            measures: [
                JazzMeasure(chords: [JazzChordEvent(id: sharedID, symbol: "Cmaj7")]),
                JazzMeasure(chords: [JazzChordEvent(id: sharedID, symbol: "G7")])
            ]
        )
        XCTAssertThrowsError(try JazzDocumentValidator.validate(duplicate)) { error in
            XCTAssertEqual(error as? JazzDocumentValidationIssue, .duplicateChordID)
        }
        duplicate.measures[1].chords[0].id = UUID()
        duplicate.measures[0].chords.append(JazzChordEvent(symbol: "Dm7", beats: 4))
        XCTAssertThrowsError(try JazzDocumentValidator.validate(duplicate)) { error in
            XCTAssertEqual(error as? JazzDocumentValidationIssue, .invalidMeasure(1))
        }
    }

    func testMIDIExportHasValidHeaderTrackAndEndMarker() throws {
        let parsed = try JazzTheory.parseChart("| Dm7 G7 | Cmaj7 |")
        let chart = JazzChart(title: "MIDI proof", measures: parsed.measures)
        let data = MIDIFileWriter.makeFile(chart: chart)
        XCTAssertEqual(String(data: data.prefix(4), encoding: .ascii), "MThd")
        XCTAssertEqual(String(data: data.dropFirst(14).prefix(4), encoding: .ascii), "MTrk")
        XCTAssertEqual(Array(data.suffix(4)), [0x00, 0xFF, 0x2F, 0x00])
        let declaredLength = data.dropFirst(18).prefix(4).reduce(0) { ($0 << 8) | Int($1) }
        XCTAssertEqual(declaredLength, data.count - 22)
    }

    func testNativeMIDIExportImportsBackIntoEditableChordEvents() throws {
        let parsed = try JazzTheory.parseChart("| Dm7 G7 | Cmaj7 |")
        let source = JazzChart(title: "Round-trip source", tempoBPM: 105, groove: .straightEighths, measures: parsed.measures)
        let result = try MIDIFileImporter.importChart(data: MIDIFileWriter.makeFile(chart: source), title: "Imported changes")

        XCTAssertEqual(result.chart.title, "Imported changes")
        XCTAssertEqual(result.chart.chartText, "| Dm7 G7 | Cmaj7 |")
        XCTAssertEqual(result.chart.tempoBPM, 105)
        XCTAssertEqual(result.chart.groove, .straightEighths)
        XCTAssertEqual(result.importedChordCount, 3)
        XCTAssertEqual(result.skippedSonorityCount, 0)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(result.chart))
    }

    func testFormatOneRunningStatusVelocityZeroAndConductorMetadataImport() throws {
        let result = try MIDIFileImporter.importChart(data: independentFormatOneMIDI(), title: "Independent fixture")

        XCTAssertEqual(result.sourceTrackCount, 2)
        XCTAssertEqual(result.chart.chartText, "| Cmaj7 |")
        XCTAssertEqual(result.chart.tempoBPM, 120)
        XCTAssertEqual(result.tempoChangeCount, 1)
    }

    func testMIDIImportRefusesHostileTimingAndNoteState() throws {
        var smpte = [UInt8](independentFormatOneMIDI())
        smpte[12] = 0xE7
        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: Data(smpte), title: "SMPTE")) { error in
            XCTAssertEqual(error as? MIDIImportIssue, .smpteDivisionUnsupported)
        }

        var zeroDivision = [UInt8](independentFormatOneMIDI())
        zeroDivision[12] = 0
        zeroDivision[13] = 0
        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: Data(zeroDivision), title: "Zero PPQ")) { error in
            XCTAssertEqual(error as? MIDIImportIssue, .zeroDivision)
        }

        var formatTwo = [UInt8](independentFormatOneMIDI())
        formatTwo[8] = 0
        formatTwo[9] = 2
        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: Data(formatTwo), title: "Format two")) { error in
            XCTAssertEqual(error as? MIDIImportIssue, .unsupportedFormat(2))
        }

        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: independentFormatOneMIDI(meterNumerator: 3), title: "Three four")) { error in
            XCTAssertEqual(error as? MIDIImportIssue, .unsupportedMeter(numerator: 3, denominator: 4))
        }

        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: unmatchedNoteOffMIDI(), title: "Broken notes")) { error in
            XCTAssertEqual(error as? MIDIImportIssue, .unmatchedNoteOff(track: 0, channel: 0, note: 60))
        }
    }

    func testMIDIImportRefusesTruncationLimitsAndUnnameableOnlyMaterial() throws {
        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: Data([0x4D]), title: "Truncated"))
        XCTAssertThrowsError(
            try MIDIFileImporter.importChart(
                data: Data(repeating: 0, count: MIDIFileImporter.maximumFileBytes + 1),
                title: "Oversized"
            )
        ) { error in
            guard case let MIDIImportIssue.limitExceeded(message) = error else {
                return XCTFail("Expected a resource refusal, got \(error)")
            }
            XCTAssertTrue(message.contains("2 MB"))
        }
        XCTAssertThrowsError(try MIDIFileImporter.importChart(data: singleNoteMIDI(), title: "No chord")) { error in
            XCTAssertEqual(error as? MIDIImportIssue, .noNamedChords)
        }
    }

    func testMIDIImportMusicalResultIsDeterministicAcrossReplays() throws {
        let bytes = independentFormatOneMIDI()
        let first = try MIDIFileImporter.importChart(data: bytes, title: "Replay")
        let second = try MIDIFileImporter.importChart(data: bytes, title: "Replay")

        XCTAssertEqual(first.chart.chartText, second.chart.chartText)
        XCTAssertEqual(first.chart.tempoBPM, second.chart.tempoBPM)
        XCTAssertEqual(first.importedChordCount, second.importedChordCount)
        XCTAssertEqual(first.skippedSonorityCount, second.skippedSonorityCount)
        XCTAssertEqual(first.omittedSourceMeasureCount, second.omittedSourceMeasureCount)
    }

    func testMIDIImportToleratesBoundedUnconsumedMetadata() throws {
        var bytes = [UInt8](independentFormatOneMIDI())
        let secondTrackLengthOffset = 45
        let secondTrackDataOffset = 49
        bytes[secondTrackLengthOffset + 3] += 7
        bytes.insert(contentsOf: [0x00, 0xFF, 0x09, 0x03, 0x44, 0x65, 0x76], at: secondTrackDataOffset)

        let result = try MIDIFileImporter.importChart(data: Data(bytes), title: "Device metadata")
        XCTAssertEqual(result.chart.chartText, "| Cmaj7 |")
    }

    @MainActor
    func testStoreMIDIImportIsOneUndoableDocumentReplacement() async throws {
        let store = JazzStudioStore()
        store.newChart()
        let beforeImport = store.chart
        let source = JazzChart(
            title: "Store source",
            tempoBPM: 120,
            groove: .straightEighths,
            measures: try JazzTheory.parseChart("| Fmaj7 Gm7 | C7 | ").measures
        )
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("frankenjazz-midi-import-\(UUID().uuidString)")
            .appendingPathExtension("mid")
        try MIDIFileWriter.makeFile(chart: source).write(to: url, options: .atomic)

        await store.importFile(url)
        XCTAssertEqual(store.chart.chartText, "| Fmaj7 Gm7 | C7 |")
        XCTAssertTrue(store.notice?.contains("editable chords from MIDI") == true)
        store.undo()
        XCTAssertEqual(store.chart, beforeImport)
    }

    @MainActor
    func testRefusedStoreMIDIImportPreservesDocumentAndUndoState() async throws {
        let store = JazzStudioStore()
        store.newChart()
        let chartBeforeImport = store.chart
        let canUndoBeforeImport = store.canUndo
        let canRedoBeforeImport = store.canRedo
        let revisionBeforeImport = store.revision
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("frankenjazz-refused-midi-import-\(UUID().uuidString)")
            .appendingPathExtension("mid")
        try Data([0x4D]).write(to: url, options: .atomic)

        await store.importFile(url)

        XCTAssertEqual(store.chart, chartBeforeImport)
        XCTAssertEqual(store.canUndo, canUndoBeforeImport)
        XCTAssertEqual(store.canRedo, canRedoBeforeImport)
        XCTAssertEqual(store.revision, revisionBeforeImport)
        XCTAssertTrue(store.notice?.hasPrefix("Import refused:") == true)
    }

    func testNativeDocumentRoundTripsEverySetting() throws {
        let parsed = try JazzTheory.parseChart("| Bbmaj9 | Eb13 |")
        var chart = JazzChart(title: "Round trip", key: .bb, tempoBPM: 87, groove: .ballad, instrument: .vibraphone, voicingFamily: .open, measures: parsed.measures)
        chart.updatedAt = Date(timeIntervalSince1970: 1_788_130_000)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(JazzChart.self, from: encoder.encode(chart))
        XCTAssertEqual(decoded, chart)
    }

    /// Hand-assembled independently from the production writer: format 1,
    /// conductor tempo/meter, and a voicing track whose later note-on and all
    /// velocity-zero note-offs use running status.
    private func independentFormatOneMIDI(meterNumerator: UInt8 = 4) -> Data {
        Data([
            0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
            0x00, 0x01, 0x00, 0x02, 0x01, 0xE0,
            0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x13,
            0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,
            0x00, 0xFF, 0x58, 0x04, meterNumerator, 0x02, 0x18, 0x08,
            0x00, 0xFF, 0x2F, 0x00,
            0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x1E,
            0x00, 0x90, 0x3C, 0x60,
            0x00, 0x40, 0x60,
            0x00, 0x43, 0x60,
            0x00, 0x47, 0x60,
            0x87, 0x40, 0x3C, 0x00,
            0x00, 0x40, 0x00,
            0x00, 0x43, 0x00,
            0x00, 0x47, 0x00,
            0x00, 0xFF, 0x2F, 0x00
        ])
    }

    private func unmatchedNoteOffMIDI() -> Data {
        Data([
            0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, 0x00, 0x01, 0x01, 0xE0,
            0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x08,
            0x00, 0x80, 0x3C, 0x00,
            0x00, 0xFF, 0x2F, 0x00
        ])
    }

    private func singleNoteMIDI() -> Data {
        Data([
            0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, 0x00, 0x01, 0x01, 0xE0,
            0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x0D,
            0x00, 0x90, 0x3C, 0x60,
            0x83, 0x60, 0x80, 0x3C, 0x00,
            0x00, 0xFF, 0x2F, 0x00
        ])
    }
}

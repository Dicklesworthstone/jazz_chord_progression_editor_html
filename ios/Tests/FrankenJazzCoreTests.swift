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
}

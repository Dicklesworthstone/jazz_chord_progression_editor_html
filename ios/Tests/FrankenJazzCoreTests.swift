import XCTest
import UIKit
@testable import FrankenJazz

final class FrankenJazzCoreTests: XCTestCase {
    func testEditorSurfaceAdaptsAndMaintainsReadableContrast() throws {
        let darkTraits = UITraitCollection(userInterfaceStyle: .dark)
        let lightTraits = UITraitCollection(userInterfaceStyle: .light)
        let surface = UIColor(JazzTheme.editorSurface)
        let text = UIColor(JazzTheme.text)

        let darkSurface = try rgba(surface.resolvedColor(with: darkTraits))
        let lightSurface = try rgba(surface.resolvedColor(with: lightTraits))
        let darkText = try rgba(text.resolvedColor(with: darkTraits))
        let lightText = try rgba(text.resolvedColor(with: lightTraits))

        XCTAssertLessThan(relativeLuminance(darkSurface), 0.01)
        XCTAssertGreaterThan(relativeLuminance(lightSurface), 0.70)
        XCTAssertGreaterThan(contrastRatio(darkText, darkSurface), 7)
        XCTAssertGreaterThan(contrastRatio(lightText, lightSurface), 7)
        XCTAssertNotEqual(darkSurface, lightSurface)
    }

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

    func testExplicitDurationFormatterAlwaysRoundTripsAcceptedChart() throws {
        let measures = [JazzMeasure(chords: [
            JazzChordEvent(symbol: "Cmaj7", beats: 0.123456789012345),
            JazzChordEvent(symbol: "Dm7", beats: 1.111111111111111),
            JazzChordEvent(symbol: "G7", beats: 2.765432099876544)
        ])]
        XCTAssertNoThrow(try JazzDocumentValidator.validate(JazzChart(title: "Precision", measures: measures)))
        let formatted = JazzTheory.formatChartText(measures)
        let reparsed = try JazzTheory.parseChart(formatted)
        XCTAssertEqual(reparsed.measures[0].chords.map(\.beats), measures[0].chords.map(\.beats))
    }

    func testAddedNinthIsNotParsedAsDominantNinth() throws {
        let chord = try XCTUnwrap(JazzTheory.parseChord("Cadd9", in: .c))
        XCTAssertEqual(Set(chord.pitchClasses), Set([0, 2, 4, 7]))
        XCTAssertFalse(chord.pitchClasses.contains(10))
        XCTAssertEqual(chord.colorNote, "Added ninth without a seventh")
    }

    func testQuickEntryDistributesUnspecifiedRemainderAndRefusesOverfill() throws {
        let parsed = try JazzTheory.parseChart("| Cmaj7:2 Dm7 G7 |")
        XCTAssertEqual(parsed.measures[0].chords.map(\.beats), [2, 1, 1])
        XCTAssertThrowsError(try JazzTheory.parseChart("| Cmaj7:3 Dm7:2 |")) { error in
            XCTAssertEqual(error as? ChartParseIssue, .invalidMeasureDuration(measure: 1))
        }
    }

    func testEveryBundledLibraryChartParsesAndCompilesToSound() throws {
        let canonicalWebEntryIDs: Set<String> = [
            "tristan", "commendatore", "lament-bass", "pachelbel", "gymnopedie", "ragtime", "chopin-chromatic",
            "two-five-one", "one-six-two-five", "minor-two-five-one", "jazz-blues-f", "dorian-vamp",
            "major-third-cycle", "rhythm-turnaround", "bird-blues", "minor-blues", "tritone-chain",
            "modal-planing", "chromatic-mediants", "mu-major-study", "lush-ballad-study", "gospel-blues-study",
            "whole-tone-study", "what-a-fool-believes", "giant-steps", "peg", "hello-its-me"
        ]
        XCTAssertEqual(JazzLibrary.entries.count, 29)
        XCTAssertEqual(Set(JazzLibrary.entries.map(\.id)).count, JazzLibrary.entries.count)
        XCTAssertTrue(canonicalWebEntryIDs.isSubset(of: Set(JazzLibrary.entries.map(\.id))))
        XCTAssertEqual(canonicalWebEntryIDs.count, 27)
        XCTAssertEqual(
            Set(JazzLibrary.entries.filter { $0.provenance == .ownerDirected }.map(\.id)),
            ["what-a-fool-believes", "giant-steps", "peg", "hello-its-me"]
        )
        for entry in JazzLibrary.entries + [JazzLibrary.starter] {
            let parsed = try JazzTheory.parseChart(entry.chartText)
            let chart = JazzChart(title: entry.title, key: entry.key, tempoBPM: entry.tempo ?? 132, groove: entry.groove, measures: parsed.measures)
            let events = JazzTheory.compilePlayback(chart)
            XCTAssertEqual(events.count, chart.chordCount, entry.id)
            XCTAssertTrue(events.allSatisfy { !$0.midiPitches.isEmpty }, entry.id)
            XCTAssertTrue(events.flatMap(\.midiPitches).allSatisfy { (21...108).contains($0) }, entry.id)
            XCTAssertTrue(events.allSatisfy(\.permitsBassReinforcement), entry.id)
        }
    }

    func testSixNineQualityIsNotMisreadAsSlashBass() throws {
        let chord = try XCTUnwrap(JazzTheory.parseChord("F6/9", in: .f))
        XCTAssertNil(chord.bass)
        XCTAssertEqual(Set(chord.pitchClasses), Set([0, 2, 5, 7, 9]))
        XCTAssertEqual(chord.colorNote, "Extended upper color")
        XCTAssertNotNil(JazzTheory.parseChord("A/B", in: .e)?.bass)
        XCTAssertEqual(JazzTheory.transpose(symbol: "F6/9", semitones: 2, preferFlats: false), "G6/9")
    }

    func testExtensionsRetainOctaveAwareIntervalsAndSoundTheirLiteralTones() throws {
        let sharpEleven = try XCTUnwrap(JazzTheory.parseChord("Fmaj7#11", in: .f))
        XCTAssertEqual(sharpEleven.intervals, [0, 4, 7, 11, 18])
        XCTAssertEqual(sharpEleven.toneNames, ["F", "A", "C", "E", "B"])
        XCTAssertEqual(sharpEleven.colorNote, "Extended upper color")
        XCTAssertEqual(
            Set(JazzTheory.voicing(for: sharpEleven, family: .balanced).map { $0 % 12 }),
            Set(sharpEleven.pitchClasses)
        )

        let altered = try XCTUnwrap(JazzTheory.parseChord("A7alt", in: .c))
        XCTAssertEqual(altered.intervals, [0, 4, 10, 13, 15, 20])
        XCTAssertEqual(altered.colorNote, "Altered dominant tension")
        XCTAssertEqual(
            Set(JazzTheory.voicing(for: altered, family: .balanced).map { $0 % 12 }),
            Set(altered.pitchClasses)
        )
    }

    func testUnsupportedSuffixRefusesWithTheNamedFragment() {
        XCTAssertNil(JazzTheory.parseChord("Cmaj7banana", in: .c))
        XCTAssertThrowsError(try JazzTheory.parseChart("| Cmaj7banana |")) { error in
            XCTAssertEqual(
                error as? ChartParseIssue,
                .unsupportedChordSuffix(fragment: "maj7banana", symbol: "Cmaj7banana", measure: 1)
            )
        }
    }

    func testEveryLibraryLiteralToneReachesBalancedPlaybackAndMIDIExport() throws {
        for entry in JazzLibrary.entries + [JazzLibrary.starter] {
            let parsed = try JazzTheory.parseChart(entry.chartText)
            let chart = JazzChart(
                title: entry.title,
                key: entry.key,
                tempoBPM: entry.tempo ?? 132,
                groove: entry.groove,
                voicingFamily: .balanced,
                measures: parsed.measures
            )
            let chords = chart.measures.flatMap(\.chords)
            let events = JazzTheory.compilePlayback(chart)
            XCTAssertEqual(events.count, chords.count, entry.id)
            for (chord, event) in zip(chords, events) {
                let description = try XCTUnwrap(JazzTheory.parseChord(chord.symbol, in: chart.key))
                var expected = Set(description.pitchClasses)
                if let bass = description.bass, let bassPitch = JazzTheory.pitchClass(for: bass) {
                    expected.insert(bassPitch)
                }
                XCTAssertEqual(Set(event.midiPitches.map { $0 % 12 }), expected, "\(entry.id):\(chord.symbol)")
            }
            XCTAssertEqual(
                Set(noteOnPitches(in: MIDIFileWriter.makeFile(chart: chart))),
                Set(events.flatMap(\.midiPitches)),
                entry.id
            )
        }
    }

    func testNewCanonicalGroovesProduceDistinctAudibleRenders() throws {
        let measures = try JazzTheory.parseChart("| Cmaj9 | Cmaj9 |").measures
        let medium = try XCTUnwrap(JazzAudioRenderer.render(chart: JazzChart(title: "Medium", tempoBPM: 132, groove: .mediumSwing, measures: measures)))
        let uptempo = try XCTUnwrap(JazzAudioRenderer.render(chart: JazzChart(title: "Fast", tempoBPM: 132, groove: .uptempoSwing, measures: measures)))
        let straight = try XCTUnwrap(JazzAudioRenderer.render(chart: JazzChart(title: "Straight", tempoBPM: 132, groove: .straightEighths, measures: measures)))
        let syncopated = try XCTUnwrap(JazzAudioRenderer.render(chart: JazzChart(title: "Syncopated", tempoBPM: 132, groove: .syncopatedSixteenths, measures: measures)))

        let swingDifference = zip(medium.left, uptempo.left).reduce(0.0) { $0 + Double(abs($1.0 - $1.1)) }
        let sixteenthDifference = zip(straight.left, syncopated.left).reduce(0.0) { $0 + Double(abs($1.0 - $1.1)) }
        XCTAssertGreaterThan(swingDifference, 1)
        XCTAssertGreaterThan(sixteenthDifference, 1)
    }

    @MainActor
    func testLibraryLoadAppliesCanonicalMetadataAndPreservesUnspecifiedTempo() throws {
        let store = JazzStudioStore()
        store.updateTempo(207)
        let device = try XCTUnwrap(JazzLibrary.entries.first { $0.id == "major-third-cycle" })
        XCTAssertNil(device.tempo)
        store.replaceChart(with: device)
        XCTAssertEqual(store.chart.title, device.title)
        XCTAssertEqual(store.chart.tempoBPM, 207)
        XCTAssertEqual(store.chart.groove, .mediumSwing)

        let transcription = try XCTUnwrap(JazzLibrary.entries.first { $0.id == "giant-steps" })
        store.replaceChart(with: transcription)
        XCTAssertEqual(store.chart.tempoBPM, 290)
        XCTAssertEqual(store.chart.groove, .uptempoSwing)
        XCTAssertEqual(store.chart.barCount, 16)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(store.chart))
    }

    func testChordEvidenceSeparatesLiteralAndContextualInformation() throws {
        let chord = try XCTUnwrap(JazzTheory.parseChord("G7b9", in: .c))
        XCTAssertEqual(chord.root, "G")
        XCTAssertEqual(chord.romanNumeral, "V")
        XCTAssertEqual(chord.function, "Dominant pull")
        XCTAssertTrue(chord.toneNames.contains("Ab"))
        XCTAssertFalse(chord.guideToneNames.isEmpty)
    }

    func testFunctionLabelsUseQualityAndKeyContextInsteadOfSevenSubstring() throws {
        XCTAssertEqual(JazzTheory.parseChord("E7", in: .c)?.function, "Secondary dominant")
        XCTAssertEqual(JazzTheory.parseChord("Ebmaj7", in: .c)?.function, "Chromatic color")
        XCTAssertEqual(JazzTheory.parseChord("G7", in: .c)?.function, "Dominant pull")
        XCTAssertEqual(JazzTheory.parseChord("Bdim7", in: .c)?.function, "Leading-tone pull")
        XCTAssertEqual(JazzTheory.parseChord("Am7", in: .c)?.function, "Tonic family")
    }

    func testSlashBassIsTheAudibleLowestPlaybackPitch() throws {
        let slash = try XCTUnwrap(JazzTheory.parseChord("Cmaj7/E", in: .c))
        for family in VoicingFamily.allCases {
            let pitches = JazzTheory.voicing(for: slash, family: family)
            XCTAssertEqual(try XCTUnwrap(pitches.first) % 12, 4, family.rawValue)
        }
    }

    func testSpreadIsDistinctAndWiderThanOpen() throws {
        let chord = try XCTUnwrap(JazzTheory.parseChord("Cmaj9", in: .c))
        let open = JazzTheory.voicing(for: chord, family: .open)
        let spread = JazzTheory.voicing(for: chord, family: .spread)
        XCTAssertNotEqual(open, spread)
        XCTAssertGreaterThan(try XCTUnwrap(spread.last) - XCTUnwrap(spread.first), try XCTUnwrap(open.last) - XCTUnwrap(open.first))
    }

    func testTransitionMotionNamesDestinationCommonToneAndNearestMove() throws {
        let source = try XCTUnwrap(JazzTheory.parseChord("Dm7", in: .c))
        let destination = try XCTUnwrap(JazzTheory.parseChord("G7", in: .c))
        let summary = JazzTheory.transitionMotion(from: source, to: destination, flats: false)
        XCTAssertTrue(summary.hasPrefix("To G7:"))
        XCTAssertTrue(summary.contains("common tones D, F"))
        XCTAssertTrue(summary.contains("1 semitone"))
    }

    @MainActor
    func testDirectDuplicateAndDeletePreserveExactBarTimeAndUndo() throws {
        let store = JazzStudioStore()
        store.newChart()
        store.setDraft("| Cmaj7 G7 |")
        store.applyDraftNow()
        let original = try XCTUnwrap(store.chart.measures.first?.chords.first)
        store.select(original)
        store.updateSelectedChordAnnotation("Keep the top voice")

        store.duplicateSelectedChord()

        XCTAssertEqual(store.chart.measures[0].chords.map(\.symbol), ["Cmaj7", "Cmaj7", "G7"])
        XCTAssertEqual(store.chart.measures[0].chords.map(\.beats), [1, 1, 2])
        XCTAssertEqual(store.selectedChord?.annotation, "Keep the top voice")
        XCTAssertEqual(Set(store.chart.measures[0].chords.map(\.id)).count, 3)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(store.chart))

        store.deleteSelectedChord()
        XCTAssertEqual(store.chart.measures[0].chords.map(\.symbol), ["Cmaj7", "G7"])
        XCTAssertEqual(store.chart.measures[0].chords.map(\.beats), [1, 3])
        XCTAssertEqual(store.selectedChord?.symbol, "G7")
        XCTAssertNoThrow(try JazzDocumentValidator.validate(store.chart))

        store.undo()
        XCTAssertEqual(store.chart.measures[0].chords.map(\.symbol), ["Cmaj7", "Cmaj7", "G7"])
    }

    @MainActor
    func testDirectMoveAndBarManagementAreBoundedUndoableOperations() throws {
        let store = JazzStudioStore()
        store.newChart()
        store.setDraft("| Cmaj7 G7 |")
        store.applyDraftNow()
        let dominant = try XCTUnwrap(store.chart.measures[0].chords.last)
        store.select(dominant)

        store.moveSelectedChord(by: -1)
        XCTAssertEqual(store.chart.measures[0].chords.map(\.symbol), ["G7", "Cmaj7"])
        store.moveSelectedChord(by: 1)
        XCTAssertEqual(store.chart.measures[0].chords.map(\.symbol), ["Cmaj7", "G7"])

        let originalMeasureID = try XCTUnwrap(store.selectedMeasureID)
        store.insertMeasure(after: originalMeasureID)
        XCTAssertEqual(store.chart.measures.count, 2)
        XCTAssertEqual(store.selectedChord?.symbol, "Cmaj7")
        let insertedMeasureID = try XCTUnwrap(store.selectedMeasureID)
        store.deleteMeasure(insertedMeasureID)
        XCTAssertEqual(store.chart.measures.count, 1)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(store.chart))

        store.deleteMeasure(originalMeasureID)
        XCTAssertEqual(store.chart.measures.count, 1)
        XCTAssertEqual(store.notice, "A chart needs at least one bar.")
        store.undo()
        XCTAssertEqual(store.chart.measures.count, 2)
    }

    @MainActor
    func testDirectEditingRefusesInvalidBoundaryOperationsWithoutHistory() throws {
        let store = JazzStudioStore()
        store.newChart()
        let onlyChord = try XCTUnwrap(store.selectedChord)
        store.select(onlyChord)
        let before = store.chart
        let canUndoBefore = store.canUndo

        store.deleteSelectedChord()
        XCTAssertEqual(store.chart, before)
        XCTAssertEqual(store.canUndo, canUndoBefore)
        XCTAssertEqual(store.notice, "A bar needs at least one change. Delete the bar instead.")

        store.moveSelectedChord(by: -1)
        XCTAssertEqual(store.chart, before)
        XCTAssertEqual(store.notice, "This change is already first in its bar.")
    }

    @MainActor
    func testDirectDuplicateRefusesSubnormalDurationUnderflow() throws {
        let store = JazzStudioStore()
        store.newChart()
        store.setDraft("| Cmaj7:5e-324 G7:4 |")
        store.applyDraftNow()
        let tiny = try XCTUnwrap(store.chart.measures.first?.chords.first)
        store.select(tiny)
        let before = store.chart
        let canUndoBefore = store.canUndo

        store.duplicateSelectedChord()

        XCTAssertEqual(store.chart, before)
        XCTAssertEqual(store.canUndo, canUndoBefore)
        XCTAssertEqual(store.notice, "This change's beat slot is too small to split safely.")
    }

    @MainActor
    func testSaveCopyProducesACompleteNativeDocument() throws {
        let store = JazzStudioStore()
        store.newChart()
        store.requestSaveCopy()

        XCTAssertTrue(store.isSaveCopyPresented)
        let data = try XCTUnwrap(store.saveCopyDocument?.data)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(JazzChart.self, from: data)
        XCTAssertEqual(decoded.id, store.chart.id)
        XCTAssertEqual(decoded.title, store.chart.title)
        XCTAssertEqual(decoded.key, store.chart.key)
        XCTAssertEqual(decoded.tempoBPM, store.chart.tempoBPM)
        XCTAssertEqual(decoded.groove, store.chart.groove)
        XCTAssertEqual(decoded.instrument, store.chart.instrument)
        XCTAssertEqual(decoded.voicingFamily, store.chart.voicingFamily)
        XCTAssertEqual(decoded.measures, store.chart.measures)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(decoded))
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
        let sourcePitches = JazzTheory.compilePlayback(source).map(\.midiPitches)
        let importedPitches = result.chart.measures.flatMap(\.chords).compactMap(\.manualMIDIPitches)

        XCTAssertEqual(result.chart.title, "Imported changes")
        XCTAssertEqual(result.chart.chartText, "| Dm7 G7 | Cmaj7 |")
        XCTAssertEqual(result.chart.tempoBPM, 105)
        XCTAssertEqual(result.chart.groove, .straightEighths)
        XCTAssertEqual(result.importedChordCount, 3)
        XCTAssertEqual(result.skippedSonorityCount, 0)
        XCTAssertEqual(importedPitches, sourcePitches)
        XCTAssertEqual(JazzTheory.compilePlayback(result.chart).map(\.midiPitches), sourcePitches)
        XCTAssertEqual(
            noteOnPitches(in: MIDIFileWriter.makeFile(chart: result.chart)),
            sourcePitches.flatMap { $0 }
        )
        XCTAssertTrue(result.notice.contains("exact Manual voicings"))
        XCTAssertNoThrow(try JazzDocumentValidator.validate(result.chart))
    }

    func testFormatOneRunningStatusVelocityZeroAndConductorMetadataImport() throws {
        let result = try MIDIFileImporter.importChart(data: independentFormatOneMIDI(), title: "Independent fixture")

        XCTAssertEqual(result.sourceTrackCount, 2)
        XCTAssertEqual(result.chart.chartText, "| Cmaj7 |")
        XCTAssertEqual(result.chart.tempoBPM, 120)
        XCTAssertEqual(result.tempoChangeCount, 1)
        XCTAssertEqual(result.chart.measures[0].chords[0].manualMIDIPitches, [60, 64, 67, 71])
    }

    func testMIDIImportPreservesExactOctavesAndDoublingsAsManual() throws {
        let exact = [48, 60, 64, 67, 71]
        let result = try MIDIFileImporter.importChart(data: singleChordMIDI(pitches: exact), title: "Exact stack")
        let chord = try XCTUnwrap(result.chart.measures.first?.chords.first)

        XCTAssertEqual(chord.symbol, "Cmaj7")
        XCTAssertEqual(chord.manualMIDIPitches, exact)
        XCTAssertNil(chord.frozenMIDIPitches)
        XCTAssertEqual(JazzTheory.compilePlayback(result.chart).first?.midiPitches, exact)
        XCTAssertEqual(noteOnPitches(in: MIDIFileWriter.makeFile(chart: result.chart)), exact)
    }

    func testMIDIImportRefusesNamedExactStacksOutsideManualBounds() {
        let outOfRange = [12, 28, 31, 35]
        XCTAssertThrowsError(try MIDIFileImporter.importChart(
            data: singleChordMIDI(pitches: outOfRange),
            title: "Out of range"
        )) { error in
            XCTAssertEqual(
                error as? MIDIImportIssue,
                .exactVoicingPitchRange(pitch: 12, low: 21, high: 108)
            )
        }

        let tooMany = [24, 28, 31, 35, 36, 40, 43, 47, 48, 52, 55, 59, 60, 64, 67, 71, 72]
        XCTAssertThrowsError(try MIDIFileImporter.importChart(
            data: singleChordMIDI(pitches: tooMany),
            title: "Too many voices"
        )) { error in
            XCTAssertEqual(
                error as? MIDIImportIssue,
                .exactVoicingVoiceLimit(count: 17, limit: 16)
            )
        }
    }

    func testMIDIImportRefusesHostileTimingAndStructure() throws {
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

    }

    func testMIDIImportSalvagesConventionalDAWNoteStateQuirksWithLedger() throws {
        let result = try MIDIFileImporter.importChart(data: dawQuirkMIDI(), title: "DAW salvage")

        XCTAssertEqual(result.chart.chartText, "| Cmaj7 |")
        XCTAssertEqual(result.salvage.retriggeredNotes, 1)
        XCTAssertEqual(result.salvage.ignoredNoteOffs, 1)
        XCTAssertEqual(result.salvage.notesClosedAtTrackEnd, 1)
        XCTAssertEqual(result.salvage.synthesizedEndOfTracks, 1)
        XCTAssertEqual(result.chart.measures[0].chords[0].manualMIDIPitches, [60, 64, 67, 71])
        XCTAssertTrue(result.notice.contains("MIDI repair ledger"))
        XCTAssertTrue(result.notice.contains("1 unmatched note-off ignored"))
    }

    @MainActor
    func testStoreSurfacesMIDISalvageLedgerAfterUndoableImport() async throws {
        let store = JazzStudioStore()
        store.newChart()
        let before = store.chart
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("frankenjazz-daw-salvage-\(UUID().uuidString)")
            .appendingPathExtension("mid")
        try dawQuirkMIDI().write(to: url, options: .atomic)

        await store.importFile(url)

        XCTAssertEqual(store.chart.chartText, "| Cmaj7 |")
        XCTAssertTrue(store.notice?.contains("MIDI repair ledger") == true)
        store.undo()
        XCTAssertEqual(store.chart, before)
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
        XCTAssertEqual(
            first.chart.measures.flatMap(\.chords).map(\.manualMIDIPitches),
            second.chart.measures.flatMap(\.chords).map(\.manualMIDIPitches)
        )
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
        XCTAssertTrue(store.chart.measures.flatMap(\.chords).allSatisfy { $0.manualMIDIPitches != nil })
        XCTAssertEqual(store.selectedVoicingMode, .manual)
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

    @MainActor
    func testSelectedChordAnnotationIsBoundedCoalescedAndSurvivesQuickEntry() throws {
        let store = JazzStudioStore()
        store.newChart()
        let selectedID = try XCTUnwrap(store.selectedChordID)

        store.updateSelectedChordAnnotation("Remember the common tone")
        store.updateSelectedChordAnnotation(String(repeating: "x", count: 540))
        XCTAssertEqual(store.selectedChord?.annotation.count, 500)

        store.undo()
        XCTAssertEqual(store.selectedChord?.id, selectedID)
        XCTAssertEqual(store.selectedChord?.annotation, "")
        store.redo()
        XCTAssertEqual(store.selectedChord?.annotation.count, 500)

        store.updateSelectedChordAnnotation("Keep this top note")
        let unchangedSource = store.chart.chartText
        store.setDraft(unchangedSource)
        store.applyDraftNow()
        XCTAssertEqual(store.selectedChord?.annotation, "Keep this top note")

        let data = try JSONEncoder().encode(store.chart)
        let decoded = try JSONDecoder().decode(JazzChart.self, from: data)
        XCTAssertEqual(decoded.measures.first?.chords.first?.annotation, "Keep this top note")
    }

    @MainActor
    func testDirectSymbolEditPreservesEventDataRecoveryAndOneStepHistory() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSymbolEditTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)
        let event = JazzChordEvent(symbol: "Cmaj7", annotation: "Keep the top voice")
        recovery.save(JazzChart(title: "Direct edit", measures: [JazzMeasure(chords: [event])]))
        let store = JazzStudioStore(recovery: recovery)
        let revision = store.revision

        XCTAssertNil(store.updateSelectedChordSymbol(" Dm7 ", keepExactPitches: false))
        XCTAssertEqual(store.selectedChord?.id, event.id)
        XCTAssertEqual(store.selectedChord?.symbol, "Dm7")
        XCTAssertEqual(store.selectedChord?.beats, 4)
        XCTAssertEqual(store.selectedChord?.annotation, "Keep the top voice")
        XCTAssertEqual(store.draftText, "| Dm7 |")
        XCTAssertEqual(store.revision, revision + 1)
        XCTAssertTrue(store.canUndo)
        XCTAssertEqual(try XCTUnwrap(recovery.load()).measures[0].chords[0].symbol, "Dm7")

        store.undo()
        XCTAssertEqual(store.selectedChord?.id, event.id)
        XCTAssertEqual(store.selectedChord?.symbol, "Cmaj7")
        store.redo()
        XCTAssertEqual(store.selectedChord?.symbol, "Dm7")
    }

    @MainActor
    func testDirectSymbolEditRefusesInvalidOrMultipleChangesWithoutHistory() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSymbolRefusalTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(JazzChart(title: "Refusal", measures: [JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])]))
        let store = JazzStudioStore(recovery: recovery)
        let before = store.chart
        let revision = store.revision

        XCTAssertEqual(
            store.updateSelectedChordSymbol("Cmaj7 G7", keepExactPitches: false),
            "Enter exactly one chord symbol, without a bar line or a second change."
        )
        XCTAssertEqual(store.chart, before)
        XCTAssertEqual(store.revision, revision)
        XCTAssertFalse(store.canUndo)

        XCTAssertNotNil(store.updateSelectedChordSymbol("Cmaj7banana", keepExactPitches: false))
        XCTAssertEqual(store.chart, before)
        XCTAssertEqual(store.revision, revision)
        XCTAssertFalse(store.canUndo)
        XCTAssertTrue(store.notice?.hasPrefix("Change refused:") == true)
    }

    @MainActor
    func testDirectSymbolEditClearsStoredVoicingByDefaultOrKeepsItAsManualExplicitly() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSymbolVoicingTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)
        let frozen = [48, 52, 55, 59]
        recovery.save(JazzChart(title: "Stored", measures: [JazzMeasure(chords: [
            JazzChordEvent(symbol: "Cmaj7", frozenMIDIPitches: frozen)
        ])]))
        let store = JazzStudioStore(recovery: recovery)

        XCTAssertNil(store.updateSelectedChordSymbol("D7", keepExactPitches: true))
        XCTAssertEqual(store.selectedChord?.symbol, "D7")
        XCTAssertNil(store.selectedChord?.frozenMIDIPitches)
        XCTAssertEqual(store.selectedChord?.manualMIDIPitches, frozen)
        XCTAssertEqual(store.selectedVoicingMode, .manual)
        XCTAssertTrue(store.notice?.contains("kept 4 exact pitches as Manual") == true)

        store.undo()
        XCTAssertEqual(store.selectedChord?.symbol, "Cmaj7")
        XCTAssertEqual(store.selectedVoicingMode, .frozen)
        XCTAssertNil(store.updateSelectedChordSymbol("Ebmaj7", keepExactPitches: false))
        XCTAssertEqual(store.selectedVoicingMode, .automatic)
        XCTAssertNil(store.selectedChord?.frozenMIDIPitches)
        XCTAssertNil(store.selectedChord?.manualMIDIPitches)
        XCTAssertTrue(store.notice?.contains("returned the change to Automatic voicing") == true)
    }

    func testNativeDocumentRoundTripsEverySetting() throws {
        let parsed = try JazzTheory.parseChart("| Bbmaj9 | Eb13 |")
        var chart = JazzChart(title: "Round trip", key: .bb, tempoBPM: 87, groove: .ballad, instrument: .vibraphone, voicingFamily: .open, measures: parsed.measures)
        chart.measures[0].chords[0].frozenMIDIPitches = [46, 53, 57, 60, 64]
        chart.updatedAt = Date(timeIntervalSince1970: 1_788_130_000)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(JazzChart.self, from: encoder.encode(chart))
        XCTAssertEqual(decoded, chart)
    }

    func testLegacyDocumentWithoutFrozenVoicingStillDecodesAsAutomatic() throws {
        let legacy = """
        {
          "schema": "frankenjazz.chart.v1",
          "id": "00000000-0000-0000-0000-000000000001",
          "title": "Legacy automatic",
          "key": "C",
          "tempoBPM": 120,
          "groove": "Medium swing",
          "instrument": "Electric piano",
          "voicingFamily": "Balanced",
          "measures": [{
            "id": "00000000-0000-0000-0000-000000000002",
            "chords": [{
              "id": "00000000-0000-0000-0000-000000000003",
              "symbol": "Cmaj7",
              "beats": 4,
              "annotation": ""
            }]
          }],
          "updatedAt": "2026-09-02T12:00:00Z"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let chart = try decoder.decode(JazzChart.self, from: Data(legacy.utf8))
        XCTAssertNil(chart.measures[0].chords[0].frozenMIDIPitches)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(chart))
    }

    func testDocumentValidatorRefusesMalformedFrozenVoicings() {
        let invalidRealizations = [
            [],
            [60, 59],
            [60, 60],
            [20, 60],
            [60, 109],
            Array(40...56)
        ]

        for pitches in invalidRealizations {
            let chart = JazzChart(
                title: "Invalid frozen voicing",
                measures: [JazzMeasure(chords: [
                    JazzChordEvent(symbol: "Cmaj7", frozenMIDIPitches: pitches)
                ])]
            )
            XCTAssertThrowsError(try JazzDocumentValidator.validate(chart), "Accepted \(pitches)") { error in
                XCTAssertEqual(error as? JazzDocumentValidationIssue, .invalidChord(1))
            }
        }

        let malformedManual = [[], [20], [109], Array(40...56)]
        for pitches in malformedManual {
            let chart = JazzChart(
                title: "Invalid manual voicing",
                measures: [JazzMeasure(chords: [
                    JazzChordEvent(symbol: "Cmaj7", manualMIDIPitches: pitches)
                ])]
            )
            XCTAssertThrowsError(try JazzDocumentValidator.validate(chart), "Accepted manual \(pitches)")
        }

        let dualMode = JazzChart(
            title: "Two stored modes",
            measures: [JazzMeasure(chords: [
                JazzChordEvent(
                    symbol: "Cmaj7",
                    frozenMIDIPitches: [48, 52, 55, 59],
                    manualMIDIPitches: [48, 52, 55, 59]
                )
            ])]
        )
        XCTAssertThrowsError(try JazzDocumentValidator.validate(dualMode))
    }

    func testManualVoicingPreservesOrderDoublingsAndDrivesExactAuthorities() throws {
        let manual = [72, 60, 60, 67]
        let chart = JazzChart(
            title: "Manual authority",
            measures: [JazzMeasure(chords: [
                JazzChordEvent(symbol: "Cmaj7", manualMIDIPitches: manual)
            ])]
        )
        XCTAssertNoThrow(try JazzDocumentValidator.validate(chart))
        let playback = try XCTUnwrap(JazzTheory.compilePlayback(chart).first)
        XCTAssertEqual(playback.midiPitches, manual)
        XCTAssertFalse(playback.permitsBassReinforcement, "Exact audio must not add a hidden octave bass")
        XCTAssertEqual(noteOnPitches(in: MIDIFileWriter.makeFile(chart: chart)).sorted(), manual.sorted())

        let decoded = try JSONDecoder().decode(JazzChart.self, from: JSONEncoder().encode(chart))
        XCTAssertEqual(decoded.measures[0].chords[0].manualMIDIPitches, manual)
        XCTAssertNil(decoded.measures[0].chords[0].frozenMIDIPitches)
        XCTAssertEqual(decoded, chart)
    }

    @MainActor
    func testManualVoiceEditingIsBoundedUndoableAndSurvivesChartOperations() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzManualVoicingTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let recovery = JazzRecoveryStore(directory: directory)
        let store = JazzStudioStore(recovery: recovery)
        store.newChart()
        let automatic = store.selectedMIDIPitches

        store.beginManualSelectedVoicing()
        XCTAssertEqual(store.selectedVoicingMode, .manual)
        XCTAssertEqual(store.selectedChord?.manualMIDIPitches, automatic)
        store.moveSelectedVoice(at: 0, semitones: 1)
        let moved = [automatic[0] + 1] + Array(automatic.dropFirst())
        XCTAssertEqual(store.selectedMIDIPitches, moved)
        XCTAssertTrue(store.notice?.contains("voicing is Manual") == true)
        store.undo()
        XCTAssertEqual(store.selectedMIDIPitches, automatic)
        store.redo()
        XCTAssertEqual(store.selectedMIDIPitches, moved)

        store.addSelectedVoice()
        XCTAssertEqual(store.selectedMIDIPitches.count, moved.count + 1)
        store.removeSelectedVoice(at: store.selectedMIDIPitches.count - 1)
        XCTAssertEqual(store.selectedMIDIPitches, moved)
        XCTAssertEqual(JazzTheory.compilePlayback(store.chart).first?.midiPitches, moved)
        XCTAssertEqual(noteOnPitches(in: MIDIFileWriter.makeFile(chart: store.chart)).sorted(), moved.sorted())

        store.updateVoicing(.spread)
        store.transpose(2)
        XCTAssertEqual(store.selectedChord?.symbol, "Dmaj7")
        XCTAssertEqual(store.selectedMIDIPitches, moved)
        XCTAssertEqual(store.notice, "Transposed up 2 semitones. 1 stored voicing stayed at its exact pitches.")
        store.setDraft(store.chart.chartText)
        store.applyDraftNow()
        XCTAssertEqual(store.selectedChord?.manualMIDIPitches, moved)

        store.duplicateSelectedChord()
        XCTAssertTrue(store.chart.measures[0].chords.allSatisfy { $0.manualMIDIPitches == moved })
        let recovered = try XCTUnwrap(recovery.load())
        XCTAssertEqual(recovered.measures, store.chart.measures)

        store.clearSelectedStoredVoicing()
        XCTAssertEqual(store.selectedVoicingMode, .automatic)
        store.undo()
        XCTAssertEqual(store.selectedVoicingMode, .manual)
    }

    @MainActor
    func testEditingFrozenVoiceConvertsToManualAndBoundsRefuseWithoutHistory() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzManualBoundaryTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)

        let store = JazzStudioStore(recovery: recovery)
        store.newChart()
        store.freezeSelectedVoicing()
        let frozen = store.selectedMIDIPitches
        store.moveSelectedVoice(at: 0, semitones: 1)
        XCTAssertEqual(store.selectedVoicingMode, .manual)
        XCTAssertNil(store.selectedChord?.frozenMIDIPitches)
        XCTAssertEqual(store.selectedChord?.manualMIDIPitches?.first, frozen[0] + 1)

        let lowerBound = JazzChart(
            title: "Lower bound",
            measures: [JazzMeasure(chords: [
                JazzChordEvent(symbol: "Cmaj7", manualMIDIPitches: [21])
            ])]
        )
        recovery.save(lowerBound)
        let bounded = JazzStudioStore(recovery: recovery)
        let before = bounded.chart
        XCTAssertFalse(bounded.canUndo)
        bounded.moveSelectedVoice(at: 0, semitones: -1)
        XCTAssertEqual(bounded.chart, before)
        XCTAssertEqual(bounded.notice, "That move would leave the supported A0–C8 MIDI range.")
        bounded.removeSelectedVoice(at: 0)
        XCTAssertEqual(bounded.chart, before)
        XCTAssertFalse(bounded.canUndo)

        let full = JazzChart(
            title: "Full manual voicing",
            measures: [JazzMeasure(chords: [
                JazzChordEvent(symbol: "Cmaj7", manualMIDIPitches: Array(40...55))
            ])]
        )
        recovery.save(full)
        let fullStore = JazzStudioStore(recovery: recovery)
        fullStore.addSelectedVoice()
        XCTAssertEqual(fullStore.chart.id, full.id)
        XCTAssertEqual(fullStore.chart.measures, full.measures)
        XCTAssertEqual(fullStore.notice, "A manual voicing can contain at most 16 voices.")
        XCTAssertFalse(fullStore.canUndo)
    }

    @MainActor
    func testFrozenVoicingDrivesPlaybackMIDIPersistenceEditingAndHistory() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzFrozenVoicingTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let recovery = JazzRecoveryStore(directory: directory)
        let store = JazzStudioStore(recovery: recovery)
        store.newChart()
        let automatic = store.selectedMIDIPitches
        let automaticSignature = JazzAudioRenderer.signature(for: store.chart)

        store.freezeSelectedVoicing()
        XCTAssertEqual(store.selectedChord?.frozenMIDIPitches, automatic)
        XCTAssertEqual(store.selectedMIDIPitches, automatic)
        XCTAssertTrue(store.canUndo)
        XCTAssertNotEqual(JazzAudioRenderer.signature(for: store.chart), automaticSignature)
        XCTAssertEqual(JazzTheory.compilePlayback(store.chart).first?.midiPitches, automatic)
        XCTAssertFalse(try XCTUnwrap(JazzTheory.compilePlayback(store.chart).first).permitsBassReinforcement)
        XCTAssertEqual(Set(noteOnPitches(in: MIDIFileWriter.makeFile(chart: store.chart))), Set(automatic))

        store.updateVoicing(.spread)
        XCTAssertEqual(store.selectedMIDIPitches, automatic, "A chart-family change must not rewrite a frozen event")
        XCTAssertEqual(JazzTheory.compilePlayback(store.chart).first?.midiPitches, automatic)

        store.transpose(2)
        XCTAssertEqual(store.selectedChord?.symbol, "Dmaj7")
        XCTAssertEqual(store.selectedChord?.frozenMIDIPitches, automatic)
        XCTAssertEqual(store.notice, "Transposed up 2 semitones. 1 stored voicing stayed at its exact pitches.")

        store.setDraft(store.chart.chartText)
        store.applyDraftNow()
        XCTAssertEqual(store.selectedChord?.frozenMIDIPitches, automatic, "Unchanged quick entry must preserve event-only data")

        store.duplicateSelectedChord()
        XCTAssertEqual(store.chart.measures[0].chords.count, 2)
        XCTAssertTrue(store.chart.measures[0].chords.allSatisfy { $0.frozenMIDIPitches == automatic })
        store.undo()
        XCTAssertEqual(store.chart.measures[0].chords.count, 1)
        XCTAssertEqual(store.selectedChord?.frozenMIDIPitches, automatic)
        store.redo()
        XCTAssertEqual(store.chart.measures[0].chords.count, 2)
        XCTAssertEqual(store.selectedChord?.frozenMIDIPitches, automatic)

        let encoded = try JSONEncoder().encode(store.chart)
        let decoded = try JSONDecoder().decode(JazzChart.self, from: encoded)
        XCTAssertEqual(decoded.measures.flatMap(\.chords).map(\.frozenMIDIPitches), [automatic, automatic])
        let recovered = try XCTUnwrap(recovery.load())
        XCTAssertEqual(recovered.id, store.chart.id)
        XCTAssertEqual(recovered.title, store.chart.title)
        XCTAssertEqual(recovered.key, store.chart.key)
        XCTAssertEqual(recovered.tempoBPM, store.chart.tempoBPM)
        XCTAssertEqual(recovered.groove, store.chart.groove)
        XCTAssertEqual(recovered.instrument, store.chart.instrument)
        XCTAssertEqual(recovered.voicingFamily, store.chart.voicingFamily)
        XCTAssertEqual(recovered.measures, store.chart.measures)
        let restored = JazzStudioStore(recovery: recovery).chart
        XCTAssertEqual(restored.id, store.chart.id)
        XCTAssertEqual(restored.measures, store.chart.measures)

        store.clearSelectedStoredVoicing()
        XCTAssertNil(store.selectedChord?.frozenMIDIPitches)
        XCTAssertNotEqual(store.selectedMIDIPitches, automatic)
        store.undo()
        XCTAssertEqual(store.selectedChord?.frozenMIDIPitches, automatic)
        store.redo()
        XCTAssertNil(store.selectedChord?.frozenMIDIPitches)
        XCTAssertNoThrow(try JazzDocumentValidator.validate(store.chart))
    }

    @MainActor
    func testRecoveryRoundTripStartupAndPreviousValidFallback() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzRecoveryTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let recovery = JazzRecoveryStore(directory: directory)
        var first = JazzChart(
            title: "First recovery",
            key: .bb,
            tempoBPM: 87,
            groove: .ballad,
            instrument: .vibraphone,
            voicingFamily: .rootlessA,
            measures: try JazzTheory.parseChart("| Bbmaj9 | Eb13 |").measures
        )
        first.updatedAt = Date(timeIntervalSince1970: 1_788_130_000)
        recovery.save(first)
        XCTAssertEqual(recovery.load(), first)

        var second = first
        second.title = "Second recovery"
        second.tempoBPM = 144
        second.updatedAt = Date(timeIntervalSince1970: 1_788_130_100)
        recovery.save(second)
        try Data("truncated".utf8).write(
            to: directory.appendingPathComponent("FrankenJazz-Recovery.json"),
            options: .atomic
        )
        XCTAssertEqual(recovery.load(), first, "A corrupt current copy must fall back to the previous validated chart")

        recovery.save(second)
        let restoredStore = JazzStudioStore(recovery: recovery)
        XCTAssertEqual(restoredStore.chart, second)
        XCTAssertEqual(restoredStore.notice, "Recovered your last local chart.")
    }

    func testEveryVoicingFamilyIsDeterministicDistinctOrderedAndBounded() throws {
        let chord = try XCTUnwrap(JazzTheory.parseChord("Cmaj13/G", in: .c))
        let expectedCounts: [VoicingFamily: Int] = [
            .balanced: 7,
            .shell: 4,
            .rootlessA: 5,
            .rootlessB: 4,
            .open: 5,
            .spread: 5
        ]
        var realized = Set<[Int]>()

        for family in VoicingFamily.allCases {
            let notes = JazzTheory.voicing(for: chord, family: family)
            XCTAssertEqual(notes, JazzTheory.voicing(for: chord, family: family), family.rawValue)
            XCTAssertEqual(notes, notes.sorted(), family.rawValue)
            XCTAssertEqual(Set(notes).count, notes.count, family.rawValue)
            XCTAssertEqual(notes.count, expectedCounts[family], family.rawValue)
            XCTAssertTrue(notes.allSatisfy { (28...92).contains($0) }, family.rawValue)
            XCTAssertEqual(try XCTUnwrap(notes.first) % 12, 7, "Slash bass must remain the lowest voice in \(family.rawValue)")
            realized.insert(notes)
        }

        XCTAssertEqual(realized.count, VoicingFamily.allCases.count, "Every advertised family must produce a distinct realization")
    }

    @MainActor
    func testBundledContinuationBridgeReturnsAuthoritativeFunctionalResolution() throws {
        let bridge = JazzTheoryBridge()
        let candidates = try bridge.continuations(for: ["Dm7", "G7"]).get()

        let tonic = try XCTUnwrap(candidates.first)
        XCTAssertEqual(tonic.chordSymbol, "Cmaj7")
        XCTAssertEqual(tonic.category, "functional")
        XCTAssertEqual(tonic.providerID, "provider.functional.circle-cadence")
        XCTAssertEqual(tonic.expectedMotion, "cycle-fifth")
        XCTAssertTrue(tonic.preservedGuideTones)
        XCTAssertEqual(candidates.map(\.rank), Array(1...candidates.count))
        XCTAssertTrue(candidates.contains {
            $0.chordSymbol == "Cm7" && $0.category == "functional"
        })
        XCTAssertEqual(
            bridge.continuations(for: []),
            .failure(.refused("The selected context must contain 1 through 8 bounded chord symbols."))
        )
    }

    @MainActor
    func testContinuationApplyIsSingleStepUndoableAndRejectsStaleOptions() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzContinuationTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(JazzChart(
            title: "Cadence",
            measures: try JazzTheory.parseChart("| Dm7 G7 |").measures
        ))
        let store = JazzStudioStore(recovery: recovery)
        let dominant = try XCTUnwrap(store.chart.measures.first?.chords.last)
        store.select(dominant)
        let option = try XCTUnwrap(store.continuationOptions.first { $0.candidate.chordSymbol == "Cmaj7" })
        let revisionBeforeApply = store.revision

        store.applyContinuation(option)

        XCTAssertEqual(store.chart.measures.count, 2)
        XCTAssertEqual(store.chart.measures.last?.chords.first?.symbol, "Cmaj7")
        XCTAssertEqual(store.revision, revisionBeforeApply + 1)
        XCTAssertTrue(store.canUndo)
        store.undo()
        XCTAssertEqual(store.chart.measures.count, 1)
        XCTAssertEqual(store.chart.measures.first?.chords.map(\.symbol), ["Dm7", "G7"])

        store.select(try XCTUnwrap(store.chart.measures.first?.chords.last))
        let stale = try XCTUnwrap(store.continuationOptions.first)
        let measuresBeforeStaleApply = store.chart.measures
        store.updateTitle("Revised cadence")
        store.applyContinuation(stale)
        XCTAssertEqual(store.chart.measures, measuresBeforeStaleApply)
        XCTAssertEqual(store.notice, "That suggestion is stale because the chart changed. Review the refreshed options.")
    }

    @MainActor
    func testContinuationBridgeFailsClosedOnForeignEngineSchema() {
        let bridge = JazzTheoryBridge(script: """
        globalThis.FrankenJazzTheoryBridge = {
          continuations: function(_) {
            return JSON.stringify({
              schema: "frankenjazz.native-continuation-response.v1",
              ok: true,
              engineSchema: "changes.continuation-result.v999",
              candidates: []
            });
          }
        };
        """)

        XCTAssertEqual(bridge.continuations(for: ["G7"]), .failure(.malformed))
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

    private func dawQuirkMIDI() -> Data {
        let track: [UInt8] = [
            0x00, 0x90, 0x3C, 0x60,
            0x00, 0x90, 0x40, 0x60,
            0x00, 0x90, 0x43, 0x60,
            0x00, 0x90, 0x47, 0x60,
            0x00, 0x90, 0x3C, 0x55,
            0x00, 0x80, 0x3E, 0x00,
            0x00, 0xB0, 0x40, 0x7F,
            0x83, 0x60, 0x80, 0x3C, 0x00,
            0x00, 0x80, 0x40, 0x00,
            0x00, 0x80, 0x43, 0x00
        ]
        return Data([
            0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, 0x00, 0x01, 0x01, 0xE0,
            0x4D, 0x54, 0x72, 0x6B,
            UInt8((track.count >> 24) & 0xFF), UInt8((track.count >> 16) & 0xFF),
            UInt8((track.count >> 8) & 0xFF), UInt8(track.count & 0xFF)
        ] + track)
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

    /// Hand-assembled format-0 fixture so exact import bounds do not certify
    /// themselves through the production MIDI writer.
    private func singleChordMIDI(pitches: [Int]) -> Data {
        precondition(!pitches.isEmpty && pitches.allSatisfy { (0...127).contains($0) })
        var track: [UInt8] = []
        for pitch in pitches {
            track += [0x00, 0x90, UInt8(pitch), 0x60]
        }
        for (index, pitch) in pitches.enumerated() {
            track += index == 0
                ? [0x83, 0x60, 0x80, UInt8(pitch), 0x00]
                : [0x00, 0x80, UInt8(pitch), 0x00]
        }
        track += [0x00, 0xFF, 0x2F, 0x00]
        return Data([
            0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, 0x00, 0x01, 0x01, 0xE0,
            0x4D, 0x54, 0x72, 0x6B,
            UInt8((track.count >> 24) & 0xFF), UInt8((track.count >> 16) & 0xFF),
            UInt8((track.count >> 8) & 0xFF), UInt8(track.count & 0xFF)
        ] + track)
    }

    private func noteOnPitches(in data: Data) -> [Int] {
        let bytes = [UInt8](data)
        guard bytes.count >= 22 else { return [] }
        var index = 22
        var pitches: [Int] = []

        func readVariableLength() -> Int? {
            var value = 0
            for _ in 0..<4 {
                guard index < bytes.count else { return nil }
                let byte = bytes[index]
                index += 1
                value = (value << 7) | Int(byte & 0x7F)
                if byte & 0x80 == 0 { return value }
            }
            return nil
        }

        while index < bytes.count {
            guard readVariableLength() != nil, index < bytes.count else { break }
            let status = bytes[index]
            index += 1
            switch status {
            case 0x90:
                guard index + 1 < bytes.count else { return pitches }
                let pitch = Int(bytes[index])
                let velocity = bytes[index + 1]
                index += 2
                if velocity > 0 { pitches.append(pitch) }
            case 0x80:
                index += min(2, bytes.count - index)
            case 0xC0:
                index += min(1, bytes.count - index)
            case 0xFF:
                guard index < bytes.count else { return pitches }
                index += 1
                guard let length = readVariableLength(), length <= bytes.count - index else { return pitches }
                index += length
            default:
                return pitches
            }
        }
        return pitches
    }

    private func rgba(_ color: UIColor) throws -> [CGFloat] {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
            throw XCTSkip("Theme color could not be resolved in the active color space")
        }
        return [red, green, blue, alpha]
    }

    private func relativeLuminance(_ rgba: [CGFloat]) -> CGFloat {
        func linear(_ component: CGFloat) -> CGFloat {
            component <= 0.04045
                ? component / 12.92
                : pow((component + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(rgba[0]) + 0.7152 * linear(rgba[1]) + 0.0722 * linear(rgba[2])
    }

    private func contrastRatio(_ first: [CGFloat], _ second: [CGFloat]) -> CGFloat {
        let firstLuminance = relativeLuminance(first)
        let secondLuminance = relativeLuminance(second)
        return (max(firstLuminance, secondLuminance) + 0.05)
            / (min(firstLuminance, secondLuminance) + 0.05)
    }
}

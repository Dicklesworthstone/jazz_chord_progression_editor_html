import XCTest
import UIKit
import FrankenJazzDSP
@testable import FrankenJazz

final class FrankenJazzCoreTests: XCTestCase {
    func testNamedSectionsMatchOriginalSyntaxAndRoundTripWithoutFlattening() throws {
        let source = "[A] \"Opening\"\n| Dm7 G7 | Cmaj7 |\n[Bridge]\n| Fmaj7 | E7 |"
        let parsed = try JazzTheory.parseChart(source)

        XCTAssertEqual(parsed.measures.map { $0.chords.map(\.symbol) }, [
            ["Dm7", "G7"], ["Cmaj7"], ["Fmaj7"], ["E7"]
        ])
        XCTAssertEqual(parsed.sections?.map(\.name), ["A", "Bridge"])
        XCTAssertEqual(parsed.sections?.map(\.annotation), ["Opening", ""])
        XCTAssertEqual(parsed.sections?.map(\.startMeasureID), [parsed.measures[0].id, parsed.measures[2].id])
        XCTAssertEqual(parsed.normalizedText, source)
        XCTAssertEqual(try JazzTheory.parseChart(parsed.normalizedText).normalizedText, source)

        let implicit = try JazzTheory.parseChart("| Dm7 G7 | Cmaj7 |")
        XCTAssertNil(implicit.sections)
        XCTAssertEqual(implicit.normalizedText, "| Dm7 G7 | Cmaj7 |")
    }

    func testSectionPlaybackWindowCannotLeakIntoAdjacentSections() {
        let loop = JazzAudioEngine.SectionLoopRange(startBeat: 8, endBeat: 16)
        XCTAssertEqual(
            JazzAudioEngine.playbackWindow(requestedBeat: 0, totalBeats: 24, sectionLoop: loop),
            .init(startBeat: 8, endBeat: 16)
        )
        XCTAssertEqual(
            JazzAudioEngine.playbackWindow(requestedBeat: 12, totalBeats: 24, sectionLoop: loop),
            .init(startBeat: 12, endBeat: 16)
        )
        XCTAssertEqual(
            JazzAudioEngine.playbackWindow(requestedBeat: 20, totalBeats: 24, sectionLoop: loop),
            .init(startBeat: 8, endBeat: 16)
        )
        XCTAssertEqual(
            JazzAudioEngine.playbackWindow(requestedBeat: 20, totalBeats: 24, sectionLoop: nil),
            .init(startBeat: 20, endBeat: 24)
        )
        XCTAssertNil(JazzAudioEngine.playbackWindow(requestedBeat: .nan, totalBeats: 24, sectionLoop: loop))
    }

    func testSectionBoundaryReallyControlsAutomaticVoiceLeading() throws {
        let first = JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])
        let second = JazzMeasure(chords: [JazzChordEvent(symbol: "Bmaj7")])
        let sectionA = JazzChartSection(name: "A", startMeasureID: first.id)
        var sectionB = JazzChartSection(
            name: "B",
            startMeasureID: second.id,
            voiceLeadingBoundary: .continue
        )
        var chart = JazzChart(title: "Boundary", measures: [first, second], sections: [sectionA, sectionB])
        let continued = JazzTheory.compilePlayback(chart)
        let plainB = try XCTUnwrap(JazzTheory.parseChord("Bmaj7", in: .c))
        XCTAssertNotEqual(continued[1].midiPitches, JazzTheory.voicing(for: plainB, family: .balanced))
        XCTAssertEqual(continued[1].midiPitches, [51, 54, 58, 59])

        sectionB.voiceLeadingBoundary = .reset
        chart.sections = [sectionA, sectionB]
        let reset = JazzTheory.compilePlayback(chart)
        XCTAssertEqual(reset[1].midiPitches, JazzTheory.voicing(for: plainB, family: .balanced))
    }

    func testOldNativeJSONWithoutSectionsStillDecodesAsTheSameFlatChart() throws {
        let chart = JazzChart(title: "Old chart", measures: [
            JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])
        ])
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(chart)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("\"sections\""))

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(JazzChart.self, from: data)
        XCTAssertNil(decoded.sections)
        XCTAssertEqual(decoded.chartText, "| Cmaj7 |")
        try JazzDocumentValidator.validate(decoded)
    }

    @MainActor
    func testSectionLoopRangeAndBoundaryRepairStayOwnedByTheChartStore() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSectionTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let measures = ["Cmaj7", "Dm7", "G7", "Fmaj7"].map {
            JazzMeasure(chords: [JazzChordEvent(symbol: $0)])
        }
        let first = JazzChartSection(name: "A", startMeasureID: measures[0].id)
        let bridge = JazzChartSection(name: "B", annotation: "Lift", startMeasureID: measures[2].id)
        let chart = JazzChart(title: "Sections", measures: measures, sections: [first, bridge])
        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(chart)
        let store = JazzStudioStore(recovery: recovery)

        XCTAssertEqual(store.sectionBeatRange(first.id), .init(startBeat: 0, endBeat: 8))
        XCTAssertEqual(store.sectionBeatRange(bridge.id), .init(startBeat: 8, endBeat: 16))
        store.toggleSectionLoop(bridge.id)
        XCTAssertEqual(store.loopedSectionID, bridge.id)
        XCTAssertEqual(store.audio.sectionLoopRange, .init(startBeat: 8, endBeat: 16))
        XCTAssertFalse(store.audio.loops)
        store.setWholeChartLoop(true)
        XCTAssertNil(store.loopedSectionID)
        XCTAssertNil(store.audio.sectionLoopRange)
        XCTAssertTrue(store.audio.loops)

        let beforeDelete = store.chart
        store.select(measures[2].chords[0])
        store.deleteMeasure(measures[2].id)
        XCTAssertEqual(store.chart.sections?.last?.id, bridge.id)
        XCTAssertEqual(store.chart.sections?.last?.startMeasureID, measures[3].id)
        XCTAssertEqual(store.chart.sections?.last?.annotation, "Lift")
        store.undo()
        XCTAssertEqual(store.chart, beforeDelete)
    }

    @MainActor
    func testVisualSectionBoundaryEditingPreservesMusicAndIsUndoable() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSectionEditingTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let measures = ["Cmaj7", "Dm7", "G7", "Cmaj7"].map {
            JazzMeasure(chords: [JazzChordEvent(symbol: $0)])
        }
        let source = JazzChart(
            title: "Visual sections",
            key: .eb,
            tempoBPM: 146,
            groove: .bossaNova,
            instrument: .concertVibes,
            voicingFamily: .spread,
            measures: measures
        )
        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(source)
        let store = JazzStudioStore(recovery: recovery)
        let before = store.chart
        let revision = store.revision

        store.startSection(at: measures[2].id)

        XCTAssertEqual(store.chart.sections?.map(\.name), ["A", "B"])
        XCTAssertEqual(store.chart.sections?.map(\.startMeasureID), [measures[0].id, measures[2].id])
        XCTAssertEqual(store.chart.measures, before.measures)
        XCTAssertEqual(store.chart.title, before.title)
        XCTAssertEqual(store.chart.key, before.key)
        XCTAssertEqual(store.chart.tempoBPM, before.tempoBPM)
        XCTAssertEqual(store.chart.groove, before.groove)
        XCTAssertEqual(store.chart.instrument, before.instrument)
        XCTAssertEqual(store.chart.voicingFamily, before.voicingFamily)
        XCTAssertEqual(store.revision, revision + 1)
        XCTAssertEqual(store.chart.sectionGroups.map { $0.indexedMeasures.count }, [2, 2])

        let afterCreate = store.chart
        store.startSection(at: measures[2].id)
        XCTAssertEqual(store.chart, afterCreate)
        XCTAssertEqual(store.revision, revision + 1)
        XCTAssertEqual(store.notice, "Bar 3 already starts a section.")

        store.undo()
        XCTAssertEqual(store.chart, before)
        store.redo()
        XCTAssertEqual(store.chart.sections?.map(\.name), ["A", "B"])

        store.removeSectionStarting(at: measures[2].id)
        XCTAssertEqual(store.chart.sections?.map(\.name), ["A"])
        XCTAssertEqual(store.chart.measures, before.measures)
        XCTAssertEqual(store.chart.sectionGroups.map { $0.indexedMeasures.count }, [4])
        XCTAssertEqual(store.notice, "Removed section B; its bars joined the preceding section.")
        store.undo()
        XCTAssertEqual(store.chart.sections?.map(\.name), ["A", "B"])

        store.removeSectionStarting(at: measures[0].id)
        XCTAssertEqual(store.chart.sections?.map(\.name), ["B"])
        XCTAssertEqual(store.chart.sectionGroups.map { $0.indexedMeasures.count }, [2, 2])
        XCTAssertEqual(store.chart.sectionGroups.first?.section, nil)
        XCTAssertEqual(store.notice, "Removed section A; its bars are now the opening.")
    }

    @MainActor
    func testSectionTransposeIsScopedUndoableAndKeepsExactVoicings() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSectionTransposeTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let measures = [
            JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")]),
            JazzMeasure(chords: [JazzChordEvent(symbol: "Dm7")]),
            JazzMeasure(chords: [JazzChordEvent(symbol: "G7/B", manualMIDIPitches: [47, 53, 59, 65])]),
            JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7", beats: 1.5), JazzChordEvent(symbol: "E7", beats: 2.5)])
        ]
        let sectionA = JazzChartSection(name: "A", annotation: "Stay", startMeasureID: measures[0].id)
        let sectionB = JazzChartSection(
            name: "B",
            annotation: "Lift",
            startMeasureID: measures[2].id,
            voiceLeadingBoundary: .continue
        )
        let source = JazzChart(
            title: "Scoped transpose",
            key: .c,
            measures: measures,
            sections: [sectionA, sectionB]
        )
        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(source)
        let store = JazzStudioStore(recovery: recovery)
        let before = store.chart
        let revision = store.revision

        store.transposeSection(sectionB.id, semitones: 1)

        XCTAssertEqual(store.chart.key, .c)
        XCTAssertEqual(store.chart.measures[0...1].flatMap(\.chords).map(\.symbol), ["Cmaj7", "Dm7"])
        XCTAssertEqual(store.chart.measures[2...3].flatMap(\.chords).map(\.symbol), ["G#7/C", "C#maj7", "F7"])
        XCTAssertEqual(store.chart.measures[3].chords.map(\.beats), [1.5, 2.5])
        XCTAssertEqual(store.chart.measures[2].chords[0].manualMIDIPitches, [47, 53, 59, 65])
        XCTAssertEqual(store.chart.sections, [sectionA, sectionB])
        XCTAssertEqual(store.notice, "Transposed section B up 1 semitone. 1 stored voicing stayed at its exact pitches.")
        XCTAssertEqual(store.revision, revision + 1)

        store.undo()
        XCTAssertEqual(store.chart, before)
        store.redo()
        XCTAssertEqual(store.chart.measures[2...3].flatMap(\.chords).map(\.symbol), ["G#7/C", "C#maj7", "F7"])

        let after = store.chart
        let afterRevision = store.revision
        store.transposeSection(UUID(), semitones: -1)
        XCTAssertEqual(store.chart, after)
        XCTAssertEqual(store.revision, afterRevision)
        XCTAssertEqual(store.notice, "That section no longer has any changes to transpose.")
    }

    @MainActor
    func testTextFileImportPreservesNamedSections() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzSectionImportTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(JazzChart(title: "Before import", measures: [
            JazzMeasure(chords: [JazzChordEvent(symbol: "Cmaj7")])
        ]))
        let store = JazzStudioStore(recovery: recovery)
        let before = store.chart
        let file = directory.appendingPathComponent("Rhythm Changes.txt")
        try Data("# exported metadata\n\n[A] \"Head\"\n| Bbmaj7 | G7 |\n[B]\n| Cm7 | F7 |\n".utf8)
            .write(to: file, options: .atomic)

        await store.importFile(file)

        XCTAssertEqual(store.chart.title, "Rhythm Changes")
        XCTAssertEqual(store.chart.sections?.map(\.name), ["A", "B"])
        XCTAssertEqual(store.chart.sections?.map(\.annotation), ["Head", ""])
        XCTAssertEqual(store.chart.sections?.map(\.startMeasureID), [
            store.chart.measures[0].id, store.chart.measures[2].id
        ])
        XCTAssertEqual(store.chart.chartText, "[A] \"Head\"\n| Bbmaj7 | G7 |\n[B]\n| Cm7 | F7 |")
        XCTAssertTrue(store.canUndo)
        store.undo()
        XCTAssertEqual(store.chart, before)
    }

    func testLeadSheetTextCodecRoundTripsEveryRepresentableNativeSetting() throws {
        let measures = [
            JazzMeasure(chords: [
                JazzChordEvent(symbol: "Ebmaj7", beats: 1.5),
                JazzChordEvent(symbol: "Fm9", beats: 2.5)
            ]),
            JazzMeasure(chords: [JazzChordEvent(symbol: "Bb13/Eb")]),
            JazzMeasure(chords: [JazzChordEvent(symbol: "Abmaj7#11")])
        ]
        let chart = JazzChart(
            title: "Glass Changes",
            key: .eb,
            tempoBPM: 147.5,
            groove: .syncopatedSixteenths,
            instrument: .clarinet,
            voicingFamily: .rootlessB,
            measures: measures,
            sections: [
                JazzChartSection(name: "A", annotation: "Rubato", startMeasureID: measures[0].id),
                JazzChartSection(name: "Bridge", annotation: "Lift", startMeasureID: measures[2].id)
            ]
        )

        let data = JazzLeadSheetTextCodec.encode(chart)
        let text = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(text.hasPrefix("# FrankenJazz lead-sheet v2\n# title Glass Changes\n"))
        XCTAssertTrue(text.contains("# tempo 147.5 BPM"))
        XCTAssertTrue(text.contains("# instrument Clarinet"))
        XCTAssertTrue(text.contains("Ebmaj7:1.5 Fm9:2.5"))

        let decoded = try JazzLeadSheetTextCodec.decode(text, fallbackTitle: "Wrong fallback")
        XCTAssertEqual(decoded.title, chart.title)
        XCTAssertEqual(decoded.key, chart.key)
        XCTAssertEqual(decoded.tempoBPM, chart.tempoBPM)
        XCTAssertEqual(decoded.groove, chart.groove)
        XCTAssertEqual(decoded.instrument, chart.instrument)
        XCTAssertEqual(decoded.voicingFamily, chart.voicingFamily)
        XCTAssertEqual(decoded.measures.map { $0.chords.map(\.symbol) }, chart.measures.map { $0.chords.map(\.symbol) })
        XCTAssertEqual(decoded.measures.map { $0.chords.map(\.beats) }, chart.measures.map { $0.chords.map(\.beats) })
        XCTAssertEqual(decoded.sections?.map(\.name), ["A", "Bridge"])
        XCTAssertEqual(decoded.sections?.map(\.annotation), ["Rubato", "Lift"])
        XCTAssertEqual(decoded.chartText, chart.chartText)
    }

    func testLeadSheetTextCodecReadsLegacyAndMetadataFreeFiles() throws {
        let legacy = try JazzLeadSheetTextCodec.decode(
            "# Blue Pocket\n# key Eb · 147 BPM · Bossa nova\n\n| Fm9 | Bb13 |",
            fallbackTitle: "legacy-file"
        )
        XCTAssertEqual(legacy.title, "Blue Pocket")
        XCTAssertEqual(legacy.key, .eb)
        XCTAssertEqual(legacy.tempoBPM, 147)
        XCTAssertEqual(legacy.groove, .bossaNova)
        XCTAssertEqual(legacy.instrument, .electricPiano)
        XCTAssertEqual(legacy.voicingFamily, .balanced)

        let plain = try JazzLeadSheetTextCodec.decode(
            "# arranger note intentionally ignored\n| Dm7 G7 | Cmaj7 |",
            fallbackTitle: "plain-file"
        )
        XCTAssertEqual(plain.title, "plain-file")
        XCTAssertEqual(plain.key, .c)
        XCTAssertEqual(plain.tempoBPM, 132)
        XCTAssertEqual(plain.groove, .mediumSwing)
    }

    func testLeadSheetTextCodecRefusesMalformedClaimedMetadata() {
        XCTAssertThrowsError(try JazzLeadSheetTextCodec.decode(
            "# FrankenJazz lead-sheet v2\n# title Broken\n# key H\n| Cmaj7 |",
            fallbackTitle: "broken"
        )) { error in
            XCTAssertEqual(error as? ImportError, .invalidTextMetadata("key"))
        }
        XCTAssertThrowsError(try JazzLeadSheetTextCodec.decode(
            "# key C\n# key D\n| Cmaj7 |",
            fallbackTitle: "duplicate"
        )) { error in
            XCTAssertEqual(error as? ImportError, .invalidTextMetadata("duplicate key"))
        }
        XCTAssertThrowsError(try JazzLeadSheetTextCodec.decode(
            "# instrument Kazoo\n| Cmaj7 |",
            fallbackTitle: "broken-instrument"
        )) { error in
            XCTAssertEqual(error as? ImportError, .invalidTextMetadata("instrument"))
        }
    }

    func testNativeChordPaletteMatchesOriginalVocabularyAndEveryPairParses() throws {
        XCTAssertEqual(JazzChordPalette.roots.map(\.symbol), [
            "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"
        ])
        XCTAssertEqual(JazzChordPalette.qualities.map(\.suffix), [
            "maj7", "m7", "7", "6/9", "add9", "m9", "m7b5", "dim7", "sus4", "13", "7b9", "maj7#11"
        ])

        for root in JazzChordPalette.roots {
            for quality in JazzChordPalette.qualities {
                let symbol = JazzChordPalette.symbol(root: root, quality: quality)
                let measure = try JazzChordPalette.validatedMeasure(
                    root: root,
                    quality: quality,
                    existingMeasureCount: 0
                )
                XCTAssertEqual(measure.chords.map(\.symbol), [symbol])
                XCTAssertEqual(measure.chords.map(\.beats), [4])
                XCTAssertNotNil(JazzTheory.parseChord(symbol, in: .c), symbol)
            }
        }

        XCTAssertThrowsError(
            try JazzChordPalette.validatedMeasure(
                root: JazzChordPalette.roots[0],
                quality: JazzChordPalette.qualities[0],
                existingMeasureCount: JazzTheory.maximumMeasures
            )
        ) { error in
            XCTAssertEqual(error as? JazzChordPaletteIssue, .measureLimit(JazzTheory.maximumMeasures))
        }
    }

    @MainActor
    func testNativeChordPaletteAppendIsOneUndoableOwnedMutationWithoutAudioOutput() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("FrankenJazzPaletteTests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recovery = JazzRecoveryStore(directory: directory)
        recovery.save(JazzChart(
            title: "Palette proof",
            key: .eb,
            tempoBPM: 147,
            groove: .bossaNova,
            instrument: .concertVibes,
            voicingFamily: .spread,
            measures: [JazzMeasure(chords: [
                JazzChordEvent(symbol: "Ebmaj7", annotation: "Keep me", manualMIDIPitches: [51, 55, 58, 62])
            ])]
        ))
        let store = JazzStudioStore(recovery: recovery)
        let before = store.chart
        let beforeRevision = store.revision
        let oldMeasureIDs = before.measures.map(\.id)
        let oldChordIDs = before.measures.flatMap(\.chords).map(\.id)
        let root = try XCTUnwrap(JazzChordPalette.roots.first { $0.id == "f-sharp" })
        let quality = try XCTUnwrap(JazzChordPalette.qualities.first { $0.id == "m7b5" })

        XCTAssertNil(store.appendPaletteChord(root: root, quality: quality))
        XCTAssertEqual(store.chart.measures.count, before.measures.count + 1)
        XCTAssertEqual(Array(store.chart.measures.dropLast()).map(\.id), oldMeasureIDs)
        XCTAssertEqual(Array(store.chart.measures.dropLast()).flatMap(\.chords).map(\.id), oldChordIDs)
        XCTAssertEqual(store.chart.measures.last?.chords.map(\.symbol), ["F#m7b5"])
        XCTAssertEqual(store.chart.measures.last?.chords.map(\.beats), [4])
        XCTAssertEqual(store.chart.title, before.title)
        XCTAssertEqual(store.chart.key, before.key)
        XCTAssertEqual(store.chart.tempoBPM, before.tempoBPM)
        XCTAssertEqual(store.chart.groove, before.groove)
        XCTAssertEqual(store.chart.instrument, before.instrument)
        XCTAssertEqual(store.chart.voicingFamily, before.voicingFamily)
        XCTAssertEqual(store.selectedChord?.symbol, "F#m7b5")
        XCTAssertEqual(store.revision, beforeRevision + 1)
        XCTAssertTrue(store.canUndo)
        XCTAssertTrue(store.draftText.hasSuffix("| F#m7b5 |"))

        store.undo()
        XCTAssertEqual(store.chart, before)
        XCTAssertTrue(store.canRedo)
        store.redo()
        XCTAssertEqual(store.chart.measures.last?.chords.first?.symbol, "F#m7b5")
    }

    @MainActor
    func testNativeCountInAndMetronomePlansMatchOriginalFourFourPolicy() {
        let fresh = JazzAudioEngine.transportClickPlan(
            startBeat: 0,
            countInEnabled: true,
            metronomeEnabled: true
        )
        XCTAssertEqual(fresh.leadInBeats, 4)
        XCTAssertEqual(fresh.chartPhaseBeat, 0)
        XCTAssertEqual(fresh.firstChartClickOffsetBeats, 0)
        XCTAssertTrue(fresh.firstChartClickIsAccent)

        let midBar = JazzAudioEngine.transportClickPlan(
            startBeat: 5.25,
            countInEnabled: false,
            metronomeEnabled: true
        )
        XCTAssertEqual(midBar.leadInBeats, 0)
        XCTAssertEqual(midBar.chartPhaseBeat, 1.25)
        XCTAssertEqual(midBar.firstChartClickOffsetBeats, 0.75)
        XCTAssertFalse(midBar.firstChartClickIsAccent)

        let almostDownbeat = JazzAudioEngine.transportClickPlan(
            startBeat: 7.8,
            countInEnabled: false,
            metronomeEnabled: true
        )
        XCTAssertEqual(almostDownbeat.firstChartClickOffsetBeats ?? -1, 0.2, accuracy: 0.000_001)
        XCTAssertTrue(almostDownbeat.firstChartClickIsAccent)

        let silent = JazzAudioEngine.transportClickPlan(
            startBeat: .nan,
            countInEnabled: false,
            metronomeEnabled: false
        )
        XCTAssertNil(silent.firstChartClickOffsetBeats)
    }

    func testNativeTransportClickBarIsBoundedAudiblePCMWithStrongerDownbeat() throws {
        let rendered = try XCTUnwrap(JazzAudioRenderer.renderTransportClickBar(tempoBPM: 120))
        XCTAssertEqual(rendered.sampleRate, 24_000)
        XCTAssertEqual(rendered.left.count, 48_000)
        XCTAssertEqual(rendered.left.count, rendered.right.count)

        let framesPerBeat = 12_000
        let energy = (0..<4).map { beat in
            rendered.left[(beat * framesPerBeat)..<min((beat * framesPerBeat) + 1_440, rendered.left.count)]
                .reduce(0.0) { $0 + Double($1 * $1) }
        }
        XCTAssertGreaterThan(energy[0], energy[1])
        XCTAssertGreaterThan(energy[1], 0)
        XCTAssertNil(JazzAudioRenderer.renderTransportClickBar(tempoBPM: 0))
        XCTAssertNil(JazzAudioRenderer.renderTransportClickBar(tempoBPM: .infinity))
    }

    @MainActor
    func testNativeTransportStepsRestartsAndPreservesVolumeAcrossMuteWithoutAudioOutput() throws {
        let parsed = try JazzTheory.parseChart("| Cmaj7:1 Dm7:1 G7:2 |")
        let chart = JazzChart(title: "Transport boundaries", measures: parsed.measures)
        let engine = JazzAudioEngine()

        XCTAssertNil(engine.chordTargetBeat(.previous, chart: chart))
        XCTAssertEqual(engine.chordTargetBeat(.next, chart: chart), 1)

        engine.stepChord(.next, chart: chart)
        XCTAssertEqual(engine.playheadBeat, 1)
        XCTAssertEqual(engine.state, .ready, "Stepping a stopped chart must never begin playback.")
        XCTAssertEqual(engine.chordTargetBeat(.previous, chart: chart), 0)
        XCTAssertEqual(engine.chordTargetBeat(.next, chart: chart), 2)

        engine.seek(toBeat: 1.5)
        XCTAssertEqual(engine.chordTargetBeat(.previous, chart: chart), 1)
        XCTAssertEqual(engine.chordTargetBeat(.next, chart: chart), 2)

        engine.setMasterVolume(0.35)
        engine.toggleMute()
        XCTAssertTrue(engine.isMuted)
        XCTAssertEqual(engine.masterVolume, 0.35)
        engine.setMasterVolume(2)
        XCTAssertEqual(engine.masterVolume, 1)
        engine.setMasterVolume(-2)
        XCTAssertEqual(engine.masterVolume, 0)
        engine.setMasterVolume(.nan)
        XCTAssertEqual(engine.masterVolume, 0.78)
        engine.toggleMute()
        XCTAssertFalse(engine.isMuted)
        XCTAssertEqual(engine.masterVolume, 0.78, "Mute must not overwrite the user's stored gain.")

        let graph = engine.masterGraphSnapshot
        XCTAssertEqual(graph.nodeIDs.first, "instrument-bus")
        XCTAssertEqual(graph.nodeIDs.last, "destination")
        XCTAssertTrue(graph.nodeIDs.contains("native-output-limiter"))
        XCTAssertEqual(graph.dcBlockFrequencyHz, 24, accuracy: 0.01)
        XCTAssertEqual(graph.lowShelfFrequencyHz, 180, accuracy: 0.01)
        XCTAssertEqual(graph.lowShelfGainDB, 1.5, accuracy: 0.01)
        XCTAssertEqual(graph.highShelfFrequencyHz, 6_000, accuracy: 0.01)
        XCTAssertEqual(graph.highShelfGainDB, -1, accuracy: 0.01)
        XCTAssertEqual(graph.dynamicsThresholdDB, -18)
        XCTAssertEqual(graph.dynamicsAttackSeconds, 0.006)
        XCTAssertEqual(graph.dynamicsReleaseSeconds, 0.18)
        XCTAssertEqual(graph.maximumReverbSendGain, 0.28)
        XCTAssertEqual(graph.safetyGain, 0.9, accuracy: 0.001)
        engine.setReverbAmount(0.25)
        XCTAssertEqual(engine.reverbAmount, 0.25)
        XCTAssertEqual(engine.masterGraphSnapshot.reverbAmount, 0.25)
        engine.setPlaybackMix(.originalDefault)
        XCTAssertEqual(engine.masterVolume, 1)
        XCTAssertEqual(engine.reverbAmount, 0.55)

        engine.loops = true
        XCTAssertTrue(engine.loops)
        engine.setCountInEnabled(true)
        engine.setMetronomeEnabled(true)
        XCTAssertTrue(engine.countInEnabled)
        XCTAssertTrue(engine.metronomeEnabled)

        // A cold restart must enter the real render path at beat zero. Stop it
        // immediately, before the detached renderer can configure audio.
        engine.restart(chart: chart)
        XCTAssertEqual(engine.state, .preparing)
        engine.stop()
        XCTAssertEqual(engine.state, .ready)
        XCTAssertEqual(engine.playheadBeat, 0)
    }

    func testNativeInstrumentCatalogMatchesEveryOriginalInstrument() throws {
        let expected: [(String, String)] = [
            ("mellow-keys", "Mellow Keys"),
            ("fm-electric-piano", "FM Electric Piano"),
            ("vibraphone", "Vibraphone"),
            ("warm-pad", "Warm Pad"),
            ("analog-poly", "Analog Poly"),
            ("concert-grand", "Concert Grand"),
            ("flute", "Flute"),
            ("organ", "Organ"),
            ("guitar", "Guitar"),
            ("upright-bass", "Upright Bass"),
            ("concert-vibes", "Concert Vibes"),
            ("blues-guitar", "Blues Guitar"),
            ("clarinet", "Clarinet"),
            ("dreadnought-guitar", "Steel Dreadnought"),
            ("ukulele", "Re-entrant Ukulele")
        ]
        XCTAssertEqual(InstrumentTone.allCases.map(\.originalID), expected.map { $0.0 })
        XCTAssertEqual(InstrumentTone.allCases.map(\.displayName), expected.map { $0.1 })
        XCTAssertEqual(Set(InstrumentTone.allCases.map(\.midiProgram)).count, 13)
        for tone in InstrumentTone.allCases {
            XCTAssertNotNil(UIImage(systemName: tone.symbol), "\(tone.displayName) needs a real SF Symbol.")
        }

        let decoder = JSONDecoder()
        XCTAssertEqual(
            try decoder.decode(InstrumentTone.self, from: Data("\"Electric piano\"".utf8)),
            .electricPiano,
            "The original native persisted spelling must remain readable."
        )
        XCTAssertEqual(
            try decoder.decode(InstrumentTone.self, from: Data("\"Warm pad\"".utf8)),
            .warmPad
        )
        XCTAssertEqual(
            try decoder.decode(InstrumentTone.self, from: Data("\"concert-grand\"".utf8)),
            .concertGrand
        )
        for tone in InstrumentTone.allCases {
            let encoded = try JSONEncoder().encode(tone)
            XCTAssertEqual(String(decoding: encoded, as: UTF8.self), "\"\(tone.originalID)\"")
            XCTAssertEqual(try decoder.decode(InstrumentTone.self, from: encoded), tone)
        }
    }

    func testEveryInstrumentRendersFiniteDistinctNonSilentPreviewWithoutAudioOutput() throws {
        var fingerprints = Set<[UInt32]>()
        for tone in InstrumentTone.allCases {
            let rendered = try XCTUnwrap(
                JazzAudioRenderer.renderPreview(midi: 60, tone: tone, duration: 0.16),
                tone.displayName
            )
            XCTAssertEqual(rendered.left.count, rendered.right.count, tone.displayName)
            XCTAssertGreaterThan(rendered.left.count, 3_000, tone.displayName)
            XCTAssertTrue(rendered.left.allSatisfy(\.isFinite), tone.displayName)
            XCTAssertTrue(rendered.right.allSatisfy(\.isFinite), tone.displayName)
            XCTAssertTrue(rendered.left.contains { abs($0) > 0.0001 }, tone.displayName)
            let fingerprint = stride(from: 101, to: min(3_000, rendered.left.count), by: 137)
                .map { rendered.left[$0].bitPattern }
            XCTAssertTrue(fingerprints.insert(fingerprint).inserted, "\(tone.displayName) needs its own audible recipe.")
        }

        XCTAssertNil(JazzAudioRenderer.renderPreview(midi: 20, tone: .concertGrand))
        XCTAssertNil(JazzAudioRenderer.renderPreview(midi: 109, tone: .concertGrand))
    }

    func testSyntheticRecipeMetadataMatchesOriginalWebAudioContract() throws {
        let expected: [InstrumentTone: JazzSyntheticInstrumentMetadata] = [
            .mellowKeys: JazzSyntheticInstrumentMetadata(
                algorithmID: "changes.audio.mellow-keys@1", topology: .additive,
                outputLevel: 0.62, polyphonyLimit: 64, oscillatorCount: 3,
                hasTransient: false, hasTremolo: false,
                attackSeconds: 0.008, decaySeconds: 0.42, sustainLevel: 0.22, releaseSeconds: 0.55,
                filterAttackHz: 2_100, filterPeakHz: 5_200, filterSustainHz: 2_100,
                filterQ: 0.7, filterDecaySeconds: 0.45
            ),
            .electricPiano: JazzSyntheticInstrumentMetadata(
                algorithmID: "changes.audio.fm-electric-piano@1", topology: .fmPair,
                outputLevel: 0.48, polyphonyLimit: 48, oscillatorCount: 1,
                hasTransient: false, hasTremolo: false,
                attackSeconds: 0.003, decaySeconds: 0.85, sustainLevel: 0.14, releaseSeconds: 0.9,
                filterAttackHz: 4_200, filterPeakHz: 9_000, filterSustainHz: 4_200,
                filterQ: 0.5, filterDecaySeconds: 0.6
            ),
            .vibraphone: JazzSyntheticInstrumentMetadata(
                algorithmID: "changes.audio.vibraphone@1", topology: .additive,
                outputLevel: 0.5, polyphonyLimit: 48, oscillatorCount: 2,
                hasTransient: true, hasTremolo: true,
                attackSeconds: 0.002, decaySeconds: 1.4, sustainLevel: 0.45, releaseSeconds: 1.1,
                filterAttackHz: 7_000, filterPeakHz: 12_000, filterSustainHz: 7_000,
                filterQ: 0.3, filterDecaySeconds: 0.25
            ),
            .warmPad: JazzSyntheticInstrumentMetadata(
                algorithmID: "changes.audio.warm-pad@1", topology: .additive,
                outputLevel: 0.3, polyphonyLimit: 32, oscillatorCount: 3,
                hasTransient: false, hasTremolo: false,
                attackSeconds: 0.32, decaySeconds: 1.2, sustainLevel: 0.72, releaseSeconds: 1.8,
                filterAttackHz: 900, filterPeakHz: 2_800, filterSustainHz: 1_600,
                filterQ: 0.8, filterDecaySeconds: 1.4
            ),
            .analogPoly: JazzSyntheticInstrumentMetadata(
                algorithmID: "changes.audio.analog-poly@1", topology: .additive,
                outputLevel: 0.34, polyphonyLimit: 48, oscillatorCount: 3,
                hasTransient: false, hasTremolo: false,
                attackSeconds: 0.012, decaySeconds: 0.3, sustainLevel: 0.52, releaseSeconds: 0.65,
                filterAttackHz: 700, filterPeakHz: 4_800, filterSustainHz: 1_300,
                filterQ: 4.2, filterDecaySeconds: 0.32
            ),
            .organ: JazzSyntheticInstrumentMetadata(
                algorithmID: "changes.audio.organ@1", topology: .additive,
                outputLevel: 0.44, polyphonyLimit: 48, oscillatorCount: 5,
                hasTransient: false, hasTremolo: true,
                attackSeconds: 0.012, decaySeconds: 0.08, sustainLevel: 0.92, releaseSeconds: 0.14,
                filterAttackHz: 7_500, filterPeakHz: 9_500, filterSustainHz: 7_500,
                filterQ: 0.4, filterDecaySeconds: 0.1
            )
        ]
        XCTAssertEqual(Set(expected.keys), Set(InstrumentTone.allCases.filter {
            JazzSyntheticInstrumentRenderer.metadata(for: $0) != nil
        }))
        for (tone, metadata) in expected {
            XCTAssertEqual(JazzSyntheticInstrumentRenderer.metadata(for: tone), metadata, tone.displayName)
            XCTAssertEqual(tone.nativeAudioSourceNote, "Original Web Audio recipe, rendered natively")
        }
        for tone in InstrumentTone.allCases where expected[tone] == nil {
            XCTAssertNil(JazzSyntheticInstrumentRenderer.metadata(for: tone), tone.displayName)
        }
    }

    func testSyntheticRecipePCMIsFiniteDeterministicAndTopologyDistinctWithoutAudioOutput() throws {
        let tones: [InstrumentTone] = [.mellowKeys, .electricPiano, .vibraphone, .warmPad, .analogPoly, .organ]
        var fingerprints = Set<[UInt32]>()
        for tone in tones {
            let first = try XCTUnwrap(JazzSyntheticInstrumentRenderer.render(
                tone: tone, midi: 60, midiVelocity: 96, normalizationGain: 1,
                sampleRate: 24_000, duration: 0.4
            ))
            let second = try XCTUnwrap(JazzSyntheticInstrumentRenderer.render(
                tone: tone, midi: 60, midiVelocity: 96, normalizationGain: 1,
                sampleRate: 24_000, duration: 0.4
            ))
            XCTAssertEqual(first.algorithmID, "changes.audio.\(tone.originalID)@1")
            XCTAssertEqual(first.samples, second.samples, tone.displayName)
            XCTAssertEqual(first.samples.count, 9_600, tone.displayName)
            XCTAssertTrue(first.samples.allSatisfy(\.isFinite), tone.displayName)
            XCTAssertTrue(first.samples.contains { abs($0) > 0.0001 }, tone.displayName)
            let fingerprint = stride(from: 101, to: first.samples.count, by: 311)
                .map { first.samples[$0].bitPattern }
            XCTAssertTrue(fingerprints.insert(fingerprint).inserted, tone.displayName)
        }
        XCTAssertNil(JazzSyntheticInstrumentRenderer.render(
            tone: .concertGrand, midi: 60, midiVelocity: 96, normalizationGain: 1,
            sampleRate: 24_000, duration: 0.4
        ))

        let quietFM = try XCTUnwrap(JazzSyntheticInstrumentRenderer.render(
            tone: .electricPiano, midi: 60, midiVelocity: 24, normalizationGain: 1,
            sampleRate: 24_000, duration: 0.4
        ))
        let loudFM = try XCTUnwrap(JazzSyntheticInstrumentRenderer.render(
            tone: .electricPiano, midi: 60, midiVelocity: 120, normalizationGain: 1,
            sampleRate: 24_000, duration: 0.4
        ))
        XCTAssertNotEqual(quietFM.samples, loudFM.samples, "FM index and amplitude must follow MIDI velocity, not post-mix gain.")
    }

    func testSelectedVoicingPreviewRendersSimultaneouslyWithoutAudioOutput() throws {
        for tone in InstrumentTone.allCases {
            let rendered = try XCTUnwrap(JazzAudioRenderer.renderPreviewChord(
                midis: [60, 64, 67, 71], tone: tone, duration: 0.18
            ), tone.displayName)
            XCTAssertEqual(rendered.left.count, rendered.right.count, tone.displayName)
            XCTAssertTrue(rendered.left.allSatisfy(\.isFinite), tone.displayName)
            XCTAssertTrue(rendered.right.allSatisfy(\.isFinite), tone.displayName)
            XCTAssertTrue(rendered.left.contains { abs($0) > 0.0001 }, tone.displayName)
        }
        XCTAssertNil(JazzAudioRenderer.renderPreviewChord(midis: [], tone: .mellowKeys))
        XCTAssertNil(JazzAudioRenderer.renderPreviewChord(midis: [20, 60], tone: .mellowKeys))
        XCTAssertNil(JazzAudioRenderer.renderPreviewChord(midis: Array(48...58), tone: .mellowKeys))
    }

    func testPianoTouchLayoutPrefersBlackKeysAndSupportsGlideHitTesting() {
        let layout = JazzPianoTouchLayout(
            whitePitches: [60, 62, 64, 65, 67],
            blackPitches: [61, 63, 66],
            whiteWidth: 46,
            whiteSpacing: 1,
            blackTouchWidth: 44
        )
        XCTAssertEqual(layout.midi(at: CGPoint(x: 23, y: 80)), 60)
        XCTAssertEqual(layout.midi(at: CGPoint(x: 46.5, y: 20)), 61, "A black key owns its overlapping upper hit region.")
        XCTAssertEqual(layout.midi(at: CGPoint(x: 70, y: 80)), 62)
        XCTAssertEqual(layout.midi(at: CGPoint(x: 93.5, y: 20)), 63)
        XCTAssertNil(layout.midi(at: CGPoint(x: -1, y: 20)))
        XCTAssertNil(layout.midi(at: CGPoint(x: 23, y: 97)))
    }

    func testKeyboardVoiceDeltaNeverRetriggersHeldFingers() {
        let chord = JazzAudioEngine.keyboardVoiceDelta(
            previous: [60],
            next: [60, 64, 67]
        )
        XCTAssertEqual(chord.added, [64, 67])
        XCTAssertEqual(chord.retained, [60])
        XCTAssertEqual(chord.removed, [])

        let glide = JazzAudioEngine.keyboardVoiceDelta(
            previous: [60, 64, 67],
            next: [62, 64, 67]
        )
        XCTAssertEqual(glide.added, [62])
        XCTAssertEqual(glide.retained, [64, 67])
        XCTAssertEqual(glide.removed, [60])
    }

    func testOriginalPlayableWindowsFoldWithoutMutatingInstrumentIdentity() throws {
        let expected: [InstrumentTone: ClosedRange<Int>] = [
            .mellowKeys: 21...108,
            .electricPiano: 21...108,
            .vibraphone: 53...89,
            .warmPad: 21...108,
            .analogPoly: 21...108,
            .concertGrand: 21...108,
            .flute: 60...72,
            .organ: 21...108,
            .guitar: 40...88,
            .uprightBass: 28...67,
            .concertVibes: 53...89,
            .bluesGuitar: 40...88,
            .clarinet: 50...82,
            .dreadnoughtGuitar: 40...88,
            .ukulele: 60...93
        ]
        XCTAssertEqual(Set(expected.keys), Set(InstrumentTone.allCases))
        for tone in InstrumentTone.allCases {
            let range = try XCTUnwrap(expected[tone])
            XCTAssertEqual(tone.originalPlayableMIDIRange, range, tone.displayName)
            for midi in 21...108 {
                let rendered = tone.renderedMIDIPitch(for: midi)
                XCTAssertTrue(range.contains(rendered), "\(tone.displayName) failed to fold MIDI \(midi)")
                XCTAssertEqual(abs(rendered - midi) % 12, 0, tone.displayName)
            }
        }
    }

    func testSampledInstrumentMetadataAndNearestKeyLawMatchOriginal() throws {
        let bass = JazzSampledInstrumentRenderer.uprightBassMetadata
        XCTAssertEqual(bass.algorithmID, "changes.dsp.sampled-upright-bass@1")
        XCTAssertEqual(bass.payloadSHA256, "d39c685343bd49c4c424f74eabdca501161ae94a9a14d8acdba6e604f496f5a9")
        XCTAssertEqual(bass.payloadByteLength, 815_638)
        XCTAssertEqual(bass.payloadRate, 22_050)
        XCTAssertEqual(bass.bufferCacheLimit, 64)
        XCTAssertEqual(bass.slices.count, 12)

        let vibes = JazzSampledInstrumentRenderer.concertVibesMetadata
        XCTAssertEqual(vibes.algorithmID, "changes.dsp.sampled-vibraphone@1")
        XCTAssertEqual(vibes.payloadSHA256, "a7f01856ffcf58271613fd2ee42b342877f0cfb7d30595137724fa2fa1b752cc")
        XCTAssertEqual(vibes.payloadByteLength, 1_267_200)
        XCTAssertEqual(vibes.payloadRate, 32_000)
        XCTAssertEqual(vibes.bufferCacheLimit, 64)
        XCTAssertEqual(vibes.slices.count, 11)

        XCTAssertEqual(
            JazzSampledInstrumentRenderer.sourceSlice(for: .uprightBass, midi: 35)?.midiPitch,
            36,
            "An equidistant request must choose the higher recorded key."
        )
        XCTAssertEqual(JazzSampledInstrumentRenderer.sourceSlice(for: .uprightBass, midi: 24)?.midiPitch, 36)
        XCTAssertEqual(JazzSampledInstrumentRenderer.sourceSlice(for: .concertVibes, midi: 96)?.midiPitch, 84)
    }

    func testSampledInstrumentPCMMatchesIndependentWebOracleWithoutAudioOutput() throws {
        struct Oracle {
            var tone: InstrumentTone
            var algorithmID: String
            var sourceMIDIPitch: Int
            var peak: Double
            var rms: Double
            var checkpoints: [(Int, Float)]
        }
        let oracles = [
            Oracle(
                tone: .uprightBass,
                algorithmID: "changes.dsp.sampled-upright-bass@1",
                sourceMIDIPitch: 59,
                peak: 0.9850844144821167,
                rms: 0.38609690634633415,
                checkpoints: [(17, 0.00007105961), (101, -0.042112716), (511, -0.045711324), (1023, 0.33253255), (2047, -0.33121836), (3839, 0)]
            ),
            Oracle(
                tone: .concertVibes,
                algorithmID: "changes.dsp.sampled-vibraphone@1",
                sourceMIDIPitch: 60,
                peak: 0.9946050643920898,
                rms: 0.38129253434478094,
                checkpoints: [(17, -0.00011248945), (101, -0.0029222681), (511, 0.047904827), (1023, 0.04242526), (2047, 0.11046351), (3839, 0)]
            )
        ]

        for oracle in oracles {
            let rendered = try XCTUnwrap(
                JazzSampledInstrumentRenderer.render(
                    tone: oracle.tone,
                    midi: 60,
                    velocity: 96,
                    sampleRate: 24_000,
                    maximumSeconds: 0.16
                ),
                oracle.tone.displayName
            )
            XCTAssertEqual(rendered.algorithmID, oracle.algorithmID)
            XCTAssertEqual(rendered.requestedMIDIPitch, 60)
            XCTAssertEqual(rendered.renderedMIDIPitch, 60)
            XCTAssertEqual(rendered.sourceMIDIPitch, oracle.sourceMIDIPitch)
            XCTAssertEqual(rendered.samples.count, 3_840)
            XCTAssertTrue(rendered.samples.allSatisfy(\.isFinite))
            let peak = rendered.samples.map { abs(Double($0)) }.max() ?? 0
            let rms = sqrt(rendered.samples.reduce(0) { $0 + Double($1) * Double($1) } / Double(rendered.samples.count))
            XCTAssertEqual(peak, oracle.peak, accuracy: 0.000_01)
            XCTAssertEqual(rms, oracle.rms, accuracy: 0.000_01)
            for (index, expected) in oracle.checkpoints {
                XCTAssertEqual(rendered.samples[index], expected, accuracy: 0.000_01, "\(oracle.tone.displayName) frame \(index)")
            }
            XCTAssertEqual(rendered.samples.last, 0, "The raised-cosine truncation guard must end at zero.")
        }
    }

    func testSampledRendererCacheIsPerInstrumentLRUAndBoundedWithoutAudioOutput() throws {
        JazzSampledInstrumentRenderer.resetCacheForTesting()

        let first = try XCTUnwrap(
            JazzSampledInstrumentRenderer.render(
                tone: .uprightBass,
                midi: 60,
                velocity: 96,
                sampleRate: 8_000,
                maximumSeconds: 0.01
            )
        )
        let repeated = try XCTUnwrap(
            JazzSampledInstrumentRenderer.render(
                tone: .uprightBass,
                midi: 60,
                velocity: 24,
                sampleRate: 8_000,
                maximumSeconds: 0.01
            )
        )
        XCTAssertEqual(first.samples, repeated.samples, "Velocity belongs at voice gain and must share PCM.")
        XCTAssertEqual(
            JazzSampledInstrumentRenderer.cacheSnapshot(for: .uprightBass),
            JazzSampledCacheSnapshot(entryCount: 1, hitCount: 1, missCount: 1, evictionCount: 0)
        )

        _ = try XCTUnwrap(
            JazzSampledInstrumentRenderer.render(
                tone: .concertVibes,
                midi: 60,
                velocity: 96,
                sampleRate: 8_000,
                maximumSeconds: 0.01
            )
        )
        for frameCeiling in 81...144 {
            _ = try XCTUnwrap(
                JazzSampledInstrumentRenderer.render(
                    tone: .uprightBass,
                    midi: 60,
                    velocity: 96,
                    sampleRate: 8_000,
                    maximumSeconds: Double(frameCeiling) / 8_000
                )
            )
        }

        XCTAssertEqual(
            JazzSampledInstrumentRenderer.cacheSnapshot(for: .uprightBass),
            JazzSampledCacheSnapshot(entryCount: 64, hitCount: 1, missCount: 65, evictionCount: 1)
        )
        XCTAssertEqual(
            JazzSampledInstrumentRenderer.cacheSnapshot(for: .concertVibes),
            JazzSampledCacheSnapshot(entryCount: 1, hitCount: 0, missCount: 1, evictionCount: 0),
            "Pressure in one recipe must not evict another instrument's PCM."
        )
    }

    func testPhysicalInstrumentMetadataMatchesOriginalRecipeContract() throws {
        let expected: [(InstrumentTone, String, Double, Int, Double, Int?)] = [
            (.concertGrand, "changes.dsp.concert-grand@1", 8, 96, 0.3, nil),
            (.flute, "changes.dsp.waveguide-flute@2", 5, 64, 2.8, nil),
            (.guitar, "changes.dsp.plucked-archtop@2", 6, 64, 0.5, 0),
            (.bluesGuitar, "changes.dsp.plucked-electric@2", 6, 64, 0.46, 1),
            (.clarinet, "changes.dsp.waveguide-clarinet@1", 5, 128, 1.1, nil),
            (.dreadnoughtGuitar, "changes.dsp.plucked-dreadnought@1", 5, 64, 0.5, 2),
            (.ukulele, "changes.dsp.plucked-ukulele@1", 3, 64, 0.65, 3)
        ]
        for (tone, algorithm, maximumSeconds, cacheLimit, outputLevel, packIndex) in expected {
            let metadata = try XCTUnwrap(JazzPhysicalInstrumentRenderer.metadata(for: tone), tone.displayName)
            XCTAssertEqual(metadata.algorithmID, algorithm)
            XCTAssertEqual(metadata.maximumRenderSeconds, maximumSeconds)
            XCTAssertEqual(metadata.bufferCacheLimit, cacheLimit)
            XCTAssertEqual(metadata.outputLevel, outputLevel)
            XCTAssertEqual(metadata.packIndex.map(Int.init), packIndex)
        }
        XCTAssertNil(JazzPhysicalInstrumentRenderer.metadata(for: .mellowKeys))
        XCTAssertNil(JazzPhysicalInstrumentRenderer.metadata(for: .uprightBass))
        XCTAssertNil(JazzPhysicalInstrumentRenderer.metadata(for: .concertVibes))
    }

    func testPhysicalInstrumentPCMMatchesOriginalWebRendererWithoutAudioOutput() throws {
        struct Oracle {
            var tone: InstrumentTone
            var peak: Double
            var rms: Double
            var checkpoints: [Float]
        }
        let oracles = [
            Oracle(tone: .concertGrand, peak: 0.51139605, rms: 0.23397876, checkpoints: [0.13247535, 0.3801051, -0.09048364, 0.33112088, 0.22011156, -0.24113809]),
            Oracle(tone: .flute, peak: 0.00731089, rms: 0.00168315, checkpoints: [0, 0, -0.00011881, 0.00047502, 0.00239247, 0.00000249]),
            Oracle(tone: .guitar, peak: 0.31474185, rms: 0.11777734, checkpoints: [-0.17600192, -0.29870582, -0.01587303, -0.14124712, 0.15688771, -0.00011896]),
            Oracle(tone: .bluesGuitar, peak: 0.28499281, rms: 0.11327524, checkpoints: [0.17948247, -0.22237934, -0.05282186, 0.11182754, -0.05755475, -0.00049102]),
            Oracle(tone: .clarinet, peak: 0.80418330, rms: 0.21990502, checkpoints: [0.00019390, -0.00627828, 0.05914050, -0.09812076, 0.27508476, -0.00000084]),
            Oracle(tone: .dreadnoughtGuitar, peak: 0.29836378, rms: 0.10737738, checkpoints: [-0.07627976, -0.25140291, -0.01606975, -0.11777935, 0.03135712, -0.00025631]),
            Oracle(tone: .ukulele, peak: 0.30346236, rms: 0.06647430, checkpoints: [-0.00247413, -0.22076225, -0.03507708, -0.01694006, 0.05712122, 0.00009684])
        ]
        let checkpointFrames = [17, 101, 511, 1_023, 2_047, 3_839]

        for oracle in oracles {
            let rendered = try XCTUnwrap(JazzPhysicalInstrumentRenderer.render(
                tone: oracle.tone,
                midi: 60,
                velocity: 96,
                sampleRate: 24_000,
                maximumSeconds: 0.16
            ), oracle.tone.displayName)
            XCTAssertEqual(rendered.left.count, 3_840, oracle.tone.displayName)
            XCTAssertEqual(rendered.left.count, rendered.right.count, oracle.tone.displayName)
            XCTAssertTrue(rendered.left.allSatisfy(\.isFinite), oracle.tone.displayName)
            XCTAssertTrue(rendered.right.allSatisfy(\.isFinite), oracle.tone.displayName)
            let peak = rendered.left.map { abs(Double($0)) }.max() ?? 0
            let rms = sqrt(rendered.left.reduce(0) { $0 + Double($1) * Double($1) } / Double(rendered.left.count))
            XCTAssertEqual(peak, oracle.peak, accuracy: 0.000_1, oracle.tone.displayName)
            XCTAssertEqual(rms, oracle.rms, accuracy: 0.000_1, oracle.tone.displayName)
            for (frame, expected) in zip(checkpointFrames, oracle.checkpoints) {
                XCTAssertEqual(rendered.left[frame], expected, accuracy: 0.000_1, "\(oracle.tone.displayName) frame \(frame)")
            }
        }
    }

    func testConcertGrandAttackLayerMatchesOriginalHybridWebRendererWithoutAudioOutput() throws {
        XCTAssertTrue(JazzPianoAttackLayer.isAvailable)
        let slice = try XCTUnwrap(JazzPianoAttackLayer.slice(for: 60, velocity: 96))
        XCTAssertEqual(slice.midiPitch, 60)
        XCTAssertEqual(slice.velocityBucket, 2)
        XCTAssertEqual(slice.sourceLayer, 14)
        XCTAssertEqual(slice.sourceChannel, 0)
        XCTAssertEqual(slice.tuningCents, -2)
        XCTAssertEqual(slice.byteOffset, 1_023_120)
        XCTAssertEqual(slice.frameCount, 17_640)

        let rendered = try XCTUnwrap(JazzPhysicalInstrumentRenderer.render(
            tone: .concertGrand,
            midi: 60,
            velocity: 96,
            sampleRate: 24_000,
            maximumSeconds: 0.4
        ))
        XCTAssertEqual(rendered.left.count, 9_600)
        let peak = rendered.left.map { abs(Double($0)) }.max() ?? 0
        let rms = sqrt(rendered.left.reduce(0) { $0 + Double($1) * Double($1) } / Double(rendered.left.count))
        XCTAssertEqual(peak, 0.71340579, accuracy: 0.000_1)
        XCTAssertEqual(rms, 0.18713286, accuracy: 0.000_1)
        let checkpoints: [(Int, Float)] = [
            (17, -0.00017832),
            (101, 0.01417949),
            (511, 0.10324643),
            (1_023, 0.33996013),
            (2_047, -0.23960657),
            (3_839, -0.16459367),
            (4_319, 0.22851957),
            (5_759, -0.25027356),
            (7_679, -0.19341671),
            (9_599, -0.14667712)
        ]
        for (frame, expected) in checkpoints {
            XCTAssertEqual(rendered.left[frame], expected, accuracy: 0.000_1, "Concert Grand frame \(frame)")
        }
    }

    func testPhysicalPluckedChordUsesOneBodyAndCourseBoundWithoutAudioOutput() throws {
        let sixCourse = try XCTUnwrap(JazzPhysicalInstrumentRenderer.renderChord(
            tone: .guitar,
            midis: [48, 52, 55, 59, 62, 65, 69],
            velocity: 96,
            sampleRate: 24_000,
            maximumSeconds: 0.08
        ))
        XCTAssertEqual(sixCourse.algorithmID, "changes.dsp.plucked-archtop@2")
        XCTAssertEqual(sixCourse.renderedMIDIPitches.count, 6)
        XCTAssertEqual(sixCourse.renderedMIDIPitches, [48, 52, 55, 59, 62, 65])
        XCTAssertEqual(sixCourse.left.count, 1_920)
        XCTAssertTrue(sixCourse.left.contains { abs($0) > 0.0001 })

        let fourCourse = try XCTUnwrap(JazzPhysicalInstrumentRenderer.renderChord(
            tone: .ukulele,
            midis: [60, 64, 67, 71, 74],
            velocity: 96,
            sampleRate: 24_000,
            maximumSeconds: 0.08
        ))
        XCTAssertEqual(fourCourse.algorithmID, "changes.dsp.plucked-ukulele@1")
        XCTAssertEqual(fourCourse.renderedMIDIPitches, [60, 64, 67, 71])
        XCTAssertEqual(fourCourse.left.count, fourCourse.right.count)
        XCTAssertTrue(fourCourse.left.allSatisfy(\.isFinite))
    }

    func testCooperativePluckedChordIsBitExactWithOriginalMonolithicABIWithoutAudioOutput() throws {
        JazzPhysicalInstrumentRenderer.resetCacheForTesting()
        let renderedMIDIs = [48, 52, 55, 59, 62, 65]
        let midi32 = renderedMIDIs.map(Int32.init)
        let velocity32 = [Int32](repeating: 96, count: renderedMIDIs.count)
        let sampleRate = 24_000.0
        let frameCount = 1_920
        var directLeft = [Float](repeating: 0, count: frameCount)
        var directRight = [Float](repeating: 0, count: frameCount)
        let written = midi32.withUnsafeBufferPointer { midiBuffer in
            velocity32.withUnsafeBufferPointer { velocityBuffer in
                directLeft.withUnsafeMutableBufferPointer { leftBuffer in
                    directRight.withUnsafeMutableBufferPointer { rightBuffer in
                        Int(plk2_render_chord(
                            0,
                            midiBuffer.baseAddress,
                            velocityBuffer.baseAddress,
                            Int32(renderedMIDIs.count),
                            Float(sampleRate),
                            leftBuffer.baseAddress,
                            rightBuffer.baseAddress,
                            Int32(frameCount)
                        ))
                    }
                }
            }
        }
        XCTAssertEqual(written, frameCount)

        // Match the renderer's established raised-cosine truncation guard.
        let fadeFrames = Int(round(0.015 * sampleRate))
        for index in 0..<fadeFrames {
            let gain = Float(fadeFrames - index) / Float(fadeFrames)
            let frame = frameCount - fadeFrames + index
            directLeft[frame] *= gain
            directRight[frame] *= gain
        }

        let cooperative = try XCTUnwrap(JazzPhysicalInstrumentRenderer.renderChord(
            tone: .guitar,
            midis: renderedMIDIs,
            velocity: 96,
            sampleRate: sampleRate,
            maximumSeconds: Double(frameCount) / sampleRate
        ))
        XCTAssertEqual(cooperative.left, directLeft)
        XCTAssertEqual(cooperative.right, directRight)
    }

    func testCancellationInterruptsLiveConcertGrandRuntimeAndLeavesNoCacheEntry() async throws {
        JazzPhysicalInstrumentRenderer.resetCacheForTesting()
        let cancellation = JazzRenderCancellationToken()
        let renderTask = Task.detached {
            JazzPhysicalInstrumentRenderer.render(
                tone: .concertGrand,
                midi: 60,
                velocity: 96,
                sampleRate: 96_000,
                maximumSeconds: 8,
                cancellation: cancellation
            )
        }
        let enteredRuntime = await Task.detached {
            cancellation.waitForCooperativeStep(timeout: 5)
        }.value
        XCTAssertTrue(enteredRuntime, "The test must observe a completed Rust quantum before cancelling.")
        cancellation.cancel()
        let cancelledRender = await renderTask.value
        XCTAssertNil(cancelledRender)
        XCTAssertGreaterThan(cancellation.cooperativeStepCount, 0)
        XCTAssertEqual(
            JazzPhysicalInstrumentRenderer.cacheSnapshot(for: .concertGrand),
            JazzPhysicalCacheSnapshot(entryCount: 0, hitCount: 0, missCount: 1, evictionCount: 0)
        )

        XCTAssertNotNil(JazzPhysicalInstrumentRenderer.render(
            tone: .concertGrand,
            midi: 60,
            velocity: 96,
            sampleRate: 24_000,
            maximumSeconds: 0.04
        ), "Cancellation must reset the opaque Rust runtime for the next render.")
    }

    func testCancellationInterruptsLivePluckedChordRuntimeAndLeavesNoCacheEntry() async throws {
        JazzPhysicalInstrumentRenderer.resetCacheForTesting()
        let cancellation = JazzRenderCancellationToken()
        let renderTask = Task.detached {
            JazzPhysicalInstrumentRenderer.renderChord(
                tone: .guitar,
                midis: [48, 52, 55, 59, 62, 65],
                velocity: 96,
                sampleRate: 24_000,
                maximumSeconds: 6,
                cancellation: cancellation
            )
        }
        let enteredRuntime = await Task.detached {
            cancellation.waitForCooperativeRuntimeEntry(timeout: 5)
        }.value
        XCTAssertTrue(enteredRuntime, "The test must observe a live Rust chord handle before cancelling.")
        cancellation.cancel()
        let cancelledRender = await renderTask.value
        XCTAssertNil(cancelledRender)
        XCTAssertGreaterThan(cancellation.cooperativeRuntimeEntryCount, 0)
        XCTAssertEqual(
            JazzPhysicalInstrumentRenderer.cacheSnapshot(for: .guitar),
            JazzPhysicalCacheSnapshot(entryCount: 0, hitCount: 0, missCount: 1, evictionCount: 0)
        )

        let recoveryMIDIs = [Int32(48), 52, 55]
        let recoveryVelocities = [Int32](repeating: 96, count: recoveryMIDIs.count)
        let recoveryHandle = recoveryMIDIs.withUnsafeBufferPointer { midiBuffer in
            recoveryVelocities.withUnsafeBufferPointer { velocityBuffer in
                plk2_chord_runtime_init(
                    0,
                    midiBuffer.baseAddress,
                    velocityBuffer.baseAddress,
                    Int32(recoveryMIDIs.count),
                    24_000,
                    1
                )
            }
        }
        XCTAssertGreaterThan(recoveryHandle, 0, "Cancellation must release the opaque runtime for the next render.")
        XCTAssertEqual(plk2_chord_runtime_reset(recoveryHandle), 1)
    }

    func testPhysicalRendererCacheIsPerInstrumentAndVelocityAwareWithoutAudioOutput() throws {
        JazzPhysicalInstrumentRenderer.resetCacheForTesting()
        let first = try XCTUnwrap(JazzPhysicalInstrumentRenderer.render(
            tone: .guitar, midi: 60, velocity: 96, sampleRate: 8_000, maximumSeconds: 0.01
        ))
        let repeated = try XCTUnwrap(JazzPhysicalInstrumentRenderer.render(
            tone: .guitar, midi: 60, velocity: 96, sampleRate: 8_000, maximumSeconds: 0.01
        ))
        let differentVelocity = try XCTUnwrap(JazzPhysicalInstrumentRenderer.render(
            tone: .guitar, midi: 60, velocity: 64, sampleRate: 8_000, maximumSeconds: 0.01
        ))
        XCTAssertEqual(first.left, repeated.left)
        XCTAssertNotEqual(first.left, differentVelocity.left, "Physical excitation velocity belongs in the PCM cache key.")
        XCTAssertEqual(
            JazzPhysicalInstrumentRenderer.cacheSnapshot(for: .guitar),
            JazzPhysicalCacheSnapshot(entryCount: 2, hitCount: 1, missCount: 2, evictionCount: 0)
        )

        _ = try XCTUnwrap(JazzPhysicalInstrumentRenderer.render(
            tone: .clarinet, midi: 60, velocity: 96, sampleRate: 8_000, maximumSeconds: 0.01
        ))
        XCTAssertEqual(
            JazzPhysicalInstrumentRenderer.cacheSnapshot(for: .clarinet),
            JazzPhysicalCacheSnapshot(entryCount: 1, hitCount: 0, missCount: 1, evictionCount: 0)
        )
        XCTAssertEqual(
            JazzPhysicalInstrumentRenderer.globalCacheSnapshot(),
            JazzPhysicalGlobalCacheSnapshot(entryCount: 3, pcmByteCount: 1_920)
        )
        XCTAssertEqual(JazzPhysicalInstrumentRenderer.maximumGlobalCacheEntries, 256)
        XCTAssertEqual(JazzPhysicalInstrumentRenderer.maximumGlobalCachePCMBytes, 100_663_296)
    }

    func testMIDIExportUsesTheSelectedInstrumentProgram() throws {
        let parsed = try JazzTheory.parseChart("| Cmaj7 |")
        var chart = JazzChart(title: "Programs", measures: parsed.measures)
        for tone in InstrumentTone.allCases {
            chart.instrument = tone
            XCTAssertEqual(programChange(in: MIDIFileWriter.makeFile(chart: chart)), tone.midiProgram, tone.displayName)
        }
    }

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
        chart.playbackMix = JazzPlaybackMix(masterVolume: 0.65, reverbAmount: 0.35)
        chart.measures[0].chords[0].frozenMIDIPitches = [46, 53, 57, 60, 64]
        chart.updatedAt = Date(timeIntervalSince1970: 1_788_130_000)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(JazzChart.self, from: encoder.encode(chart))
        XCTAssertEqual(decoded, chart)
        XCTAssertEqual(decoded.effectivePlaybackMix, JazzPlaybackMix(masterVolume: 0.65, reverbAmount: 0.35))

        var invalid = chart
        invalid.playbackMix?.reverbAmount = 1.01
        XCTAssertThrowsError(try JazzDocumentValidator.validate(invalid)) { error in
            XCTAssertEqual(error as? JazzDocumentValidationIssue, .playbackMix)
        }
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
        XCTAssertNil(chart.playbackMix)
        XCTAssertEqual(chart.effectivePlaybackMix, .originalDefault)
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

    private func programChange(in data: Data) -> UInt8? {
        let bytes = [UInt8](data)
        guard bytes.count >= 22 else { return nil }
        var index = 22

        func skipVariableLength() -> Bool {
            for _ in 0..<4 {
                guard index < bytes.count else { return false }
                let byte = bytes[index]
                index += 1
                if byte & 0x80 == 0 { return true }
            }
            return false
        }

        while index < bytes.count {
            guard skipVariableLength(), index < bytes.count else { return nil }
            let status = bytes[index]
            index += 1
            switch status {
            case 0xC0:
                guard index < bytes.count else { return nil }
                return bytes[index]
            case 0x90, 0x80:
                index += min(2, bytes.count - index)
            case 0xFF:
                guard index < bytes.count else { return nil }
                index += 1
                guard skipVariableLength() else { return nil }
                // MIDIFileWriter emits only the fixed three-byte tempo meta
                // before its program change, so this helper can skip it.
                index += min(3, bytes.count - index)
            default:
                return nil
            }
        }
        return nil
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

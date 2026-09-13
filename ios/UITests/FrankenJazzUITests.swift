import XCTest

final class FrankenJazzUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing-reset"]
        app.launch()
    }

    private func revealAboveTransport(_ element: XCUIElement, maximumSwipes: Int = 10) {
        let transport = app.buttons["transport-play-pause"]
        for _ in 0..<maximumSwipes {
            guard !element.isHittable || element.frame.maxY >= transport.frame.minY - 8 else { return }
            app.swipeUp()
        }
    }

    func testRealPlaybackAndChordInspectorPath() throws {
        let play = app.buttons["Play"]
        XCTAssertTrue(play.waitForExistence(timeout: 3))
        play.tap()
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 8), "The real local renderer should reach playback.")
        app.buttons["Pause"].tap()

        let firstChord = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'" )).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 2))
        firstChord.tap()
        XCTAssertTrue(app.staticTexts["04 · HARMONY LENS"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Cmaj9"].exists)
        XCTAssertTrue(app.staticTexts["Tonic family"].exists)
    }

    func testInspectorDiscoversSourceOwnedContinuationOptions() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        let lab = app.descendants(matching: .any)["continuation-lab"]
        for _ in 0..<6 where !lab.isHittable { app.swipeUp() }
        XCTAssertTrue(lab.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["G2 · BOUNDED"].exists)
        XCTAssertTrue(app.buttons["Use for next change"].firstMatch.exists)
        let preview = app.buttons["preview-continuation-1"]
        XCTAssertTrue(preview.exists)
        XCTAssertTrue(preview.isHittable)
        XCTAssertTrue(preview.label.hasPrefix("Hear "))
        let previewedSymbol = String(preview.label.dropFirst("Hear ".count))
        XCTAssertFalse(previewedSymbol.isEmpty)
        XCTAssertTrue(app.staticTexts[previewedSymbol].exists)
        XCTAssertGreaterThanOrEqual(preview.frame.height, 44)

        // Do not tap Hear: this lane proves the audible choice is discoverable
        // and hittable while keeping automated Simulator runs silent.
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz G2 continuation engine"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testAppearanceTogglePersistsLightModeAcrossLaunches() throws {
        let toggle = app.buttons["appearance-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 3))

        if toggle.label == "Switch to dark mode" {
            toggle.tap()
            XCTAssertEqual(toggle.label, "Switch to light mode")
        }

        toggle.tap()
        XCTAssertEqual(toggle.label, "Switch to dark mode")

        let lightProof = XCTAttachment(screenshot: app.screenshot())
        lightProof.name = "FrankenJazz light appearance"
        lightProof.lifetime = .keepAlways
        add(lightProof)

        app.terminate()
        app.launch()

        let relaunchedToggle = app.buttons["appearance-toggle"]
        XCTAssertTrue(relaunchedToggle.waitForExistence(timeout: 3))
        XCTAssertEqual(relaunchedToggle.label, "Switch to dark mode")
    }

    func testInstrumentRackExposesEveryOriginalSoundAndSelectsWithoutAuditioning() throws {
        let route = app.buttons["open-instrument-rack"]
        XCTAssertTrue(route.waitForExistence(timeout: 3))
        XCTAssertTrue(route.isHittable)
        XCTAssertGreaterThanOrEqual(route.frame.height, 44)
        route.tap()

        XCTAssertTrue(app.navigationBars["Instrument rack"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["15 INSTRUMENTS"].exists)
        let rack = app.scrollViews["instrument-rack-scroll"]
        XCTAssertTrue(rack.waitForExistence(timeout: 3))
        // The pure catalog test exhaustively proves all 15 identities and their
        // grouping. Here, exercise the two ends of the lazily rendered rack so
        // XCTest does not mistake an off-screen SwiftUI card for a missing one.
        let firstName = app.staticTexts["Mellow Keys"]
        let firstHear = app.buttons["instrument-hear-mellow-keys"]
        XCTAssertTrue(firstName.isHittable)
        XCTAssertTrue(firstHear.isHittable)
        XCTAssertGreaterThanOrEqual(firstHear.frame.height, 44)
        // Deliberately do not tap Hear: Simulator verification stays silent.

        let lastName = app.staticTexts["Re-entrant Ukulele"]
        for _ in 0..<12 where !lastName.isHittable { rack.swipeUp() }
        XCTAssertTrue(lastName.exists, "The complete original catalog must reach Re-entrant Ukulele.")
        XCTAssertTrue(lastName.isHittable)
        let lastHear = app.buttons["instrument-hear-ukulele"]
        XCTAssertTrue(lastHear.isHittable)
        XCTAssertGreaterThanOrEqual(lastHear.frame.height, 44)

        let chooseUkulele = app.buttons["instrument-select-ukulele"]
        XCTAssertTrue(chooseUkulele.isHittable)
        XCTAssertGreaterThanOrEqual(chooseUkulele.frame.height, 44)
        chooseUkulele.tap()
        XCTAssertEqual(chooseUkulele.label, "Re-entrant Ukulele, selected")

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz complete original instrument rack"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testChordPadsExposeTheWholeStarterChartWithoutAuditioning() throws {
        let route = app.buttons["open-chord-pads"]
        XCTAssertTrue(route.waitForExistence(timeout: 3))
        XCTAssertTrue(route.isHittable)
        XCTAssertGreaterThanOrEqual(route.frame.height, 44)
        route.tap()

        XCTAssertTrue(app.navigationBars["Chord pads"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["12 PADS"].exists)
        let scroll = app.scrollViews["chord-pads-scroll"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 3))
        let first = app.buttons["chord-pad-0"]
        XCTAssertTrue(first.waitForExistence(timeout: 3))
        XCTAssertTrue(first.isHittable)
        XCTAssertGreaterThanOrEqual(first.frame.height, 44)
        XCTAssertTrue(first.label.contains("Cmaj9"))

        let last = app.buttons["chord-pad-11"]
        for _ in 0..<10 where !last.isHittable { scroll.swipeUp() }
        XCTAssertTrue(last.exists)
        XCTAssertTrue(last.isHittable)
        XCTAssertGreaterThanOrEqual(last.frame.height, 44)
        XCTAssertTrue(last.label.contains("C6"))
        XCTAssertTrue(app.buttons["stop-chord-pad-audition"].exists)

        // The pad actions are intentionally not tapped in automated UI runs.
        // Their pure preview plan and renderer are covered without sound in
        // the core suite; this path proves the complete touch surface.
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz exact full-chart chord pads"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testTouchUndoAndRedoRoundTripAChartEdit() throws {
        let undo = app.buttons["undo-chart-change"]
        let redo = app.buttons["redo-chart-change"]
        let transposeUp = app.buttons["transpose-chart-up"]
        let firstChange = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1,'")
        ).firstMatch

        for control in [undo, redo, transposeUp, firstChange] {
            XCTAssertTrue(control.waitForExistence(timeout: 3))
        }
        XCTAssertFalse(undo.isEnabled)
        XCTAssertFalse(redo.isEnabled)
        XCTAssertTrue(transposeUp.isHittable)

        let originalLabel = firstChange.label
        transposeUp.tap()
        expectation(
            for: NSPredicate(format: "label != %@", originalLabel),
            evaluatedWith: firstChange
        )
        waitForExpectations(timeout: 3)
        let transposedLabel = firstChange.label
        XCTAssertTrue(undo.isEnabled)

        undo.tap()
        expectation(
            for: NSPredicate(format: "label == %@", originalLabel),
            evaluatedWith: firstChange
        )
        waitForExpectations(timeout: 3)
        XCTAssertTrue(redo.isEnabled)

        redo.tap()
        expectation(
            for: NSPredicate(format: "label == %@", transposedLabel),
            evaluatedWith: firstChange
        )
        waitForExpectations(timeout: 3)

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz touch undo and redo"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testChordPaletteBuildsARealUndoableBarWithoutPlayingAudio() throws {
        let toggle = app.buttons["quick-entry-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 3))
        revealAboveTransport(toggle)
        XCTAssertTrue(toggle.isHittable)
        toggle.tap()

        let root = app.buttons["chord-palette-root-d-flat"]
        let quality = app.buttons["chord-palette-quality-m7b5"]
        XCTAssertTrue(root.waitForExistence(timeout: 3))
        revealAboveTransport(root)
        XCTAssertTrue(root.isHittable)
        XCTAssertGreaterThanOrEqual(root.frame.width, 44)
        XCTAssertGreaterThanOrEqual(root.frame.height, 44)
        root.tap()
        expectation(for: NSPredicate(format: "value == 'Selected'"), evaluatedWith: root)
        waitForExpectations(timeout: 2)

        XCTAssertTrue(quality.waitForExistence(timeout: 3))
        revealAboveTransport(quality)
        XCTAssertTrue(quality.isHittable)
        XCTAssertGreaterThanOrEqual(quality.frame.width, 44)
        XCTAssertGreaterThanOrEqual(quality.frame.height, 44)
        XCTAssertEqual(quality.label, "Add Dbm7b5 as a new bar")
        quality.tap()

        let added = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 9, Dbm7b5'")
        ).firstMatch
        XCTAssertTrue(added.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["undo-chart-change"].isEnabled)

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz original chord palette parity"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testNamedSectionsAreVisibleEditableAndArmOnlyTheirOwnLoop() throws {
        app.terminate()
        app.launchArguments.append("-ui-testing-sections")
        app.launch()

        let sectionA = app.buttons["Loop section A"]
        let sectionB = app.buttons["Loop section B"]
        XCTAssertTrue(sectionA.waitForExistence(timeout: 3))
        XCTAssertTrue(sectionB.waitForExistence(timeout: 3))
        revealAboveTransport(sectionB)
        XCTAssertGreaterThanOrEqual(sectionB.frame.width, 44)
        XCTAssertGreaterThanOrEqual(sectionB.frame.height, 44)
        sectionB.tap()
        XCTAssertEqual(sectionB.value as? String, "On")
        XCTAssertEqual(app.buttons["transport-loop"].value as? String, "Off")
        XCTAssertTrue(app.textFields.matching(NSPredicate(format: "value == 'Head'")).firstMatch.exists)
        XCTAssertTrue(app.textFields.matching(NSPredicate(format: "value == 'B'")).firstMatch.exists)

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz named section practice loop"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testNamedSectionTransposeChangesOnlyThatSectionWithoutPlayingAudio() throws {
        app.terminate()
        app.launchArguments.append("-ui-testing-sections")
        app.launch()

        let transpose = app.buttons["Transpose section B"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 3))
        revealAboveTransport(transpose)
        XCTAssertTrue(transpose.isHittable)
        XCTAssertGreaterThanOrEqual(transpose.frame.width, 44)
        XCTAssertGreaterThanOrEqual(transpose.frame.height, 44)
        transpose.tap()

        let up = app.buttons["Up one semitone"]
        XCTAssertTrue(up.waitForExistence(timeout: 2))
        up.tap()

        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj7'")
        ).firstMatch.exists)
        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 3, G#7'")
        ).firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts[
            "Transposed section B up 1 semitone."
        ].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["undo-chart-change"].isEnabled)

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz section-scoped transpose"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testLeadSheetCreatesAndRemovesNamedSectionsWithoutChartSyntax() throws {
        let barThreeActions = app.buttons["Actions for bar 3"]
        XCTAssertTrue(barThreeActions.waitForExistence(timeout: 3))
        revealAboveTransport(barThreeActions)
        XCTAssertTrue(barThreeActions.isHittable)
        XCTAssertGreaterThanOrEqual(barThreeActions.frame.width, 44)
        XCTAssertGreaterThanOrEqual(barThreeActions.frame.height, 44)
        barThreeActions.tap()

        let startSection = app.buttons["Start section here"]
        XCTAssertTrue(startSection.waitForExistence(timeout: 2))
        startSection.tap()

        let sectionA = app.textFields.matching(NSPredicate(format: "value == 'A'")).firstMatch
        let sectionB = app.textFields.matching(NSPredicate(format: "value == 'B'")).firstMatch
        XCTAssertTrue(sectionA.waitForExistence(timeout: 3))
        XCTAssertTrue(sectionB.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["undo-chart-change"].isEnabled)
        revealAboveTransport(sectionB)
        XCTAssertTrue(sectionB.isHittable)

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz touch-created named sections"
        proof.lifetime = .keepAlways
        add(proof)

        let boundaryActions = app.buttons["Actions for bar 3"]
        revealAboveTransport(boundaryActions)
        boundaryActions.tap()
        let removeSection = app.buttons["Remove section B"]
        XCTAssertTrue(removeSection.waitForExistence(timeout: 2))
        removeSection.tap()
        XCTAssertFalse(app.textFields.matching(NSPredicate(format: "value == 'B'")).firstMatch.exists)
        XCTAssertTrue(app.textFields.matching(NSPredicate(format: "value == 'A'")).firstMatch.exists)
    }

    func testCompactTransportExposesEveryEverydayControlWithoutPlayingAudio() throws {
        let previous = app.buttons["transport-previous-chord"]
        let playPause = app.buttons["transport-play-pause"]
        let stop = app.buttons["transport-stop"]
        let restart = app.buttons["transport-restart"]
        let next = app.buttons["transport-next-chord"]
        let focus = app.buttons["transport-focus"]
        let loop = app.buttons["transport-loop"]
        let mute = app.buttons["transport-mute"]
        let volume = app.sliders["transport-master-volume"]
        let reverb = app.sliders["transport-reverb-amount"]
        let countIn = app.buttons["transport-count-in"]
        let metronome = app.buttons["transport-metronome"]

        for control in [previous, playPause, stop, restart, next, focus, countIn, metronome, loop, mute] {
            XCTAssertTrue(control.waitForExistence(timeout: 3))
            XCTAssertTrue(app.windows.firstMatch.frame.intersects(control.frame))
        }
        XCTAssertTrue(volume.waitForExistence(timeout: 3))
        XCTAssertTrue(volume.isHittable)
        XCTAssertTrue(reverb.waitForExistence(timeout: 3))
        XCTAssertTrue(reverb.isHittable)

        XCTAssertEqual(countIn.value as? String, "Off")
        countIn.tap()
        XCTAssertEqual(countIn.value as? String, "On")

        XCTAssertEqual(metronome.value as? String, "Off")
        metronome.tap()
        XCTAssertEqual(metronome.value as? String, "On")

        // These state-only gestures exercise the real transport controls but
        // cannot schedule audio. Next makes Previous legitimately actionable.
        XCTAssertTrue(next.isHittable)
        next.tap()
        XCTAssertTrue(previous.isEnabled)
        XCTAssertTrue(previous.isHittable)

        XCTAssertEqual(loop.value as? String, "Off")
        loop.tap()
        XCTAssertEqual(loop.value as? String, "On")

        XCTAssertEqual(mute.label, "Mute")
        mute.tap()
        XCTAssertEqual(mute.label, "Unmute")

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz complete compact transport"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testFocusPlayAlongIsGlanceableAndDiscoverableWithoutPlayingAudio() throws {
        let focus = app.buttons["transport-focus"]
        let appearance = app.buttons["appearance-toggle"]
        XCTAssertTrue(focus.waitForExistence(timeout: 3))
        XCTAssertTrue(appearance.waitForExistence(timeout: 3))
        let initialAppearance = appearance.label == "Switch to dark mode" ? "light" : "dark"
        XCTAssertTrue(focus.isHittable)
        XCTAssertGreaterThanOrEqual(focus.frame.width, 44)
        XCTAssertGreaterThanOrEqual(focus.frame.height, 44)
        focus.tap()

        let current = app.staticTexts["focus-current-chord"]
        let next = app.staticTexts["focus-next-chord"]
        let stop = app.buttons["focus-stop"]
        let playPause = app.buttons["focus-play-pause"]
        let exit = app.buttons["focus-exit"]
        for control in [current, next, stop, playPause, exit] {
            XCTAssertTrue(control.waitForExistence(timeout: 3))
            XCTAssertTrue(app.windows.firstMatch.frame.intersects(control.frame))
        }
        XCTAssertEqual(current.label, "Cmaj9")
        XCTAssertNotEqual(next.label, "")
        XCTAssertEqual(app.descendants(matching: .any)["focus-status"].label, "Ready")
        XCTAssertTrue(stop.isHittable)
        XCTAssertTrue(exit.isHittable)
        XCTAssertGreaterThanOrEqual(stop.frame.height, 44)
        XCTAssertGreaterThanOrEqual(exit.frame.height, 44)

        // No audio action is tapped. This proof covers discoverability, layout,
        // exact initial timeline projection, and escape controls only.
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz Focus play-along \(initialAppearance)"
        proof.lifetime = .keepAlways
        add(proof)

        exit.tap()
        XCTAssertTrue(focus.waitForExistence(timeout: 2))
        appearance.tap()
        focus.tap()
        XCTAssertTrue(current.waitForExistence(timeout: 2))
        XCTAssertTrue(stop.isHittable)
        XCTAssertTrue(exit.isHittable)

        let alternateAppearance = initialAppearance == "light" ? "dark" : "light"
        let alternateProof = XCTAttachment(screenshot: app.screenshot())
        alternateProof.name = "FrankenJazz Focus play-along \(alternateAppearance)"
        alternateProof.lifetime = .keepAlways
        add(alternateProof)
        exit.tap()
    }

    func testInspectorPianoExposesRealHittableKeysWithoutPlayingAudio() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        let instruction = app.staticTexts["Press, glide, or play several keys"]
        let middleC = app.buttons["piano-key-60"]
        let chordPreview = app.buttons["preview-selected-chord"]
        for _ in 0..<8 where !middleC.isHittable { app.swipeUp() }
        XCTAssertTrue(instruction.waitForExistence(timeout: 3))
        XCTAssertTrue(middleC.waitForExistence(timeout: 3))
        XCTAssertTrue(middleC.isHittable)
        XCTAssertGreaterThanOrEqual(middleC.frame.width, 44)
        XCTAssertGreaterThanOrEqual(middleC.frame.height, 44)
        XCTAssertTrue(middleC.label.contains("C4"))
        XCTAssertTrue(app.staticTexts["FM Electric Piano"].exists)
        XCTAssertTrue(chordPreview.exists)
        XCTAssertTrue(chordPreview.isHittable)
        XCTAssertEqual(chordPreview.label, "Hear this voicing")

        // Do not tap either audio action: automated validation must never emit audible output.
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz playable inspector piano"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testIPadExpandedWorkspaceExposesLibraryChartInspectorAndTransport() throws {
        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5))

        let libraryAction = app.buttons["New blank chart"]
        let title = app.textFields["Chart title"]
        let play = app.buttons["Play"]
        let documents = app.buttons["Document actions"]
        let harmony = app.buttons["Harmony"]

        for element in [libraryAction, title, play, documents] {
            XCTAssertTrue(element.waitForExistence(timeout: 5))
            XCTAssertTrue(element.isHittable, "Every primary expanded-workspace control must be visibly reachable.")
            XCTAssertTrue(
                window.frame.contains(element.frame),
                "\(element.identifier) at \(element.frame) must fit inside the app window at \(window.frame)."
            )
        }

        let workspaceProof = XCTAttachment(screenshot: app.screenshot())
        workspaceProof.name = "FrankenJazz iPad expanded workspace"
        workspaceProof.lifetime = .keepAlways
        add(workspaceProof)

        let inspectorHeading = app.staticTexts["04 · HARMONY LENS"]
        let inspectorEditor = app.textFields["Selected chord symbol"]
        if harmony.waitForExistence(timeout: 2) {
            XCTAssertTrue(harmony.isHittable)
            XCTAssertTrue(window.frame.contains(harmony.frame))
            harmony.tap()
        }
        XCTAssertTrue(inspectorHeading.waitForExistence(timeout: 5))
        XCTAssertTrue(inspectorEditor.waitForExistence(timeout: 5))
        XCTAssertTrue(inspectorEditor.isHittable)
        XCTAssertTrue(window.frame.contains(inspectorEditor.frame), "The presented inspector must remain inside the actual app window.")
        XCTAssertGreaterThan(inspectorEditor.frame.width, 140, "The inspector editor must not survive as a clipped sliver.")
        XCTAssertLessThanOrEqual(inspectorEditor.frame.maxX, window.frame.maxX - 16, "The inspector needs visible trailing breathing room.")

        let inspectorProof = XCTAttachment(screenshot: app.screenshot())
        inspectorProof.name = "FrankenJazz iPad harmony inspector"
        inspectorProof.lifetime = .keepAlways
        add(inspectorProof)
    }

    func testLibraryLoadsThroughTheRealDocumentPath() throws {
        app.buttons["Progression library"].tap()
        let entry = app.buttons.matching(NSPredicate(format: "label CONTAINS 'ii–V–I in C'" )).firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 3))
        entry.tap()
        let chartTitle = app.textFields["Chart title"]
        XCTAssertTrue(chartTitle.waitForExistence(timeout: 3))
        XCTAssertEqual(chartTitle.value as? String, "ii–V–I in C")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Dm7'" )).firstMatch.exists)
    }

    func testOwnerDirectedLibraryEntryIsSearchableAndLoadsCanonicalMetadata() throws {
        app.buttons["Progression library"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("Giant Steps")

        let entry = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Giant Steps'")).firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 3))
        entry.tap()

        let chartTitle = app.textFields["Chart title"]
        XCTAssertTrue(chartTitle.waitForExistence(timeout: 3))
        XCTAssertEqual(chartTitle.value as? String, "Giant Steps")
        XCTAssertEqual(app.textFields["Tempo"].value as? String, "290")
        XCTAssertTrue(app.buttons["Uptempo swing"].exists)
    }

    func testDocumentCenterExposesHonestMIDIImportBoundary() throws {
        let documentActions = app.buttons["Document actions"].firstMatch
        XCTAssertTrue(documentActions.waitForExistence(timeout: 3))
        documentActions.tap()

        XCTAssertTrue(app.buttons["Import a chart, text, or MIDI file"].waitForExistence(timeout: 3))
        let boundary = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'Common DAW retriggers'")
        ).firstMatch
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'exact Manual pitches'")
        ).firstMatch.exists)

        let performedMIDI = app.buttons["export-performed-midi"]
        for _ in 0..<8 where !performedMIDI.isHittable { app.swipeUp() }
        XCTAssertTrue(performedMIDI.waitForExistence(timeout: 3))
        XCTAssertTrue(performedMIDI.isHittable)
        XCTAssertGreaterThanOrEqual(performedMIDI.frame.height, 44)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'separate Bass and Comp tracks'")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'does not carry FrankenJazz instrument timbre'")
        ).firstMatch.exists)

        let prepareWave = app.buttons["prepare-dry-wave"]
        for _ in 0..<8 where !prepareWave.isHittable { app.swipeUp() }
        XCTAssertTrue(prepareWave.waitForExistence(timeout: 3))
        XCTAssertTrue(prepareWave.isHittable)
        XCTAssertGreaterThanOrEqual(prepareWave.frame.height, 44)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'deliberately dry'")
        ).firstMatch.exists)

        // Do not tap Prepare: the product path is an offline render, but this
        // UI lane remains a strict no-audio/no-render discoverability check.
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz dry performed WAV export"
        proof.lifetime = .keepAlways
        add(proof)
    }

    func testMyChartsKeepsSearchesAndExposesEverySnapshotAction() throws {
        let documentActions = app.buttons["Document actions"].firstMatch
        XCTAssertTrue(documentActions.waitForExistence(timeout: 3))
        documentActions.tap()

        let openMyCharts = app.buttons["open-my-charts"]
        XCTAssertTrue(openMyCharts.waitForExistence(timeout: 3))
        XCTAssertTrue(openMyCharts.isHittable)
        openMyCharts.tap()

        let keep = app.buttons["my-charts-keep-current"]
        XCTAssertTrue(keep.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["No charts are kept yet"].exists)
        keep.tap()
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'explicit snapshot'")
        ).firstMatch.waitForExistence(timeout: 3))

        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("Midnight")
        XCTAssertTrue(app.staticTexts["Midnight laboratory"].waitForExistence(timeout: 3))
        if app.keyboards.buttons["Search"].exists {
            app.keyboards.buttons["Search"].tap()
        }

        let duplicate = app.buttons["my-charts-duplicate-selected"]
        for _ in 0..<8 where !duplicate.isHittable { app.swipeUp() }
        XCTAssertTrue(duplicate.waitForExistence(timeout: 3))
        XCTAssertTrue(duplicate.isHittable)
        XCTAssertTrue(app.buttons["my-charts-open-selected"].exists)
        XCTAssertTrue(app.buttons["my-charts-export-selected"].exists)
        XCTAssertTrue(app.textFields["my-charts-rename-field"].exists)
        XCTAssertTrue(app.buttons["Replace with current chart…"].exists)
        XCTAssertTrue(app.buttons["Remove kept copy…"].exists)

        duplicate.tap()
        let actionMessage = app.staticTexts["my-charts-action-feedback"]
        XCTAssertTrue(actionMessage.waitForExistence(timeout: 3))

        let open = app.buttons["my-charts-open-selected"]
        for _ in 0..<4 where !open.isHittable { app.swipeUp() }
        open.tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.alerts.buttons["Open chart"].exists)
        XCTAssertTrue(app.alerts.buttons["Cancel"].exists)

        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = "FrankenJazz iPhone My Charts complete actions"
        proof.lifetime = .keepAlways
        add(proof)
        app.alerts.buttons["Cancel"].tap()

        let dismissFeedback = app.buttons["my-charts-dismiss-feedback"]
        XCTAssertTrue(dismissFeedback.waitForExistence(timeout: 3))
        dismissFeedback.tap()

        let backup = app.buttons["my-charts-export-backup"]
        for _ in 0..<10 where !backup.isHittable { app.swipeUp() }
        XCTAssertTrue(backup.waitForExistence(timeout: 3))
        XCTAssertTrue(backup.isHittable)
        let restore = app.buttons["my-charts-restore-backup"]
        for _ in 0..<4 where !restore.isHittable { app.swipeUp() }
        XCTAssertTrue(restore.exists)
        XCTAssertTrue(restore.isHittable)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'do not claim the web studio’s E0 interchange schema'")
        ).firstMatch.exists)

        let portableProof = XCTAttachment(screenshot: app.screenshot())
        portableProof.name = "FrankenJazz iPhone My Charts portable copies"
        portableProof.lifetime = .keepAlways
        add(portableProof)
    }

    func testChordInspectorExposesPersistedChordNoteEditor() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        XCTAssertTrue(app.staticTexts["05 · CHORD NOTE"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textViews["Note for Cmaj9"].exists)
        XCTAssertTrue(app.staticTexts[
            "Saved only in the private FrankenJazz document; text and MIDI exports omit chord notes."
        ].exists)
    }

    func testInspectorDirectEditingDuplicatesAChangeAndPreservesAccess() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        let symbol = app.textFields["Selected chord symbol"]
        XCTAssertTrue(symbol.waitForExistence(timeout: 3))
        symbol.tap()
        let originalSymbol = symbol.value as? String ?? ""
        symbol.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: originalSymbol.count))
        symbol.typeText("Dm7")
        app.buttons["Apply symbol"].tap()

        let updatedSymbol = app.textFields["Selected chord symbol"]
        XCTAssertTrue(updatedSymbol.waitForExistence(timeout: 3))
        XCTAssertEqual(updatedSymbol.value as? String, "Dm7")

        let moreActions = app.buttons["More change actions"]
        XCTAssertTrue(moreActions.waitForExistence(timeout: 3))
        moreActions.tap()
        let duplicate = app.buttons["Duplicate change"]
        XCTAssertTrue(duplicate.waitForExistence(timeout: 2))
        duplicate.tap()
        XCTAssertTrue(app.staticTexts["Duplicated Dm7 and split its beat slot."].waitForExistence(timeout: 3))
    }

    func testInspectorFreezesExactVoicingAndReturnsToAutomatic() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        let freeze = app.buttons["Freeze exact voicing"]
        for _ in 0..<4 where !freeze.isHittable { app.swipeUp() }
        XCTAssertTrue(freeze.waitForExistence(timeout: 3))
        freeze.tap()

        XCTAssertTrue(app.staticTexts["Frozen exact voicing"].waitForExistence(timeout: 3))
        let automatic = app.buttons["Use automatic Balanced"]
        XCTAssertTrue(automatic.waitForExistence(timeout: 3))
        automatic.tap()
        XCTAssertTrue(app.buttons["Freeze exact voicing"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Automatic · Balanced"].exists)
    }

    func testInspectorCreatesAndEditsManualExactVoicing() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        let editExact = app.buttons["Edit exact voicing"]
        for _ in 0..<4 where !editExact.isHittable { app.swipeUp() }
        XCTAssertTrue(editExact.waitForExistence(timeout: 3))
        editExact.tap()
        XCTAssertTrue(app.staticTexts["Manual exact voicing"].waitForExistence(timeout: 3))

        let firstVoice = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Edit voice 1,'")
        ).firstMatch
        XCTAssertTrue(firstVoice.waitForExistence(timeout: 3))
        firstVoice.tap()
        let raise = app.buttons["Up one semitone"]
        XCTAssertTrue(raise.waitForExistence(timeout: 2))
        raise.tap()
        XCTAssertTrue(app.staticTexts["Manual exact voicing"].exists)

        let automatic = app.buttons["Use automatic Balanced"]
        XCTAssertTrue(automatic.waitForExistence(timeout: 3))
        automatic.tap()
        XCTAssertTrue(app.staticTexts["Automatic · Balanced"].waitForExistence(timeout: 3))
    }
}

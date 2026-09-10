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
        let loop = app.buttons["transport-loop"]
        let mute = app.buttons["transport-mute"]
        let volume = app.sliders["transport-master-volume"]
        let countIn = app.buttons["transport-count-in"]
        let metronome = app.buttons["transport-metronome"]

        for control in [previous, playPause, stop, restart, next, countIn, metronome, loop, mute] {
            XCTAssertTrue(control.waitForExistence(timeout: 3))
            XCTAssertTrue(app.windows.firstMatch.frame.intersects(control.frame))
        }
        XCTAssertTrue(volume.waitForExistence(timeout: 3))
        XCTAssertTrue(volume.isHittable)

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

    func testInspectorPianoExposesRealHittableKeysWithoutPlayingAudio() throws {
        let firstChord = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Measure 1, Cmaj9'")
        ).firstMatch
        XCTAssertTrue(firstChord.waitForExistence(timeout: 3))
        firstChord.tap()

        let instruction = app.staticTexts["Tap any key to hear it"]
        let middleC = app.buttons["piano-key-60"]
        for _ in 0..<8 where !middleC.isHittable { app.swipeUp() }
        XCTAssertTrue(instruction.waitForExistence(timeout: 3))
        XCTAssertTrue(middleC.waitForExistence(timeout: 3))
        XCTAssertTrue(middleC.isHittable)
        XCTAssertGreaterThanOrEqual(middleC.frame.width, 44)
        XCTAssertGreaterThanOrEqual(middleC.frame.height, 44)
        XCTAssertTrue(middleC.label.contains("C4"))
        XCTAssertTrue(app.staticTexts["FM Electric Piano"].exists)

        // Do not tap: automated validation must never emit audible output.
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

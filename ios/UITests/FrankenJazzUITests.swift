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
            XCTAssertTrue(window.frame.contains(element.frame), "No primary expanded-workspace control may be clipped outside the actual app window.")
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

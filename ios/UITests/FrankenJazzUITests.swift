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

    func testDocumentCenterExposesHonestMIDIImportBoundary() throws {
        let documentActions = app.buttons["Document actions"].firstMatch
        XCTAssertTrue(documentActions.waitForExistence(timeout: 3))
        documentActions.tap()

        XCTAssertTrue(app.buttons["Import a chart, text, or MIDI file"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["MIDI chord stacks become editable 4/4 symbols. Files in another meter or with no nameable harmony are refused instead of guessed."].exists)
    }
}

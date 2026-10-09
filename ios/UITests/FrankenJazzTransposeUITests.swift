import XCTest
import UIKit

final class FrankenJazzTransposeUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing-reset"]
        app.launch()
    }

    private func revealEditorControl(_ element: XCUIElement) {
        let transport = app.buttons["transport-play-pause"]
        let navigation = app.navigationBars.firstMatch
        for _ in 0..<6 {
            let top = navigation.frame.maxY
            if element.isHittable && element.frame.minY >= top
                && element.frame.maxY < transport.frame.minY - 8 { return }
            let distance = element.frame.minY < top
                ? element.frame.minY - top - 24
                : element.frame.maxY - transport.frame.minY + 32
            let step = min(160, max(48, abs(distance))) * (distance < 0 ? -1 : 1)
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
            start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -step)))
        }
        XCTAssertTrue(element.isHittable)
        XCTAssertLessThan(element.frame.maxY, transport.frame.minY - 8)
    }

    private func firstStoredVoiceLabel() -> String {
        let voice = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Edit voice 1,'")).firstMatch
        for _ in 0..<4 where !voice.isHittable { app.swipeUp() }
        XCTAssertTrue(voice.waitForExistence(timeout: 3))
        XCTAssertTrue(voice.isHittable)
        return voice.label
    }

    private func capture(_ name: String) {
        let proof = XCTAttachment(screenshot: app.screenshot())
        proof.name = name
        proof.lifetime = .keepAlways
        add(proof)
    }

    private func captureBothAppearances() {
        let appearance = app.buttons["appearance-toggle"]
        let originalLabel = appearance.label
        capture("FrankenJazz transposition mode - original appearance")
        appearance.tap()
        XCTAssertNotEqual(appearance.label, originalLabel)
        capture("FrankenJazz transposition mode - alternate appearance")
        appearance.tap()
        XCTAssertEqual(appearance.label, originalLabel)
    }

    func testStoredNoteTransposeChoiceAndUndoWithoutPlayingAudio() throws {
        let chord = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Measure 1,'")).firstMatch
        XCTAssertTrue(chord.waitForExistence(timeout: 3))
        revealEditorControl(chord)
        chord.tap()
        let freeze = app.buttons["Freeze exact voicing"]
        for _ in 0..<4 where !freeze.isHittable { app.swipeUp() }
        XCTAssertTrue(freeze.isHittable)
        freeze.tap()
        let originalPitch = firstStoredVoiceLabel()
        app.buttons["Done"].tap()

        let mode = app.switches["transpose-stored-notes"]
        XCTAssertTrue(mode.waitForExistence(timeout: 3))
        XCTAssertTrue(mode.isHittable)
        XCTAssertEqual(mode.value as? String, "1")
        capture("FrankenJazz transposition mode - stored notes enabled")
        let originalChord = chord.label
        let transposeUp = app.buttons["transpose-chart-up"]
        revealEditorControl(transposeUp)
        transposeUp.tap()
        XCTAssertNotEqual(chord.label, originalChord)
        revealEditorControl(chord)
        chord.tap()
        XCTAssertNotEqual(firstStoredVoiceLabel(), originalPitch)
        app.buttons["Done"].tap()

        let undo = app.buttons["undo-chart-change"]
        revealEditorControl(undo)
        undo.tap()
        XCTAssertEqual(chord.label, originalChord)
        revealEditorControl(chord)
        chord.tap()
        XCTAssertEqual(firstStoredVoiceLabel(), originalPitch)
        app.buttons["Done"].tap()
        revealEditorControl(mode)
        mode.tap()
        XCTAssertEqual(mode.value as? String, "0")
        XCTAssertTrue(app.staticTexts["Symbols only: Manual and Frozen notes keep their saved pitches."].exists)
        revealEditorControl(transposeUp)
        transposeUp.tap()
        XCTAssertNotEqual(chord.label, originalChord)
        revealEditorControl(chord)
        chord.tap()
        XCTAssertEqual(firstStoredVoiceLabel(), originalPitch)
        app.buttons["Done"].tap()

        revealEditorControl(mode)
        captureBothAppearances()
    }
}

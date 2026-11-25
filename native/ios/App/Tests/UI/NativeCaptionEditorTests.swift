import XCTest

final class NativeCaptionEditorTests: XCTestCase {
    func testEditingKeepsDraftWhenCancelIsDismissedAndSavesCorrection() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication(); app.launchArguments = ["--native-caption-editor-fixture"]; app.launch()
        let open = app.buttons["caption.fixture.open"]; XCTAssertTrue(open.waitForExistence(timeout: 10)); open.tap()
        let editor = app.textViews["녹음 자막 수정"]; XCTAssertTrue(editor.waitForExistence(timeout: 10)); editor.tap()
        XCTAssertEqual(editor.value as? String ?? "", "", "An explicitly cleared correction must not fall back to the automatic original")
        editor.typeText("corrected answer")
        app.buttons["취소"].tap()
        let keepEditing = app.buttons["계속 수정"]; XCTAssertTrue(keepEditing.waitForExistence(timeout: 10)); keepEditing.tap()
        XCTAssertEqual(editor.value as? String, "corrected answer")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "native-caption-editor"; image.lifetime = .keepAlways; add(image)
        app.buttons["수정 저장"].tap()
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["caption.fixture.saved"].label, "corrected answer")
    }
}

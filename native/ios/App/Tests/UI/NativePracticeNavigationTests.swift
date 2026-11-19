import XCTest

final class NativePracticeNavigationTests: XCTestCase {
    func testBothModesPushNativePreparationAndReturnToList() {
        let app = XCUIApplication(); app.launchArguments = ["--native-practice-navigation-fixture"]; app.launch()
        for mode in ["job", "personality"] {
            let menu = app.buttons["native.menu.\(mode)"]; XCTAssertTrue(menu.waitForExistence(timeout: 10)); menu.tap()
            XCTAssertTrue(app.buttons["practice.back"].waitForExistence(timeout: 10))
            XCTAssertTrue(app.staticTexts["베타"].exists)
            XCTAssertTrue(app.buttons["practice.quick-start"].exists)
            XCTAssertTrue(app.buttons["practice.question-catalog"].exists)
            let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "native-\(mode)-preparation"; attachment.lifetime = .keepAlways; add(attachment)
            app.buttons["practice.back"].tap(); XCTAssertTrue(menu.waitForExistence(timeout: 10))
        }
    }
}

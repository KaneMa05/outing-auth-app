import XCTest

/// Explicit opt-in on an owner's already-authenticated physical test device.
/// Opens preparation only; never creates student recordings or requests analysis.
final class ProductionNativePracticeTests: XCTestCase {
    func testApprovedAccountOpensNativePreparation() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires an owner's authenticated physical test device")
        #else
        guard ProcessInfo.processInfo.environment["RONPARK_PRODUCTION_NATIVE_PREP_TEST"] == "1" else {
            throw XCTSkip("Production preparation smoke test requires explicit opt-in")
        }
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.buttons["모의면접"].waitForExistence(timeout: 35), "Approved test account must already be logged in")
        web.buttons["모의면접"].tap()
        for label in ["직무(전공) 연습모드", "인성 연습모드"] {
            let mode = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(mode.waitForExistence(timeout: 15)); mode.tap()
            XCTAssertTrue(app.buttons["practice.back"].waitForExistence(timeout: 25))
            XCTAssertTrue(app.staticTexts["베타"].exists)
            XCTAssertTrue(app.buttons["practice.quick-start"].exists)
            XCTAssertTrue(app.buttons["practice.question-catalog"].exists)
            let image = XCTAttachment(screenshot: app.screenshot())
            image.name = "production-native-\(label)-preparation"; image.lifetime = .keepAlways; add(image)
            app.buttons["practice.back"].tap(); XCTAssertTrue(mode.waitForExistence(timeout: 15))
        }
        #endif
    }
}

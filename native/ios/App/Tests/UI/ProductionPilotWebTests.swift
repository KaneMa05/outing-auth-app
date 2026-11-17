import XCTest

final class ProductionPilotWebTests: XCTestCase {
    func testApprovedAccountSeesReleasedWebPractice() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires owner's existing production test account login")
        #else
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 25))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 35), "Production test account must be logged in")
        mock.tap()
        let job = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "직무(전공) 연습모드")).firstMatch
        XCTAssertTrue(job.waitForExistence(timeout: 15)); job.tap()
        XCTAssertTrue(web.buttons["연습 시작"].waitForExistence(timeout: 25))
        XCTAssertFalse(web.buttons["바로 연습하기"].exists)
        let original = XCTAttachment(screenshot: app.screenshot()); original.name = "released-original-job-restored"; original.lifetime = .keepAlways; add(original)
        web.buttons["‹ 모의면접 목록"].tap()
        let menu = XCTAttachment(screenshot: app.screenshot()); menu.name = "released-separated-question-menu"; menu.lifetime = .keepAlways; add(menu)
        XCTAssertTrue(web.buttons["직무 질문별 연습"].waitForExistence(timeout: 15)); web.buttons["직무 질문별 연습"].tap()
        XCTAssertTrue(web.buttons["바로 연습하기"].waitForExistence(timeout: 25))
        web.buttons["질문 골라 연습"].tap()
        XCTAssertTrue(web.buttons["이 질문 연습하기"].firstMatch.waitForExistence(timeout: 15))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "released-pilot-question-catalog"; screenshot.lifetime = .keepAlways; add(screenshot)
        #endif
    }
    func testApprovedAccountSavesOneReleasedWebAnswer() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires owner's existing production test account login")
        #else
        continueAfterFailure = false
        addUIInterruptionMonitor(withDescription: "Microphone") { alert in
            for title in ["허용", "Allow", "확인", "OK"] where alert.buttons[title].exists { alert.buttons[title].tap(); return true }
            return false
        }
        let app = XCUIApplication(); app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.buttons["모의면접"].waitForExistence(timeout: 30)); web.buttons["모의면접"].tap()
        let job = web.buttons["직무 질문별 연습"]
        XCTAssertTrue(job.waitForExistence(timeout: 15)); job.tap()
        XCTAssertTrue(web.buttons["질문 골라 연습"].waitForExistence(timeout: 25)); web.buttons["질문 골라 연습"].tap()
        XCTAssertTrue(web.buttons["이 질문 연습하기"].firstMatch.waitForExistence(timeout: 15)); web.buttons["이 질문 연습하기"].firstMatch.tap(); app.tap()
        let allow = app.alerts.buttons["허용"]
        if allow.waitForExistence(timeout: 8) { allow.tap() }
        print(app.debugDescription)
        let start = XCTAttachment(screenshot: app.screenshot()); start.name = "released-web-recording-start"; start.lifetime = .keepAlways; add(start)
        let answer = web.buttons["답변 완료 →"]
        if !web.staticTexts["면접 결과"].exists {
        XCTAssertTrue(answer.waitForExistence(timeout: 35))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: answer)], timeout: 35), .completed)
        Thread.sleep(forTimeInterval: 1.2)
        if answer.exists && answer.isEnabled { answer.tap() }
        }
        XCTAssertTrue(web.staticTexts["면접 결과"].waitForExistence(timeout: 25))
        Thread.sleep(forTimeInterval: 12)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "released-pilot-saved-answer"; screenshot.lifetime = .keepAlways; add(screenshot)
        #endif
    }

}

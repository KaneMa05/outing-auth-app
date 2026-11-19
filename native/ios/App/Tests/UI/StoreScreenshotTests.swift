import XCTest

final class StoreScreenshotTests: XCTestCase {
    func testCaptureStudentHome() throws {
        let env = ProcessInfo.processInfo.environment
        guard let account = env["REVIEW_STUDENT_ID"],
              let password = env["REVIEW_STUDENT_PASSWORD"] else {
            throw XCTSkip("Store capture requires explicitly authorized cloud credentials")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--store-screenshots", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launchEnvironment["REVIEW_STUDENT_ID"] = account
        app.launchEnvironment["REVIEW_STUDENT_PASSWORD"] = password
        app.launchEnvironment["REVIEW_SCREENSHOT_DEVICE_TOKEN"] = env["REVIEW_SCREENSHOT_DEVICE_TOKEN"]
        app.launch()
        defer {
            let evidence = XCTAttachment(screenshot: app.screenshot())
            evidence.name = "store-student-screen"
            evidence.lifetime = .keepAlways
            add(evidence)
        }
        let login = app.webViews.textFields["예: 18004"]
        XCTAssertTrue(login.waitForExistence(timeout: 60), "Student login must load")
        let loggedIn = NSPredicate(format: "exists == false")
        expectation(for: loggedIn, evaluatedWith: login)
        waitForExpectations(timeout: 60)
        // Allow asynchronous home data and images to finish rendering.
        Thread.sleep(forTimeInterval: 8)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "store-student-home"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

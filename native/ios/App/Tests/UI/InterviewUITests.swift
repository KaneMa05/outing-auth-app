import XCTest
import UIKit

final class StudentWebUITests: XCTestCase {
    private func matchesLoginBackground(_ image: UIImage, x: CGFloat, y: CGFloat) -> Bool {
        guard let cg = image.cgImage, let space = CGColorSpace(name: CGColorSpace.sRGB) else { return false }
        var pixel = [UInt8](repeating: 0, count: 4)
        pixel.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
                                          bytesPerRow: 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
            context.translateBy(x: -(x * image.scale), y: -(CGFloat(cg.height) - y * image.scale - 1))
            context.draw(cg, in: CGRect(x: 0, y: 0, width: CGFloat(cg.width), height: CGFloat(cg.height)))
        }
        return abs(Int(pixel[0]) - 5) <= 5 && abs(Int(pixel[1]) - 15) <= 5 && abs(Int(pixel[2]) - 28) <= 5
    }
    func testInterviewLoginColorsBothNativeSafeAreas() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-login-preview", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.webViews.buttons["카카오 로그인하기"].waitForExistence(timeout: 60))
        let colored = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let image = app.screenshot().image
            return self.matchesLoginBackground(image, x: 10, y: 10) &&
                self.matchesLoginBackground(image, x: 10, y: image.size.height - 10)
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [colored], timeout: 20), .completed,
                       "The native top and bottom safe areas must match #050f1c without white bands")
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "08-interview-login-safe-areas"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testInstalledAppShowsStudentLoginWithoutInstallGate() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.webViews.textFields["예: 18004"].waitForExistence(timeout: 60),
                      "Installed iOS app must show student login, not the browser install gate")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "07-student-login"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

final class InterviewUITests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["interview.start"].waitForExistence(timeout: 15))
    }
    private func tap(_ id: String) {
        let button = app.buttons[id]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Missing native control: \(id)")
        for _ in 0..<5 { if button.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(button.isHittable, "Offscreen native control: \(id)"); button.tap()
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testNativeQuestionFollowupAndRecordFlow() {
        XCTAssertEqual(app.webViews.count, 0, "Interview preview must render native views")
        capture("01-preparation")
        tap("interview.start")
        XCTAssertTrue(app.staticTexts["협업 중 의견 차이를 해결한 경험을 말씀해주세요."].waitForExistence(timeout: 5))
        capture("02-interview")
        tap("interview.answer")
        XCTAssertTrue(app.staticTexts["그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?"].waitForExistence(timeout: 5))
        capture("03-followup")
        tap("interview.answer"); tap("interview.answer")
        XCTAssertTrue(app.staticTexts["완료한 답변 3개"].waitForExistence(timeout: 5))
        capture("04-result")
        app.segmentedControls.buttons["질문별 기록"].tap()
        XCTAssertTrue(app.staticTexts["2 · 꼬리 질문"].waitForExistence(timeout: 5))
        capture("05-records")
    }
    func testExitCanBeCancelledAndBackgroundEndsInterview() {
        tap("interview.start"); tap("interview.end")
        XCTAssertTrue(app.buttons["계속 면접하기"].waitForExistence(timeout: 5))
        app.buttons["계속 면접하기"].tap()
        XCTAssertTrue(app.buttons["interview.answer"].exists)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["완료한 답변 0개"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["interview.answer"].exists)
        capture("06-background-ended")
    }
}

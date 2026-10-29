import XCTest

final class StudentWebUITests: XCTestCase {
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
        app.launchArguments = ["--interview-native-preview", "--interview-legacy-fixture", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
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
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5))
        app.activate()
        XCTAssertTrue(app.staticTexts["완료한 답변 0개"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["interview.answer"].exists)
        capture("06-background-ended")
    }
}

final class InterviewPracticeUITests: XCTestCase {
    func testPhysicalCameraStartsDuringFirstQuestion() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Camera startup requires the connected physical iPhone")
        #else
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.personality"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.personality"].tap()
        // No device-check tap: the camera must start with the first question.
        app.buttons["interview.start"].tap()
        XCTAssertTrue(app.staticTexts["practice.start-countdown"].exists)
        XCTAssertFalse(app.buttons["practice.replay"].isEnabled)
        let camera = app.descendants(matching: .any)["practice.live-camera"].firstMatch
        let ready = expectation(for: NSPredicate(format: "value == %@", "camera-ready"), evaluatedWith: camera)
        wait(for: [ready], timeout: 3)
        let questionStarted = expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.buttons["practice.replay"])
        wait(for: [questionStarted], timeout: 5)
        XCTAssertEqual(camera.value as? String, "camera-ready")
        XCTAssertFalse(app.buttons["interview.answer"].isEnabled, "Preview must be ready while the question is playing")
        let avatar = app.descendants(matching: .any)["practice.avatar"].firstMatch
        XCTAssertTrue(avatar.exists)
        XCTAssertEqual(avatar.frame.width, camera.frame.width, accuracy: 1, "Interviewer and camera must use equal widths")
        XCTAssertEqual(avatar.frame.maxX, camera.frame.minX, accuracy: 1, "Video panes must touch without a gap")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "physical-avatar-and-camera"; attachment.lifetime = .keepAlways; add(attachment)
        app.terminate()
        #endif
    }

    func testEndingDuringCountdownCancelsFirstQuestion() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.personality"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.personality"].tap()
        app.buttons["interview.start"].tap()
        XCTAssertTrue(app.staticTexts["practice.start-countdown"].exists)
        app.buttons["interview.end"].tap()
        app.buttons["종료하고 기록 보기"].tap()
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["practice.replay"].exists)
        XCTAssertFalse(app.buttons["내 답변 듣기"].exists)
    }

    func testPhysicalCameraSurvivesPreparationTransition() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Camera continuity requires the connected physical iPhone")
        #else
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.personality"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.personality"].tap()
        let prep = app.descendants(matching: .any)["practice.prep-camera"].firstMatch
        XCTAssertEqual(prep.value as? String, "camera-pending", "Camera stays off until explicitly requested")
        app.buttons["practice.media"].tap()
        let prepared = expectation(for: NSPredicate(format: "value == %@", "camera-ready"), evaluatedWith: prep)
        wait(for: [prepared], timeout: 3)
        app.buttons["interview.start"].tap()
        let live = app.descendants(matching: .any)["practice.live-camera"].firstMatch
        // Predicate expectations poll at one-second intervals. Read the current
        // value directly once the new host exists to check continuity, not polling latency.
        XCTAssertTrue(live.waitForExistence(timeout: 2))
        XCTAssertEqual(live.value as? String, "camera-ready")
        app.terminate()
        #endif
    }

    func testQuestionPlaybackRecordsAnAnswerAndSurvivesRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.personality"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.personality"].tap()
        app.buttons["interview.start"].tap()
        if app.alerts.firstMatch.waitForExistence(timeout: 3) {
            let allow = app.alerts.buttons["허용"]
            if allow.exists { allow.tap() }
        }
        let answer = app.buttons["interview.answer"]
        XCTAssertTrue(answer.waitForExistence(timeout: 10))
        let avatar = app.descendants(matching: .any)["practice.avatar"].firstMatch
        XCTAssertTrue(avatar.exists)
        let assignedAvatar = avatar.value as? String
        XCTAssertTrue(["interviewer-man-1.mp4", "interviewer-woman.mp4", "interviewer-man-2.mp4"].contains(assignedAvatar ?? ""))
        let enabled = expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: answer)
        wait(for: [enabled], timeout: 75)
        let liveCapture = XCTAttachment(screenshot: app.screenshot())
        liveCapture.name = "camera-stage-and-voice-bars"; liveCapture.lifetime = .keepAlways; add(liveCapture)
        // Record actual simulator microphone PCM, allowing its file to contain measurable audio.
        let recordingStarted = Date()
        let recorded = expectation(for: NSPredicate { _, _ in Date().timeIntervalSince(recordingStarted) >= 1 }, evaluatedWith: nil)
        wait(for: [recorded], timeout: 4)
        answer.tap()
        XCTAssertEqual(avatar.value as? String, assignedAvatar, "The interviewer must stay assigned across questions")
        app.buttons["interview.end"].tap()
        app.buttons["종료하고 기록 보기"].tap()
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["내 답변 듣기"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["내 답변 듣기"].firstMatch.tap()
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["practice.records"].waitForExistence(timeout: 15))
        app.buttons["practice.records"].tap()
        XCTAssertTrue(app.buttons["기록 보기"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["기록 보기"].firstMatch.tap()
        XCTAssertTrue(app.buttons["내 답변 듣기"].firstMatch.waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "android-parity-local-recording"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testPhysicalPracticeVideoIsSavedAndReplayed() throws {
        continueAfterFailure = false
        #if targetEnvironment(simulator)
        throw XCTSkip("Video capture requires a physical iPhone")
        #else
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.personality"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.personality"].tap()
        app.switches["practice.video-toggle"].tap()
        app.buttons["interview.start"].tap()
        XCTAssertTrue(app.staticTexts["녹화 중"].firstMatch.waitForExistence(timeout: 25))
        let answer = app.buttons["interview.answer"]
        let ready = expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: answer)
        wait(for: [ready], timeout: 75)
        app.buttons["interview.end"].tap()
        app.buttons["종료하고 기록 보기"].tap()
        let video = app.buttons["practice.video-play"]
        XCTAssertTrue(video.waitForExistence(timeout: 20))
        video.tap()
        XCTAssertTrue(app.navigationBars["면접 영상"].waitForExistence(timeout: 10))
        app.buttons["닫기"].tap()
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["practice.records"].waitForExistence(timeout: 15))
        app.buttons["practice.records"].tap()
        app.buttons["기록 보기"].firstMatch.tap()
        XCTAssertTrue(app.buttons["practice.video-play"].waitForExistence(timeout: 10))
        #endif
    }
    func testPracticeMenuAndTrackSelectionUseBundledQuestions() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.job"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.job"].tap()
        XCTAssertTrue(app.staticTexts["면접 준비"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["practice.media"].exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        app.buttons["practice.track"].tap()
        app.buttons["practice.track.항해"].tap()
        XCTAssertTrue(app.buttons["practice.track"].label.contains("항해"))
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "android-parity-preparation"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["돌아가기"].tap()
        app.buttons["practice.mode.personality"].tap()
        XCTAssertTrue(app.buttons["interview.start"].waitForExistence(timeout: 5))
        app.buttons["practice.records"].tap()
        XCTAssertTrue(app.staticTexts["내 면접 기록"].waitForExistence(timeout: 5))
    }
}

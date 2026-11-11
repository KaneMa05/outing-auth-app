import XCTest

final class StudentWebUITests: XCTestCase {
    func testPreparationCameraMatchesLiveCameraAspectRatio() {
        let app = XCUIApplication()
        app.launchArguments = ["--web-camera-layout-fixture", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.webViews.staticTexts["준비·면접 카메라 비율 일치"].waitForExistence(timeout: 45))
        XCTAssertFalse(app.webViews.staticTexts["카메라 비율 불일치"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "matching-preparation-camera"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.terminate()
    }
    func testWebMediaPermissionAllowsCaptureOnlyAfterConfirmation() {
        let app = XCUIApplication()
        app.launchArguments = ["--web-media-permission-fixture", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        let alert = app.alerts["‘론박스터디 앱’에서 마이크를 사용하도록 허용할까요?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 45))
        alert.buttons["허용"].tap()
        let systemAlert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if systemAlert.waitForExistence(timeout: 3) {
            if systemAlert.buttons["허용"].exists { systemAlert.buttons["허용"].tap() }
            else if systemAlert.buttons["확인"].exists { systemAlert.buttons["확인"].tap() }
        }
        XCTAssertTrue(app.webViews.staticTexts["웹 마이크 권한 허용 확인"].waitForExistence(timeout: 10))
        app.terminate()
    }
    func testWebMediaPermissionUsesAppNameAndRespectsDenial() {
        let app = XCUIApplication()
        app.launchArguments = ["--web-media-permission-fixture", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        let alert = app.alerts["‘론박스터디 앱’에서 마이크를 사용하도록 허용할까요?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 45))
        XCTAssertTrue(alert.buttons["허용"].exists)
        XCTAssertTrue(alert.buttons["허용 안 함"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "branded-web-microphone-permission"; screenshot.lifetime = .keepAlways; add(screenshot)
        alert.buttons["허용 안 함"].tap()
        XCTAssertTrue(app.webViews.staticTexts["웹 마이크 권한 거부 확인"].waitForExistence(timeout: 10))
        app.terminate()
    }
    func testInstalledAppShowsStudentLoginWithoutInstallGate() {
        let app = XCUIApplication()
        // The screenshot entry uses the same student page as Release. The default
        // Debug entry intentionally opens the interview portal instead.
        app.launchArguments = ["--store-screenshots", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.webViews.textFields["예: 18004"].waitForExistence(timeout: 60),
                      "Installed iOS app must show student login, not the browser install gate")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "07-student-login"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    func testDebugAppShowsInterviewPortalLogin() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.webViews.buttons["카카오 로그인하기"].waitForExistence(timeout: 60),
                      "Debug interview app must open the interview portal login")
    }
}

final class InterviewUITests: XCTestCase {
    func testPCPreparationCombinesMediaAndHasNoFeedbackOptIn() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--portal-practice-ai-fixture"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.camera-mic-test"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["practice.camera-test"].exists)
        XCTAssertFalse(app.buttons["practice.media"].exists)
        XCTAssertFalse(app.switches["practice.ai-feedback"].exists)
        XCTAssertFalse(app.staticTexts["켜면 답변 음성을 전송해 분석합니다."].exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
    }
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
    func testStartFailureStaysOnPreparationWithNotice() {
        app.terminate()
        app.launchArguments.append("--interview-start-failure-fixture")
        app.launch()
        tap("interview.start")
        XCTAssertTrue(app.staticTexts["interview.notice"].label.contains("현재 면접 연결이 많습니다"))
        XCTAssertTrue(app.buttons["interview.start"].exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        XCTAssertEqual(app.staticTexts["interview.remaining"].label, "테스트앱 · 이용 횟수 제한 없음")
        XCTAssertFalse(app.buttons["다시 연습하기"].exists)
        XCTAssertFalse(app.staticTexts["내 답변을 돌아보고,\n다음 연습을 준비해요."].exists)
        capture("startup-failure-preparation")
    }
    func testNativeQuestionFollowupAndRecordFlow() {
        XCTAssertEqual(app.staticTexts["interview.remaining"].label, "테스트앱 · 이용 횟수 제한 없음")
        XCTAssertEqual(app.webViews.count, 0, "Interview preview must render native views")
        capture("01-preparation")
        tap("interview.start")
        XCTAssertTrue(app.staticTexts["협업 중 의견 차이를 해결한 경험을 말씀해주세요."].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["interview.progress"].label, "메인 질문 1/2")
        capture("02-interview")
        tap("interview.answer")
        XCTAssertTrue(app.staticTexts["그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["interview.progress"].label, "메인 1/2 · 꼬리질문 1/2")
        capture("03-followup")
        tap("interview.answer"); tap("interview.answer")
        XCTAssertTrue(app.staticTexts["완료한 답변 3개"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["이번 면접 API 비용"].exists)
        capture("04-result")
        app.segmentedControls.buttons["질문별 기록"].tap()
        XCTAssertTrue(app.staticTexts["2 · 꼬리 질문"].waitForExistence(timeout: 5))
        capture("05-records")
    }
    func testLivePreparationCameraAndInterviewerLayout() {
        let preparation = app.descendants(matching: .any)["practice.prep-camera"].firstMatch
        XCTAssertTrue(preparation.exists)
        XCTAssertEqual(preparation.frame.width / preparation.frame.height, 3.0 / 4.0, accuracy: 0.01)
        tap("practice.camera-mic-test")
        #if !targetEnvironment(simulator)
        let cameraReady = expectation(for: NSPredicate(format: "value == %@", "camera-ready"), evaluatedWith: preparation)
        wait(for: [cameraReady], timeout: 15)
        #endif
        capture("live-restored-preparation-camera")
        tap("interview.start")
        let avatar = app.descendants(matching: .any)["interview.avatar"].firstMatch
        let camera = app.descendants(matching: .any)["interview.live-camera"].firstMatch
        XCTAssertTrue(avatar.waitForExistence(timeout: 10))
        XCTAssertTrue(camera.exists)
        XCTAssertEqual(avatar.frame.width, camera.frame.width, accuracy: 1)
        XCTAssertEqual(avatar.frame.maxX, camera.frame.minX, accuracy: 1)
        XCTAssertEqual(avatar.frame.height, camera.frame.height, accuracy: 1)
        XCTAssertEqual((avatar.frame.width + camera.frame.width) / camera.frame.height, 8.0 / 7.0, accuracy: 0.01)
        #if !targetEnvironment(simulator)
        let liveReady = expectation(for: NSPredicate(format: "value == %@", "camera-ready"), evaluatedWith: camera)
        wait(for: [liveReady], timeout: 15)
        #endif
        let assigned = avatar.value as? String
        XCTAssertTrue(assigned?.hasSuffix(".mp4") == true)
        capture("live-restored-avatar-and-camera")
        tap("interview.answer")
        XCTAssertEqual(avatar.value as? String, assigned, "Keep the assigned interviewer across follow-up questions")
        tap("interview.end")
        app.buttons["종료하고 기록 보기"].tap()
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
        XCTAssertTrue(app.buttons["practice.mode.ai"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.ai"].tap()
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
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.ai"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.ai"].tap()
        // Resolve first-launch microphone authorization before testing the short
        // countdown. A pending system prompt leaves the app on preparation.
        let combined = app.buttons["practice.camera-mic-test"]
        let microphone = combined.exists ? combined : app.buttons["practice.media"]
        microphone.tap()
        let permission = app.alerts.firstMatch
        if permission.waitForExistence(timeout: 3) {
            guard let allow = ["허용", "Allow", "OK", "확인"].map({ permission.buttons[$0] }).first(where: { $0.exists }) else {
                XCTFail("The microphone permission alert must offer Allow"); return
            }
            allow.tap()
        }
        XCTAssertEqual(microphone.label, combined.exists ? "카메라·마이크 끄기" : "종료", "Preparation microphone test must be active")
        microphone.tap()
        app.buttons["interview.start"].tap()
        XCTAssertTrue(app.staticTexts["practice.start-countdown"].waitForExistence(timeout: 2))
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
        XCTAssertTrue(app.buttons["practice.mode.ai"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.ai"].tap()
        let prep = app.descendants(matching: .any)["practice.prep-camera"].firstMatch
        XCTAssertEqual(prep.value as? String, "camera-pending", "Camera stays off until explicitly requested")
        app.buttons["practice.camera-mic-test"].tap()
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
        XCTAssertTrue(app.buttons["practice.mode.ai"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.ai"].tap()
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
        XCTAssertTrue(app.buttons["practice.mode.ai"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.ai"].tap()
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
    func testJobContinuousAnswersAndFinalReview() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.job"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.job"].tap()
        app.buttons["practice.track"].tap()
        app.buttons["practice.track.항해"].tap()
        app.buttons["practice.job-count"].tap()
        app.buttons["3문항"].tap()
        XCTAssertFalse(app.switches["practice.job-auto"].exists)
        app.buttons["interview.start"].tap()
        for index in 1...3 {
            let answer = app.buttons["interview.answer"]
            let enabled = expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: answer)
            wait(for: [enabled], timeout: 75)
            Thread.sleep(forTimeInterval: 1)
            XCTAssertFalse(app.buttons["내 답변 듣기"].exists)
            XCTAssertFalse(app.buttons["practice.job-next"].exists)
            answer.tap()
        }
        XCTAssertTrue(app.buttons["practice.job-repeat"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["질문 3개"].exists)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == %@", "내 답변 듣기")).count, 3, "Every completed answer must remain playable")
        // The restored local bundle retains its verified study references.
        let example = app.descendants(matching: .any)["practice.example.1"].firstMatch
        XCTAssertTrue(example.exists)
        example.tap()
        XCTAssertTrue(app.staticTexts["학습 참고용 · 공식 정답이 아닙니다."].firstMatch.exists)
        app.swipeDown()
        app.buttons["practice.job-repeat"].tap()
        XCTAssertTrue(app.buttons["interview.start"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["practice.job-count"].value as? String, "3문항")
    }

    func testJobAndPersonalityUseAudioOnly() {
        for mode in ["job", "personality"] {
            let app = XCUIApplication()
            app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
            app.launch()
            XCTAssertTrue(app.buttons["practice.mode." + mode].waitForExistence(timeout: 15))
            app.buttons["practice.mode." + mode].tap()
            XCTAssertFalse(app.descendants(matching: .any)["practice.prep-camera"].firstMatch.exists)
            XCTAssertFalse(app.switches["practice.video-toggle"].exists)
            XCTAssertTrue(app.buttons["테스트하기"].exists)
            XCTAssertFalse(app.switches["practice.live-captions"].exists)
            XCTAssertFalse(app.switches["practice.job-auto"].exists)
            app.buttons["interview.start"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["practice.audio-only"].firstMatch.waitForExistence(timeout: 10))
            let captions = app.switches["practice.live-captions"]
            XCTAssertTrue(captions.exists)
            XCTAssertEqual(captions.value as? String, "0")
            captions.tap()
            XCTAssertEqual(captions.value as? String, "1")
            captions.tap()
            XCTAssertFalse(app.descendants(matching: .any)["practice.avatar"].firstMatch.exists)
            XCTAssertFalse(app.descendants(matching: .any)["practice.live-camera"].firstMatch.exists)
            app.terminate()
        }
    }

    func testRealInterviewKeepsAvatarAndCamera() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.ai"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.ai"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["practice.prep-camera"].firstMatch.exists)
        app.buttons["interview.start"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["practice.avatar"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["practice.live-camera"].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["practice.audio-only"].firstMatch.exists)
    }

    func testPracticeMenuAndTrackSelectionUseBundledQuestions() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--interview-offline-testing", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.mode.job"].waitForExistence(timeout: 15))
        app.buttons["practice.mode.job"].tap()
        XCTAssertTrue(app.staticTexts["직무(전공) 연습모드"].waitForExistence(timeout: 5))
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

final class PortalPracticeUITests: XCTestCase {
    func testMicrophonePermissionUsesKorean() {
        let app = XCUIApplication()
        app.resetAuthorizationStatus(for: .microphone)
        app.launchArguments = ["--interview-native-preview", "--portal-practice-fixture", "--interview-offline-testing", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        let start = app.buttons["interview.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: start)
        waitForExpectations(timeout: 15)
        for _ in 0..<3 { if start.isHittable { break }; app.swipeUp() }
        start.tap()
        let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        let allow = alert.buttons["허용"]
        let confirm = alert.buttons["확인"]
        XCTAssertTrue(allow.exists || confirm.exists, "System permission action must be Korean")
        XCTAssertTrue(alert.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "마이크")).firstMatch.exists)
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "korean-microphone-permission"; screenshot.lifetime = .keepAlways; add(screenshot)
        if allow.exists { allow.tap() } else if confirm.exists { confirm.tap() }
        app.terminate()
    }
    func testApprovedPortalQuestionPlaysPreparedRecording() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--portal-practice-fixture", "--portal-recorded-question", "--interview-offline-testing"]
        app.launch()
        let start = app.buttons["interview.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: start)
        waitForExpectations(timeout: 15)
        for _ in 0..<3 { if start.isHittable { break }; app.swipeUp() }
        start.tap()
        let question = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "서해지방해양경찰청의 관할 구역을 설명해 ")).firstMatch
        XCTAssertTrue(question.waitForExistence(timeout: 15))
        let answer = app.buttons["interview.answer"]
        XCTAssertEqual(answer.label, "질문 듣는 중")
        XCTAssertFalse(answer.isEnabled)
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: answer)
        waitForExpectations(timeout: 20)
        XCTAssertFalse(app.staticTexts["practice.question-audio-notice"].exists)
    }
    func testApprovedPortalQuestionWithoutRecordingUsesText() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--portal-practice-fixture", "--interview-offline-testing"]
        addUIInterruptionMonitor(withDescription: "Microphone") { alert in
            for label in ["허용", "Allow", "OK", "확인"] { if alert.buttons[label].exists { alert.buttons[label].tap(); return true } }
            return false
        }
        app.launch()
        let start = app.buttons["interview.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: start)
        waitForExpectations(timeout: 15)
        for _ in 0..<3 { if start.isHittable { break }; app.swipeUp() }
        start.tap(); app.tap()
        XCTAssertTrue(app.buttons["interview.answer"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["해양경찰의 역할을 설명해주세요."].firstMatch.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["practice.question-audio-notice"].exists)
    }
}


final class PhysicalPortalEndToEndTests: XCTestCase {
    func testDeployedJobContentFieldAndRegionSelection() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires the signed-in physical test iPhone")
        #else
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 40)); mock.tap()
        let job = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "직무(전공) 연습모드")).firstMatch
        XCTAssertTrue(job.waitForExistence(timeout: 15)); job.tap()
        let start = web.buttons["연습 시작"]
        XCTAssertTrue(start.waitForExistence(timeout: 15)); start.tap()
        let field = app.buttons["practice.content-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: field)], timeout: 30), .completed)
        let regionInput = app.buttons["practice.region"]
        XCTAssertEqual(field.frame.minY, regionInput.frame.minY, accuracy: 2)
        XCTAssertGreaterThan(regionInput.frame.minX, field.frame.maxX)
        field.tap()
        for label in ["구조·잠수", "관제·해상통신", "기관학·함정정비", "해양환경·방제", "특공·대테러", "전산·정보보안", "항해학"] {
            XCTAssertFalse(app.buttons[label].exists, label)
        }
        let navigation = app.buttons["형사법·수사절차"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 10)); navigation.tap()
        XCTAssertTrue((field.label + " " + String(describing: field.value)).contains("형사법·수사절차"))
        let region = app.buttons["practice.region"]
        XCTAssertTrue(region.waitForExistence(timeout: 10)); region.tap()
        let west = app.buttons["서해"]
        XCTAssertTrue(west.waitForExistence(timeout: 10)); west.tap()
        XCTAssertTrue((region.label + " " + String(describing: region.value)).contains("서해"))
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "선택 조건에 맞는")).firstMatch.exists)
        XCTAssertFalse(app.buttons["practice.media"].exists)
        XCTAssertFalse(app.staticTexts["practice.mic-status"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "음성 분석 연결됨")).firstMatch.exists)
        let questionCount = app.buttons["practice.job-count"]
        for count in [3, 5, 10, 15, 20] {
            questionCount.tap()
            let option = app.buttons["\(count)문항"]
            XCTAssertTrue(option.waitForExistence(timeout: 5)); option.tap()
            XCTAssertEqual(questionCount.value as? String, "\(count)문항")
        }
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "job-field-criminal-west"; screenshot.lifetime = .keepAlways; add(screenshot)
        #endif
    }
    func testSavedResultLoadsSourceExampleWithoutASecondAnalysis() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires the signed-in owner's existing saved practice")
        #else
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 40)); mock.tap()
        let job = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "직무(전공) 연습모드")).firstMatch
        XCTAssertTrue(job.waitForExistence(timeout: 15)); job.tap()
        let start = web.buttons["연습 시작"]
        XCTAssertTrue(start.waitForExistence(timeout: 15)); start.tap()
        let records = app.buttons["practice.records"]
        XCTAssertTrue(records.waitForExistence(timeout: 30)); records.tap()
        let open = app.buttons["기록 보기"].firstMatch
        if !open.waitForExistence(timeout: 15) {
            if app.staticTexts["아직 저장된 기록이 없습니다."].exists { throw XCTSkip("No saved job result is available on this signed-in device") }
            XCTFail("Expected a saved job result or the empty-record state"); return
        }
        open.tap()
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 15))
        let example = app.descendants(matching: .any)["practice.example.1"].firstMatch
        XCTAssertTrue(example.waitForExistence(timeout: 30)); example.tap()
        XCTAssertTrue(app.staticTexts["학습 참고용 · 공식 정답이 아닙니다."].firstMatch.exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "physical-saved-result-example"; screenshot.lifetime = .keepAlways; add(screenshot)
        #endif
    }
    func testPersonalityPreparationAllowsTopicAndQuestionCount() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires the signed-in physical test iPhone")
        #else
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 40)); mock.tap()
        let personality = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "인성")).firstMatch
        XCTAssertTrue(personality.waitForExistence(timeout: 15)); personality.tap()
        let open = web.buttons["연습 시작"]
        XCTAssertTrue(open.waitForExistence(timeout: 15)); open.tap()
        let field = app.buttons["practice.content-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: field)], timeout: 30), .completed)
        field.tap(); app.buttons["실패·성장"].tap()
        XCTAssertEqual(field.value as? String, "실패·성장")
        let count = app.buttons["practice.personality-count"]
        for number in [3, 5, 10, 15, 20] {
            count.tap(); app.buttons["\(number)문항"].tap()
            XCTAssertEqual(count.value as? String, "\(number)문항")
        }
        XCTAssertFalse(app.buttons["practice.region"].exists)
        XCTAssertFalse(app.buttons["practice.job-count"].exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "personality-topic-count-preparation"; screenshot.lifetime = .keepAlways; add(screenshot)
        #endif
    }
    func testOrdinaryAppKeepsAllMockModesComingSoon() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires the signed-in physical test iPhone")
        #else
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ordinary-app-verification"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 40)); mock.tap()
        for label in ["직무(전공) 연습모드", "인성 연습모드", "실전 모의면접"] {
            let mode = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(mode.waitForExistence(timeout: 15)); mode.tap()
            let notice = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "준비 중입니다.")).firstMatch
            XCTAssertTrue(notice.waitForExistence(timeout: 15))
            XCTAssertFalse(web.buttons["연습 시작"].exists)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "ordinary-coming-soon-" + label; screenshot.lifetime = .keepAlways; add(screenshot)
            let back = web.buttons.matching(NSPredicate(format: "label CONTAINS %@", "모의면접 목록")).firstMatch
            XCTAssertTrue(back.waitForExistence(timeout: 5)); back.tap()
        }
        #endif
    }
    func testDeployedCombinedCameraAndMicrophoneControl() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires the signed-in physical test iPhone")
        #else
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 40)); mock.tap()
        let ai = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "실전 모의면접")).firstMatch
        XCTAssertTrue(ai.waitForExistence(timeout: 15)); ai.tap()
        let start = web.buttons["연습 시작"]
        XCTAssertTrue(start.waitForExistence(timeout: 20)); start.tap()
        let devices = app.buttons["practice.camera-mic-test"]
        let visible = devices.waitForExistence(timeout: 30)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "deployed-combined-camera-microphone"; screenshot.lifetime = .keepAlways; add(screenshot)
        XCTAssertTrue(visible)
        XCTAssertFalse(app.buttons["practice.camera-test"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "윈도우")).firstMatch.waitForExistence(timeout: 30))
        #endif
    }
    func testSignedInJobPreparationAndLocalConnection() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Requires signed-in physical test iPhone and spoken answer")
        #else
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let mock = web.buttons["모의면접"]
        XCTAssertTrue(mock.waitForExistence(timeout: 40), "Signed-in pilot account must have mock tab")
        mock.tap()
        let job = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "직무(전공) 연습모드")).firstMatch
        XCTAssertTrue(job.waitForExistence(timeout: 15)); job.tap()
        let open = web.buttons["연습 시작"]
        XCTAssertTrue(open.waitForExistence(timeout: 15)); open.tap()
        let start = app.buttons["interview.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 30))
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: start)
        waitForExpectations(timeout: 30)
        app.buttons["practice.job-count"].tap()
        app.buttons["3문항"].tap()
        for _ in 0..<3 { if start.isHittable { break }; app.swipeUp() }
        start.tap()
        let consent = app.alerts.buttons["동의하고 테스트"]
        XCTAssertTrue(consent.waitForExistence(timeout: 15), "Local AI bridge must be ready")
        XCTAssertTrue(app.alerts["로컬 AI 피드백"].exists)
        app.alerts.buttons["취소"].tap()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "physical-portal-preparation"; screenshot.lifetime = .keepAlways; add(screenshot)
        #endif
    }
}

final class PracticeFilterUITests: XCTestCase {
    func testContentFieldAndRegionIntersectWithoutFallingBackToOtherQuestions() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--portal-practice-filter-fixture"]
        app.launch()
        XCTAssertTrue(app.buttons["practice.content-field"].waitForExistence(timeout: 15))
        app.buttons["practice.content-field"].tap()
        app.buttons["형사법·수사절차"].tap()
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "선택 조건에 맞는")).firstMatch.exists)
        app.buttons["practice.region"].tap()
        app.buttons["중부"].tap()
        XCTAssertTrue(app.staticTexts["선택 조건에 맞는 공개 승인 문항이 없습니다. 분야나 지역을 변경해주세요."].exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        app.buttons["practice.region"].tap()
        app.buttons["서해"].tap()
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "선택 조건에 맞는")).firstMatch.exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        app.buttons["practice.job-count"].tap()
        XCTAssertTrue(app.buttons["20문항"].exists)
        app.buttons["20문항"].tap()
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
    }
}

final class PhysicalReadOnlyDiagnosticTests: XCTestCase {
    func testSignedInPracticeStatusWithoutStartingAnAttempt() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Uses the owner's existing signed-in device cookie jar")
        #else
        let app = XCUIApplication()
        app.launchArguments = ["--interview-api-status-diagnostic"]
        app.launch()
        for name in ["job", "personality", "access"] {
            let label = app.webViews.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "API 진단 " + name)).firstMatch
            XCTAssertTrue(label.waitForExistence(timeout: 40))
            print(label.label)
            XCTAssertTrue(label.label.contains("HTTP 200"), label.label)
            if name == "access" {
                XCTAssertTrue(label.label.contains("allowed=true"), label.label)
            } else {
                XCTAssertTrue(label.label.contains("ready=true"), label.label)
                XCTAssertTrue(label.label.contains("bootstrap=200"), label.label)
                XCTAssertFalse(label.label.contains("questions=0 "), label.label)
            }
        }
        #endif
    }
}

final class PracticeResultPresentationTests: XCTestCase {
    func testResultsShowReferenceVerdictsAndPendingAnalysisOnTheResultScreen() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--practice-result-ui-fixture"]
        app.launch()
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 15))
        let example = app.descendants(matching: .any)["practice.example.1"].firstMatch
        XCTAssertTrue(example.waitForExistence(timeout: 5)); example.tap()
        XCTAssertTrue(app.staticTexts["상황을 확인하고 동료에게 보고한 뒤 조치를 기록합니다."].exists)
        for id in 1...3 {
            let grade = app.descendants(matching: .any)["practice.overall-grade.\(id)"].firstMatch
            for _ in 0..<4 { if grade.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(grade.exists)
            XCTAssertTrue(app.staticTexts[["충족", "부분 충족", "미충족"][id - 1]].exists)
        }
        let progress = app.descendants(matching: .any)["practice.analysis-progress.4"].firstMatch
        for _ in 0..<4 { if progress.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(progress.exists)
        XCTAssertFalse(app.buttons["분석 결과 확인"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "practice-result-verdicts-and-progress"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
}

final class PersonalityPreparationTests: XCTestCase {
    func testTopicAndCountDropdownsCanBeSetBeforeStartingPractice() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--portal-personality-filter-fixture"]
        app.launch()
        let field = app.buttons["practice.content-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        field.tap(); app.buttons["실패·성장"].tap()
        XCTAssertEqual(field.value as? String, "실패·성장")
        let count = app.buttons["practice.personality-count"]
        for number in [3, 5, 10, 15, 20] {
            count.tap(); app.buttons["\(number)문항"].tap()
            XCTAssertEqual(count.value as? String, "\(number)문항")
        }
        XCTAssertFalse(app.buttons["practice.job-count"].exists)
        XCTAssertFalse(app.buttons["practice.region"].exists)
        XCTAssertFalse(app.buttons["practice.media"].exists)
        XCTAssertTrue(app.buttons["interview.start"].isEnabled)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "personality-settings-fixture"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
}

// Explicit real-provider validation. Never included in normal offline UI test selection.
final class PaidLiveVerificationTests: XCTestCase {
    func testActualLiveVoiceInterview() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        guard let code = ProcessInfo.processInfo.environment["LIVE_VERIFICATION_CODE"] else {
            throw XCTSkip("Real Live verification requires an explicit short-lived handoff code")
        }
        app.launchEnvironment["INTERVIEW_LIVE_VERIFICATION_CODE"] = code
        app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        func evidence(_ name: String) {
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        }
        func tap(_ id: String) {
            let button = app.buttons[id]
            for _ in 0..<5 { if button.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(button.isHittable, "Control not reachable: " + id); button.tap()
        }
        defer {
            if app.buttons["interview.end"].exists && app.buttons["interview.end"].isEnabled {
                tap("interview.end")
                if app.alerts.buttons["종료하고 기록 보기"].waitForExistence(timeout: 3) { app.alerts.buttons["종료하고 기록 보기"].tap() }
                _ = app.staticTexts["내 답변을 돌아보고,\n다음 연습을 준비해요."].waitForExistence(timeout: 30)
            }
        }
        let start = app.buttons["interview.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 50), "Native credential exchange failed")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: start)], timeout: 25), .completed, "Live readiness failed: " + app.staticTexts["interview.notice"].label)
        evidence("paid-live-preparation")
        tap("interview.start")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.firstMatch.waitForExistence(timeout: 4) {
            let allow = springboard.alerts.buttons["허용"]
            if allow.exists { allow.tap() }
        }
        let question = app.staticTexts["interview.question"]
        XCTAssertTrue(question.waitForExistence(timeout: 90), "Live transport failed: " + app.staticTexts["interview.notice"].label)
        for turn in 1...6 {
            let current = question.label
            XCTAssertFalse(current.isEmpty)
            // Let the actual interviewer finish speaking before providing the answer.
            var previous = "", stableAt = Date(), waited = Date()
            while Date().timeIntervalSince(waited) < 18 {
                let spokenElement = app.staticTexts["interview.audio-output"]
                let spoken = spokenElement.exists ? spokenElement.value as? String ?? "" : ""
                if spoken != previous { previous = spoken; stableAt = Date() }
                if !spoken.isEmpty && Date().timeIntervalSince(stableAt) > 2 { break }
                Thread.sleep(forTimeInterval: 0.5)
            }
            let data = try JSONSerialization.data(withJSONObject: ["turn": turn, "question": current], options: [.sortedKeys])
            let route = app.staticTexts["interview.audio-output"].label
            XCTAssertTrue(route.contains("Speaker"), "Actual Live audio must use the loudspeaker: " + route)
            XCTAssertFalse(route.contains("Receiver"))
            print("LIVE_VERIFY_AUDIO_ROUTE " + String(decoding: try JSONSerialization.data(withJSONObject: ["turn": turn, "outputs": route]), as: UTF8.self))
            print("LIVE_VERIFY_TURN " + String(decoding: data, as: UTF8.self))
            evidence("paid-live-turn-\(turn)")
            let transcript = app.staticTexts["interview.transcript"]
            var heardText = ""
            let heard = NSPredicate { _, _ in
                guard transcript.exists else { return false }
                let text = transcript.label
                if text.replacingOccurrences(of: " ", with: "").contains("이상입니다") { heardText = text; return true }
                return false
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: heard, object: nil)], timeout: 65), .completed, "No real microphone transcript on turn \(turn)")
            Thread.sleep(forTimeInterval: 3)
            print("LIVE_VERIFY_HEARD " + String(decoding: try JSONSerialization.data(withJSONObject: ["turn": turn, "transcript": heardText]), as: UTF8.self))
            if question.exists && question.label == current { tap("interview.answer") }
            let next = NSPredicate { _, _ in
                if turn == 6 { return app.buttons["다시 연습하기"].exists }
                return question.exists && question.label != current
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: next, object: nil)], timeout: 65), .completed, "No next question on turn \(turn): " + app.staticTexts["interview.notice"].label)
        }
        XCTAssertTrue(app.staticTexts["완료한 답변 6개"].waitForExistence(timeout: 30))
        evidence("paid-live-result")
        print("LIVE_VERIFY_COMPLETED six_answers")
    }
}

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
    func testIncompleteResultKeepsExamplesAndReferenceVerdictsHidden() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--practice-result-ui-fixture", "--practice-incomplete-result-fixture"]
        app.launch()
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.descendants(matching: .any)["practice.example.1"].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["practice.overall-grade.1"].firstMatch.exists)
    }
    func testMixedVerdictsShowConfirmedAndUncertainCriteriaSeparately() {
        let app = XCUIApplication()
        app.launchArguments = ["--interview-native-preview", "--practice-result-ui-fixture", "--practice-mixed-verdict-fixture"]
        app.launch()
        XCTAssertTrue(app.staticTexts["일부 항목 확인"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["확인된 항목 1/2 · 나머지 항목은 녹음 확인 필요"].exists)
        let before = XCTAttachment(screenshot: app.screenshot()); before.name = "fixture-job-mixed-verdict-overview"; before.lifetime = .keepAlways; add(before)
        app.buttons["판정 근거"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["상황 확인 · 충족"].exists)
        XCTAssertTrue(app.staticTexts["보고 · 판정 보류"].exists)
        let after = XCTAttachment(screenshot: app.screenshot()); after.name = "fixture-job-confirmed-and-held-criteria"; after.lifetime = .keepAlways; add(after)
    }
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
            let spoken = app.staticTexts["interview.audio-output"].value as? String ?? ""
            print("LIVE_VERIFY_SPOKEN " + String(decoding: try JSONSerialization.data(withJSONObject: ["turn": turn, "spoken": spoken]), as: UTF8.self))
            if turn == 1 {
                XCTAssertTrue(spoken.filter { !$0.isWhitespace }.hasPrefix("면접을시작하겠습니다"), "Unexpected interview opening: " + spoken)
            }
            XCTAssertFalse(spoken.contains("확인하겠습니다"), "Use the approved neutral acknowledgement")
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
            let responseSpeech = app.staticTexts["interview.audio-output"].value as? String ?? ""
            print("LIVE_VERIFY_ACK " + String(decoding: try JSONSerialization.data(withJSONObject: ["turn": turn, "spoken": responseSpeech]), as: UTF8.self))
            XCTAssertFalse(responseSpeech.contains("확인하겠습니다"), "Unexpected acknowledgement during answer completion")
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
        let retention = app.staticTexts["interview.retention-date"].label
        XCTAssertNotNil(retention.range(of: "^보관 종료: [0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression))
        print("LIVE_VERIFY_RETENTION " + retention)
        if ProcessInfo.processInfo.environment["LIVE_VERIFY_COMPREHENSIVE"] == "1" {
            tap("interview.analysis"); evidence("paid-live-comprehensive-generating")
            let disclaimer = app.staticTexts["저장된 전사에 근거한 연습 피드백이며 확정 성적이 아닙니다."]
            let until = Date().addingTimeInterval(150)
            while !disclaimer.exists && Date() < until {
                XCTAssertEqual(app.state, .runningForeground)
                Thread.sleep(forTimeInterval: 4)
                if !app.buttons["interview.analysis"].exists || app.buttons["interview.analysis"].isEnabled { tap("기록 다시 확인") }
            }
            XCTAssertTrue(disclaimer.exists, "Comprehensive feedback did not finish; never automatically generate again")
            for _ in 0..<8 { app.swipeDown() }; evidence("paid-live-comprehensive-overview")
            for page in 1...5 { app.swipeUp(); evidence("paid-live-comprehensive-page-\(page)") }
            XCTAssertEqual(app.state, .runningForeground)
            print("FEEDBACK_VERIFY_COMPLETED actual_run_comprehensive_feedback_no_app_exit")
        }
        print("LIVE_VERIFY_COMPLETED six_answers")
    }
}

// Explicit on-device verification, including real microphone recordings and paid analysis.
final class ActualPracticeScreenshotTests: XCTestCase {
    func testJobAndPersonalityRealAnswersAndFeedbackScreens() throws {
        guard ProcessInfo.processInfo.environment["RUN_REAL_PRACTICE_VERIFICATION"] == "1" else { throw XCTSkip("Explicit real practice verification only") }
        continueAfterFailure = false
        let app = XCUIApplication()
        func capture(_ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
        func tap(_ button: XCUIElement) {
            XCTAssertTrue(button.waitForExistence(timeout: 40))
            for _ in 0..<8 { if button.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(button.isHittable); button.tap()
        }
        for mode in (ProcessInfo.processInfo.environment["PRACTICE_VERIFY_MODES"] ?? "job,personality").split(separator: ",").map(String.init) {
            app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
            app.launch()
            let web = app.webViews.firstMatch
            XCTAssertTrue(web.buttons["모의면접"].waitForExistence(timeout: 50), "Signed-in test account required")
            capture(mode + "-01-home")
            tap(web.buttons["모의면접"]); capture(mode + "-02-mode-menu")
            let title = mode == "job" ? "직무(전공) 연습모드" : "인성 연습모드"
            tap(web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch)
            XCTAssertTrue(web.buttons["연습 시작"].waitForExistence(timeout: 30)); capture(mode + "-03-entry")
            tap(web.buttons["연습 시작"])
            let field = app.buttons["practice.content-field"]
            XCTAssertTrue(field.waitForExistence(timeout: 40))
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: field)], timeout: 30), .completed)
            capture(mode + "-04-preparation")
            tap(field); capture(mode + "-05-field-options"); tap(app.buttons["전체 분야"])
            if mode == "job" { tap(app.buttons["practice.region"]); capture(mode + "-06-region-options"); tap(app.buttons["전체 지역"]) }
            tap(app.buttons[mode == "job" ? "practice.job-count" : "practice.personality-count"])
            capture(mode + "-07-question-count"); tap(app.buttons["3문항"])
            capture(mode + "-08-ready")
            tap(app.buttons["interview.start"])
            if app.alerts.buttons["동의하고 테스트"].waitForExistence(timeout: 2) { capture(mode + "-09-analysis-consent"); app.alerts.buttons["동의하고 테스트"].tap() }
            let question = app.staticTexts["practice.question"]
            for turn in 1...3 {
                XCTAssertTrue(question.waitForExistence(timeout: 50))
                let current = question.label
                capture(mode + "-10-question-\(turn)-listening")
                let answer = app.buttons["interview.answer"]
                XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: answer)], timeout: 60), .completed)
                XCTAssertTrue(app.descendants(matching: .any)["practice.audio-only"].exists)
                XCTAssertFalse(app.descendants(matching: .any)["practice.live-camera"].exists)
                print("PRACTICE_VERIFY_TURN " + String(decoding: try JSONSerialization.data(withJSONObject: ["mode": mode, "turn": turn, "question": current]), as: UTF8.self))
                Thread.sleep(forTimeInterval: 2)
                capture(mode + "-11-question-\(turn)-recording")
                let advanced = NSPredicate { _, _ in
                    if app.staticTexts["면접 결과"].exists { return true }
                    return question.exists && question.label != current
                }
                let outcome = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: advanced, object: nil)], timeout: 55)
                if outcome != .completed, question.exists, question.label == current, answer.exists, answer.isEnabled { tap(answer) }
                XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: advanced, object: nil)], timeout: 30), .completed)
            }
            XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 35)); capture(mode + "-12-result-loading")
            for turn in 1...3 {
                let feedback = app.staticTexts["practice.feedback.\(turn).summary"]
                let notice = app.staticTexts["practice.analysis-notice.\(turn)"]
                let finished = NSPredicate { _, _ in feedback.exists || notice.exists }
                XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: finished, object: nil)], timeout: 150), .completed, "Analysis did not finish for \(mode) turn \(turn)")
                print("PRACTICE_VERIFY_RESULT \(mode) turn=\(turn) status=" + (feedback.exists ? "feedback" : "review_required") + " notice=" + (notice.exists ? notice.label : ""))
                if ProcessInfo.processInfo.environment["PRACTICE_REQUIRE_FEEDBACK"] == "1" {
                    capture(mode + "-result-turn-\(turn)-feedback-check")
                    XCTAssertTrue(feedback.exists, "Real answer was still held: " + (notice.exists ? notice.label : "unknown"))
                }
            }
            for _ in 0..<12 { app.swipeDown() }
            capture(mode + "-13-result-overview")
            let example = app.descendants(matching: .any)["practice.example.1"].firstMatch
            if example.exists { tap(example); capture(mode + "-14-reference-answer") }
            let reasons = app.buttons["판정 근거"].firstMatch
            if reasons.exists { tap(reasons); capture(mode + "-15-assessment-reasons") }
            for page in 1...5 { app.swipeUp(); capture(mode + "-16-feedback-page-\(page)") }
            XCTAssertEqual(app.state, .runningForeground)
            print("PRACTICE_VERIFY_COMPLETED " + mode + " three_real_answers_results_captured")
        }
    }
}

final class ExistingLiveFeedbackVerificationTests: XCTestCase {
    func testExistingRunComprehensiveFeedback() throws {
        guard let code = ProcessInfo.processInfo.environment["LIVE_VERIFICATION_CODE"] else { throw XCTSkip("Explicit short-lived verification credential required") }
        continueAfterFailure = false
        let app = XCUIApplication(); app.launchEnvironment["INTERVIEW_LIVE_VERIFICATION_CODE"] = code
        app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]; app.launch()
        func capture(_ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
        func tap(_ button: XCUIElement) {
            XCTAssertTrue(button.waitForExistence(timeout: 40))
            for _ in 0..<10 { if button.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(button.isHittable); button.tap()
        }
        XCTAssertTrue(app.buttons["interview.start"].waitForExistence(timeout: 50)); capture("mock-feedback-01-preparation")
        tap(app.buttons["내 면접 기록"]); capture("mock-feedback-02-record-list")
        let saved = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "08:23:28")).firstMatch
        tap(saved)
        XCTAssertTrue(app.staticTexts["완료한 답변 6개"].waitForExistence(timeout: 40)); capture("mock-feedback-03-saved-six-answers")
        let disclaimer = app.staticTexts["저장된 전사에 근거한 연습 피드백이며 확정 성적이 아닙니다."]
        if !disclaimer.exists {
            let generate = app.buttons["interview.analysis"]
            XCTAssertTrue(generate.waitForExistence(timeout: 20), "Report unavailable or already in uncertain state")
            tap(generate); capture("mock-feedback-04-generating")
        }
        let until = Date().addingTimeInterval(150)
        while !disclaimer.exists && Date() < until {
            XCTAssertEqual(app.state, .runningForeground, "App exited while requesting comprehensive feedback")
            Thread.sleep(forTimeInterval: 4)
            if !app.buttons["interview.analysis"].exists || app.buttons["interview.analysis"].isEnabled { tap(app.buttons["기록 다시 확인"]) }
        }
        XCTAssertTrue(disclaimer.exists, "Comprehensive feedback did not complete; do not automatically generate another paid report")
        for _ in 0..<10 { app.swipeDown() }; capture("mock-feedback-05-comprehensive-overview")
        for page in 1...4 { app.swipeUp(); capture("mock-feedback-06-comprehensive-page-\(page)") }
        XCTAssertEqual(app.state, .runningForeground)
        print("FEEDBACK_VERIFY_COMPLETED saved_run_comprehensive_feedback_no_app_exit")
    }
}

final class SavedJobVerdictVerificationTests: XCTestCase {
    func testSavedRealJobVerdictsAndFeedback() throws {
        guard ProcessInfo.processInfo.environment["RUN_SAVED_PRACTICE_REVIEW"] == "1" else { throw XCTSkip("Explicit saved real practice review only") }
        continueAfterFailure = false
        let app = XCUIApplication(); app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]; app.launch()
        func capture(_ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
        func tap(_ button: XCUIElement) {
            XCTAssertTrue(button.waitForExistence(timeout: 40))
            for _ in 0..<12 { if button.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(button.isHittable); button.tap()
        }
        let web = app.webViews.firstMatch
        tap(web.buttons["모의면접"])
        tap(web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "직무(전공) 연습모드")).firstMatch)
        tap(web.buttons["연습 시작"])
        XCTAssertTrue(app.buttons["practice.content-field"].waitForExistence(timeout: 40))
        tap(app.buttons["practice.records"]); capture("saved-job-01-record-list")
        tap(app.buttons["기록 보기"].firstMatch)
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 20)); capture("saved-job-02-overview")
        for turn in 1...3 {
            let grade = app.descendants(matching: .any)["practice.overall-grade.\(turn)"].firstMatch
            for _ in 0..<15 { if grade.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(grade.exists)
            XCTAssertTrue(app.staticTexts["practice.feedback.\(turn).summary"].exists)
            capture("saved-job-03-turn-\(turn)-verdict")
            let reasons = app.buttons.matching(identifier: "판정 근거").allElementsBoundByIndex
            if reasons.count >= turn { tap(reasons[turn-1]) }
            capture("saved-job-04-turn-\(turn)-evidence")
            let example = app.descendants(matching: .any)["practice.example.\(turn)"].firstMatch
            if example.exists { tap(example); capture("saved-job-05-turn-\(turn)-example"); tap(example) }
        }
        for page in 1...3 { app.swipeUp(); capture("saved-job-06-feedback-page-\(page)") }
        XCTAssertEqual(app.state, .runningForeground)
        print("SAVED_JOB_VERIFY_COMPLETED three_real_verdicts_and_feedback_no_new_inference")
    }
}

final class SavedPersonalityFeedbackVerificationTests: XCTestCase {
    func testSavedRealPersonalityFeedback() throws {
        guard ProcessInfo.processInfo.environment["RUN_SAVED_PRACTICE_REVIEW"] == "1" else { throw XCTSkip("Explicit saved real personality review only") }
        continueAfterFailure = false
        let app = XCUIApplication(); app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]; app.launch()
        func capture(_ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
        func tap(_ button: XCUIElement) {
            XCTAssertTrue(button.waitForExistence(timeout: 40))
            for _ in 0..<10 { if button.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(button.isHittable); button.tap()
        }
        let web = app.webViews.firstMatch
        tap(web.buttons["모의면접"])
        tap(web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "인성 연습모드")).firstMatch)
        tap(web.buttons["연습 시작"])
        XCTAssertTrue(app.buttons["practice.content-field"].waitForExistence(timeout: 40))
        tap(app.buttons["practice.records"]); capture("saved-personality-01-record-list")
        tap(app.buttons["기록 보기"].firstMatch)
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 20))
        for turn in 1...3 {
            let feedback = app.staticTexts["practice.feedback.\(turn).summary"]
            XCTAssertTrue(feedback.waitForExistence(timeout: 20))
            XCTAssertTrue(feedback.label.contains("공통으로 확인된"))
            XCTAssertFalse(app.staticTexts["practice.analysis-notice.\(turn)"].exists)
        }
        capture("saved-personality-02-result-overview")
        let footer = app.buttons["practice.records"]
        for page in 1...14 {
            if footer.isHittable { break }
            app.swipeUp(); capture("saved-personality-03-feedback-page-\(page)")
        }
        XCTAssertTrue(footer.isHittable, "Capture all feedback through the result footer")
        XCTAssertEqual(app.state, .runningForeground)
        print("SAVED_PERSONALITY_VERIFY_COMPLETED three_real_feedbacks_all_pages_no_new_analysis")
    }
}

final class SavedPersonalityPlaybackVerificationTests: XCTestCase {
    func testSavedRecordingPlayPauseAndSeekWithoutAnalysis() throws {
        guard ProcessInfo.processInfo.environment["RUN_SAVED_PRACTICE_REVIEW"] == "1" else { throw XCTSkip("Explicit saved recording review only") }
        continueAfterFailure = false
        let app = XCUIApplication(); app.launchArguments = ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]; app.launch()
        func capture(_ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
        func tap(_ button: XCUIElement) {
            XCTAssertTrue(button.waitForExistence(timeout: 40))
            for _ in 0..<12 { if button.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(button.isHittable); button.tap()
        }
        func waitState(_ button: XCUIElement, _ state: String) {
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", state), object: button)], timeout: 6), .completed)
        }
        func seconds(_ turn: Int, total: Bool = false) -> Int {
            let label = app.descendants(matching: .any)["practice.playback.time.\(turn)"].firstMatch.label
            let pattern = try! NSRegularExpression(pattern: "([0-9]+):([0-9]{2})")
            let matches = pattern.matches(in: label, range: NSRange(label.startIndex..., in: label))
            guard let m = total ? matches.last : matches.first,
                  let minutes = Range(m.range(at: 1), in: label), let seconds = Range(m.range(at: 2), in: label) else { XCTFail("Missing playback time: " + label); return -1 }
            return (Int(label[minutes]) ?? 0) * 60 + (Int(label[seconds]) ?? 0)
        }
        let mode = ProcessInfo.processInfo.environment["SAVED_PLAYBACK_MODE"] == "job" ? "직무(전공) 연습모드" : "인성 연습모드"
        let web = app.webViews.firstMatch
        tap(web.buttons["모의면접"])
        tap(web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", mode)).firstMatch)
        tap(web.buttons["연습 시작"])
        XCTAssertTrue(app.buttons["practice.content-field"].waitForExistence(timeout: 40))
        tap(app.buttons["practice.records"]); tap(app.buttons["기록 보기"].firstMatch)
        XCTAssertTrue(app.staticTexts["면접 결과"].waitForExistence(timeout: 20)); capture("playback-01-ready")
        let play = app.buttons["practice.playback.toggle.1"]
        tap(play); waitState(play, "재생 중")
        Thread.sleep(forTimeInterval: 1.2); XCTAssertGreaterThanOrEqual(seconds(1), 1); capture("playback-02-playing")
        let slider = app.sliders["practice.playback.seek.1"]
        XCTAssertTrue(slider.isHittable); slider.adjust(toNormalizedSliderPosition: 0.5)
        waitState(play, "재생 중"); XCTAssertEqual(Double(seconds(1)), Double(seconds(1, total: true)) * 0.5, accuracy: 4); capture("playback-03-seek-half")
        tap(play); waitState(play, "일시정지"); let paused = seconds(1)
        Thread.sleep(forTimeInterval: 1); XCTAssertEqual(seconds(1), paused); capture("playback-04-paused")
        slider.adjust(toNormalizedSliderPosition: 0.2); waitState(play, "일시정지")
        XCTAssertEqual(Double(seconds(1)), Double(seconds(1, total: true)) * 0.2, accuracy: 3); capture("playback-05-seek-while-paused")
        tap(play); waitState(play, "재생 중"); capture("playback-06-resumed")
        let next = app.buttons["practice.playback.toggle.2"]
        tap(next); waitState(next, "재생 중"); XCTAssertEqual(play.value as? String, "재생 대기"); capture("playback-07-switch-answer")
        tap(next); waitState(next, "일시정지")
        XCTAssertFalse(app.staticTexts["practice.playback.error.1"].exists)
        XCTAssertFalse(app.staticTexts["practice.playback.error.2"].exists)
        XCTAssertEqual(app.state, .runningForeground)
        print("PLAYBACK_VERIFY_COMPLETED real_audio_play_pause_seek_resume_switch_no_analysis")
    }
}

import XCTest
@testable import InterviewNative

@MainActor final class InterviewPracticeCLITests: XCTestCase {
    private let id = "5a3f957d-2607-4f9b-9be9-d53e931f335d"
    private func advance(_ service: PracticeCLI, allow: Bool = true) async throws -> PracticeCLIResult {
        try await service.advance(id: id, account: "fixture-account", mode: "personality", questionID: "fixture-question",
            question: "협업 경험은?", audio: URL(fileURLWithPath: "/missing-fixture.wav"), allowSubmission: allow)
    }
    func testExistingPendingRequestIsOnlyReadEvenWhenSubmissionIsAllowed() async throws {
        var calls: [String] = []
        let service = PracticeCLI { action, fields in
            calls.append(action); XCTAssertEqual(fields["accountId"] as? String, "fixture-account")
            return ["ok": true, "id": self.id, "state": "queued"]
        }
        let result = try await advance(service)
        XCTAssertTrue(result.pending); XCTAssertEqual(calls, ["get"])
    }
    func testUnknownFailedAndCancelledRequestsNeverResubmit() async throws {
        for state in ["unknown", "failed", "cancelled"] {
            var calls: [String] = []
            let service = PracticeCLI { action, _ in calls.append(action); return ["ok": true, "id": self.id, "state": state] }
            let result = try await advance(service); XCTAssertEqual(result.state, state); XCTAssertFalse(result.pending); XCTAssertEqual(calls, ["get"])
        }
    }
    func testMissingRequestIsNotUploadedOnAutomaticResume() async {
        var calls: [String] = []
        let service = PracticeCLI { action, _ in calls.append(action); return ["ok": false, "error": "not_found"] }
        do { _ = try await advance(service, allow: false); XCTFail("Expected a held submission") } catch {}
        XCTAssertEqual(calls, ["get"])
    }
    func testExplicitRecoveryKeepsThePersistedRequestIdAndAudio() async throws {
        let audio = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        let bytes = Data(repeating: 0, count: 64); try bytes.write(to: audio); defer { try? FileManager.default.removeItem(at: audio) }
        var calls: [String] = []
        let service = PracticeCLI { action, fields in
            calls.append(action); XCTAssertEqual(fields["id"] as? String, self.id)
            if action == "get" { return ["ok": false, "error": "not_found"] }
            XCTAssertEqual(fields["audioBase64"] as? String, bytes.base64EncodedString())
            return ["ok": true, "id": self.id, "state": "queued"]
        }
        _ = try await service.advance(id: id, account: "fixture-account", mode: "personality", questionID: "fixture-question", question: "협업 경험은?", audio: audio, allowSubmission: true)
        XCTAssertEqual(calls, ["get", "submit"])
    }
    func testInterruptedUploadUsesSameIDOnlyWhenExplicitlyAllowed() async throws {
        let audio = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        try Data(repeating: 0, count: 64).write(to: audio)
        defer { try? FileManager.default.removeItem(at: audio) }
        var calls: [String] = []
        let service = PracticeCLI { action, fields in
            calls.append(action)
            XCTAssertEqual(fields["id"] as? String, self.id)
            return ["ok": true, "id": self.id, "state": action == "get" ? "uploading" : "running"]
        }
        _ = try await service.advance(id: id, account: "fixture-account", mode: "job", questionID: "q-test", question: "질문", audio: audio, allowSubmission: false)
        XCTAssertEqual(calls, ["get"])
        calls = []
        _ = try await service.advance(id: id, account: "fixture-account", mode: "job", questionID: "q-test", question: "질문", audio: audio, allowSubmission: true)
        XCTAssertEqual(calls, ["get", "submit"])
    }
    func testCompletedResultMapsTranscriptAndEvidenceWithoutAnExtraInference() async throws {
        let service = PracticeCLI { action, _ in
            XCTAssertEqual(action, "get")
            return ["ok": true, "id": self.id, "state": "completed", "report": ["transcripts": ["역할을 나눴습니다.", "역할을 나눴습니다."],
                "analysis": ["summary": "본인의 행동을 설명했습니다.", "strengths": [["feedback": "행동이 드러납니다.", "quote": "역할을 나눴습니다."]], "improvements": [], "nextPractice": []]]]
        }
        let result = try await advance(service)
        XCTAssertEqual(result.transcript, "역할을 나눴습니다."); XCTAssertTrue(result.feedback?["strength"]?.contains("역할을 나눴습니다.") == true); XCTAssertFalse(result.pending)
    }
    func testRecognitionDisagreementIsShownAsHeldRatherThanFinishedAnalysis() async throws {
        let service = PracticeCLI { _, _ in
            ["ok": true, "id": self.id, "state": "completed", "report": ["status": "review_required", "analysis": NSNull(), "reasons": ["transcript_disagreement"], "transcripts": ["첫 번째 인식", "두 번째 인식"]]]
        }
        let result = try await advance(service)
        XCTAssertFalse(result.pending)
        XCTAssertNil(result.feedback)
        XCTAssertEqual(result.notice, "음성 인식 결과가 서로 달라 판정을 보류했습니다. 녹음을 확인해주세요.")
    }
    func testAssessmentSurvivesServerResponseAndLocalRecordDecoding() async throws {
        let service = PracticeCLI { _, _ in
            ["ok": true, "id": self.id, "state": "completed", "report": ["transcripts": ["원인을 점검합니다."], "assessment": [
                ["index": 0, "label": "원인 점검", "claim": "원인을 점검한다.", "status": "O", "quote": "원인을 점검합니다.", "reason": "점검 절차를 설명했습니다."]]]]
        }
        let result = try await advance(service)
        var turn = PracticeTurn(id: 1, question: "어떻게 조치하나요?", audio: "1.wav")
        turn.analysis = result.feedback
        XCTAssertEqual(turn.assessment.count, 1)
        XCTAssertEqual(turn.overallAssessment, "O")
        XCTAssertEqual(turn.assessment.first?.quote, "원인을 점검합니다.")
    }
    func testSourceExampleIsAvailableBeforeAnalysisCompletes() async throws {
        let service = PracticeCLI { _, _ in ["ok": true, "id": self.id, "state": "running", "referenceAnswer": "상황을 확인하고 보고합니다."] }
        let result = try await advance(service)
        XCTAssertTrue(result.pending)
        XCTAssertNil(result.feedback)
        XCTAssertEqual(result.exampleAnswer, "상황을 확인하고 보고합니다.")
    }
    func testReadinessAndAccountFailureAreNotConvertedIntoSuccess() async throws {
        let unready = PracticeCLI { _, _ in ["ok": true, "ready": false] }
        let ready = try await unready.ready(account: "fixture-account"); XCTAssertFalse(ready)
        let denied = PracticeCLI { _, _ in ["ok": false, "error": "forbidden"] }
        do { _ = try await advance(denied); XCTFail("Expected authorization failure") } catch {}
    }
}

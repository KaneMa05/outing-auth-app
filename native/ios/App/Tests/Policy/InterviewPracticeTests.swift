import XCTest
import CryptoKit
@testable import InterviewNative

final class InterviewPracticeTests: XCTestCase {
    @MainActor
    func testPCFeedbackIsAutomaticForEveryPracticeMode() {
        let model = PracticeModel()
        model.cliRequest = { _, _ in ["ok": true] }
        for mode in ["job", "personality", "ai"] {
            model.mode = mode
            model.bridgeReady = true
            XCTAssertTrue(model.analyzesAnswers, mode)
            model.bridgeReady = false
            XCTAssertFalse(model.analyzesAnswers, mode)
        }
        model.dispose()
    }
    func testDeviceBridgeOnlyAcceptsPinnedTLSOnPrivateNetwork() {
        XCTAssertTrue(InterviewBridgePolicy.accepts("https://192.168.0.5:8788", simulator: false))
        XCTAssertTrue(InterviewBridgePolicy.accepts("https://10.0.0.5:8788", simulator: false))
        XCTAssertTrue(InterviewBridgePolicy.accepts("https://172.16.0.5:8788", simulator: false))
        XCTAssertTrue(InterviewBridgePolicy.accepts("http://127.0.0.1:8787", simulator: true))
        for url in ["http://127.0.0.1:8787", "http://192.168.0.5:8788", "https://example.com:8788", "https://8.8.8.8:8788", "https://172.32.0.5:8788", "https://192.168.0.5:443", "https://user@192.168.0.5:8788", "https://192.168.0.5:8788/other", "https://192.168.0.5:8788?token=x", "https://192.168.0.5:8788#other"] {
            XCTAssertFalse(InterviewBridgePolicy.accepts(url, simulator: false), url)
        }
    }
    func testTrackPolicyMatchesAndroid() {
        for track in InterviewPracticePolicy.tracks {
            XCTAssertTrue(InterviewPracticePolicy.eligible(category: "personality", tracks: [], mode: "ai", track: track))
            XCTAssertTrue(InterviewPracticePolicy.eligible(category: "personality", tracks: [], mode: "personality", track: track))
            XCTAssertTrue(InterviewPracticePolicy.eligible(category: "job", tracks: [track], mode: "job", track: track))
            XCTAssertFalse(InterviewPracticePolicy.eligible(category: "job", tracks: [], mode: "job", track: track))
            XCTAssertFalse(InterviewPracticePolicy.eligible(category: "personality", tracks: [], mode: "job", track: track))
        }
        XCTAssertFalse(InterviewPracticePolicy.eligible(category: "personality", tracks: [], mode: "ai", track: "unknown"))
    }
    func testSilenceGateIgnoresWordGapsAndEndsOnceAfterFourSeconds() {
        var gate = InterviewAnswerGate(now: 10)
        XCTAssertEqual(gate.sample(now: 10.2, speaking: false), .waiting)
        XCTAssertEqual(gate.sample(now: 11, speaking: true), .speaking)
        XCTAssertEqual(gate.sample(now: 11.8, speaking: false), .speaking)
        XCTAssertEqual(gate.sample(now: 12.3, speaking: false), .pause)
        XCTAssertEqual(gate.remaining(now: 12.3), 2.7, accuracy: 0.001)
        XCTAssertEqual(gate.sample(now: 14, speaking: true), .speaking)
        XCTAssertEqual(gate.sample(now: 17.9, speaking: false), .pause)
        XCTAssertEqual(gate.sample(now: 18, speaking: false), .complete)
        XCTAssertEqual(gate.sample(now: 19, speaking: true), .complete)
    }
    func testNoAnswerAdvancesExactlyFourSecondsAfterMicrophoneIsReady() {
        var empty = InterviewAnswerGate(now: 20)
        XCTAssertEqual(empty.remaining(now: 20), 4)
        XCTAssertEqual(empty.sample(now: 23.99, speaking: false), .pause)
        XCTAssertEqual(empty.sample(now: 24, speaking: false), .complete)
        XCTAssertEqual(empty.sample(now: 25, speaking: false), .complete)
    }
    func testSpeechJustBeforeDeadlineResetsFourSeconds() {
        var gate = InterviewAnswerGate(now: 0)
        XCTAssertEqual(gate.sample(now: 3.9, speaking: true), .speaking)
        XCTAssertEqual(gate.remaining(now: 4), 3.9, accuracy: 0.001)
        XCTAssertEqual(gate.sample(now: 7.89, speaking: false), .pause)
        XCTAssertEqual(gate.sample(now: 7.91, speaking: false), .complete)
    }
    func testMicrophoneCalibrationRejectsNoiseAndRequiresSustainedVoice() {
        var signal = InterviewMicSignal(); signal.calibrate()
        for _ in 0..<20 { signal.sample(rms: pow(10, -60.0/20), seconds: 0.05) }
        XCTAssertFalse(signal.calibrating)
        XCTAssertEqual(signal.noiseDb, -60, accuracy: 0.01)
        signal.sample(rms: pow(10, -54.0/20), seconds: 1)
        XCTAssertFalse(signal.speaking)
        signal.sample(rms: pow(10, -25.0/20), seconds: 0.06)
        XCTAssertFalse(signal.speaking)
        signal.sample(rms: pow(10, -25.0/20), seconds: 0.07)
        XCTAssertTrue(signal.speaking)
        XCTAssertGreaterThan(signal.level, 0)
        signal.sample(rms: pow(10, -65.0/20), seconds: 1)
        XCTAssertFalse(signal.speaking)
    }
    #if DEBUG
    @MainActor func testPCAnalysisUsesOriginalQuestionAndDoesNotRepeatCompletedWork() async throws {
        let account = "original-prompt-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = PracticeModel(); defer { model.dispose() }
        model.sessionLoader = { ["accountId": account, "track": "공채", "questions": []] }
        let id = UUID().uuidString.lowercased()
        var actions: [String] = []
        model.cliRequest = { action, fields in
            if action == "status" { return ["ok": true, "ready": true] }
            actions.append(action)
            if action == "get" { return ["ok": false, "error": "not_found"] }
            XCTAssertEqual(fields["questionPrompt"] as? String, "분석용 원본 질문")
            XCTAssertEqual(fields["accountId"] as? String, account)
            return ["ok": true, "id": id, "state": "completed", "report": ["transcripts": ["답변"], "analysis": ["summary": "피드백"]]]
        }
        await model.load()
        let store = try PracticeStore(root: root)
        var record = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        record.accountID = account
        var turn = PracticeTurn(id: 1, question: "녹음과 일치하는 표시 문구", audio: "1.wav", questionID: "q-test")
        turn.analysisRequestID = id; turn.analysisQuestionPrompt = "분석용 원본 질문"
        record.turns = [turn]; try store.save(record)
        try Data(repeating: 0, count: 64).write(to: store.audio(record.id, "1.wav"))
        model.refreshCLIResults(allowSubmission: true)
        for _ in 0..<100 {
            if try store.load(record.id).turns[0].analysisState == "completed" { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertEqual(actions, ["get", "submit"])
        XCTAssertEqual(try store.load(record.id).turns[0].analysisState, "completed")
        model.foreground()
        await Task.yield()
        XCTAssertEqual(actions, ["get", "submit"])
    }
    @MainActor func testPracticeFiltersUseReviewedFieldsAndRegionsAndSurviveStartRefresh() async throws {
        let model = PracticeModel(); defer { model.dispose() }
        let account = "filter-test-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer { try? FileManager.default.removeItem(at: root) }
        model.sessionLoader = { ["accountId": account, "track": "공채", "mode": "job",
            "fields": [["id": "criminal_law_investigation", "label": "형사법·수사절차"], ["id": "domestic_maritime_law", "label": "국내 해사법규"]],
            "questions": [
                ["id": "nav", "prompt": "항법 질문", "category": "job", "tracks": ["공채"], "fieldIds": ["criminal_law_investigation", "domestic_maritime_law"], "regions": ["서해"]],
                ["id": "law", "prompt": "법규 질문", "category": "job", "tracks": ["공채"], "fieldIds": ["domestic_maritime_law"], "regions": ["중부"]]] ] }
        model.cliRequest = { _, _ in ["ok": true, "ready": false] }
        await model.load()
        XCTAssertEqual(model.available, 2)
        XCTAssertEqual(model.contentFields.map { $0.label }, ["형사법·수사절차", "국내 해사법규"])
        model.changeField("criminal_law_investigation"); XCTAssertEqual(model.available, 1)
        model.changeRegion("중부"); XCTAssertEqual(model.available, 0); XCTAssertTrue(model.questions.isEmpty)
        // Starting refresh must not discard the selected constraints or silently use other questions.
        try await model.refreshPortal()
        XCTAssertEqual(model.selectedField, "criminal_law_investigation"); XCTAssertEqual(model.selectedRegion, "중부")
        XCTAssertTrue(model.questions.isEmpty)
        model.changeRegion("서해"); XCTAssertEqual(model.questions.map { $0.id }, ["nav"])
        model.changeField("domestic_maritime_law"); XCTAssertEqual(model.questions.map { $0.id }, ["nav"])
        model.changeRegion(""); XCTAssertEqual(model.available, 2)
    }
    @MainActor func testPublicRecruitmentFieldsExcludeOtherSpecialtiesWithoutRemovingQuestions() async throws {
        let model = PracticeModel(); defer { model.dispose() }
        let account = "field-profile-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer { try? FileManager.default.removeItem(at: root) }
        let ids = ["coast_guard", "domestic_maritime_law", "criminal_law_investigation", "international_maritime_law", "navigation", "engineering_maintenance", "marine_environment", "vts_communications", "rescue_diving", "emergency_care", "special_operations", "it_security"]
        model.selectedField = "rescue_diving"
        model.sessionLoader = { ["accountId": account, "track": "공채", "mode": "job",
            "fields": ids.map { ["id": $0, "label": $0] },
            "questions": ids.map { ["id": $0, "prompt": $0, "category": "job", "tracks": ["공채"], "fieldIds": [$0]] as [String: Any] }] }
        model.cliRequest = { _, _ in ["ok": true, "ready": true] }
        await model.load()
        XCTAssertEqual(model.contentFields.map { $0.id }, Array(ids.prefix(4)))
        XCTAssertEqual(model.selectedField, "")
        XCTAssertEqual(model.available, ids.count)
        XCTAssertTrue(model.notice.isEmpty)
        for count in [3, 5, 10, 15, 20] {
            model.setJobQuestionCount(count)
            XCTAssertEqual(model.jobQuestionCount, count)
            XCTAssertEqual(model.questions.count, min(count, ids.count))
        }
        XCTAssertEqual(model.sessionLimitSeconds, model.questions.count * 120)
        model.setJobQuestionCount(1)
        XCTAssertEqual(model.jobQuestionCount, 20)
        XCTAssertTrue(InterviewPracticePolicy.contentFieldAllowed("navigation", track: "항해"))
        XCTAssertTrue(InterviewPracticePolicy.contentFieldAllowed("engineering_maintenance", track: "기관"))
        XCTAssertFalse(InterviewPracticePolicy.contentFieldAllowed("engineering_maintenance", track: "항해"))
        XCTAssertTrue(InterviewPracticePolicy.contentFieldAllowed("marine_environment", track: "방제"))
        XCTAssertTrue(InterviewPracticePolicy.contentFieldAllowed("vts_communications", track: "관제"))
    }
    func testLegacyPCRecordsKeepRequestAndAccountIsolation() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        var legacy = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        var turn = PracticeTurn(id: 1, question: "화면 표시용 질문", audio: "1.wav")
        let requestID = UUID().uuidString
        turn.remoteRequestID = requestID; turn.remoteSubmitted = true
        turn.remoteQuestionPrompt = "분석 요청의 원본 질문"
        legacy.turns = [turn]; try store.save(legacy)
        var other = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        other.accountID = "other-account"; try store.save(other)
        try store.migrateLegacyCLI(account: "current-account")
        let migrated = try store.load(legacy.id)
        XCTAssertEqual(migrated.accountID, "current-account")
        XCTAssertEqual(migrated.turns[0].analysisRequestID, requestID)
        XCTAssertEqual(migrated.turns[0].analysisQuestionPrompt, "분석 요청의 원본 질문")
        XCTAssertEqual(migrated.turns[0].analysisState, "connection_required")
        XCTAssertEqual(migrated.turns[0].audio, "1.wav")
        XCTAssertEqual(try store.load(other.id).accountID, "other-account")
        try store.migrateLegacyCLI(account: "current-account")
        XCTAssertEqual(try store.load(legacy.id).turns[0].analysisRequestID, requestID)
    }
    func testLegacyAudioRecordLoadsWithoutVideoAndVideoDeletionIsScoped() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        var record = PracticeRecord(id: UUID().uuidString, mode: "personality", track: "공채")
        try store.save(record)
        let metadata = try store.folder(record.id).appendingPathComponent("record.json")
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: metadata)) as? [String: Any])
        legacy.removeValue(forKey: "video")
        try JSONSerialization.data(withJSONObject: legacy).write(to: metadata)
        XCTAssertNil(try store.load(record.id).video)
        record.video = "interview.mov"; try store.save(record)
        let video = try store.video(record.id)
        try Data([1, 2, 3]).write(to: video)
        let other = PracticeRecord(id: UUID().uuidString, mode: "job", track: "항해")
        try store.save(other)
        XCTAssertEqual(try store.load(record.id).video, "interview.mov")
        try store.delete(record.id)
        XCTAssertFalse(FileManager.default.fileExists(atPath: video.path))
        XCTAssertEqual(try store.load(other.id).id, other.id)
        XCTAssertThrowsError(try store.video("../escape"))
    }
    func testRecordsSurviveReloadAndDeleteOnlyTheirOwnFolder() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        var record = PracticeRecord(id: UUID().uuidString, mode: "job", track: "항해")
        record.turns = [PracticeTurn(id: 1, question: "질문", answer: "답변", duration: 3, audio: "1.wav")]
        try store.save(record)
        let audio = try store.audio(record.id, "1.wav")
        try Data(repeating: 0, count: 32044).write(to: audio)
        let reopened = try PracticeStore(root: root)
        XCTAssertEqual(try reopened.list().count, 1)
        XCTAssertEqual(try reopened.load(record.id).turns.first?.answer, "답변")
        XCTAssertTrue(FileManager.default.fileExists(atPath: audio.path))
        XCTAssertThrowsError(try store.audio(record.id, "../other.wav"))
        XCTAssertThrowsError(try store.folder("../other"))
        let other = PracticeRecord(id: UUID().uuidString, mode: "personality", track: "공채")
        try store.save(other)
        try store.delete(record.id)
        XCTAssertEqual(try reopened.list().map(\.id), [other.id])
        XCTAssertFalse(FileManager.default.fileExists(atPath: audio.path))
    }
    #endif
}

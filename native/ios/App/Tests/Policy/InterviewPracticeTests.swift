import XCTest
import CryptoKit
import AVFoundation
@testable import InterviewNative

final class InterviewPracticeTests: XCTestCase {
    func testQuestionProgressCountsOnlySavedAnswersWithinAccountAndMode() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        func save(_ account: String, _ mode: String, _ date: Date, audioBytes: Int, duplicate: Bool = false) throws {
            var record = PracticeRecord(id: UUID().uuidString, mode: mode, track: "공채")
            record.accountID = account; record.createdAt = date
            var turn = PracticeTurn(id: 1, question: "질문", audio: "1.wav", questionID: "question-a")
            record.turns = [turn]
            if duplicate { turn.id = 2; record.turns.append(turn) }
            try store.save(record)
            if audioBytes > 0 { try Data(repeating: 0, count: audioBytes).write(to: store.audio(record.id, "1.wav")) }
        }
        let earlier = Date(timeIntervalSince1970: 1_794_931_200)
        let latest = earlier.addingTimeInterval(86400)
        try save("student-a", "job", earlier, audioBytes: 45, duplicate: true)
        try save("student-a", "job", latest, audioBytes: 100)
        try save("student-a", "job", latest, audioBytes: 44)
        try save("student-a", "job", latest, audioBytes: 0)
        try save("student-b", "job", latest, audioBytes: 100)
        try save("student-a", "personality", latest, audioBytes: 100)
        let progress = try store.questionProgress(account: "student-a", mode: "job")
        XCTAssertEqual(progress["question-a"]?.count, 2)
        XCTAssertEqual(progress["question-a"]?.latest, latest)
        XCTAssertTrue(progress["question-a"]!.label.contains("답변 완료 · 2회"))
        XCTAssertTrue(PracticeQuestionProgress().label.contains("0회"))
        XCTAssertTrue(try store.questionProgress(account: "student-c", mode: "job").isEmpty)
    }
    func testCachedVerifiedJobSummaryDoesNotMentionNonexistentHolds() throws {
        var turn = PracticeTurn(id: 1, question: "질문", audio: "fixture.wav")
        let prefix = "음성 인식 결과가 일부 달라 근거와 판정이 일치하는 1개 항목만 반영했습니다. 보류된 항목은 녹음을 확인해 주세요."
        func rows(_ status: String) throws -> String {
            let value: [[String: Any]] = [["index": 0, "label": "항목", "claim": "기준", "status": status, "quote": "근거", "reason": "설명"]]
            return String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
        }
        turn.analysis = ["summary": prefix, "assessment": try rows("partial")]
        XCTAssertFalse(turn.feedbackSummary!.contains("보류"))
        turn.analysis?["assessment"] = try rows("uncertain")
        XCTAssertEqual(turn.feedbackSummary, prefix)
        turn.analysis = ["summary": "원래의 답변 피드백", "assessment": try rows("O")]
        XCTAssertEqual(turn.feedbackSummary, "원래의 답변 피드백")
    }
    #if DEBUG
    @MainActor func testTestAppRetentionShowsOnlyKoreanCalendarDate() {
        XCTAssertEqual(InterviewView.retentionDate("2026-11-11T16:30:00.123Z"), "2026-11-12")
        XCTAssertEqual(InterviewView.retentionDate("2026-11-11T00:00:00+09:00"), "2026-11-11")
        XCTAssertEqual(InterviewView.retentionDate("2026-11-11"), "2026-11-11")
        XCTAssertEqual(InterviewView.retentionDate(nil), "확인 중")
        XCTAssertEqual(InterviewView.retentionDate("invalid"), "확인 중")
    }
    #endif
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
    @MainActor func testBackNavigationOnlyDismissesTheRootAndRemembersRecordHistory() {
        let model = PracticeModel(); defer { model.dispose() }
        model.sessionLoader = { [:] }; model.screen = .prep
        XCTAssertTrue(model.isNavigationRoot); XCTAssertTrue(model.navigateBack())
        model.screen = .records
        XCTAssertFalse(model.isNavigationRoot); XCTAssertFalse(model.navigateBack())
        XCTAssertEqual(model.screen, .prep)
        model.screen = .result
        XCTAssertFalse(model.navigateBack()); XCTAssertEqual(model.screen, .prep)
        let saved = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        model.showRecord(saved)
        XCTAssertFalse(model.navigateBack()); XCTAssertEqual(model.screen, .records)
        XCTAssertFalse(model.navigateBack()); XCTAssertEqual(model.screen, .prep)
        model.screen = .live
        XCTAssertFalse(model.navigateBack()); XCTAssertEqual(model.screen, .live)
        model.screen = .jobReview
        XCTAssertFalse(model.navigateBack()); XCTAssertEqual(model.screen, .jobReview)
        model.screen = .prep; model.sessionLoader = nil
        XCTAssertFalse(model.navigateBack()); XCTAssertEqual(model.screen, .menu)
        XCTAssertTrue(model.navigateBack())
    }

    private func archiveTestWAV(seconds: Int) -> Data {
        let frames = 16000 * seconds
        var header = Data()
        func value(_ n: UInt32, _ count: Int = 4) { var little = n.littleEndian; withUnsafeBytes(of: &little) { header.append(contentsOf: $0.prefix(count)) } }
        header.append(Data("RIFF".utf8)); value(UInt32(frames * 2 + 36)); header.append(Data("WAVEfmt ".utf8))
        value(16); value(1, 2); value(1, 2); value(16000); value(32000); value(2, 2); value(16, 2)
        header.append(Data("data".utf8)); value(UInt32(frames * 2))
        let samples = (0..<frames).map { Int16(sin(Double($0) * 2 * .pi * 440 / 16000) * 12000).littleEndian }
        samples.withUnsafeBytes { header.append(contentsOf: $0) }
        return header
    }

    @MainActor func testArchiveAACCompressionPreservesOriginalAndDuration() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        var saved = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        saved.accountID = "account-a"; saved.questionCount = 1; saved.finished = true
        saved.turns = [PracticeTurn(id: 1, question: "압축 검증", duration: 120, audio: "1.wav")]
        try store.save(saved)
        let raw = archiveTestWAV(seconds: 120), source = try store.audio(saved.id, "1.wav")
        try raw.write(to: source)
        let sync = PracticeArchiveSync(); sync.store = store; sync.account = "account-a"
        let first = try await sync.payload(saved)
        let compressed = try XCTUnwrap(first.files[1])
        let bytes = try Data(contentsOf: compressed)
        let file = try AVAudioFile(forReading: compressed)
        let duration = Double(file.length) / file.processingFormat.sampleRate
        XCTAssertEqual(compressed.pathExtension, "m4a")
        XCTAssertEqual(duration, 120, accuracy: 0.2)
        XCTAssertLessThan(bytes.count, raw.count / 5)
        XCTAssertEqual(try Data(contentsOf: source), raw)
        let second = try await sync.payload(saved)
        XCTAssertEqual(second.files[1], compressed)
        XCTAssertEqual(try Data(contentsOf: compressed), bytes, "Retries must reuse exactly the same archived bytes")
        print("ARCHIVE_COMPRESSION source=\(raw.count) compressed=\(bytes.count) seconds=\(duration)")
    }

    @MainActor func testArchiveRetriesEveryAnswerWithoutLosingLocalAudioOrCrossingAccounts() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        var saved = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        saved.accountID = "account-a"; saved.questionCount = 2; saved.finished = true
        saved.turns = [PracticeTurn(id: 1, question: "첫 질문", duration: 1, audio: "1.wav"), PracticeTurn(id: 2, question: "다음 질문", duration: 2, audio: "2.wav")]
        try store.save(saved)
        for turn in saved.turns { try archiveTestWAV(seconds: turn.id).write(to: store.audio(saved.id, turn.audio)) }
        var foreign = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채"); foreign.accountID = "account-b"
        try store.save(foreign)
        let sync = PracticeArchiveSync(); sync.store = store; sync.account = "account-a"
        var calls = 0, fail = true, status = ""
        sync.onStatus = { status = $0 }
        sync.transport = { body, files in
            calls += 1
            XCTAssertEqual(body["runId"] as? String, saved.id.lowercased())
            XCTAssertEqual(Set(files.keys), [1, 2])
            let turns = try XCTUnwrap(body["turns"] as? [[String: Any]])
            XCTAssertEqual(turns.count, 2)
            XCTAssertTrue(turns.allSatisfy { ($0["audioHash"] as? String)?.count == 64 })
            XCTAssertNil(body["audioBase64"])
            if fail { throw URLError(.notConnectedToInternet) }
        }
        sync.schedule(); await sync.wait()
        XCTAssertEqual(calls, 1); XCTAssertFalse(status.isEmpty)
        XCTAssertNil(try store.load(saved.id).adminSyncFingerprint)
        XCTAssertTrue(FileManager.default.fileExists(atPath: try store.audio(saved.id, "2.wav").path))
        fail = false; sync.schedule(); await sync.wait()
        XCTAssertEqual(calls, 2); XCTAssertTrue(status.isEmpty)
        XCTAssertTrue(sync.isSynced(try store.load(saved.id)))
        sync.schedule(); await sync.wait(); XCTAssertEqual(calls, 2)
        XCTAssertNil(try store.load(foreign.id).adminSyncFingerprint)
    }

    @MainActor func testArchiveKeepsNewAnswersWrittenDuringAnUpload() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PracticeStore(root: root)
        var saved = PracticeRecord(id: UUID().uuidString, mode: "personality", track: "공채")
        saved.accountID = "account-a"; saved.questionCount = 2; saved.finished = false
        saved.turns = [PracticeTurn(id: 1, question: "첫 질문", duration: 1, audio: "1.wav")]
        try store.save(saved); try archiveTestWAV(seconds: 1).write(to: store.audio(saved.id, "1.wav"))
        let sync = PracticeArchiveSync(); sync.store = store; sync.account = "account-a"
        var counts: [Int] = []
        sync.transport = { body, files in
            counts.append(files.count)
            if counts.count == 1 {
                var latest = try store.load(saved.id)
                latest.turns.append(PracticeTurn(id: 2, question: "새 답변", duration: 1, audio: "2.wav"))
                latest.completed = true; latest.finished = true
                try store.save(latest); try self.archiveTestWAV(seconds: 1).write(to: store.audio(saved.id, "2.wav"))
                sync.schedule()
            }
        }
        sync.schedule(); await sync.wait()
        let latest = try store.load(saved.id)
        XCTAssertEqual(counts, [1, 2]); XCTAssertEqual(latest.turns.count, 2)
        XCTAssertTrue(latest.completed); XCTAssertTrue(latest.finished == true); XCTAssertTrue(sync.isSynced(latest))
        try FileManager.default.removeItem(at: store.audio(saved.id, "2.wav"))
        let missingPayload = try await sync.payload(latest)
        let missing = try XCTUnwrap((missingPayload.body["turns"] as? [[String: Any]])?.last)
        XCTAssertEqual(missing["audioBytes"] as? Int, 0)
        XCTAssertEqual(missing["audioHash"] as? String, "")
    }

    @MainActor func testBetaCatalogFiltersAndPersistsFavoritesPerAccount() async throws {
        let account = "beta-catalog-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer {
            UserDefaults.standard.removeObject(forKey: "interview.practice.favorites." + scope)
            try? FileManager.default.removeItem(at: root)
        }
        let rows: [[String: Any]] = [
            ["id": "west-law", "prompt": "서해 법규 질문", "category": "job", "tracks": ["공채"], "fieldIds": ["domestic_maritime_law"], "regions": ["서해"]],
            ["id": "central-law", "prompt": "중부 법규 질문", "category": "job", "tracks": ["공채"], "fieldIds": ["domestic_maritime_law"], "regions": ["중부"]],
            ["id": "other-track", "prompt": "다른 직렬", "category": "job", "tracks": ["기관"]],
            ["id": "personality", "prompt": "인성 질문", "category": "personality", "tracks": []]
        ]
        let loader: () async throws -> [String: Any] = {
            ["accountId": account, "track": "공채", "mode": "job", "questions": rows,
             "fields": [["id": "domestic_maritime_law", "label": "해사법규"]]]
        }
        let model = PracticeModel(); defer { model.dispose() }
        model.sessionLoader = loader; model.screen = .prep
        try await model.refreshPortal()
        XCTAssertEqual(Set(model.catalogQuestions.map(\.id)), ["west-law", "central-law"])
        model.toggleFavorite("west-law")
        model.toggleFavorite("other-track")
        XCTAssertEqual(model.favoriteQuestionIDs, ["west-law"])
        model.changeField("domestic_maritime_law"); model.changeRegion("중부")
        XCTAssertEqual(model.catalogQuestions.map(\.id), ["central-law"])
        XCTAssertEqual(model.favoriteQuestionIDs, ["west-law"], "Filtering must not delete saved favorites")
        let reopened = PracticeModel(); defer { reopened.dispose() }
        reopened.sessionLoader = loader
        try await reopened.refreshPortal()
        XCTAssertEqual(reopened.favoriteQuestionIDs, ["west-law"])
        reopened.toggleFavorite("west-law")
        try await model.refreshPortal()
        XCTAssertTrue(model.favoriteQuestionIDs.isEmpty)
        let other = PracticeModel(); defer { other.dispose() }
        let otherAccount = account + "-other"
        let otherScope = SHA256.hash(data: Data(otherAccount.utf8)).map { String(format: "%02x", $0) }.joined()
        defer { try? FileManager.default.removeItem(at: root.deletingLastPathComponent().appendingPathComponent(otherScope)) }
        other.sessionLoader = { ["accountId": otherAccount, "track": "공채", "mode": "job", "questions": rows] }
        reopened.toggleFavorite("west-law")
        try await other.refreshPortal()
        XCTAssertTrue(other.favoriteQuestionIDs.isEmpty)
    }

    @MainActor func testBetaSelectedQuestionCannotStartAfterCatalogRevocation() async throws {
        let account = "beta-revoked-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = PracticeModel(); defer { model.dispose() }
        var revoked = false
        model.sessionLoader = {
            ["accountId": account, "track": "공채", "mode": "job", "questions": revoked ? [] : [
                ["id": "approved", "prompt": "승인 질문", "category": "job", "tracks": ["공채"]]
            ]]
        }
        model.screen = .prep
        try await model.refreshPortal()
        XCTAssertEqual(model.catalogQuestions.map(\.id), ["approved"])
        revoked = true
        model.start(questionIDs: ["approved"])
        for _ in 0..<100 {
            if !model.sessionLoading { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertFalse(model.sessionLoading)
        XCTAssertEqual(model.screen, .prep)
        XCTAssertNil(model.record)
        XCTAssertTrue(model.notice.contains("공개가 종료"))
    }

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
        var record = PracticeRecord(id: UUID().uuidString, mode: "ai", track: "공채")
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
    @MainActor func testPortalRecordsStayInTheirModeAndOldResultsNeverUploadAutomatically() {
        let model = PracticeModel(); defer { model.dispose() }
        model.sessionLoader = { [:] }; model.mode = "job"
        let job = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        let personality = PracticeRecord(id: UUID().uuidString, mode: "personality", track: "공채")
        model.records = [personality, job]
        XCTAssertEqual(model.visibleRecords.map { $0.id }, [job.id])
        model.record = personality; model.screen = .result
        XCTAssertEqual(model.modeTitle, "인성 연습모드")
        XCTAssertFalse(model.canAutomaticallySubmitCurrentAnswers)
        model.mode = "personality"
        XCTAssertEqual(model.visibleRecords.map { $0.id }, [personality.id])
    }
    @MainActor func testCompletedReferenceReadFailurePreservesResultAndCannotSubmitAgain() async throws {
        let account = "reference-read-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = PracticeModel(); defer { model.dispose() }
        model.sessionLoader = { ["accountId": account, "track": "공채", "questions": []] }
        var actions: [String] = []
        model.cliRequest = { action, _ in
            if action == "status" { return ["ok": true, "ready": true] }
            actions.append(action); return ["ok": false, "error": "not_found"]
        }
        await model.load()
        let store = try PracticeStore(root: root)
        var saved = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채"); saved.accountID = account
        var turn = PracticeTurn(id: 1, question: "기존 질문", audio: "1.wav")
        turn.analysisRequestID = UUID().uuidString; turn.analysisState = "completed"; turn.analysis = ["summary": "기존 피드백"]
        saved.turns = [turn]; try store.save(saved); model.record = saved
        model.refreshCLIResults(allowSubmission: true, currentOnly: true)
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(actions, ["get"])
        XCTAssertEqual(try store.load(saved.id).turns[0].analysisState, "completed")
        XCTAssertEqual(try store.load(saved.id).turns[0].analysis?["summary"], "기존 피드백")
    }
    @MainActor func testPersonalityTopicAndCountSettingsFilterAllQuestionsAndStaySeparateFromJob() async throws {
        let account = "personality-settings-" + UUID().uuidString
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = PracticeModel(); defer { model.dispose() }
        model.mode = "job"; model.screen = .prep; model.setJobQuestionCount(10)
        let rows: [[String: Any]] = (0..<60).map { index in
            let field = index < 30 ? "failure" : "teamwork"
            return ["id": "\(field)-\(index)", "prompt": "인성 질문 \(index)", "category": "personality", "tracks": [String](), "fieldIds": [field]]
        }
        model.sessionLoader = { ["accountId": account, "track": "공채", "mode": "personality",
            "fields": [["id": "failure", "label": "실패·성장"], ["id": "teamwork", "label": "협동심·팀워크"], ["id": "unused", "label": "문항 없음"]], "questions": rows] }
        model.cliRequest = { _, _ in ["ok": true, "ready": true] }
        await model.load()
        XCTAssertEqual(model.contentFields.map { $0.id }, ["failure", "teamwork"])
        XCTAssertEqual(model.available, 60); XCTAssertEqual(model.selectedQuestionCount, 3)
        model.changeField("failure"); model.changeRegion("서해")
        XCTAssertEqual(model.available, 30)
        for count in [3, 5, 10, 15, 20] {
            model.setPracticeQuestionCount(count)
            XCTAssertEqual(model.questions.count, count)
            XCTAssertTrue(model.questions.allSatisfy { $0.id.hasPrefix("failure-") })
        }
        XCTAssertEqual(model.jobQuestionCount, 10)
        XCTAssertEqual(model.personalityQuestionCount, 20)
        XCTAssertEqual(model.sessionLimitSeconds, 2400)
        try await model.refreshPortal()
        XCTAssertEqual(model.selectedField, "failure"); XCTAssertEqual(model.questions.count, 20)
        model.changeField("teamwork")
        XCTAssertTrue(model.questions.allSatisfy { $0.id.hasPrefix("teamwork-") })
        model.select("job")
        XCTAssertEqual(model.selectedField, ""); XCTAssertEqual(model.selectedQuestionCount, 10)
        model.select("personality")
        XCTAssertEqual(model.selectedQuestionCount, 20)
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
    @MainActor func testBetaDefersFeedbackAndUploadsWhileExamplesStayFree() async throws {
        for mode in ["job", "personality"] {
            let account = "on-demand-" + UUID().uuidString
            let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewAccounts/" + scope)
            defer { try? FileManager.default.removeItem(at: root) }
            let model = PracticeModel(); defer { model.dispose() }
            model.mode = mode; model.sessionLoader = { ["accountId": account, "track": "공채", "mode": mode, "questions": []] }
            var calls: [String] = []
            model.cliRequest = { action, fields in
                if action == "status" { return ["ok": true, "ready": true] }
                calls.append(action)
                if action == "reference" { return ["ok": true, "accountId": account, "referenceAnswer": "상황을 먼저 확인하고 동료에게 보고한 뒤 조치를 기록합니다."] }
                return ["ok": false, "error": "not_found"]
            }
            await model.load(); XCTAssertTrue(model.usesOnDemandFeedback); XCTAssertFalse(model.analyzesAnswers)
            let store = try PracticeStore(root: root)
            var saved = PracticeRecord(id: UUID().uuidString, mode: mode, track: "공채"); saved.accountID = account; saved.completed = true
            var turn = PracticeTurn(id: 1, question: "질문", duration: 1, audio: "1.wav", questionID: "fixture-question")
            turn.analysisState = "not_requested"; turn.analysisQuestionPrompt = "질문"; saved.turns = [turn]
            try store.save(saved); try Data(repeating: 0, count: 64).write(to: store.audio(saved.id, "1.wav"))
            model.record = saved; model.screen = .result
            model.foreground();model.refreshCLIResults(allowSubmission: true, currentOnly: true)
            for _ in 0..<100 { if model.record?.turns[0].exampleAnswer != nil { break }; try await Task.sleep(nanoseconds: 1_000_000) }
            XCTAssertEqual(calls, ["reference"]); XCTAssertNil(model.record?.turns[0].analysisRequestID); XCTAssertNotNil(model.record?.turns[0].exampleAnswer)
            XCTAssertTrue(model.feedbackDeferred)
            XCTAssertFalse(model.canRequestFeedback(for: model.record!.turns[0]))
            XCTAssertFalse(model.canAutomaticallySubmitCurrentAnswers)
            model.requestFeedback(1); model.requestFeedback(1)
            for _ in 0..<10 { await Task.yield() }
            XCTAssertEqual(calls, ["reference"])
            XCTAssertNil(model.record?.turns[0].analysisRequestID)
            // An old interrupted request must never upload audio when reopened or retried.
            var interrupted = try store.load(saved.id)
            interrupted.turns[0].analysisRequestID = UUID().uuidString.lowercased()
            interrupted.turns[0].analysisState = "connection_required"
            try store.save(interrupted); model.record = interrupted
            model.refreshCLIResults(allowSubmission: true, currentOnly: true)
            for _ in 0..<100 {
                if calls.contains("get") { break }
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            for _ in 0..<10 { await Task.yield() }
            XCTAssertEqual(calls, ["reference", "get"])
            XCTAssertFalse(calls.contains("submit"))
            XCTAssertTrue(FileManager.default.fileExists(atPath: try store.audio(saved.id, "1.wav").path))
        }
        let live = PracticeModel();defer { live.dispose() };live.sessionLoader = { [:] };live.cliRequest = { _, _ in [:] };live.mode = "ai";live.bridgeReady = true
        XCTAssertFalse(live.usesOnDemandFeedback);XCTAssertTrue(live.analyzesAnswers)
        live.record = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채"); live.screen = .prep
        XCTAssertFalse(live.usesOnDemandFeedback);XCTAssertTrue(live.analyzesAnswers)
        live.mode = "job"; live.record = PracticeRecord(id: UUID().uuidString, mode: "ai", track: "공채")
        XCTAssertTrue(live.usesOnDemandFeedback);XCTAssertFalse(live.analyzesAnswers)
    }
    #endif
}

#if DEBUG
@MainActor private final class MockPracticeAnswerSound: PracticeAnswerSound {
    var duration: TimeInterval = 30
    var currentTime: TimeInterval = 0
    var onFinish: ((Bool) -> Void)?
    var playSucceeds = true
    var playCalls = 0
    var stopCalls = 0
    func play() -> Bool { playCalls += 1; return playSucceeds }
    func pause() {}
    func stop() { stopCalls += 1 }
}
final class PracticeAnswerPlaybackTests: XCTestCase {
    @MainActor func testSeekingResumesOnlyWhenPreviouslyPlayingAndClampsToRecording() {
        let sound = MockPracticeAnswerSound()
        let player = PracticeAnswerPlayback(makeSound: { _ in sound }, configure: {})
        defer { player.stop() }
        let url = URL(fileURLWithPath: "/fixture.wav")
        player.toggle(key: "first", url: url); XCTAssertTrue(player.isPlaying)
        player.beginSeeking(); XCTAssertTrue(player.isSeeking); XCTAssertFalse(player.isPlaying)
        player.seek(to: 14); player.endSeeking(); XCTAssertTrue(player.isPlaying); XCTAssertEqual(sound.currentTime, 14)
        player.toggle(key: "first", url: url); XCTAssertFalse(player.isPlaying)
        player.beginSeeking(); player.seek(to: 8); player.endSeeking(); XCTAssertFalse(player.isPlaying)
        player.seek(to: -1); XCTAssertEqual(player.position, 0)
        player.seek(to: 100); XCTAssertEqual(player.position, 30)
        player.seek(to: .nan); XCTAssertEqual(player.position, 30)
        player.toggle(key: "first", url: url); XCTAssertEqual(player.position, 0); XCTAssertTrue(player.isPlaying)
    }
    @MainActor func testSwitchingAnswersStopsOldAudioAndIgnoresItsCompletion() {
        let first = MockPracticeAnswerSound(), second = MockPracticeAnswerSound()
        let player = PracticeAnswerPlayback(makeSound: { $0.lastPathComponent == "one.wav" ? first : second }, configure: {})
        defer { player.stop() }
        player.toggle(key: "one", url: URL(fileURLWithPath: "/one.wav"))
        player.toggle(key: "two", url: URL(fileURLWithPath: "/two.wav"))
        XCTAssertEqual(first.stopCalls, 1); XCTAssertEqual(player.key, "two")
        first.onFinish?(true); XCTAssertTrue(player.isPlaying); XCTAssertEqual(player.key, "two")
        second.onFinish?(true); XCTAssertFalse(player.isPlaying); XCTAssertEqual(player.position, 30)
        player.stop(); XCTAssertNil(player.key); XCTAssertEqual(player.duration, 0)
    }
    @MainActor func testFileAndPlaybackFailuresAreVisibleAndRetryable() {
        let url = URL(fileURLWithPath: "/missing.wav")
        let missing = PracticeAnswerPlayback(makeSound: { _ in throw InterviewError.connection }, configure: {})
        missing.toggle(key: "missing", url: url); XCTAssertNotNil(missing.error); XCTAssertFalse(missing.isPlaying)
        let sound = MockPracticeAnswerSound(); sound.playSucceeds = false
        let player = PracticeAnswerPlayback(makeSound: { _ in sound }, configure: {})
        defer { player.stop() }
        player.toggle(key: "answer", url: url); XCTAssertNotNil(player.error); XCTAssertFalse(player.isPlaying)
        sound.playSucceeds = true; player.toggle(key: "answer", url: url)
        XCTAssertNil(player.error); XCTAssertTrue(player.isPlaying)
        sound.onFinish?(false); XCTAssertNotNil(player.error); XCTAssertFalse(player.isPlaying)
    }
}

final class RemoteAnswerPlaybackTests: XCTestCase {
    @MainActor func testDownloadIsReusedForSeekingAndDeletedOnStop() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([1]).write(to: file)
        let sound = MockPracticeAnswerSound()
        let local = PracticeAnswerPlayback(makeSound: { _ in sound }, configure: {})
        var downloads = 0
        let remote = RemoteAnswerPlayback(playback: local, download: { _ in downloads += 1; return file })
        defer { remote.stop(); try? FileManager.default.removeItem(at: file) }
        remote.toggle(key: "run/input", rawURL: "https://example.com/signed") {}
        for _ in 0..<1000 { if !remote.loading { break }; await Task.yield() }
        XCTAssertFalse(remote.loading); XCTAssertTrue(local.isPlaying); XCTAssertEqual(downloads, 1)
        remote.toggle(key: "run/input", rawURL: "https://example.com/signed") {}
        XCTAssertFalse(local.isPlaying)
        local.beginSeeking(); local.seek(to: 12); local.endSeeking()
        XCTAssertEqual(local.position, 12); XCTAssertFalse(local.isPlaying)
        remote.toggle(key: "run/input", rawURL: nil) {}
        XCTAssertTrue(local.isPlaying); XCTAssertEqual(downloads, 1)
        remote.stop(); XCTAssertFalse(FileManager.default.fileExists(atPath: file.path)); XCTAssertNil(local.key)
    }
    @MainActor func testInvalidLinksAndDownloadFailureAreVisibleAndRetryable() async {
        let local = PracticeAnswerPlayback(makeSound: { _ in MockPracticeAnswerSound() }, configure: {})
        var requests = 0
        let remote = RemoteAnswerPlayback(playback: local, download: { _ in requests += 1; throw InterviewError.connection })
        defer { remote.stop() }
        remote.toggle(key: "input", rawURL: "http://example.com/file") {}
        XCTAssertNotNil(remote.error); XCTAssertEqual(requests, 0)
        remote.toggle(key: "input", rawURL: "https://example.com/file") {}
        for _ in 0..<1000 { if !remote.loading { break }; await Task.yield() }
        XCTAssertNotNil(remote.error); XCTAssertEqual(requests, 1); XCTAssertFalse(local.isPlaying)
        remote.toggle(key: "input", rawURL: "https://example.com/retry") {}
        for _ in 0..<1000 { if !remote.loading { break }; await Task.yield() }
        XCTAssertEqual(requests, 2); XCTAssertNotNil(remote.error)
    }
    @MainActor func testCancelledDownloadCannotStartPlaybackAndCleansItsFile() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([1]).write(to: file)
        var complete: CheckedContinuation<URL, Never>?
        let local = PracticeAnswerPlayback(makeSound: { _ in MockPracticeAnswerSound() }, configure: {})
        let remote = RemoteAnswerPlayback(playback: local, download: { _ in
            await withCheckedContinuation { complete = $0 }
        })
        defer { remote.stop(); try? FileManager.default.removeItem(at: file) }
        remote.toggle(key: "old/input", rawURL: "https://example.com/file") {}
        for _ in 0..<1000 { if complete != nil { break }; await Task.yield() }
        XCTAssertNotNil(complete)
        remote.stop(); complete?.resume(returning: file)
        for _ in 0..<1000 { if !FileManager.default.fileExists(atPath: file.path) { break }; await Task.yield() }
        XCTAssertNil(local.key); XCTAssertFalse(local.isPlaying)
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }
}

final class RecordingResumeLifecycleTests: XCTestCase {
    @MainActor func testSystemInterruptionAndHeadphoneDisconnectPreservePositionAndNeverAutoResume() async {
        let sound = MockPracticeAnswerSound()
        let player = PracticeAnswerPlayback(makeSound: { _ in sound }, configure: {})
        defer { player.stop() }
        let url = URL(fileURLWithPath: "/fixture.wav")
        player.toggle(key: "input", url: url); sound.currentTime = 9
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
                                       userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        for _ in 0..<1000 { if !player.isPlaying { break }; await Task.yield() }
        XCTAssertFalse(player.isPlaying); XCTAssertEqual(player.position, 9)
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
                                       userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
                                                  AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue])
        await Task.yield(); XCTAssertFalse(player.isPlaying)
        player.toggle(key: "input", url: url); XCTAssertTrue(player.isPlaying); XCTAssertEqual(sound.currentTime, 9)
        player.beginSeeking(); player.seek(to: 15); player.interrupt(); player.endSeeking()
        XCTAssertFalse(player.isSeeking); XCTAssertFalse(player.isPlaying); XCTAssertEqual(player.position, 15)
        player.toggle(key: "input", url: url)
        NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: nil,
                                       userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue])
        for _ in 0..<1000 { if !player.isPlaying { break }; await Task.yield() }
        XCTAssertFalse(player.isPlaying); XCTAssertEqual(player.position, 15)
    }
    @MainActor func testRewindReusesFileAndFreshLinkIsFetchedOnlyForDownload() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([1]).write(to: file)
        let sound = MockPracticeAnswerSound()
        let local = PracticeAnswerPlayback(makeSound: { _ in sound }, configure: {})
        var refreshes = 0, downloads = 0
        let remote = RemoteAnswerPlayback(playback: local, download: { url in
            XCTAssertEqual(url.lastPathComponent, "fresh"); downloads += 1; return file
        })
        defer { remote.stop(); try? FileManager.default.removeItem(at: file) }
        func play() { remote.toggle(key: "run/input", rawURL: "https://example.com/expired", refreshURL: {
            refreshes += 1; return "https://example.com/fresh"
        }) {} }
        play()
        for _ in 0..<1000 { if !remote.loading { break }; await Task.yield() }
        XCTAssertTrue(local.isPlaying); XCTAssertEqual(refreshes, 1); XCTAssertEqual(downloads, 1)
        sound.currentTime = 12; remote.pause(); XCTAssertEqual(local.position, 12)
        play(); XCTAssertEqual(sound.currentTime, 12)
        remote.rewind(); XCTAssertFalse(local.isPlaying); XCTAssertEqual(local.position, 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
        play(); XCTAssertTrue(local.isPlaying); XCTAssertEqual(refreshes, 1); XCTAssertEqual(downloads, 1)
        remote.stop(); XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }
    @MainActor func testExpiredLinkRetriesOnceButNetworkFailuresDoNotRetry() async {
        var downloads = 0, refreshes = 0
        let local = PracticeAnswerPlayback(makeSound: { _ in MockPracticeAnswerSound() }, configure: {})
        let remote = RemoteAnswerPlayback(playback: local, download: { _ in downloads += 1; throw RecordingDownloadError.expiredLink })
        defer { remote.stop() }
        remote.toggle(key: "input", rawURL: nil, refreshURL: { refreshes += 1; return "https://example.com/fresh" }) {}
        for _ in 0..<1000 { if !remote.loading { break }; await Task.yield() }
        XCTAssertEqual(downloads, 2); XCTAssertEqual(refreshes, 2); XCTAssertNotNil(remote.error)
        downloads = 0; refreshes = 0
        let network = RemoteAnswerPlayback(playback: local, download: { _ in downloads += 1; throw URLError(.notConnectedToInternet) })
        defer { network.stop() }
        network.toggle(key: "input", rawURL: nil, refreshURL: { refreshes += 1; return "https://example.com/fresh" }) {}
        for _ in 0..<1000 { if !network.loading { break }; await Task.yield() }
        XCTAssertEqual(downloads, 1); XCTAssertEqual(refreshes, 1); XCTAssertNotNil(network.error)
    }
}

final class PendingRecordingInterruptionTests: XCTestCase {
    @MainActor func testInterruptionCancelsPendingDownloadAndPreventsLateAutoplay() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([1]).write(to: file)
        var complete: CheckedContinuation<URL, Never>?
        let local = PracticeAnswerPlayback(makeSound: { _ in MockPracticeAnswerSound() }, configure: {})
        let remote = RemoteAnswerPlayback(playback: local, download: { _ in await withCheckedContinuation { complete = $0 } })
        defer { remote.stop(); try? FileManager.default.removeItem(at: file) }
        remote.toggle(key: "input", rawURL: "https://example.com/file") {}
        for _ in 0..<1000 { if complete != nil { break }; await Task.yield() }
        XCTAssertNotNil(complete)
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
                                       userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        for _ in 0..<1000 { if !remote.loading { break }; await Task.yield() }
        XCTAssertFalse(remote.loading); complete?.resume(returning: file)
        for _ in 0..<1000 { if !FileManager.default.fileExists(atPath: file.path) { break }; await Task.yield() }
        XCTAssertFalse(local.isPlaying); XCTAssertNil(local.key)
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }
}

final class QuestionRecordingSegmentTests: XCTestCase {
    @MainActor func testQuestionRangeUsesRelativeTimeAndStopsAtItsOwnEnd() async {
        let sound = MockPracticeAnswerSound()
        let player = PracticeAnswerPlayback(makeSound: { _ in sound }, configure: {})
        defer { player.stop() }
        let url=URL(fileURLWithPath: "/fixture.wav")
        XCTAssertTrue(player.prepare(key: "question-2", url: url))
        let segment=RecordingSegment(startBytes: 480_000, endBytes: 960_000)!
        XCTAssertTrue(player.selectSegment(segment)); XCTAssertEqual(player.duration,10); XCTAssertEqual(sound.currentTime,10)
        player.toggle(key: "question-2",url:url); player.seek(to:4)
        XCTAssertEqual(sound.currentTime,14); XCTAssertEqual(player.position,4)
        sound.currentTime=20.2
        try? await Task.sleep(nanoseconds:200_000_000)
        XCTAssertFalse(player.isPlaying); XCTAssertEqual(player.position,10)
        player.toggle(key:"question-2",url:url);XCTAssertEqual(sound.currentTime,10)
        XCTAssertNil(RecordingSegment(startBytes:960_000,endBytes:480_000))
    }
    @MainActor func testSwitchingQuestionsReusesOneRecordingFile() async throws {
        let file=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([1]).write(to:file)
        let player=PracticeAnswerPlayback(makeSound:{_ in MockPracticeAnswerSound()},configure:{})
        var downloads=0,refreshes=0
        let remote=RemoteAnswerPlayback(playback:player,download:{_ in downloads+=1;return file})
        defer{remote.stop();try? FileManager.default.removeItem(at:file)}
        remote.toggle(key:"run/0",rawURL:nil,fileKey:"run/input",segment:RecordingSegment(startBytes:0,endBytes:480_000),refreshURL:{refreshes+=1;return "https://example.com/file"}){}
        for _ in 0..<1000{if !remote.loading{break};await Task.yield()}
        remote.toggle(key:"run/1",rawURL:nil,fileKey:"run/input",segment:RecordingSegment(startBytes:480_000,endBytes:960_000),refreshURL:{refreshes+=1;return "https://example.com/file"}){}
        XCTAssertEqual(player.key,"run/1");XCTAssertEqual(player.duration,10);XCTAssertTrue(player.isPlaying)
        XCTAssertEqual(downloads,1);XCTAssertEqual(refreshes,1)
    }
}
#endif

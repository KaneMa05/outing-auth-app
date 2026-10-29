import XCTest
@testable import InterviewNative

final class InterviewPracticeTests: XCTestCase {
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

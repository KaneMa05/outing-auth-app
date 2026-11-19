import XCTest
import AVFoundation
@testable import InterviewNative

private final class MicrophoneCheckStub: PracticeMicrophoneChecking {
    var completion: ((Bool) -> Void)?
    var starts = 0, stops = 0
    func start(sample: @escaping (Float, Double, Bool) -> Void, completion: @escaping (Bool) -> Void) {
        starts += 1; self.completion = completion
    }
    func stop() { stops += 1 }
}

@MainActor final class NativePracticeLifecycleTests: XCTestCase {
    private func catalog(_ mode: String = "job") -> [String: Any] {
        ["ok": true, "accountId": "local-lifecycle-fixture", "mode": mode, "track": "공채", "fields": [],
         "questions": [["id": "q-local", "prompt": "가상 질문", "category": mode, "tracks": ["공채"]]]]
    }
    private func fixture(_ mode: String = "job") async throws -> (PracticeModel, URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("native-lifecycle-" + UUID().uuidString)
        let model = PracticeModel(); model.mode = mode
        model.makeAccountStore = { _ in try PracticeStore(root: root) }
        model.sessionLoader = { self.catalog(mode) }
        await model.load()
        XCTAssertTrue(model.catalogLoaded)
        return (model, root)
    }
    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<100 {
            if condition() { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Local asynchronous state did not settle")
    }
    private func clean(_ model: PracticeModel, _ root: URL) {
        model.dispose(); try? FileManager.default.removeItem(at: root)
    }
    func testDeniedPermissionAndFailedPreflightKeepPreparationWithoutCreatingRun() async throws {
        let (model, root) = try await fixture(); defer { clean(model, root) }
        let mic = MicrophoneCheckStub(); model.preflight = mic
        model.requestMicrophonePermission = { $0(false) }; model.start()
        await waitUntil { !model.sessionLoading && !model.starting }
        XCTAssertTrue(model.screen == .prep); XCTAssertEqual(mic.starts, 0)
        XCTAssertTrue(try PracticeStore(root: root).list().isEmpty)
        model.requestMicrophonePermission = { $0(true) }; model.start()
        await waitUntil { mic.completion != nil }; mic.completion?(false)
        XCTAssertTrue(model.screen == .prep); XCTAssertFalse(model.starting)
        XCTAssertTrue(try PracticeStore(root: root).list().isEmpty)
    }
    func testOpeningRecordsCancelsPendingPermissionAndAllowsRetry() async throws {
        let (model, root) = try await fixture(); defer { clean(model, root) }
        let mic = MicrophoneCheckStub(); model.preflight = mic
        var permission: ((Bool) -> Void)?
        model.requestMicrophonePermission = { permission = $0 }; model.start()
        await waitUntil { permission != nil }; model.showRecords(); permission?(true)
        try? await Task.sleep(nanoseconds: 40_000_000)
        XCTAssertTrue(model.screen == .records); XCTAssertFalse(model.starting); XCTAssertEqual(mic.starts, 0)
        _ = model.navigateBack(); permission = nil; model.start()
        await waitUntil { permission != nil }; permission?(false)
        await waitUntil { !model.starting }
        XCTAssertTrue(model.screen == .prep); XCTAssertNil(model.record)
    }
    func testBackgroundRejectsLatePreflightSuccess() async throws {
        let (model, root) = try await fixture(); defer { clean(model, root) }
        let mic = MicrophoneCheckStub(); model.preflight = mic
        model.requestMicrophonePermission = { $0(true) }; model.start()
        await waitUntil { mic.completion != nil }; model.background(); mic.completion?(true)
        XCTAssertTrue(model.screen == .prep); XCTAssertFalse(model.starting); XCTAssertNil(model.record)
        XCTAssertGreaterThan(mic.stops, 0); XCTAssertTrue(try PracticeStore(root: root).list().isEmpty)
    }
    func testBackgroundRejectsLateCatalogResponseBeforePermission() async throws {
        let (model, root) = try await fixture(); defer { clean(model, root) }
        var reply: CheckedContinuation<[String: Any], Never>?
        var permissionRequests = 0
        model.requestMicrophonePermission = { _ in permissionRequests += 1 }
        model.sessionLoader = { await withCheckedContinuation { reply = $0 } }
        model.start(); await waitUntil { reply != nil }; model.background()
        reply?.resume(returning: catalog()); try? await Task.sleep(nanoseconds: 40_000_000)
        XCTAssertEqual(permissionRequests, 0); XCTAssertFalse(model.sessionLoading); XCTAssertNil(model.record)
    }
    func testMissingRecordingStopsWithoutAdvancingOrMarkingCompleted() async throws {
        let (model, root) = try await fixture(); defer { clean(model, root) }
        model.record = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        model.number = 1; model.screen = .live; model.talking = false; model.recordingReady = true; model.notice = ""
        model.answer()
        XCTAssertTrue(model.screen == .result); XCTAssertEqual(model.number, 1)
        XCTAssertEqual(model.record?.turns.count, 0); XCTAssertEqual(model.record?.completed, false)
        XCTAssertTrue(model.notice.contains("저장하지 못했습니다")); XCTAssertFalse(model.notice.contains("저장되었습니다"))
    }
    func testStorageFailurePreservesFailureMessageAndIncompleteState() async throws {
        let (model, root) = try await fixture(); defer { clean(model, root) }
        try FileManager.default.removeItem(at: root); try Data("blocked".utf8).write(to: root)
        model.record = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
        model.screen = .live; model.notice = ""; model.stop(completed: true, capture: false)
        XCTAssertEqual(model.record?.completed, false)
        XCTAssertTrue(model.notice.contains("저장하지 못했습니다")); XCTAssertFalse(model.notice.contains("저장되었습니다"))
    }
    func testReadableSavedAnswerStillReachesReviewOrCompletedResult() async throws {
        for mode in ["job", "personality"] {
            let (model, root) = try await fixture(mode); defer { clean(model, root) }
            let store = try PracticeStore(root: root)
            let record = PracticeRecord(id: UUID().uuidString, mode: mode, track: "공채"); try store.save(record)
            do {
                let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)!
                let audio = try AVAudioFile(forWriting: store.audio(record.id, "1.wav"), settings: format.settings)
                let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1600)!
                buffer.frameLength = 1600
                for index in 0..<1600 { buffer.floatChannelData![0][index] = 0.1 }
                try audio.write(from: buffer)
            }
            model.record = record; model.number = 1; model.screen = .live; model.talking = false; model.recordingReady = true; model.notice = ""
            model.answer()
            XCTAssertEqual(model.record?.turns.count, 1)
            XCTAssertTrue(mode == "job" ? model.screen == .jobReview : model.screen == .result)
            XCTAssertEqual(model.record?.completed, mode == "personality")
            XCTAssertEqual(try store.load(record.id).turns.count, 1)
        }
    }
}

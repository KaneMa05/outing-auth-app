import XCTest
@testable import InterviewNative

@MainActor final class NativeRecordingCaptionTests: XCTestCase {
    private let runID = "caption-fixture"
    private func response(revision: Int, text: String?) -> [String: Any] {
        var caption: [String: Any] = ["number": 1, "status": "completed", "text": "automatic original", "studentRevision": revision]
        if let text { caption["studentText"] = text }
        return ["runId": runID, "captions": [caption], "estimate": ["state": "completed"]]
    }
    func testSavingEmptyCorrectionPreservesOriginalAndRejectsAnOlderRefresh() async {
        let store = PracticeRecordingCaptions(request: { _ in self.response(revision: 1, text: nil) }, save: { id, number, revision, text in
            XCTAssertEqual(id, self.runID); XCTAssertEqual(number, 1); XCTAssertEqual(revision, 1); XCTAssertEqual(text, "")
            return ["runId": id, "caption": ["number": 1, "status": "completed", "text": "automatic original", "studentText": text, "studentRevision": 2]]
        })
        await store.observe(runID)
        XCTAssertFalse(store.showsEstimate)
        let saved = await store.save(runID, caption: store.rows[0], text: "")
        XCTAssertTrue(saved)
        await store.refresh(runID)
        XCTAssertEqual(store.rows[0].text, "automatic original")
        XCTAssertEqual(store.rows[0].studentText, "")
        XCTAssertEqual(store.rows[0].studentRevision, 2)
        XCTAssertEqual(store.rows[0].message, "수정한 자막 내용이 없습니다.")
    }
    func testConflictKeepsTheCurrentCorrection() async {
        let store = PracticeRecordingCaptions(request: { _ in self.response(revision: 2, text: "current correction") }, save: { _, _, _, _ in
            throw NSError(domain: "fixture", code: 409, userInfo: ["WKJavaScriptExceptionMessage": "revision_conflict"])
        })
        await store.observe(runID)
        let saved = await store.save(runID, caption: store.rows[0], text: "unsaved draft")
        XCTAssertFalse(saved)
        XCTAssertEqual(store.rows[0].studentText, "current correction")
        XCTAssertTrue(store.saveError.contains("다른 화면에서 먼저 수정"))
    }
    func testLateCaptionResponseCannotReplaceAnotherRecording() async {
        var delayed: CheckedContinuation<[String: Any], Error>?
        let store = PracticeRecordingCaptions(request: { id in
            if id == "old-record" { return try await withCheckedThrowingContinuation { delayed = $0 } }
            return ["runId": id, "captions": [["number": 1, "status": "completed", "text": "new record"]], "estimate": ["state": "completed"]]
        })
        let oldRequest = Task { await store.observe("old-record") }
        while delayed == nil { await Task.yield() }
        await store.observe("new-record")
        delayed?.resume(returning: ["runId": "old-record", "captions": [["number": 1, "status": "completed", "text": "old record"]], "estimate": ["state": "completed"]])
        await oldRequest.value
        XCTAssertEqual(store.rows[0].text, "new record")
    }
}

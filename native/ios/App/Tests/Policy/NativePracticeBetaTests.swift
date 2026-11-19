import XCTest
@testable import InterviewNative

final class NativePracticeBetaTests: XCTestCase {
    func testNativePracticeRequiresOwnTopLevelPageAndTwoModes() {
        for host in [InterviewLaunchPolicy.host, "app.ronparkpass.com"] {
            let page = URL(string: "https://" + host + "/index.html")!
            let body = ["mode": "job", "sessionId": UUID().uuidString]
            XCTAssertTrue(InterviewLaunchPolicy.acceptsPractice(scheme: "https", host: host, port: 443, isMainFrame: true, topLevelURL: page, payload: body))
            XCTAssertFalse(InterviewLaunchPolicy.acceptsPractice(scheme: "https", host: host, port: 443, isMainFrame: false, topLevelURL: page, payload: body))
            XCTAssertFalse(InterviewLaunchPolicy.acceptsPractice(scheme: "https", host: host, port: 443, isMainFrame: true, topLevelURL: page, payload: ["mode": "ai", "sessionId": UUID().uuidString]))
            XCTAssertFalse(InterviewLaunchPolicy.acceptsPractice(scheme: "https", host: host, port: 443, isMainFrame: true, topLevelURL: URL(string: "https://evil.example"), payload: body))
        }
    }
    func testSilenceAndShortTapsNeverComplete() {
        var gate = InterviewAnswerGate(now: 0)
        for index in 1...200 { XCTAssertNotEqual(gate.sample(now: Double(index) / 10, speaking: false), .complete) }
        XCTAssertFalse(gate.hasInput)
        gate = InterviewAnswerGate(now: 0)
        _ = gate.sample(now: 0.1, speaking: true)
        XCTAssertNotEqual(gate.sample(now: 8, speaking: false), .complete)
        XCTAssertFalse(gate.hasInput)
    }
    func testConfirmedInputThenFourSecondsSilenceCompletesOnce() {
        var gate = InterviewAnswerGate(now: 0)
        for index in 1...5 { _ = gate.sample(now: Double(index) / 10, speaking: true) }
        XCTAssertTrue(gate.hasInput)
        XCTAssertNotEqual(gate.sample(now: 4.49, speaking: false), .complete)
        XCTAssertEqual(gate.sample(now: 4.5, speaking: false), .complete)
    }
}

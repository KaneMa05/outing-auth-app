import XCTest
import InterviewNative

final class InterviewLaunchPolicyTests: XCTestCase {
    private let code = String(repeating: "a", count: 43)
    func testKakaoOAuthNavigationStaysInAppWithoutBridgePrivileges() {
        for host in ["kauth.kakao.com", "accounts.kakao.com"] {
            XCTAssertTrue(InterviewLaunchPolicy.allowsWebNavigation(URL(string: "https://" + host + "/oauth/authorize")!))
            XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "https", host: host, port: 443,
                isMainFrame: true, payload: ["code": code]))
        }
        XCTAssertTrue(InterviewLaunchPolicy.allowsWebNavigation(URL(string: "https://" + InterviewLaunchPolicy.host + "/api/interview-auth?action=callback")!))
        for url in ["http://accounts.kakao.com", "https://accounts.kakao.com.attacker.example", "https://evil.example", "https://kauth.kakao.com:8443", "https://user@kauth.kakao.com", "kakaotalk://login"] {
            XCTAssertFalse(InterviewLaunchPolicy.allowsWebNavigation(URL(string: url)!))
        }
    }
    func testOwnTopLevelHTTPSCanOpenNativeInterview() {
        for port in [0, 443] {
            XCTAssertTrue(InterviewLaunchPolicy.accepts(scheme: "https", host: InterviewLaunchPolicy.host,
                port: port, isMainFrame: true, payload: ["code": code]))
        }
    }
    func testOtherOriginsFramesAndUnexpectedCredentialsAreRejected() {
        for host in ["attacker.example", "outing-auth-app.vercel.app.attacker.example", "sub.outing-auth-app.vercel.app"] {
            XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "https", host: host, port: 443, isMainFrame: true, payload: ["code": code]))
        }
        XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "http", host: InterviewLaunchPolicy.host, port: 80, isMainFrame: true, payload: ["code": code]))
        XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "https", host: InterviewLaunchPolicy.host, port: 8443, isMainFrame: true, payload: ["code": code]))
        XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "https", host: InterviewLaunchPolicy.host, port: 443, isMainFrame: false, payload: ["code": code]))
        XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "https", host: InterviewLaunchPolicy.host, port: 443, isMainFrame: true, payload: ["code": code, "token": "unexpected"]))
        for invalid in ["", String(repeating: "a", count: 42), code + "a", String(repeating: "가", count: 43), String(repeating: "a", count: 42) + "\n", String(code.dropLast()) + ";"] {
            XCTAssertFalse(InterviewLaunchPolicy.accepts(scheme: "https", host: InterviewLaunchPolicy.host, port: 443, isMainFrame: true, payload: ["code": String(invalid)]))
        }
    }
}

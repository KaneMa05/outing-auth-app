import XCTest
#if DEBUG
@testable import InterviewNative
import AVFoundation
import WebRTC
#else
import InterviewNative
#endif

final class InterviewLaunchPolicyTests: XCTestCase {
    private let code = String(repeating: "a", count: 43)
    func testMediaCaptureRequiresOurOwnTopLevelOrigin() {
        let page = URL(string: "https://" + InterviewLaunchPolicy.host + "/interview?app=1")!
        for port in [0, 443] {
            XCTAssertTrue(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "https", host: InterviewLaunchPolicy.host, port: port, isMainFrame: true, topLevelURL: page))
        }
        for host in ["evil.example", "accounts.kakao.com", InterviewLaunchPolicy.host + ".evil.example"] {
            XCTAssertFalse(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "https", host: host, port: 443, isMainFrame: true, topLevelURL: page))
            XCTAssertFalse(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "https", host: InterviewLaunchPolicy.host, port: 443, isMainFrame: true, topLevelURL: URL(string: "https://" + host)))
        }
        XCTAssertFalse(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "https", host: InterviewLaunchPolicy.host, port: 443, isMainFrame: false, topLevelURL: page))
        XCTAssertFalse(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "http", host: InterviewLaunchPolicy.host, port: 80, isMainFrame: true, topLevelURL: page))
        XCTAssertFalse(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "https", host: InterviewLaunchPolicy.host, port: 8443, isMainFrame: true, topLevelURL: page))
        XCTAssertFalse(InterviewLaunchPolicy.acceptsMediaCapture(scheme: "https", host: InterviewLaunchPolicy.host, port: 443, isMainFrame: true, topLevelURL: nil))
    }
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

#if DEBUG
final class LiveSpeakerRoutingTests: XCTestCase {
    func testWebRTCAudioReconfigurationKeepsSpeakerDefault() throws {
        let av = AVAudioSession.sharedInstance()
        let oldCategory = av.category, oldMode = av.mode, oldOptions = av.categoryOptions
        let previous = InterviewSpeakerAudio.installDefaults()
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        defer {
            try? rtc.setActive(false)
            try? rtc.setCategory(oldCategory, with: oldOptions)
            try? rtc.setMode(oldMode)
            InterviewSpeakerAudio.restoreDefaults(previous)
            rtc.unlockForConfiguration()
        }
        let configuration = RTCAudioSessionConfiguration.webRTC()
        XCTAssertEqual(configuration.mode, AVAudioSession.Mode.videoChat.rawValue)
        XCTAssertTrue(configuration.categoryOptions.contains(.defaultToSpeaker))
        // Exercise the configuration WebRTC applies after the app configures audio.
        try rtc.setConfiguration(configuration, active: true)
        XCTAssertEqual(av.mode, .videoChat)
        XCTAssertTrue(av.categoryOptions.contains(.defaultToSpeaker))
        XCTAssertFalse(av.currentRoute.outputs.isEmpty)
        XCTAssertFalse(av.currentRoute.outputs.contains { $0.portType == .builtInReceiver })
        print("Verified Live WebRTC output route: \(av.currentRoute.outputs.map { $0.portType.rawValue })")
    }
}

final class PracticeSpeakerRoutingTests: XCTestCase {
    func testOnlyBuiltInReceiverIsOverridden() {
        XCTAssertTrue(PracticeAudioRouting.shouldUseSpeaker(outputs: [.builtInReceiver]))
        let external: [AVAudioSession.Port] = [.headphones, .bluetoothHFP, .bluetoothA2DP, .bluetoothLE, .airPlay, .carAudio, .lineOut, .usbAudio]
        for route in external {
            XCTAssertFalse(PracticeAudioRouting.shouldUseSpeaker(outputs: [route]))
            XCTAssertFalse(PracticeAudioRouting.shouldUseSpeaker(outputs: [.builtInReceiver, route]))
        }
        XCTAssertFalse(PracticeAudioRouting.shouldUseSpeaker(outputs: []))
        XCTAssertFalse(PracticeAudioRouting.shouldUseSpeaker(outputs: [.builtInSpeaker]))
    }
    func testPreparedPlaybackDoesNotUseTelephoneReceiver() throws {
        let session = AVAudioSession.sharedInstance()
        defer { try? session.setActive(false, options: .notifyOthersOnDeactivation) }
        try PracticeAudioRouting.configurePlayback()
        XCTAssertEqual(session.mode, .default)
        XCTAssertFalse(session.currentRoute.outputs.contains { $0.portType == .builtInReceiver })
        print("Verified prepared playback route: \(session.currentRoute.outputs.map { $0.portType.rawValue })")
    }
}
#endif

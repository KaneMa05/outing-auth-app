import Foundation

/// A native handoff must originate from our own top-level HTTPS page.
/// The server independently checks the code's expiry, single use and student enrollment.
public enum InterviewLaunchPolicy {
    public static let host = "outing-auth-app.vercel.app"
    /// Keep OAuth in the same WKWebView so its browser-state cookie survives the callback.
    /// Navigation permission never grants these hosts access to the native bridge.
    public static func allowsWebNavigation(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443 else { return false }
        return [host, "kauth.kakao.com", "accounts.kakao.com"].contains(url.host ?? "")
    }
    public static func accepts(scheme: String, host: String, port: Int,
                               isMainFrame: Bool, payload: [String: String]) -> Bool {
        guard scheme == "https", host == Self.host, port == 0 || port == 443, isMainFrame,
              payload.count == 1, let code = payload["code"], code.utf8.count == 43 else { return false }
        return code.utf8.allSatisfy { byte in
            (65...90).contains(byte) || (97...122).contains(byte) || (48...57).contains(byte) || byte == 45 || byte == 95
        }
    }
}

import Foundation

/// A native handoff must originate from our own top-level HTTPS page.
/// The server independently checks the code's expiry, single use and student enrollment.
public enum InterviewLaunchPolicy {
    public static let host = "outing-auth-app.vercel.app"
    public static func acceptsPractice(scheme: String, host: String, port: Int,
        isMainFrame: Bool, topLevelURL: URL?, payload: [String: String]) -> Bool {
        guard scheme == "https", [Self.host, "app.ronparkpass.com"].contains(host),
              port == 0 || port == 443, isMainFrame, let page = topLevelURL,
              page.scheme == "https", page.host == host, page.user == nil, page.password == nil,
              page.port == nil || page.port == 443, payload.count == 2,
              let mode = payload["mode"], ["job", "personality"].contains(mode),
              let id = payload["sessionId"], UUID(uuidString: id) != nil else { return false }
        return true
    }
    /// OAuth shares this webview's cookies; provider pages never receive native bridge privileges.
    public static func allowsWebNavigation(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443 else { return false }
        return [host, "app.ronparkpass.com", "kauth.kakao.com", "accounts.kakao.com", "appleid.apple.com"].contains(url.host ?? "")
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

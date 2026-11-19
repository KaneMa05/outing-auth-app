import Foundation
import WebKit
import InterviewNative

/// The existing authenticated app performs only catalog/archive API requests.
/// The handoff ID is an in-process capability, never a server credential.
@MainActor final class PracticePortalSession: NSObject, URLSessionTaskDelegate {
    let mode: String
    let sessionID: String
    private weak var webView: WKWebView?
    private var closed = false
    init(webView: WKWebView, mode: String, sessionID: String) {
        self.webView = webView; self.mode = mode; self.sessionID = sessionID
        super.init()
    }
    func load() async throws -> [String: Any] {
        try await post(["action": "practice_bootstrap", "mode": mode])
    }
    private func post(_ body: [String: Any]) async throws -> [String: Any] {
        guard !closed, let webView, let page = webView.url,
              page.scheme == "https", [InterviewLaunchPolicy.host, "app.ronparkpass.com"].contains(page.host ?? ""),
              page.user == nil, page.password == nil, page.port == nil || page.port == 443 else {
            throw URLError(.userAuthenticationRequired)
        }
        let value = try await webView.callAsyncJavaScript(
            "return await window.__ronparkPracticeRequest(sessionID, body)",
            arguments: ["sessionID": sessionID, "body": body], in: nil, contentWorld: .page)
        guard !closed, let result = value as? [String: Any], result["ok"] as? Bool == true else {
            throw URLError(.badServerResponse)
        }
        return result
    }
    func syncRecords(_ fields: [String: Any], files: [Int: URL]) async throws {
        var body = fields; body["action"] = "sync"
        let plan = try await post(body)
        guard let uploads = plan["uploads"] as? [[String: Any]], let run = fields["runId"] as? String else { throw URLError(.badServerResponse) }
        let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        for upload in uploads {
            guard let number = upload["number"] as? Int, let file = files[number],
                  let hash = upload["audioHash"] as? String, hash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  let raw = upload["url"] as? String, let url = URL(string: raw),
                  url.scheme == "https", url.host?.hasSuffix(".supabase.co") == true,
                  url.user == nil, url.password == nil, url.port == nil || url.port == 443,
                  url.path == "/storage/v1/object/upload/sign/interview-practice/\(run)/\(number)-\(hash).m4a" else { throw URLError(.badServerResponse) }
            var request = URLRequest(url: url); request.httpMethod = "PUT"; request.timeoutInterval = 120
            request.setValue("audio/mp4", forHTTPHeaderField: "Content-Type"); request.setValue("true", forHTTPHeaderField: "x-upsert")
            let (_, response) = try await session.upload(for: request, fromFile: file)
            guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) else { throw URLError(.cannotWriteToFile) }
            _ = try await post(["action": "uploaded", "runId": run, "number": number, "audioHash": hash])
        }
    }
    func close() {
        guard !closed else { return }; closed = true
        webView?.callAsyncJavaScript("window.__ronparkPracticeClose?.(sessionID)", arguments: ["sessionID": sessionID], in: nil, contentWorld: .page, completionHandler: nil)
    }
    func showWebRecords() {
        guard !closed else { return }
        webView?.callAsyncJavaScript("window.__ronparkPracticeWebRecords?.(sessionID)", arguments: ["sessionID": sessionID], in: nil, contentWorld: .page, completionHandler: nil)
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

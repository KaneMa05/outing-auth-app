import Foundation

typealias InterviewJSON = [String: Any]
enum InterviewError: Error { case connection, invalidResponse, expired }

// Memory-only, short-lived interview credential. No API key or portal cookie is copied.
final class InterviewAPI: NSObject, URLSessionTaskDelegate {
    static let origin = "https://outing-auth-app.vercel.app"
    private(set) var token = ""
    lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 65
        config.httpCookieStorage = nil
        config.urlCache = nil
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    lazy var controlSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 720
        config.httpCookieStorage = nil
        config.urlCache = nil
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
    func exchange(_ code: String) async throws {
        guard code.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw InterviewError.expired }
        let result = try await post(["action": "exchange", "code": code])
        guard let value = result["token"] as? String, !value.isEmpty else { throw InterviewError.invalidResponse }
        token = value
    }
    func command(_ action: String, _ body: InterviewJSON = [:]) async throws -> InterviewJSON {
        var fields = body; fields["action"] = action
        return try await post(["action": "command", "command": fields])
    }
    private func post(_ body: InterviewJSON) async throws -> InterviewJSON {
        var req = URLRequest(url: URL(string: Self.origin + "/api/interview-native")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !token.isEmpty { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let result = try JSONSerialization.jsonObject(with: data) as? InterviewJSON,
              result["ok"] as? Bool == true else { throw InterviewError.connection }
        return result
    }
    func clear() { token = ""; session.invalidateAndCancel(); controlSession.invalidateAndCancel() }
}

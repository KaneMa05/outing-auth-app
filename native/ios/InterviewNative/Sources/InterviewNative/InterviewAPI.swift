import Foundation

typealias InterviewJSON = [String: Any]
enum InterviewError: Error { case connection, invalidResponse, expired, server(String) }

enum InterviewStartFailure {
    static func message(_ code: String?) -> String {
        switch code {
        case "daily_limit": return "오늘 실전 모의면접 이용 횟수(3회)를 모두 사용했습니다. 내일 다시 이용해주세요."
        case "admission_busy": return "이전 면접이 진행 중이거나 종료 확인 중입니다. 내 면접 기록을 확인한 뒤 다시 시도해주세요."
        case "queue_full": return "현재 면접 연결이 많습니다. 잠시 후 다시 시도해주세요."
        case "not_enrolled", "forbidden": return "실전 모의면접 수강 등록과 이용 권한을 확인해주세요."
        case "unauthorized", "session_expired": return "연결이 만료되었습니다. 돌아간 뒤 실전 모의면접을 다시 열어주세요."
        default: return "면접을 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요."
        }
    }
    static func code(_ error: Error?) -> String? {
        guard let error = error as? InterviewError else { return nil }
        if case .server(let code) = error { return code }
        return nil
    }
}

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
        #if DEBUG
        if !ProcessInfo.processInfo.arguments.contains("--ordinary-app-verification") {
            req.setValue("1", forHTTPHeaderField: "X-Interview-Test-App")
        }
        #endif
        if !token.isEmpty { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse,
              let result = try JSONSerialization.jsonObject(with: data) as? InterviewJSON else { throw InterviewError.invalidResponse }
        guard http.statusCode == 200, result["ok"] as? Bool == true else {
            throw InterviewError.server(result["error"] as? String ?? "connection")
        }
        return result
    }
    func clear() { token = ""; session.invalidateAndCancel(); controlSession.invalidateAndCancel() }
}

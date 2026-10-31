#if DEBUG
import Foundation
import Security

/// Debug-only Mac bridge. Physical devices use TLS and an exact bundled certificate pin.
@MainActor final class PracticeBridge: NSObject, URLSessionTaskDelegate {
    private(set) var isLocal = false
    private(set) var liveCaptions = true
    private let token: String
    nonisolated private let endpoint: URL
    nonisolated private let certificateData: Data?
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 280; config.timeoutIntervalForResource = 285
        config.httpCookieStorage = nil; config.urlCache = nil
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    var configured: Bool { !token.isEmpty }
    override init() {
        var token = "", endpoint = URL(string: "http://127.0.0.1:8787")!, certificate: Data?
        #if targetEnvironment(simulator)
        let simulator = true
        #else
        let simulator = false
        #endif
        if !ProcessInfo.processInfo.arguments.contains("--interview-offline-testing"), let file = Bundle.main.url(forResource: "interview-local-bridge", withExtension: "json"),
           let data = try? Data(contentsOf: file), let config = try? JSONSerialization.jsonObject(with: data) as? InterviewJSON,
           let raw = config["url"] as? String, InterviewBridgePolicy.accepts(raw, simulator: simulator), let url = URL(string: raw),
           let key = config["token"] as? String, key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil {
            let pin = (config["certificate"] as? String).flatMap { Data(base64Encoded: $0) }
            if url.scheme == "http" || pin.flatMap({ SecCertificateCreateWithData(nil, $0 as CFData) }) != nil {
                token = key; endpoint = url; certificate = pin
            }
        }
        self.token = token; self.endpoint = endpoint; self.certificateData = certificate
        super.init()
    }
    nonisolated func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                                completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == endpoint.host,
              let trust = challenge.protectionSpace.serverTrust, let data = certificateData,
              let certificate = SecCertificateCreateWithData(nil, data as CFData),
              let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first, SecCertificateCopyData(leaf) as Data == data else {
            print("Interview bridge TLS pin rejected"); completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, endpoint.host as CFString?))
        SecTrustSetAnchorCertificates(trust, [certificate] as CFArray)
        SecTrustSetAnchorCertificatesOnly(trust, true)
        var evaluationError: CFError?
        guard SecTrustEvaluateWithError(trust, &evaluationError) else {
            print("Interview bridge TLS evaluation failed: \(String(describing: evaluationError))")
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    private func request(_ path: String) -> URLRequest {
        var request = URLRequest(url: endpoint.appendingPathComponent(path))
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        return request
    }
    func ready() async -> Bool {
        guard configured else { print("Interview bridge configuration unavailable"); return false }
        do {
            var statusRequest = request("status"); statusRequest.timeoutInterval = 5
            let (data, response) = try await session.data(for: statusRequest)
            let value = try JSONSerialization.jsonObject(with: data) as? InterviewJSON
            isLocal = value?["provider"] as? String == "local"
            liveCaptions = value?["liveCaptions"] as? Bool ?? true
            return (response as? HTTPURLResponse)?.statusCode == 200 && value?["ok"] as? Bool == true && value?["ready"] as? Bool == true
        } catch { let error = error as NSError; print("Interview bridge status error: \(error.domain) \(error.code), underlying: \(String(describing: error.userInfo[NSUnderlyingErrorKey]))"); return false }
    }
    func analyze(audio: URL, question: String, mode: String, transcript: String) async throws -> [String: String] {
        let data = try Data(contentsOf: audio)
        guard configured, data.count > 44, data.count <= 3_000_000 else { throw InterviewError.invalidResponse }
        var request = request("analyze"); request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["audio": data.base64EncodedString(), "question": question, "mode": mode, "transcript": transcript, "consent": true])
        let (result, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let object = try JSONSerialization.jsonObject(with: result) as? InterviewJSON,
              object["ok"] as? Bool == true, let feedback = object["result"] as? InterviewJSON else { throw InterviewError.connection }
        return feedback.compactMapValues { $0 as? String }
    }
    func close() { session.invalidateAndCancel() }
    func captions(question: String, mode: String, onText: @escaping (String, Bool) -> Void, onFailure: @escaping () -> Void) -> PracticeCaptions {
        var request = request("live")
        var components = URLComponents(url: endpoint.appendingPathComponent("live"), resolvingAgainstBaseURL: false)!
        components.scheme = endpoint.scheme == "https" ? "wss" : "ws"; request.url = components.url!
        return PracticeCaptions(socket: session.webSocketTask(with: request), question: question, mode: mode, onText: onText, onFailure: onFailure)
    }
}

@MainActor final class PracticeCaptions {
    private let socket: URLSessionWebSocketTask
    private var queued: [Data] = [], queuedSize = 0
    private var ready = false, closed = false, finishing = false
    private var text = "", words = ""
    private var completed: ((String, Bool) -> Void)?
    private var readTask: Task<Void, Never>?, timeout: Task<Void, Never>?
    init(socket: URLSessionWebSocketTask, question: String, mode: String, onText: @escaping (String, Bool) -> Void, onFailure: @escaping () -> Void) {
        self.socket = socket; socket.resume()
        readTask = Task { [weak self] in
            guard let self else { return }
            do {
                let config = try JSONSerialization.data(withJSONObject: ["type": "configure", "question": question, "mode": mode])
                try await socket.send(.string(String(decoding: config, as: UTF8.self)))
                while !closed {
                    let message = try await socket.receive()
                    guard case .string(let raw) = message, let object = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? InterviewJSON else { continue }
                    switch object["type"] as? String {
                    case "ready":
                        ready = true
                        for data in queued { try await socket.send(.data(data)) }; queued = []; queuedSize = 0
                        if finishing { try await socket.send(.string("{\"type\":\"end\"}")) }
                    case "transcript":
                        text = object["text"] as? String ?? ""
                        let filtered = text.replacingOccurrences(of: "[\\[(][^\\])]*(?:잡음|소음|음악|박수|noise|music|applause|silence)[^\\])]*[\\])]", with: "", options: [.regularExpression, .caseInsensitive])
                        let next = filtered.filter { $0.isLetter || $0.isNumber }
                        let speech = object["partial"] as? Bool == true && !next.isEmpty && next != words
                        words = next; if !finishing { onText(text, speech) }
                    case "finished": finish(text: object["text"] as? String ?? text, confirmed: object["confirmed"] as? Bool == true)
                    case "error": throw InterviewError.connection
                    default: break
                    }
                }
            } catch { if !closed { finish(text: text, confirmed: false); onFailure() } }
        }
    }
    var available: Bool { !closed }
    func pcm(_ data: Data) {
        guard !closed, !finishing else { return }
        guard queuedSize + data.count <= 512_000 else { finish(text: text, confirmed: false); return }
        queuedSize += data.count
        Task { [weak self] in
            guard let self, !closed else { return }
            if ready { do { try await socket.send(.data(data)) } catch { finish(text: text, confirmed: false) }; queuedSize -= data.count }
            else { queued.append(data) }
        }
    }
    func end(_ callback: @escaping (String, Bool) -> Void) {
        if closed { callback(text, false); return }
        finishing = true; completed = callback
        if ready { Task { try? await socket.send(.string("{\"type\":\"end\"}")) } }
        timeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard !Task.isCancelled, let self else { return }; finish(text: text, confirmed: false)
        }
    }
    private func finish(text: String, confirmed: Bool) {
        guard !closed else { return }; closed = true; self.text = text
        timeout?.cancel(); socket.cancel(with: .normalClosure, reason: nil); queued = []; queuedSize = 0
        let callback = completed; completed = nil; callback?(text, confirmed)
    }
    func close() { completed = nil; finish(text: text, confirmed: false); readTask?.cancel() }
}
#endif

#if DEBUG
import Foundation

enum PracticeCLIError: Error { case server(String), invalidResponse }
struct PracticeCLIResult {
    let state: String
    var transcript = ""
    var feedback: [String: String]?
    var notice: String?
    var pending: Bool { ["queued", "running", "uploading"].contains(state) }
}

/// The app session owns authentication; no PC credential is stored in this client.
@MainActor final class PracticeCLI {
    typealias Request = (String, [String: Any]) async throws -> [String: Any]
    let request: Request
    init(request: @escaping Request) { self.request = request }
    private func call(_ action: String, account: String, fields: [String: Any] = [:]) async throws -> [String: Any] {
        guard !account.isEmpty, account.count <= 200 else { throw PracticeCLIError.invalidResponse }
        var body = fields; body["accountId"] = account
        let value = try await request(action, body)
        guard value["ok"] as? Bool == true else { throw PracticeCLIError.server(value["error"] as? String ?? "practice_unavailable") }
        return value
    }
    func ready(account: String) async throws -> Bool {
        let result = try await call("status", account: account)
        return result["ready"] as? Bool == true
    }
    func advance(id: String, account: String, mode: String, questionID: String, question: String, audio: URL, allowSubmission: Bool) async throws -> PracticeCLIResult {
        guard UUID(uuidString: id) != nil, ["job", "personality", "ai"].contains(mode) else { throw PracticeCLIError.invalidResponse }
        let value: [String: Any]
        do { value = try await call("get", account: account, fields: ["id": id]) }
        catch PracticeCLIError.server("not_found") {
            guard allowSubmission, !questionID.isEmpty, !question.isEmpty else { throw PracticeCLIError.server("not_found") }
            let bytes = try Data(contentsOf: audio)
            guard bytes.count > 44, bytes.count <= 3_000_000 else { throw PracticeCLIError.invalidResponse }
            value = try await call("submit", account: account, fields: ["id": id, "mode": mode, "questionId": questionID, "questionPrompt": question, "audioBase64": bytes.base64EncodedString()])
        }
        guard value["id"] as? String == id, let state = value["state"] as? String,
              ["uploading", "queued", "running", "completed", "failed", "unknown", "cancelled"].contains(state) else { throw PracticeCLIError.invalidResponse }
        var result = PracticeCLIResult(state: state)
        if state == "completed" {
            guard let report = value["report"] as? [String: Any] else { throw PracticeCLIError.invalidResponse }
            result.transcript = (report["transcripts"] as? [String])?.first ?? ""
            if let analysis = report["analysis"] as? [String: Any], let summary = analysis["summary"] as? String {
                func notes(_ key: String) -> String {
                    (analysis[key] as? [[String: Any]] ?? []).compactMap { item in
                        guard let feedback = item["feedback"] as? String, let quote = item["quote"] as? String else { return nil }
                        return feedback + "\n나의 답변: “" + quote + "”"
                    }.joined(separator: "\n\n")
                }
                result.feedback = ["summary": summary, "strength": notes("strengths"), "improvement": notes("improvements"), "nextPractice": notes("nextPractice")]
            } else { result.notice = "인식 결과를 확인해야 합니다. 녹음을 듣고 다시 연습해주세요." }
        }
        return result
    }
}
#endif

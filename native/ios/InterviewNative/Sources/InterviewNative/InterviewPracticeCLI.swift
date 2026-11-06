#if DEBUG
import Foundation

enum PracticeCLIError: Error { case server(String), invalidResponse }
struct PracticeCLIResult {
    let state: String
    var transcript = ""
    var feedback: [String: String]?
    var notice: String?
    var exampleAnswer: String?
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
        var value: [String: Any]
        var missing = false
        do { value = try await call("get", account: account, fields: ["id": id]) }
        catch PracticeCLIError.server("not_found") { value = [:]; missing = true }
        if missing || (allowSubmission && value["state"] as? String == "uploading") {
            guard allowSubmission, !questionID.isEmpty, !question.isEmpty else { throw PracticeCLIError.server("not_found") }
            let bytes = try Data(contentsOf: audio)
            guard bytes.count > 44, bytes.count <= 3_000_000 else { throw PracticeCLIError.invalidResponse }
            value = try await call("submit", account: account, fields: ["id": id, "mode": mode, "questionId": questionID, "questionPrompt": question, "audioBase64": bytes.base64EncodedString()])
        }
        guard value["id"] as? String == id, let state = value["state"] as? String,
              ["uploading", "queued", "running", "completed", "failed", "unknown", "cancelled"].contains(state) else { throw PracticeCLIError.invalidResponse }
        var result = PracticeCLIResult(state: state)
        if let example = value["referenceAnswer"] as? String, !example.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            result.exampleAnswer = example
        }
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
            } else if (report["status"] as? String) == "review_required" || (report["assessment"] as? [[String: Any]])?.isEmpty != false {
                let reasons = report["reasons"] as? [String] ?? []
                if reasons.contains("transcript_disagreement") {
                    result.notice = "음성 인식 결과가 서로 달라 판정을 보류했습니다. 녹음을 확인해주세요."
                } else if reasons.contains("audio_too_quiet") {
                    result.notice = "답변 소리가 작아 분석하지 못했습니다. 녹음을 확인해주세요."
                } else {
                    result.notice = "답변을 명확하게 인식하지 못해 판정을 보류했습니다. 녹음을 확인해주세요."
                }
            }
            if mode == "job", report["assessmentBasis"] as? String == "unavailable" {
                result.notice = "예시답변이 없어 ○·△·× 판정을 보류했습니다."
            }
            if let rows = report["assessment"] as? [[String: Any]], !rows.isEmpty,
               JSONSerialization.isValidJSONObject(rows), let data = try? JSONSerialization.data(withJSONObject: rows),
               let assessment = String(data: data, encoding: .utf8) {
                var feedback = result.feedback ?? [:]
                feedback["assessment"] = assessment
                result.feedback = feedback
            }
        }
        return result
    }
}
#endif

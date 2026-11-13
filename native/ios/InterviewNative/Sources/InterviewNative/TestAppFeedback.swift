#if DEBUG
import SwiftUI

public struct TestAppFeedbackError: Error {
    public let code: String
    public init(code: String) { self.code = code }
}

@MainActor public enum TestAppFeedbackTransport {
    public static var send: (([String: Any]) async throws -> Void)?
}

@MainActor public struct TestAppFeedbackForm: View {
    let screen: String
    public init(screen: String) { self.screen = screen }
    @Environment(\.dismiss) private var dismiss
    @State private var kind = "bug"
    @State private var content = ""
    @State private var requestID = UUID().uuidString
    @State private var sending = false
    @State private var sent = false
    @State private var error = ""
    public var body: some View {
        NavigationStack {
            Form {
                if sent {
                    Section { Text("의견을 접수했습니다. 감사합니다.").accessibilityIdentifier("test.feedback.success") }
                } else {
                    Section {
                        Picker("종류", selection: $kind) { Text("오류 신고").tag("bug"); Text("개선 의견").tag("suggestion") }
                        TextEditor(text: $content).frame(minHeight: 140).accessibilityLabel("의견 내용")
                            .accessibilityIdentifier("test.feedback.content")
                        Text("어느 화면에서 어떤 문제가 있었는지 적어주세요. 비밀번호 등 민감한 정보는 적지 마세요.").font(.caption).foregroundStyle(.secondary)
                        Text("\(content.utf16.count) / 2,000자").font(.caption).foregroundStyle(.secondary)
                        Text("작성 내용은 관리자에게만 전달됩니다. 녹음·답변 내용은 자동으로 첨부하지 않습니다.").font(.caption).foregroundStyle(.secondary)
                    }.disabled(sending)
                    if !error.isEmpty { Text(error).foregroundStyle(.red).accessibilityIdentifier("test.feedback.error") }
                    Button(sending ? "보내는 중…" : "의견 보내기") { Task { await submit() } }
                        .disabled(sending || content.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || content.utf16.count > 2000)
                        .accessibilityIdentifier("test.feedback.submit")
                }
            }.navigationTitle("의견 보내기").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(sent ? "닫기" : "취소") { dismiss() }.disabled(sending) } }
                .interactiveDismissDisabled(sending)
                .onChange(of: content) { _ in requestID = UUID().uuidString; error = "" }
                .onChange(of: kind) { _ in requestID = UUID().uuidString; error = "" }
        }
    }
    private func submit() async {
        guard !sending, let send = TestAppFeedbackTransport.send else { error = "앱의 로그인 화면에서 다시 연결해주세요."; return }
        sending = true; error = ""
        defer { sending = false }
        let info = Bundle.main.infoDictionary ?? [:]
        let version = String(describing: info["CFBundleShortVersionString"] ?? "") + "(" + String(describing: info["CFBundleVersion"] ?? "") + ")"
        do {
            try await send(["requestId": requestID, "kind": kind, "content": content.trimmingCharacters(in: .whitespacesAndNewlines), "screen": screen, "appVersion": String(version.prefix(50))])
            sent = true
        } catch {
            switch (error as? TestAppFeedbackError)?.code {
            case "unauthorized": self.error = "로그인 후 의견을 보내주세요. 작성한 내용은 이 화면에 유지됩니다."
            case "rate_limited": self.error = "오늘 의견 접수 한도에 도달했습니다. 내일 다시 보내주세요."
            default: self.error = "보내지 못했습니다. 작성한 내용은 유지됩니다. 잠시 후 다시 시도해주세요."
            }
        }
    }
}
#endif

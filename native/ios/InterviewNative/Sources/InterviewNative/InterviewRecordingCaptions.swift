import SwiftUI

struct PracticeRecordingCaption: Decodable, Identifiable {
    var id: Int { number }
    let number: Int
    let status: String
    let text: String
    let studentText: String?
    let studentRevision: Int?
    let studentUpdatedAt: String?
    var editableText: String { studentText ?? text }
    var message: String {
        switch status {
        case "completed":
            if let studentText { return studentText.isEmpty ? "수정한 자막 내용이 없습니다." : studentText }
            return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "녹음에서 인식된 음성이 없습니다." : text
        case "uploading": return "녹음 전송 후 자막을 준비합니다."
        case "processing": return "녹음 자막을 만들고 있습니다."
        case "failed": return "녹음 자막을 만들지 못했습니다. 저장된 녹음은 계속 들을 수 있습니다."
        case "unavailable": return "자막을 만들 수 있는 녹음이 없습니다."
        default: return "녹음 자막 준비 중입니다."
        }
    }
}

/// Server captions remain separate from local answers and the archive fingerprint.
@MainActor final class PracticeRecordingCaptions: ObservableObject {
    typealias Request = (String) async throws -> [String: Any]
    typealias Save = (String, Int, Int, String) async throws -> [String: Any]
    private let request: Request?
    private let saveRequest: Save?
    private var activeID: String?
    private var generation = 0
    @Published private(set) var rows: [PracticeRecordingCaption] = []
    @Published private(set) var loading = false
    @Published private(set) var error = false
    @Published private(set) var estimate: PracticeRecordingEstimate?
    @Published private(set) var saving = false
    @Published private(set) var saveError = ""
    var estimateMessage: String { estimate?.message ?? "예상 소요 시간을 확인하고 있습니다." }
    var showsEstimate: Bool { ["pending", "waiting", "uploading"].contains(estimate?.state ?? "") || rows.isEmpty || rows.contains { !["completed", "failed", "unavailable"].contains($0.status) } }
    var canEdit: Bool { saveRequest != nil }
    init(request: Request?, save: Save? = nil) { self.request = request; self.saveRequest = save }
    func refresh(_ id: String) async {
        guard activeID == id, !loading, let request else { return }
        let ticket = generation
        loading = true; error = false
        defer { if activeID == id, ticket == generation { loading = false } }
        do {
            let result = try await request(id)
            guard !Task.isCancelled, activeID == id, ticket == generation else { return }
            guard (result["runId"] as? String)?.lowercased() == id.lowercased(), let values = result["captions"] as? [[String: Any]] else { throw URLError(.badServerResponse) }
            let incoming = try JSONDecoder().decode([PracticeRecordingCaption].self, from: JSONSerialization.data(withJSONObject: values))
            rows = incoming.map { row in
                if let prior = rows.first(where: { $0.number == row.number }), (prior.studentRevision ?? 0) > (row.studentRevision ?? 0) { return prior }
                return row
            }
            if let value = result["estimate"] as? [String: Any] { estimate = try JSONDecoder().decode(PracticeRecordingEstimate.self, from: JSONSerialization.data(withJSONObject: value)) }
        } catch { if !Task.isCancelled, activeID == id, ticket == generation { self.error = true } }
    }
    func observe(_ id: String?) async {
        generation += 1
        let ticket = generation
        if activeID != id { activeID = id; rows = []; estimate = nil }
        loading = false; error = false; saving = false; saveError = ""
        guard let id, request != nil else { return }
        await refresh(id)
        for _ in 0..<20 {
            let pending = ["pending", "waiting", "uploading"].contains(estimate?.state ?? "") || rows.isEmpty || rows.contains(where: { !["completed", "failed", "unavailable"].contains($0.status) })
            guard !Task.isCancelled, activeID == id, ticket == generation, !error,
                  pending else { return }
            do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
            await refresh(id)
        }
    }
    func caption(_ number: Int) -> String {
        rows.first(where: { $0.number == number })?.message ?? "녹음 자막을 확인하고 있습니다."
    }
    func save(_ id: String, caption: PracticeRecordingCaption, text: String) async -> Bool {
        guard activeID == id, !saving, let saveRequest else { return false }
        let ticket = generation; saving = true; saveError = ""
        defer { if ticket == generation { saving = false } }
        do {
            let result = try await saveRequest(id, caption.number, caption.studentRevision ?? 0, text)
            guard !Task.isCancelled, ticket == generation, activeID == id else { return false }
            guard (result["runId"] as? String)?.lowercased() == id.lowercased(), let value = result["caption"] as? [String: Any] else { throw URLError(.badServerResponse) }
            let updated = try JSONDecoder().decode(PracticeRecordingCaption.self, from: JSONSerialization.data(withJSONObject: value))
            rows = rows.map { $0.number == updated.number ? updated : $0 }; return true
        } catch {
            if ticket == generation {
                let details = String(describing: error) + ((error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? "")
                saveError = details.contains("revision_conflict") ? "다른 화면에서 먼저 수정했습니다. 입력한 내용을 복사한 뒤 취소하고 기록을 다시 열어주세요." : "수정본을 저장하지 못했습니다. 입력한 내용은 유지됩니다. 다시 저장해주세요."
            }
            return false
        }
    }
}

struct PracticeRecordingEstimate: Decodable {
    let state: String
    let minSeconds: Int?
    let maxSeconds: Int?
    var message: String {
        switch state {
        case "completed": return "녹음 자막이 준비되었습니다."
        case "uploading": return "녹음 전송이 끝나면 예상 소요 시간을 안내합니다."
        case "waiting": return "자막 변환 대기 중입니다. 작업이 재개되면 예상 시간을 안내합니다."
        case "failed": return "일부 녹음 자막을 만들지 못했습니다. 저장된 녹음은 계속 들을 수 있습니다."
        case "unavailable": return "자막을 만들 수 있는 녹음이 없습니다."
        case "pending":
            let low = max(1, Int(ceil(Double(minSeconds ?? 0) / 60))), high = max(low, Int(ceil(Double(maxSeconds ?? 0) / 60)))
            let range = low == high ? String(low) : "\(low)~\(high)"
            return "녹음 자막 완료까지 약 \(range)분 예상됩니다. 녹음 길이와 대기 상황에 따라 달라질 수 있습니다."
        default: return "예상 소요 시간을 확인하고 있습니다."
        }
    }
}

struct PracticeRecordingCaptionEditor: View {
    let caption: PracticeRecordingCaption
    let save: (String) async -> String?
    let player: AnyView?
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var saving = false
    @State private var error = ""
    @State private var confirmDiscard = false
    init(caption: PracticeRecordingCaption, player: AnyView? = nil, save: @escaping (String) async -> String?) {
        self.caption = caption; self.player = player; self.save = save; _text = State(initialValue: caption.editableText)
    }
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                if let player { player }
                TextEditor(text: $text).disabled(saving).accessibilityLabel("녹음 자막 수정").border(Color.secondary.opacity(0.3))
                Text("\(text.utf16.count) / 30,000자").font(.caption).foregroundStyle(.secondary)
                if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(.red) }
                Button(saving ? "저장 중…" : "수정 저장") {
                    saving = true
                    Task { if let message = await save(text) { error = message; saving = false } else { dismiss() } }
                }.buttonStyle(.borderedProminent).disabled(saving || text.utf16.count > 30000)
            }.padding().navigationTitle("녹음 자막 수정").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button("취소") { if text != caption.editableText { confirmDiscard = true } else { dismiss() } }.disabled(saving)
                } }
                .alert("저장하지 않은 수정 내용을 버릴까요?", isPresented: $confirmDiscard) {
                    Button("수정 취소", role: .destructive) { dismiss() }; Button("계속 수정", role: .cancel) {}
                }
        }.interactiveDismissDisabled(saving || text != caption.editableText)
    }
}

#if DEBUG
/// Synthetic editor fixture. No account, recording or server is accessed.
@MainActor public struct PracticeCaptionEditorFixture: View {
    @State private var presented = false
    @State private var saved = ""
    public init() {}
    public var body: some View {
        VStack {
            Button("자막 수정") { presented = true }.accessibilityIdentifier("caption.fixture.open")
            Text(saved).accessibilityIdentifier("caption.fixture.saved")
        }.sheet(isPresented: $presented) {
            PracticeRecordingCaptionEditor(caption: PracticeRecordingCaption(number: 1, status: "completed", text: "automatic original", studentText: "", studentRevision: 1, studentUpdatedAt: nil)) { text in
                saved = text
                return nil
            }
        }
    }
}
#endif

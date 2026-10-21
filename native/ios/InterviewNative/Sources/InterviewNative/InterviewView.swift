import SwiftUI

/// Present only this view for the mock interview route. The surrounding app keeps its existing screens.
@MainActor public struct InterviewView: View {
    @StateObject private var model: InterviewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var showExit = false, showCaptions = true, details = false
    private let teal = Color(red: 0.03, green: 0.49, blue: 0.45)
    private let ink = Color(red: 0.08, green: 0.17, blue: 0.26)
    public init(launchCode: String) { _model = StateObject(wrappedValue: InterviewModel(code: launchCode, demo: false)) }
    #if DEBUG
    public init(preview: Bool) { _model = StateObject(wrappedValue: InterviewModel(code: "", demo: preview)) }
    #endif
    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if model.demo { Text("무료 테스트 · 가상 질문·답변 / iOS 네이티브 화면").font(.caption).foregroundStyle(teal) }
                    content
                    Text(model.notice).font(.footnote).frame(maxWidth: .infinity, alignment: .leading)
                        .padding().background(teal.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
                }.padding(24)
            }
            .id(model.screen)
            .background(Color(red: 0.965, green: 0.973, blue: 0.98))
            .foregroundStyle(ink).navigationTitle("모의면접").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("돌아가기") { if model.active { showExit = true } else { dismiss() } } } }
            .tint(teal)
            .confirmationDialog("면접을 마칠까요?", isPresented: $showExit, titleVisibility: .visible) {
                Button("종료하고 기록 보기", role: .destructive) { model.stop() }
                Button("계속 면접하기", role: .cancel) {}
            } message: { Text("마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.") }
        }
        .interactiveDismissDisabled(model.active)
        .task { await model.load() }
        .onChange(of: phase) { value in if value == .background { model.background() } }
        .onDisappear { model.dispose() }
    }
    @ViewBuilder private var content: some View {
        switch model.screen {
        case .auth: ProgressView("앱에 연결하고 있습니다.")
        case .error: Text("학생앱에서 모의면접을 다시 열어주세요.").font(.title2)
        case .connecting: ProgressView("AI 면접관 연결 중")
        case .prep: prep
        case .live, .closing: live
        case .result: result
        case .records: records
        }
    }
    private func action(_ title: String, primary: Bool = false, enabled: Bool = true, run: @escaping () -> Void) -> some View {
        Button(action: run) { Text(title).font(.body.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 13) }
            .buttonStyle(.plain).background(primary ? teal : .white, in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(primary ? .white : teal).disabled(!enabled).opacity(enabled ? 1 : 0.5)
    }
    private var prep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("BEFORE WE BEGIN").font(.caption).tracking(2).foregroundStyle(teal)
            Text("편안하게 앉아 주세요.").font(.largeTitle.bold())
            Text("질문은 한 번에 하나씩, 충분히 듣겠습니다.").font(.subheadline).foregroundStyle(.secondary)
            InterviewPreparationMedia(media: model.media)
            Text("기본 질문 3개 · 꼬리 질문 최대 2개씩 · 최대 10분").font(.subheadline)
            Text("이어폰 사용을 권장합니다. 음성과 대화 기록은 수강 종료 후 30일까지 보관합니다. 확정 점수는 부여하지 않습니다.").font(.footnote).foregroundStyle(.secondary)
            action("면접 시작하기 →", primary: true, enabled: model.ready) { model.start() }.accessibilityIdentifier("interview.start")
            action("내 면접 기록") { Task { await model.loadRecords() } }
            if !model.ready { action("연결 다시 확인") { Task { await model.checkReady() } } }
        }
    }
    private var live: some View {
        VStack(spacing: 18) {
            HStack { Text("실전 모의면접").font(.headline); Spacer()
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let seconds = min(600, max(0, Int(context.date.timeIntervalSince(model.startedAt))))
                    Text(String(format: "%d:%02d / 10:00", seconds / 60, seconds % 60)).monospacedDigit().font(.caption)
                        .onChange(of: seconds) { value in if value >= 600 { model.stop() } }
                }
            }
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Circle().fill(teal.opacity(0.04)).frame(width: 180, height: 180)
                    Circle().fill(teal.opacity(0.06)).frame(width: 150, height: 150)
                    Circle().fill(RadialGradient(colors: [Color(red: 0.84, green: 0.99, blue: 0.95), Color(red: 0.54, green: 0.84, blue: 0.77), Color(red: 0.16, green: 0.28, blue: 0.37)], center: .topLeading, startRadius: 0, endRadius: 145)).frame(width: 120, height: 120)
                }.frame(maxWidth: .infinity).accessibilityLabel("AI 면접관")
                InterviewSmallCamera(media: model.media)
            }
            Text(String(format: "진행 질문 %02d", model.questionNumber)).font(.caption).foregroundStyle(teal)
            Text(model.question).font(.title2.bold()).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            if showCaptions {
                VStack(alignment: .leading, spacing: 10) {
                    Text("면접관").font(.caption).foregroundStyle(teal); Text(model.spoken)
                    Text("내 답변 · 실시간 자막").font(.caption).foregroundStyle(teal); Text(model.transcript)
                }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.white, in: RoundedRectangle(cornerRadius: 18))
            }
            action(model.muted ? "마이크 켜기" : "마이크 끄기", enabled: model.screen == .live) { model.mute() }
            action(showCaptions ? "자막 숨기기" : "자막 보기") { showCaptions.toggle() }
            action(model.answering ? "답변 확인 중…" : "답변 완료 →", primary: true,
                   enabled: model.screen == .live && !model.answering && !model.muted) { model.answer() }.accessibilityIdentifier("interview.answer")
            action(model.screen == .closing ? "종료·저장 중…" : "면접 종료", enabled: model.screen == .live) { showExit = true }.accessibilityIdentifier("interview.end")
        }
    }
    private var result: some View {
        let run = model.record?["run"] as? InterviewJSON ?? [:]
        let turns = run["turns"] as? [InterviewJSON] ?? []
        return VStack(alignment: .leading, spacing: 18) {
            Text("INTERVIEW RECORD").font(.caption).tracking(2).foregroundStyle(teal)
            Text("내 답변을 돌아보고,\n다음 연습을 준비해요.").font(.title.bold())
            Text("실제 기록 기반 · 확정 채점 결과 아님").font(.caption).foregroundStyle(.secondary)
            Picker("결과 보기", selection: $details) { Text("종합").tag(false); Text("질문별 기록").tag(true) }.pickerStyle(.segmented)
            if model.record == nil { Text("기록을 확인하고 있습니다. 잠시 후 다시 확인해주세요.") }
            else if details {
                if run["recording_partial"] as? Bool == true { Text("중단 후 복구한 음성으로 일부 구간이 누락될 수 있습니다.").font(.footnote) }
                if model.record?["recordings"] != nil {
                    action("학생 음성 재생") { model.play("input") }
                    action("면접관 음성 재생") { model.play("output") }
                    action("재생 중지") { model.stopPlayback() }
                }
                ForEach(turns.indices, id: \.self) { i in
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(i + 1) · " + (turns[i]["kind"] as? String == "followup" ? "꼬리 질문" : "기본 질문")).font(.caption).foregroundStyle(teal)
                        Text(turns[i]["question"] as? String ?? "").font(.headline)
                        Text(turns[i]["answer"] as? String ?? "인식한 답변 없음").font(.subheadline)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.white, in: RoundedRectangle(cornerRadius: 18))
                }
            } else {
                Text("완료한 답변 \(turns.filter { $0["complete"] as? Bool == true }.count)개").font(.title2).foregroundStyle(teal)
                Text("보관 종료: " + (run["retain_until"] as? String ?? "확인 중")).font(.caption)
                Text("질문별 기록에서 답변과 녹음을 확인하세요. 강점·보완점 자동 분석은 아직 제공하지 않습니다.").font(.subheadline)
            }
            if !model.demo { action("기록 다시 확인") { Task { await model.loadRecord() } } }
            action("다시 연습하기", primary: true) { Task { await model.checkReady() } }
            action("내 면접 기록") { Task { await model.loadRecords() } }
        }
    }
    private var records: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("내 면접 기록").font(.title.bold())
            if model.recordsLoading { ProgressView() }
            else if model.records.isEmpty { Text("저장된 면접 기록이 없습니다.") }
            ForEach(model.records.indices, id: \.self) { i in
                action((model.records[i]["created_at"] as? String ?? "") + " · 기록 보기") {
                    let id = model.records[i]["id"] as? String ?? ""; model.record = nil
                    Task { await model.loadRecord(id) }
                }
            }
            if model.page > 0 { action("이전 기록") { Task { await model.loadRecords(page: model.page - 1) } } }
            if model.hasMore { action("다음 기록") { Task { await model.loadRecords(page: model.page + 1) } } }
            action("새로고침") { Task { await model.loadRecords(page: model.page) } }
            action("면접 준비로") { Task { await model.checkReady() } }
        }
    }
}

private struct InterviewPreparationMedia: View {
    @ObservedObject var media: InterviewMedia
    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 24).fill(Color.gray.opacity(0.12))
                if media.cameraOn { InterviewCameraPreview(session: media.capture) }
                else { Text("카메라 미리보기\n영상은 전송·저장하지 않습니다.").font(.subheadline).multilineTextAlignment(.center).foregroundStyle(.secondary) }
            }.frame(height: 200).clipShape(RoundedRectangle(cornerRadius: 24))
            Button(media.cameraOn ? "내 모습 함께 보기 · 켜짐" : "내 모습 함께 보기 · 꺼짐") { media.toggleCamera() }.buttonStyle(.bordered)
            Button(media.micOn ? "마이크 확인 종료" : "마이크 확인") { media.toggleMic() }.buttonStyle(.bordered)
            ProgressView(value: media.level)
            if !media.message.isEmpty { Text(media.message).font(.caption).foregroundStyle(.secondary) }
        }
    }
}
private struct InterviewSmallCamera: View {
    @ObservedObject var media: InterviewMedia
    var body: some View {
        if media.cameraOn { InterviewCameraPreview(session: media.capture).frame(width: 72, height: 96).clipShape(RoundedRectangle(cornerRadius: 14)).accessibilityLabel("내 카메라 미리보기") }
    }
}

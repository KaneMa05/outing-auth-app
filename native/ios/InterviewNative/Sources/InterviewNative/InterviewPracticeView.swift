#if DEBUG
import SwiftUI
import AVKit

/// The Android debug practice menu, backed by real bundled audio and local WAV recordings.
@MainActor public struct InterviewPracticeView: View {
    @StateObject private var model = PracticeModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var showExit = false
    @State private var deleting: PracticeRecord?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let teal = Color(red: 8/255, green: 125/255, blue: 114/255)
    private let ink = Color(red: 21/255, green: 44/255, blue: 67/255)
    public init(loadSession: (() async throws -> [String: Any])? = nil) {
        let model = PracticeModel(); model.sessionLoader = loadSession
        if loadSession != nil { model.mode = "job"; model.screen = .prep }
        _model = StateObject(wrappedValue: model)
    }
    public var body: some View {
        NavigationStack {
            ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text(model.screen == .menu ? "론박스터디 · 면접반" : model.modeTitle).font(.subheadline).foregroundStyle(teal)
                        Spacer()
                        if (model.screen == .menu || model.screen == .prep) && !model.isPortalPractice {
                            Menu {
                                ForEach(InterviewPracticePolicy.tracks, id: \.self) { track in
                                    Button(track) { model.changeTrack(track) }.accessibilityIdentifier("practice.track.\(track)")
                                }
                            } label: { Text(model.track + " ▾").font(.headline).padding(12).background(.white, in: RoundedRectangle(cornerRadius: 12)) }
                            .accessibilityIdentifier("practice.track")
                        } else { Text(model.record?.track ?? model.track).font(.subheadline).foregroundStyle(teal) }
                    }
                    content
                    if model.screen != .live {
                        Text(compactNotice).font(.footnote).foregroundStyle(teal).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14).background(teal.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
                    }
                }.padding(24).id("practice.top")
            }
            .background(Color(red: 246/255, green: 248/255, blue: 250/255)).foregroundStyle(ink)
            .navigationTitle("모의면접").navigationBarTitleDisplayMode(.inline).tint(teal)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button("돌아가기") { if model.screen == .live || model.screen == .jobReview { showExit = true } else if model.screen == .menu || model.isPortalPractice { dismiss() } else { model.media.stop(); model.stopPlayback(); model.screen = .menu } }
            } }
            .sheet(isPresented: $model.videoPresented, onDismiss: { model.stopPlayback() }) {
                if let player = model.videoPlayer {
                    NavigationStack {
                        VideoPlayer(player: player).ignoresSafeArea(edges: .bottom)
                            .navigationTitle("면접 영상").navigationBarTitleDisplayMode(.inline)
                            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { model.stopPlayback() } } }
                    }
                }
            }
            .alert("면접을 마칠까요?", isPresented: $showExit) {
                Button("종료하고 기록 보기", role: .destructive) { model.stop() }
                Button("계속 면접하기", role: .cancel) {}
            } message: { Text("마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.") }
            .alert(model.usesLocalAI ? "로컬 AI 피드백" : "무료 AI 테스트", isPresented: $model.needsConsent) {
                Button("기기에서만 연습") { model.start(allowAI: false) }
                Button("동의하고 테스트") { model.start(allowAI: true) }
                Button("취소", role: .cancel) {}
            } message: { Text(model.usesLocalAI ? "답변을 같은 Wi-Fi의 Mac에서 분석합니다. 외부 AI 서비스로 전송하지 않습니다. 답변 후 전사문과 피드백을 제공합니다." : "답변 음성이 Mac 서버를 거쳐 Google Gemini로 전송됩니다. 무료 서비스의 제품 개선에 이용될 수 있으므로 개인정보 없는 테스트용 답변만 사용해주세요.") }
            .alert("기록을 삭제할까요?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                Button("삭제", role: .destructive) { if let deleting { model.delete(deleting.id) }; deleting = nil }
                Button("취소", role: .cancel) { deleting = nil }
            } message: { Text("이 기기에 저장된 답변 음성과 영상도 삭제됩니다.") }
            .onChange(of: model.screen) { _ in
                DispatchQueue.main.async { scroll.scrollTo("practice.top", anchor: .top) }
            }
            }
        }
        .interactiveDismissDisabled(model.screen == .live || model.screen == .jobReview)
        .task { await model.load() }
        .onChange(of: phase) { value in if value == .background { model.background() } }
        .onDisappear { model.dispose() }
    }
    private var compactNotice: String {
        switch model.notice {
        case "무료 AI 테스트 연결됨 · 테스트용 답변만 사용해주세요.": return "AI 연결됨"
        case "기기 내 녹음·재생 · AI 서버 연결 대기": return "AI 연결 대기"
        case "답변 음성은 이 기기에만 저장됩니다.", "음성은 이 기기에 저장되었습니다.": return "녹음은 이 기기에 저장됩니다."
        default: return model.notice
        }
    }
    private func action(_ label: String, primary: Bool = false, enabled: Bool = true, id: String = "", run: @escaping () -> Void) -> some View {
        Button(action: run) { Text(label).font(.body.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 14) }
            .foregroundStyle(primary ? .white : teal)
            .buttonStyle(PracticePressStyle(primary: primary, tint: teal)).disabled(!enabled).opacity(enabled ? 1 : 0.45).accessibilityIdentifier(id)
    }
    @ViewBuilder private var content: some View {
        switch model.screen {
        case .menu:
            Text("모의면접").font(.title.bold())
            action("전공(직무) 시험모드     ›", id: "practice.mode.job") { model.select("job") }
            action("인성 연습모드     ›", id: "practice.mode.personality") { model.select("personality") }
            action("실전 모의면접 (AI)     ›", id: "practice.mode.ai") { model.select("ai") }
                        action("내 면접 기록", id: "practice.records") { model.showRecords() }
            if !model.bridgeReady { action("AI 연결 다시 확인") { Task { await model.load() } } }
        case .prep:
            Text(model.mode == "job" ? "전공 연습" : "면접 준비").font(.title.bold())
            if model.mode == "job" { Text("질문을 듣고 답변한 뒤, 내 답변과 피드백을 확인하세요.").font(.subheadline).foregroundStyle(.secondary) }
            if model.mode == "job" {
                Text("연습 문항 수").font(.subheadline).foregroundStyle(.secondary)
                Picker("연습 문항 수", selection: Binding(get: { model.jobQuestionCount }, set: { model.setJobQuestionCount($0) })) {
                    ForEach([1, 3, 5, 10], id: \.self) { Text("\($0)문항").tag($0) }
                }.pickerStyle(.segmented).accessibilityIdentifier("practice.job-count")
                if model.questions.count < model.jobQuestionCount { Text("준비된 \(model.questions.count)문항으로 진행합니다.").font(.caption).foregroundStyle(.secondary) }
            }
            PracticePreparationMedia(media: model.media, cameraEnabled: model.showsInterviewer)
            if model.showsInterviewer {
            Toggle("내 모습과 답변 영상 녹화", isOn: $model.recordVideo).accessibilityIdentifier("practice.video-toggle")
            Text("영상은 기기에만 저장됩니다.").font(.caption).foregroundStyle(.secondary)
            }
            if model.questions.isEmpty && !model.sessionLoading { Text(model.isPortalPractice ? "공개 승인된 질문이 없습니다. 관리자 승인 후 다시 열어주세요." : "해당 직렬에 준비된 질문이 없습니다.").font(.subheadline) }
            action(model.sessionLoading ? "준비 중…" : "연습 시작", primary: true, enabled: !model.sessionLoading && !model.questions.isEmpty && !model.videoSaving, id: "interview.start") { model.start() }
            action("내 면접 기록", id: "practice.records") { model.showRecords() }
        case .live:
            if model.mode == "job" || model.mode == "personality" {
                Toggle("실시간 자막", isOn: Binding(get: { model.liveCaptionsEnabled }, set: { model.setLiveCaptions($0) }))
                    .accessibilityIdentifier("practice.live-captions")
            }
            HStack {
                Text("질문 \(model.number) / \(model.questions.count)").font(.headline); Spacer()
                Button("다시 듣기") { model.speakQuestion() }.disabled(model.answering || model.countdown != nil).accessibilityIdentifier("practice.replay")
            }
            Text(String(format: "%d:%02d / 10:00", model.elapsed / 60, model.elapsed % 60)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
            if model.showsInterviewer {
            PracticeConversationStage(media: model.media, meter: model.meter, talking: model.talking, preparing: model.countdown != nil, avatarURL: model.avatarURL, questionPlayer: model.questionPlayer)
            } else {
                VStack(spacing: 16) {
                    Image(systemName: model.talking ? "speaker.wave.2.fill" : "mic.fill")
                        .font(.system(size: 36)).foregroundStyle(teal)
                    PracticeVoiceIndicator(meter: model.meter, talking: model.talking, preparing: model.countdown != nil)
                }.frame(maxWidth: .infinity).padding(28)
                    .background(.white, in: RoundedRectangle(cornerRadius: 20))
                    .accessibilityIdentifier("practice.audio-only")
            }
            PracticeTurnStatus(meter: model.meter, talking: model.talking)
            if let countdown = model.countdown {
                Text("\(countdown)").font(.system(size: 44, weight: .semibold, design: .rounded)).monospacedDigit()
                    .frame(maxWidth: .infinity).accessibilityIdentifier("practice.start-countdown")
            } else {
                Text(model.question).font(.title2.bold()).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            }
            if model.streamsCaptions && !model.transcript.isEmpty {
                Text(model.transcript).font(.subheadline).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 18))
            }
            action(model.countdown != nil ? "면접 준비 중" : model.talking ? "질문 듣는 중" : model.answering ? "답변 확인 중…" : "답변 완료 →", primary: true, enabled: !model.talking && !model.answering && model.recordingReady, id: "interview.answer") { model.answer() }
            action("면접 종료", id: "interview.end") { showExit = true }
        case .jobReview:
            jobReview
        case .result:
            result
        case .records:
            Text("내 면접 기록").font(.title.bold())
            action("면접 준비로") { model.select(model.mode) }
            if model.records.isEmpty { Text("아직 저장된 기록이 없습니다.").font(.subheadline) }
            ForEach(model.records) { record in
                VStack(alignment: .leading, spacing: 10) {
                    Text(record.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.headline)
                    Text(record.track + " · 질문 \(record.turns.count)개").font(.caption)
                    action("기록 보기") { model.record = record; model.screen = .result }
                    Button("기록 삭제", role: .destructive) { deleting = record }
                }.padding().background(.white, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }
    private var jobReview: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("답변 돌아보기").font(.title.bold())
            Text("질문 \(model.number) / \(model.questions.count)").font(.caption).foregroundStyle(teal)
            Text(model.question).font(.title3.weight(.semibold))
            if let turn = model.record?.turns.first(where: { $0.id == model.number }) {
                Text("답변 \(Int(turn.duration))초").font(.caption).foregroundStyle(.secondary)
                action("내 답변 듣기", id: "practice.job-play-answer") { model.play(turn) }
                action("재생 중지") { model.stopPlayback() }
                if !turn.answer.isEmpty { DisclosureGroup("나의 답변") { Text(turn.answer).font(.body) } }
                if let feedback = turn.analysis {
                    Text("AI 연습 피드백").font(.headline)
                    ForEach(["summary", "strength", "improvement"], id: \.self) { key in
                        if let value = feedback[key], !value.isEmpty { Text(value).font(.subheadline) }
                    }
                } else {
                    Text(turn.analysisPending ? "AI 분석 중 · 결과는 자동 저장됩니다." : turn.analysisError ? "AI 분석 실패 · 녹음은 저장됐습니다." : "AI 미연결 · 녹음을 듣고 점검해 보세요.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            } else { Text("저장된 답변이 없습니다. 마이크와 저장 공간을 확인해주세요.").foregroundStyle(.secondary) }
            DisclosureGroup("답변 점검하기") {
                VStack(alignment: .leading, spacing: 8) {
                Text("질문의 핵심에 먼저 답했나요?")
                Text("전공 용어와 근거를 정확하게 설명했나요?")
                Text("실무 상황이나 적용 예시를 덧붙였나요?")
                }
            }.font(.subheadline).padding().frame(maxWidth: .infinity, alignment: .leading)
                .background(teal.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
            action(model.number >= model.questions.count ? "연습 결과 보기" : "다음 질문 →", primary: true, id: "practice.job-next") { model.nextJobQuestion() }
            action("연습 종료") { showExit = true }
        }
    }

    private var result: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("면접 결과").font(.title.bold())
            if model.canRepeatJobQuestions {
                action("같은 질문으로 다시 연습", id: "practice.job-repeat") { model.repeatJobQuestions() }
            }
            if let record = model.record {
                Text("질문 \(record.turns.count)개").font(.subheadline).foregroundStyle(teal)
                Text("음성·영상은 이 기기에만 저장됩니다.").font(.caption).foregroundStyle(.secondary)
                if model.videoSaving { Text("영상 저장 중…").accessibilityIdentifier("practice.video-saving") }
                if record.video != nil { action("면접 영상 보기", id: "practice.video-play") { model.playVideo() } }
                ForEach(record.turns) { turn in
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(turn.id). " + turn.question).font(.headline)
                        Text("\(Int(turn.duration))초").font(.caption).foregroundStyle(.secondary)
                        action("내 답변 듣기") { model.play(turn) }
                        if !turn.answer.isEmpty {
                            DisclosureGroup("나의 답변") { Text(turn.answer).font(.subheadline) }
                        } else {
                            Text(turn.analysisPending ? "전사·분석 중…" : "인식된 답변 없음").font(.caption).foregroundStyle(.secondary)
                        }
                        if let example = model.exampleAnswer(for: turn) {
                            DisclosureGroup("예시답변") {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(example).font(.subheadline)
                                    Text("학습 참고용 · 공식 정답이 아닙니다.").font(.caption).foregroundStyle(.secondary)
                                }.padding(.top, 6)
                            }.accessibilityIdentifier("practice.example.\(turn.id)")
                        }
                        if !turn.assessment.isEmpty {
                            let grade = turn.overallAssessment
                            HStack(spacing: 12) {
                                Text(grade == "O" ? "○" : grade == "partial" ? "△" : grade == "X" ? "×" : "—")
                                    .font(.system(size: 40, weight: .semibold))
                                    .foregroundStyle(grade == "O" ? Color.teal : grade == "partial" ? Color.orange : grade == "X" ? Color.red : Color.secondary)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(grade == "O" ? "충족" : grade == "partial" ? "부분 충족" : grade == "X" ? "미충족" : "판정 보류").font(.headline)
                                    Text("답변 전체 · 예시답변 기준").font(.caption).foregroundStyle(.secondary)
                                }
                            }.accessibilityIdentifier("practice.overall-grade.\(turn.id)")
                            DisclosureGroup("판정 근거") {
                                VStack(alignment: .leading, spacing: 12) {
                                    ForEach(turn.assessment) { item in
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(item.label).font(.subheadline.weight(.medium))
                                            Text(item.reason).font(.subheadline)
                                            Text(item.claim).font(.caption).foregroundStyle(.secondary)
                                            if !item.quote.isEmpty { Text("나의 답변: “" + item.quote + "”").font(.caption).foregroundStyle(.secondary) }
                                        }
                                    }
                                }
                            }
                        } else if record.mode == "job", turn.analysis != nil {
                            Text("항목별 판정 기준 미등록").font(.caption).foregroundStyle(.secondary)
                        }
                        if let feedback = turn.analysis {
                            Text("AI 연습 피드백").font(.caption).foregroundStyle(teal)
                            ForEach(["summary", "strength", "improvement"], id: \.self) { key in
                                if let value = feedback[key], !value.isEmpty { Text(value).font(.subheadline) }
                            }
                        } else {
                            Text(turn.analysisPending ? "AI 분석 중 · 녹음은 저장되었습니다." : turn.analysisError ? "AI 분석을 완료하지 못했습니다. 녹음은 보관되었습니다." : "AI 평가 미연결").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding().background(.white, in: RoundedRectangle(cornerRadius: 18))
                }
            }
            action("재생 중지") { model.stopPlayback() }
            action("다시 연습하기", primary: true) { model.select(model.mode) }
            action("내 면접 기록", id: "practice.records") { model.showRecords() }
            action("모의면접 메뉴") { model.stopPlayback(); model.screen = .menu }
        }.disclosureGroupStyle(PracticeDisclosureStyle())
    }
}

private struct PracticeDisclosureStyle: DisclosureGroupStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                    configuration.isExpanded.toggle()
                }
            } label: {
                HStack {
                    configuration.label
                    Spacer(minLength: 12)
                    Image(systemName: configuration.isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.semibold)).accessibilityHidden(true)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }.buttonStyle(.plain)
                .accessibilityValue(configuration.isExpanded ? "펼쳐짐" : "접힘")
                .accessibilityHint(configuration.isExpanded ? "접기" : "펼치기")
            if configuration.isExpanded { configuration.content }
        }
    }
}

private struct PracticePressStyle: ButtonStyle {
    let primary: Bool
    let tint: Color
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(primary ? tint : Color.white, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).fill(Color.black.opacity(configuration.isPressed ? 0.055 : 0)))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.955 : 1)
            .offset(y: configuration.isPressed && !reduceMotion ? 1.5 : 0)
            .shadow(color: .black.opacity(configuration.isPressed ? 0.025 : 0.06), radius: configuration.isPressed ? 2 : 7, y: configuration.isPressed ? 1 : 3)
            .animation(reduceMotion ? nil : .spring(response: configuration.isPressed ? 0.2 : 0.3, dampingFraction: 0.76), value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct PracticePreparationMedia: View {
    @ObservedObject var media: InterviewMedia
    let cameraEnabled: Bool
    @State private var detectedInput = false
    @State private var attempted = false
    @State private var permissionDenied = false
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var openURL
    private var status: String {
        if permissionDenied { return "마이크 권한 필요" }
        if detectedInput { return "마이크 입력 확인됨" }
        if media.micOn { return "말해보세요" }
        return attempted ? "입력이 감지되지 않았습니다" : "마이크 테스트"
    }
    var body: some View {
        VStack(spacing: 12) {
            if cameraEnabled {
                ZStack {
                    RoundedRectangle(cornerRadius: 23).fill(Color(red: 220/255, green: 229/255, blue: 233/255))
                    if media.cameraOn { InterviewCameraPreview(media: media) }
                    else { Text("카메라 미리보기").font(.subheadline).foregroundStyle(.secondary) }
                }.frame(width: 216, height: 288).clipShape(RoundedRectangle(cornerRadius: 23)).frame(maxWidth: .infinity)
                    .accessibilityIdentifier("practice.prep-camera")
                    .accessibilityValue(media.cameraReady ? "camera-ready" : "camera-pending")
                Button(media.cameraOn ? "카메라 끄기" : "카메라 켜기") { media.toggleCamera() }
                    .buttonStyle(.bordered).accessibilityIdentifier("practice.camera-test")
            }
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label(status, systemImage: permissionDenied ? "mic.slash" : detectedInput ? "checkmark.circle.fill" : "mic")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(detectedInput && !permissionDenied ? Color.teal : Color.primary)
                        .accessibilityIdentifier("practice.mic-status")
                    Spacer()
                    if permissionDenied {
                        Button("설정 열기") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }.accessibilityIdentifier("practice.mic-settings")
                    } else {
                        Button(media.micOn ? "종료" : "테스트하기") {
                            if media.micOn { media.stopMic() }
                            else { detectedInput = false; attempted = true; media.toggleMic() }
                        }.accessibilityIdentifier("practice.media")
                    }
                }.buttonStyle(.bordered).controlSize(.small)
                if media.micOn {
                    ProgressView(value: media.level)
                        .animation(.linear(duration: 0.05), value: media.level)
                        .accessibilityLabel("마이크 입력 음량")
                }
                if !permissionDenied && media.message.contains("못했습니다") {
                    Text(media.message).font(.caption).foregroundStyle(.secondary)
                }
            }.padding(16).background(.white, in: RoundedRectangle(cornerRadius: 16))
        }
        .onAppear { permissionDenied = AVAudioSession.sharedInstance().recordPermission == .denied }
        .onChange(of: phase) { value in
            if value == .active { permissionDenied = AVAudioSession.sharedInstance().recordPermission == .denied }
        }
        .onChange(of: media.micOn) { _ in permissionDenied = AVAudioSession.sharedInstance().recordPermission == .denied }
        .onChange(of: media.level) { value in
            if media.micOn && value > 0.05 && media.message != "주변 소음 확인 중…" { detectedInput = true }
        }
    }
}
private struct PracticeConversationStage: View {
    @ObservedObject var media: InterviewMedia
    let meter: PracticeMeter
    let talking: Bool
    let preparing: Bool
    let avatarURL: URL?
    let questionPlayer: AVPlayer?
    @Environment(\.scenePhase) private var phase
    var body: some View {
        if let url = avatarURL {
            GeometryReader { geometry in
                HStack(spacing: 0) {
                    ZStack(alignment: .bottomLeading) {
                        if let questionPlayer {
                            InterviewQuestionVideo(player: questionPlayer)
                        } else {
                            InterviewAvatarVideo(url: url, paused: phase != .active)
                        }
                        VStack(alignment: .leading) {
                            Text("AI 면접관").font(.caption2.weight(.medium))
                                .padding(7).background(.ultraThinMaterial, in: Capsule())
                            Spacer()
                            if talking && !preparing {
                                PracticeVoiceIndicator(meter: meter, talking: true, preparing: false)
                                    .padding(8).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                            }
                        }.padding(8)
                    }.frame(width: geometry.size.width * 0.5, height: geometry.size.height)
                        .clipped()
                        .overlay(Rectangle().strokeBorder(Color.teal.opacity(talking && !preparing ? 0.8 : 0), lineWidth: 2))
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("AI 면접관 동작 영상").accessibilityIdentifier("practice.avatar")
                        .accessibilityValue(url.lastPathComponent)
                    PracticeLiveCamera(media: media, meter: meter, talking: talking, preparing: preparing,
                                       height: geometry.size.height, showIndicator: !talking || preparing, joined: true)
                        .frame(width: geometry.size.width * 0.5)
                        .overlay(alignment: .topLeading) {
                            Text("내 모습").font(.caption2.weight(.medium)).padding(7)
                                .background(.ultraThinMaterial, in: Capsule()).padding(8)
                        }
                        .overlay(Rectangle().strokeBorder(Color.teal.opacity(!talking && !preparing ? 0.8 : 0), lineWidth: 2))
                }.clipShape(RoundedRectangle(cornerRadius: 20))
            }.aspectRatio(8.0/7.0, contentMode: .fit)
        } else {
            // Preserve the working full-size camera until the actual video asset is available.
            PracticeLiveCamera(media: media, meter: meter, talking: talking, preparing: preparing)
        }
    }
}

private struct PracticeLiveCamera: View {
    @ObservedObject var media: InterviewMedia
    let meter: PracticeMeter
    let talking: Bool
    let preparing: Bool
    var height: CGFloat? = nil
    var showIndicator = true
    var joined = false
    var body: some View {
        Group {
            if let height { surface.frame(height: height) }
            else { surface.aspectRatio(3/4, contentMode: .fit).frame(maxWidth: 260).frame(maxWidth: .infinity) }
        }.accessibilityIdentifier("practice.live-camera")
            .accessibilityValue(media.cameraReady ? "camera-ready" : "camera-pending")
    }
    private var surface: some View {
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: 24).fill(Color(red: 220/255, green: 229/255, blue: 233/255))
                if media.cameraOn { InterviewCameraPreview(media: media) }
                else {
                    VStack(spacing: 12) {
                        Image(systemName: "person.crop.rectangle").font(.system(size: 34))
                        Text("내 모습 미리보기").font(.subheadline)
                        Button("카메라 켜기") { media.toggleCamera() }.buttonStyle(.bordered)
                        if !media.message.isEmpty { Text(media.message).font(.caption).multilineTextAlignment(.center) }
                    }.padding().foregroundStyle(.secondary)
                }
            }.clipShape(RoundedRectangle(cornerRadius: joined ? 0 : 24))
                .overlay(alignment: .topTrailing) {
                    PracticeRecordingStatus(media: media).padding(8)
                }
            if showIndicator {
                PracticeVoiceIndicator(meter: meter, talking: talking, preparing: preparing)
                    .padding(.horizontal, 10).padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14)).padding(8)
            }
        }
    }
}
private struct PracticeTurnStatus: View {
    @ObservedObject var meter: PracticeMeter
    let talking: Bool
    var body: some View {
        VStack {
            Text(meter.hint).font(.title3.weight(.semibold)).foregroundStyle(talking ? Color.secondary : Color.teal).frame(maxWidth: .infinity)
            ProgressView(value: meter.remaining, total: InterviewAnswerGate.silenceSeconds).tint(.teal).opacity(!talking && meter.remaining < InterviewAnswerGate.silenceSeconds ? 1 : 0)
        }
    }
}
private struct PracticeVoiceIndicator: View {
    @ObservedObject var meter: PracticeMeter
    let talking: Bool
    let preparing: Bool
    private let weights: [CGFloat] = [0.45, 0.75, 1, 0.65, 0.4]
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: preparing ? "timer" : talking ? "speaker.wave.2.fill" : "mic.fill").font(.caption)
            HStack(alignment: .center, spacing: 3) {
                ForEach(weights.indices, id: \.self) { index in
                    Capsule().fill(Color.teal).frame(width: 3, height: 4 + CGFloat(meter.level) * 19 * weights[index])
                }
            }.frame(height: 24).animation(.easeOut(duration: 0.1), value: meter.level)
            Text(preparing ? "준비" : talking ? "질문" : "답변").font(.caption2.weight(.medium))
        }.foregroundStyle(.teal).accessibilityLabel(preparing ? "면접 준비" : talking ? "면접관 질문 음성" : "내 답변 음성")
    }
}
#endif

#if DEBUG
private struct PracticeRecordingStatus: View {
    @ObservedObject var media: InterviewMedia
    var body: some View {
        if media.videoRecording {
            HStack(spacing: 4) {
                Circle().fill(.red).frame(width: 6, height: 6)
                Text("녹화 중").font(.caption2.weight(.semibold))
            }.padding(.horizontal, 7).padding(.vertical, 5)
                .background(.ultraThinMaterial, in: Capsule())
                .accessibilityElement(children: .combine).accessibilityIdentifier("practice.video-recording")
        }
    }
}
#endif

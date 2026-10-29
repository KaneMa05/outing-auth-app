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
    public init() {}
    public var body: some View {
        NavigationStack {
            ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text(model.screen == .menu ? "론박스터디 · 면접반" : model.modeTitle).font(.subheadline).foregroundStyle(teal)
                        Spacer()
                        if model.screen == .menu || model.screen == .prep {
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
                        Text(model.notice).font(.footnote).foregroundStyle(teal).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14).background(teal.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
                    }
                }.padding(24).id("practice.top")
            }
            .background(Color(red: 246/255, green: 248/255, blue: 250/255)).foregroundStyle(ink)
            .navigationTitle("모의면접").navigationBarTitleDisplayMode(.inline).tint(teal)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button("돌아가기") { if model.screen == .live { showExit = true } else if model.screen == .menu { dismiss() } else { model.media.stop(); model.stopPlayback(); model.screen = .menu } }
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
            .alert("무료 AI 테스트", isPresented: $model.needsConsent) {
                Button("기기에서만 연습") { model.start(allowAI: false) }
                Button("동의하고 테스트") { model.start(allowAI: true) }
                Button("취소", role: .cancel) {}
            } message: { Text("답변 음성이 Mac 서버를 거쳐 Google Gemini로 전송됩니다. 무료 서비스의 제품 개선에 이용될 수 있으므로 개인정보 없는 테스트용 답변만 사용해주세요.") }
            .alert("기록을 삭제할까요?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                Button("삭제", role: .destructive) { if let deleting { model.delete(deleting.id) }; deleting = nil }
                Button("취소", role: .cancel) { deleting = nil }
            } message: { Text("이 기기에 저장된 답변 음성과 영상도 삭제됩니다.") }
            .onChange(of: model.screen) { _ in
                DispatchQueue.main.async { scroll.scrollTo("practice.top", anchor: .top) }
            }
            }
        }
        .interactiveDismissDisabled(model.screen == .live)
        .task { await model.load() }
        .onChange(of: phase) { value in if value == .background { model.background() } }
        .onDisappear { model.dispose() }
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
            Text("기기 내 테스트 · AI 분석은 별도 연결과 동의 후 사용").font(.footnote).foregroundStyle(.secondary)
            action("내 면접 기록", id: "practice.records") { model.showRecords() }
            if !model.bridgeReady { action("AI 연결 다시 확인") { Task { await model.load() } } }
        case .prep:
            Text("면접 준비").font(.title.bold())
            PracticePreparationMedia(media: model.media)
            Toggle("내 모습과 답변 영상 녹화", isOn: $model.recordVideo).accessibilityIdentifier("practice.video-toggle")
            Text("영상은 기기에만 저장되며 기록 삭제 시 함께 삭제됩니다.").font(.caption).foregroundStyle(.secondary)
            if model.questions.isEmpty { Text("해당 직렬에 음성이 준비된 질문이 없습니다.").font(.subheadline) }
            action("면접 시작하기 →", primary: true, enabled: !model.questions.isEmpty && !model.videoSaving, id: "interview.start") { model.start() }
            action("내 면접 기록", id: "practice.records") { model.showRecords() }
        case .live:
            HStack {
                Text("실전 모의면접").font(.headline); Spacer()
                Button("다시 듣기") { model.speakQuestion() }.disabled(model.answering || model.countdown != nil).accessibilityIdentifier("practice.replay")
            }
            Text(String(format: "%d:%02d / 10:00", model.elapsed / 60, model.elapsed % 60)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
            PracticeConversationStage(media: model.media, meter: model.meter, talking: model.talking, preparing: model.countdown != nil, avatarURL: model.avatarURL)
            PracticeTurnStatus(meter: model.meter, talking: model.talking)
            Text(String(format: "진행 질문 %02d", model.number)).font(.caption).foregroundStyle(teal)
            if let countdown = model.countdown {
                Text("\(countdown)").font(.system(size: 44, weight: .semibold, design: .rounded)).monospacedDigit()
                    .frame(maxWidth: .infinity).accessibilityIdentifier("practice.start-countdown")
            } else {
                Text(model.question).font(.title2.bold()).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            }
            Text(model.countdown != nil ? "잠시 후 첫 질문을 시작합니다." : model.talking ? "질문이 끝나면 답변을 시작해 주세요." : !model.transcript.isEmpty ? model.transcript : model.bridgeReady ? "말씀하시면 자막이 표시됩니다." : "녹음 중 · 실시간 자막은 AI 연결 후 제공됩니다.")
                .font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(16).background(.white, in: RoundedRectangle(cornerRadius: 18))
            action(model.countdown != nil ? "면접 준비 중" : model.talking ? "질문을 듣고 답변해 주세요" : model.answering ? "답변 확인 중…" : "답변 완료 →", primary: true, enabled: !model.talking && !model.answering && model.recordingReady, id: "interview.answer") { model.answer() }
            action("면접 종료", id: "interview.end") { showExit = true }
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
    private var result: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("면접 결과").font(.title.bold())
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
                        if !turn.answer.isEmpty { Text(turn.answer).font(.subheadline) }
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
    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 23).fill(Color(red: 220/255, green: 229/255, blue: 233/255))
                if media.cameraOn { InterviewCameraPreview(media: media) }
                else { Text("카메라 미리보기\n녹화를 선택하면 기기에 저장합니다.").font(.subheadline).multilineTextAlignment(.center).foregroundStyle(.secondary) }
            }.frame(width: 216, height: 288).clipShape(RoundedRectangle(cornerRadius: 23)).frame(maxWidth: .infinity)
                .accessibilityIdentifier("practice.prep-camera")
                .accessibilityValue(media.cameraReady ? "camera-ready" : "camera-pending")
            Button("카메라 및 마이크 확인") { if !media.cameraOn { media.toggleCamera() }; if !media.micOn { media.toggleMic() } }
                .font(.footnote.weight(.medium)).controlSize(.small)
                .buttonStyle(.bordered).frame(maxWidth: .infinity, minHeight: 44).accessibilityIdentifier("practice.media")
            VStack(alignment: .leading, spacing: 5) {
                Text("마이크 입력 음량").font(.caption2).foregroundStyle(.secondary)
                ProgressView(value: media.level).animation(.linear(duration: 0.05), value: media.level)
            }
            if !media.message.isEmpty { Text(media.message).font(.caption).foregroundStyle(.secondary) }
        }
    }
}
private struct PracticeConversationStage: View {
    @ObservedObject var media: InterviewMedia
    let meter: PracticeMeter
    let talking: Bool
    let preparing: Bool
    let avatarURL: URL?
    @Environment(\.scenePhase) private var phase
    var body: some View {
        if let url = avatarURL {
            GeometryReader { geometry in
                HStack(spacing: 0) {
                    ZStack(alignment: .bottomLeading) {
                        InterviewAvatarVideo(url: url, paused: phase != .active)
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

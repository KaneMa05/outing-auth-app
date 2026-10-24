import SwiftUI
import AVFoundation

@MainActor final class InterviewModel: ObservableObject {
    enum Screen: Hashable { case auth, prep, connecting, live, closing, result, records, error }
    @Published var screen: Screen = .auth
    @Published var ready = false, muted = false, answering = false
    @Published var question = "", transcript = "", spoken = ""
    @Published var notice = "앱 연결을 확인하고 있습니다."
    @Published var questionNumber = 0
    @Published var record: InterviewJSON?
    @Published var records: [InterviewJSON] = []
    @Published var hasMore = false, page = 0, recordsLoading = false
    let media = InterviewMedia()
    let api = InterviewAPI()
    let demo: Bool
    var startedAt = Date()
    private var call: InterviewCall?
    private var runID = "", code: String
    private var loaded = false, disposed = false
    private var requestGeneration = 0
    private var playback: AVPlayer?
    private var demoTurns: [InterviewJSON] = []
    private let samples = ["협업 중 의견 차이를 해결한 경험을 말씀해주세요.", "그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?", "그 경험에서 배운 점을 말씀해주세요."]
    var active: Bool { [.connecting, .live, .closing].contains(screen) }
    init(code: String, demo: Bool) {
        self.code = code
        #if DEBUG
        self.demo = demo
        #else
        self.demo = false
        #endif
    }
    func load() async {
        guard !loaded else { return }; loaded = true
        if demo { screen = .prep; ready = true; notice = "무료 화면 테스트입니다. AI 음성과 실제 답변 인식은 사용하지 않습니다."; return }
        do { try await api.exchange(code); code = ""; guard !disposed else { return }; screen = .prep; await checkReady() }
        catch { code = ""; guard !disposed else { return }; screen = .error; notice = "앱 연결이 만료되었습니다. 학생앱의 모의면접 메뉴에서 다시 열어주세요." }
    }
    func checkReady() async {
        stopPlayback(); screen = .prep
        if demo { ready = true; return }
        ready = false
        do { let result = try await api.command("ready"); guard !disposed, screen == .prep else { return }
            ready = result["ready"] as? Bool == true
            notice = ready ? "준비되면 면접을 시작해주세요." : "면접 연결을 준비 중입니다. 수강 등록과 서버 설정을 확인해주세요."
        } catch { if !disposed { notice = "연결을 확인하지 못했습니다. 다시 시도해주세요." } }
    }
    func start() {
        guard ready, screen == .prep else { return }
        media.stopMic(); stopPlayback()
        screen = .connecting; notice = "마이크와 AI 면접관을 연결하고 있습니다."
        if demo { beginCall(); return }
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] allowed in DispatchQueue.main.async {
            guard let self, !self.disposed, self.screen == .connecting else { return }
            if allowed { self.beginCall() } else { self.screen = .prep; self.notice = "설정에서 마이크 권한을 허용해주세요." }
        }}
    }
    private func beginCall() {
        questionNumber = 1; transcript = ""; spoken = ""; muted = false; answering = false; record = nil
        UIApplication.shared.isIdleTimerDisabled = true
        if demo { demoTurns = []; question = samples[0]; runID = "demo"; startedAt = Date(); screen = .live; notice = "가상 질문입니다. 답변 완료를 누르면 다음 질문으로 이동합니다."; return }
        let session = InterviewCall(api: api); call = session
        session.onReady = { [weak self] id, question in
            guard let self, !self.disposed else { return }
            self.runID = id; self.question = question; self.startedAt = Date(); self.screen = .live
            self.notice = "AI 면접관의 질문을 듣고 답해주세요."
        }
        session.onEvent = { [weak self] event in
            guard let self, !self.disposed, self.screen == .live else { return }
            let type = event["type"] as? String
            if type == "interview.question", let question = event["question"] as? String, question != self.question {
                self.question = question; self.questionNumber += 1; self.transcript = ""; self.spoken = ""
            }
            if type == "session.input_transcript.delta" { self.transcript = String((self.transcript + (event["delta"] as? String ?? "")).suffix(4000)) }
            if type == "session.output_transcript.delta" { self.spoken = String((self.spoken + (event["delta"] as? String ?? "")).suffix(2000)) }
        }
        session.onEnd = { [weak self] id, failed in
            guard let self else { return }
            self.call = nil; self.media.stop(); UIApplication.shared.isIdleTimerDisabled = false
            if self.disposed { self.api.clear(); return }
            self.runID = id; self.screen = .result; self.answering = false
            self.notice = failed ? "연결이 종료되었습니다. 기록 저장 상태를 다시 확인해주세요." : "면접이 종료되었습니다. 기록을 확인해주세요."
            if !id.isEmpty { Task { @MainActor in await self.loadRecord(id) } }
        }
        session.start()
    }
    func answer() {
        guard screen == .live, !answering, !muted else { return }; answering = true
        if demo {
            demoTurns.append(["kind": questionNumber == 2 ? "followup" : "initial", "question": question,
                              "answer": "화면 확인용 가상 답변입니다. 의견을 듣고 역할을 조정했습니다.", "complete": true])
            if questionNumber == samples.count { stop(); return }
            question = samples[questionNumber]; questionNumber += 1; spoken = question; transcript = ""; answering = false; return
        }
        call?.answer { [weak self] result in
            guard let self, !self.disposed, self.screen == .live else { return }; self.answering = false
            switch result {
            case .failure: self.notice = "답변 처리 상태를 확인하지 못했습니다. 종료 후 기록을 확인해주세요."
            case .success(let data): self.notice = data["waiting"] as? Bool == true ? "아직 인식한 답변이 없습니다. 마이크를 확인해주세요." : "다음 질문을 듣고 답해주세요."
            }
        }
    }
    func mute() { muted.toggle(); call?.mute(muted) }
    func stop() {
        guard active, screen != .closing else { return }
        media.stop(); screen = .closing; notice = "마이크를 끄고 면접 기록을 저장하고 있습니다."
        if demo {
            record = ["run": ["turns": demoTurns, "state": "completed", "retain_until": "테스트 데이터 · 앱 종료 시 초기화"]]
            screen = .result; answering = false; UIApplication.shared.isIdleTimerDisabled = false
        } else if let call { call.stop() }
        else { screen = .prep; UIApplication.shared.isIdleTimerDisabled = false }
    }
    func loadRecord(_ id: String? = nil) async {
        stopPlayback(); if let id { runID = id }; let requestedID = runID
        screen = .result
        if demo { return }
        do { let data = try await api.command("get", ["runId": requestedID]); guard !disposed, screen == .result, runID == requestedID else { return }; record = data }
        catch { if !disposed { notice = "기록을 불러오지 못했습니다. 다시 확인해주세요." } }
    }
    func loadRecords(page: Int = 0) async {
        media.stop(); stopPlayback(); screen = .records; self.page = page; records = []; hasMore = false
        guard !demo else { notice = "무료 테스트 기록은 결과 화면에서만 확인할 수 있습니다."; return }
        requestGeneration += 1; let generation = requestGeneration; recordsLoading = true
        defer { if requestGeneration == generation { recordsLoading = false } }
        do { let data = try await api.command("list", ["page": page]); guard !disposed, screen == .records, generation == requestGeneration else { return }
            records = data["runs"] as? [InterviewJSON] ?? []; hasMore = data["hasMore"] as? Bool == true
        } catch { if !disposed { notice = "기록을 불러오지 못했습니다." } }
    }
    func play(_ key: String) {
        stopPlayback()
        guard let files = record?["recordings"] as? [String: String], let raw = files[key], let url = URL(string: raw), url.scheme == "https" else { notice = "재생 링크를 다시 확인해주세요."; return }
        do { try AVAudioSession.sharedInstance().setCategory(.playback); try AVAudioSession.sharedInstance().setActive(true)
            playback = AVPlayer(url: url); playback?.play()
        } catch { notice = "음성을 재생하지 못했습니다." }
    }
    func stopPlayback() { if playback != nil { playback?.pause(); playback = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) } }
    func background() { media.stop(); stopPlayback(); if active { stop() } }
    func dispose() {
        guard !disposed else { return }; disposed = true; media.stop(); stopPlayback(); UIApplication.shared.isIdleTimerDisabled = false
        if let call {
            let previous = call.onEnd, api = self.api
            call.onEnd = { id, failed in previous?(id, failed); api.clear() }
            call.stop(failed: true)
        } else { api.clear() }
    }
}

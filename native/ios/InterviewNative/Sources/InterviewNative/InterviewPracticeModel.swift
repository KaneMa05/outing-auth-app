#if DEBUG
import SwiftUI
import AVFoundation

@MainActor final class PracticeMeter: ObservableObject {
    @Published var level: Float = 0
    @Published var hint = "이제 답변해 주세요"
    @Published var remaining: TimeInterval = InterviewAnswerGate.silenceSeconds
    private var lastLevelAt: TimeInterval = 0
    func updateLevel(_ value: Float) {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastLevelAt >= 0.08, abs(level - value) > 0.015 else { return }
        lastLevelAt = now; level = value
    }
}

@MainActor final class PracticeModel: NSObject, ObservableObject, AVAudioPlayerDelegate {
    enum Screen { case menu, prep, live, result, records }
    @Published var screen = Screen.menu
    @Published var mode = "ai"
    @Published var track = UserDefaults.standard.string(forKey: "interview.practice.track") ?? "공채"
    @Published var questions: [PracticeQuestion] = []
    @Published var available = 0
    @Published var number = 0
    @Published private(set) var avatarURL: URL?
    @Published var countdown: Int?
    @Published var talking = false
    @Published var answering = false
    @Published var transcript = ""
    let meter = PracticeMeter()
    var hint: String { get { meter.hint } set { if meter.hint != newValue { meter.hint = newValue } } }
    var remaining: TimeInterval { get { meter.remaining } set { if abs(meter.remaining - newValue) > 0.08 { meter.remaining = newValue } } }
    @Published var recordingReady = false
    @Published var elapsed = 0
    @Published var notice = "답변 음성은 이 기기에만 저장됩니다."
    @Published var record: PracticeRecord?
    @Published var records: [PracticeRecord] = []
    @Published var recordVideo = false
    @Published var videoSaving = false
    @Published var videoPlayer: AVPlayer?
    @Published var videoPresented = false
    @Published var bridgeReady = false
    @Published var needsConsent = false
    let media = InterviewMedia()
    private let bridge = PracticeBridge()
    private let bank = PracticeQuestion.load()
    private var store: PracticeStore?
    private let recorder = PracticeRecorder()
    private var player: AVAudioPlayer?
    private let playbackQueue = DispatchQueue(label: "interview.practice.playback", qos: .userInitiated)
    private var captions: PracticeCaptions?
    private var pendingCaptions: [UUID: PracticeCaptions] = [:]
    private var openingTask: Task<Void, Never>?
    private var ticker: Task<Void, Never>?
    private var answerTicker: Task<Void, Never>?
    private var playbackMeter: Task<Void, Never>?
    private var generation = 0
    private var consent = false
    private var transcriptPrefix = ""
    private var speaking = false
    private var startedAt = Date()
    private var answerStartedAt = Date()
    private var disposed = false
    var question: String { questions.indices.contains(number - 1) ? questions[number - 1].spokenPrompt : "" }
    var modeTitle: String { mode == "job" ? "전공(직무) 시험모드" : mode == "personality" ? "인성 연습모드" : "실전 모의면접 (AI)" }
    override init() {
        super.init()
        if !InterviewPracticePolicy.tracks.contains(track) { track = "공채" }
        do { store = try PracticeStore() } catch { notice = "기록 저장 공간을 준비하지 못했습니다. 다시 실행해주세요." }
    }
    func load() async {
        bridgeReady = await bridge.ready()
        if !bridgeReady && bridge.configured {
            for _ in 0..<2 {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !disposed, !Task.isCancelled else { return }
                bridgeReady = await bridge.ready()
                if bridgeReady { break }
            }
        }
        print("Interview bridge ready: \(bridgeReady)")
        if bridgeReady { notice = "무료 AI 테스트 연결됨 · 테스트용 답변만 사용해주세요." }
        else { notice = "기기 내 녹음·재생 · AI 서버 연결 대기" }
    }
    func select(_ selectedMode: String) {
        stopPlayback(); media.stop(); mode = selectedMode; refreshQuestions(); screen = .prep
    }
    func changeTrack(_ value: String) {
        guard InterviewPracticePolicy.tracks.contains(value), screen == .prep || screen == .menu else { return }
        track = value; UserDefaults.standard.set(value, forKey: "interview.practice.track")
        refreshQuestions()
    }
    func refreshQuestions() {
        let eligible = bank.filter { InterviewPracticePolicy.eligible(category: $0.category, tracks: $0.tracks, mode: mode, track: track) }
        available = eligible.count; questions = Array(eligible.shuffled().prefix(3))
    }
    func start(allowAI: Bool? = nil) {
        guard screen == .prep, !questions.isEmpty, store != nil, !videoSaving else { return }
        if bridgeReady && !consent && allowAI == nil { needsConsent = true; return }
        if let allowAI { consent = allowAI }
        generation += 1; let active = generation
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] allowed in
            DispatchQueue.main.async {
                guard let self, !self.disposed, self.generation == active, self.screen == .prep else { return }
                guard allowed else { self.notice = "설정에서 마이크 권한을 허용해주세요."; return }
                self.begin()
            }
        }
    }
    private func begin() {
        media.stopMic(); stopPlayback(); generation += 1
        do {
            var record = PracticeRecord(id: UUID().uuidString, mode: mode, track: track)
            record.completed = false; try store?.save(record); self.record = record
            avatarURL = InterviewAvatarVideo.availableURLs.randomElement()
            remaining = InterviewAnswerGate.silenceSeconds
            number = 1; elapsed = 0; countdown = 3; talking = false; hint = "3초 후 시작"; transcript = ""; transcriptPrefix = ""; screen = .live; startedAt = Date(); UIApplication.shared.isIdleTimerDisabled = true
            ticker?.cancel()
            ticker = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    guard !Task.isCancelled, let self, self.screen == .live else { return }
                    self.elapsed = self.countdown == nil ? min(600, Int(Date().timeIntervalSince(self.startedAt))) : 0
                    if self.elapsed >= 600 { self.stop(completed: false); return }
                }
            }
            // Show the live screen immediately. Camera startup must not gate interview playback.
            media.startCamera()
            openingTask = Task { [weak self] in
                if let self, self.recordVideo {
                    self.hint = "녹화 준비 중…"
                    for _ in 0..<100 {
                        guard !Task.isCancelled, self.screen == .live else { return }
                        if self.media.cameraReady { break }
                        try? await Task.sleep(nanoseconds: 100_000_000)
                    }
                    guard !Task.isCancelled, self.screen == .live else { return }
                    if self.media.cameraReady, let store = self.store, let url = try? store.video(record.id) {
                        self.videoSaving = true
                        let success: Bool = await withCheckedContinuation { continuation in
                            self.media.startPracticeVideo(url: url, started: { ok in continuation.resume(returning: ok) }, finished: { [weak self] ok in
                                guard let self else { return }
                                self.videoSaving = false
                                if ok, var saved = try? store.load(record.id) {
                                    saved.video = "interview.mov"
                                    do {
                                        try store.save(saved)
                                        if self.record?.id == saved.id { self.record = saved }
                                    } catch { self.notice = "영상을 기록에 연결하지 못했습니다." }
                                } else if !ok { self.notice = "영상을 저장하지 못했습니다. 답변 음성은 별도로 보관됩니다." }
                            })
                        }
                        guard !Task.isCancelled, self.screen == .live else { self.media.stopPracticeVideo(); return }
                        if !success { self.notice = "녹화를 시작하지 못해 음성만 저장합니다." }
                    } else { self.notice = "카메라를 사용할 수 없어 음성만 저장합니다." }
                }
                for seconds in (1...3).reversed() {
                    guard let self, !Task.isCancelled, self.screen == .live else { return }
                    self.countdown = seconds; self.hint = "\(seconds)초 후 시작"
                    do { try await Task.sleep(nanoseconds: 1_000_000_000) } catch { return }
                }
                guard let self, !Task.isCancelled, self.screen == .live else { return }
                self.countdown = nil; self.openingTask = nil
                self.startedAt = Date(); self.speakQuestion()
            }
        } catch { notice = "기록을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요." }
    }
    func speakQuestion() {
        guard screen == .live, countdown == nil, !answering else { return }
        // Replay preserves the recording already captured for this question.
        transcriptPrefix = transcript
        stopTurn(); talking = true; hint = "질문을 듣는 중"; remaining = InterviewAnswerGate.silenceSeconds
        guard questions.indices.contains(number - 1), let url = questions[number - 1].url else {
            notice = "질문 음성 파일을 열지 못했습니다. 다시 시작해 주세요."; stop(completed: false); return
        }
        let active = generation
        hint = "질문 음성 준비 중…"
        playbackQueue.async { [weak self] in
            let prepared: Result<AVAudioPlayer, Error>
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try session.setActive(true)
                let player = try AVAudioPlayer(contentsOf: url)
                guard player.prepareToPlay() else { throw InterviewError.connection }
                prepared = .success(player)
            } catch { prepared = .failure(error) }
            DispatchQueue.main.async {
                guard let self, self.generation == active, self.screen == .live else { return }
                switch prepared {
                case .success(let player):
                    self.player = player; player.delegate = self; player.isMeteringEnabled = true
                    self.hint = "질문을 듣는 중"
                    self.playbackMeter = Task { [weak self, weak player] in
                        while !Task.isCancelled {
                            try? await Task.sleep(nanoseconds: 80_000_000)
                            guard !Task.isCancelled, let self, let player, self.player === player, self.talking else { return }
                            player.updateMeters()
                            self.meter.updateLevel(min(1, pow(10, player.averagePower(forChannel: 0) / 20) * 3))
                        }
                    }
                    if !player.play() { self.notice = "질문 음성을 재생하지 못했습니다. 화면의 질문을 확인해주세요."; self.beginAnswer() }
                case .failure:
                    self.notice = "질문 음성을 재생하지 못했습니다. 화면의 질문을 확인해주세요."; self.beginAnswer()
                }
            }
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            guard let self, self.player === player, self.screen == .live, self.talking else { return }
            self.player = nil; self.beginAnswer()
        }
    }
    private func playCue() {
        // Recording is already running before the applicant hears the start cue.
        let active = generation
        let ready = { [weak self] in
            guard let self, self.generation == active, self.screen == .live else { return }
            self.talking = false; self.recordingReady = true; self.speaking = false
            self.answerStartedAt = Date(); self.hint = "이제 답변해 주세요"
            self.startAnswerTimer(active)
        }
        guard let root = Bundle.main.url(forResource: "InterviewPracticeAudio", withExtension: nil),
              let cue = try? AVAudioPlayer(contentsOf: root.appendingPathComponent("answer-cue.wav")) else { ready(); return }
        player = cue; cue.delegate = self
        // Completion must enter the answer instead of playing the cue repeatedly.
        cue.delegate = nil
        guard cue.play() else { ready(); return }
        Task {
            try? await Task.sleep(nanoseconds: UInt64(max(0.05, cue.duration) * 1_000_000_000))
            ready()
        }
    }
    private func beginAnswer() {
        guard screen == .live, let record, let store else { return }
        talking = true; meter.level = 0; recordingReady = false; hint = "마이크 준비 중…"; answerStartedAt = Date()
        let active = generation
        if bridgeReady && consent {
            captions = bridge.captions(question: question, mode: mode, onText: { [weak self] text, _ in
                guard let self, self.generation == active, self.screen == .live else { return }
                self.transcript = self.transcriptPrefix.isEmpty ? text : self.transcriptPrefix + " " + text
            }, onFailure: { [weak self] in
                guard let self, self.generation == active else { return }; self.notice = "실시간 자막 연결이 끊겼습니다. 녹음은 계속됩니다."
            })
        }
        do {
            let url = try store.audio(record.id, "\(number).wav")
            recorder.start(url: url, noiseDb: media.noiseDb, completion: { [weak self] result in
                guard let self, self.generation == active, self.screen == .live else { return }
                switch result {
                case .success: self.playCue()
                case .failure: self.captions?.close(); self.captions = nil; self.notice = "마이크를 확인하지 못했습니다. 면접을 종료하고 다시 시도해주세요."
                }
            }) { [weak self] level, speaking, data in
                guard let self, self.generation == active, self.screen == .live, !self.talking else { return }
                self.meter.updateLevel(level); self.speaking = speaking; self.captions?.pcm(data)
            }

        } catch { captions?.close(); captions = nil; notice = "마이크를 확인하지 못했습니다. 답변 완료를 눌러 계속하거나 면접을 종료해주세요." }
    }
    private func startAnswerTimer(_ active: Int) {
            answerTicker = Task { [weak self] in
                var gate = InterviewAnswerGate(now: ProcessInfo.processInfo.systemUptime)
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                    guard !Task.isCancelled, let self, self.generation == active, self.screen == .live else { return }
                    let now = ProcessInfo.processInfo.systemUptime
                    // Local input sets the silence deadline; network caption latency must not delay it.
                    let state = gate.sample(now: now, speaking: self.speaking)
                    self.remaining = gate.remaining(now: now)
                    self.hint = state == .speaking ? "답변을 듣는 중" : state == .pause ? "다음 질문까지 \(Int(ceil(self.remaining)))초" : "이제 답변해 주세요"
                    if state == .complete { self.answer(); return }
                }
            }
    }
    func answer() {
        guard screen == .live, !talking, !answering, recordingReady else { return }
        answering = true; captureAnswer()
        if number == questions.count { stop(completed: true, capture: false) }
        else { number += 1; answering = false; transcript = ""; transcriptPrefix = ""; speakQuestion() }
    }
    private func captureAnswer() {
        
        let text = transcript, currentNumber = number
        let wasAnswering = !talking
        let currentCaptions = captions; captions = nil
        stopTurn()
        guard wasAnswering, var saved = record, let store,
              !saved.turns.contains(where: { $0.id == currentNumber }) else { currentCaptions?.close(); return }
        do {
            let url = try store.audio(saved.id, "\(currentNumber).wav")
            let bytes = (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            guard bytes > 44 else { currentCaptions?.close(); return }
            let shouldAnalyze = bridgeReady && consent
            saved.turns.append(PracticeTurn(id: currentNumber, question: question, answer: text, duration: Double(bytes - 44) / 32000, audio: "\(currentNumber).wav", analysisPending: shouldAnalyze))
            try store.save(saved); record = saved
            let run = saved.id, prompt = question, selectedMode = mode
            let prefix = transcriptPrefix
            let finish: (String, Bool) -> Void = { [weak self] final, confirmed in
                guard let self else { return }
                self.updateTurn(run, currentNumber) { $0.answer = final }
                if shouldAnalyze {
                    Task { [weak self] in
                        guard let self else { return }
                        do {
                            let feedback = try await self.bridge.analyze(audio: url, question: prompt, mode: selectedMode, transcript: confirmed ? final : "")
                            self.updateTurn(run, currentNumber) { $0.analysis = feedback; $0.answer = feedback["transcript"] ?? final; $0.analysisPending = false }
                        } catch { self.updateTurn(run, currentNumber) { $0.analysisPending = false; $0.analysisError = true } }
                    }
                }
            }
            if let currentCaptions {
                let key = UUID(); pendingCaptions[key] = currentCaptions
                currentCaptions.end { [weak self] final, confirmed in self?.pendingCaptions.removeValue(forKey: key); finish(prefix.isEmpty ? final : prefix + " " + final, confirmed && prefix.isEmpty) }
            } else { finish(text, false) }
        } catch { currentCaptions?.close(); notice = "기록을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요." }
    }
    private func updateTurn(_ run: String, _ number: Int, change: (inout PracticeTurn) -> Void) {
        guard let store else { return }
        do {
            var saved = try store.load(run)
            guard let index = saved.turns.firstIndex(where: { $0.id == number }) else { return }
            change(&saved.turns[index]); try store.save(saved)
            if record?.id == run { record = saved }
        } catch { notice = "기록을 갱신하지 못했습니다. 저장 공간을 확인해주세요." }
    }
    func stop(completed: Bool = false, capture: Bool = true) {
        guard screen == .live else { return }
        if capture { captureAnswer() } else { stopTurn() }
        media.stop(); ticker?.cancel(); UIApplication.shared.isIdleTimerDisabled = false
        if var saved = record { saved.completed = completed; do { try store?.save(saved); record = saved } catch { notice = "기록을 저장하지 못했습니다." } }
        screen = .result; answering = false; notice = "음성은 이 기기에 저장되었습니다."
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func stopTurn() {
        openingTask?.cancel(); openingTask = nil; countdown = nil
        generation += 1; answerTicker?.cancel(); playbackMeter?.cancel(); recorder.stop(); player?.stop(); player = nil
        captions?.close(); captions = nil; speaking = false; meter.level = 0; recordingReady = false
    }
    func stopPlayback() { player?.stop(); player = nil; videoPlayer?.pause(); videoPlayer = nil; videoPresented = false }
    func playVideo() {
        stopPlayback()
        do {
            guard let record, record.video == "interview.mov", let url = try store?.video(record.id), FileManager.default.fileExists(atPath: url.path) else { return }
            try configurePlayback(); videoPlayer = AVPlayer(url: url); videoPresented = true; videoPlayer?.play()
        } catch { notice = "저장된 영상을 재생하지 못했습니다." }
    }
    private func configurePlayback() throws {
        try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try AVAudioSession.sharedInstance().setActive(true)
    }
    func play(_ turn: PracticeTurn) {
        stopPlayback()
        do {
            guard let id = record?.id, let url = try store?.audio(id, turn.audio) else { return }
            try configurePlayback(); player = try AVAudioPlayer(contentsOf: url); guard player?.play() == true else { throw InterviewError.connection }
        } catch { notice = "저장된 음성을 재생하지 못했습니다." }
    }
    func showRecords() {
        media.stop(); stopPlayback()
        do { records = try store?.list() ?? []; screen = .records } catch { notice = "기록을 불러오지 못했습니다." }
    }
    func delete(_ id: String) {
        // Cancel pending caption work first so it cannot recreate a deleted record.
        stopPlayback()
        do { try store?.delete(id); records.removeAll { $0.id == id }; if record?.id == id { record = nil } }
        catch { notice = "기록을 삭제하지 못했습니다." }
    }
    func background() { media.stop(); stopPlayback(); if screen == .live { stop() } }
    func dispose() {
        if screen == .live { stop() }
        disposed = true; media.stop(); stopTurn(); ticker?.cancel()
        for pending in pendingCaptions.values { pending.close() }; pendingCaptions = [:]
        bridge.close()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
#endif

import SwiftUI
import AVFoundation
import CryptoKit

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
    enum Screen { case menu, prep, live, jobReview, result, records }
    @Published var screen = Screen.menu
    @Published var mode = "ai"
    @Published var track = UserDefaults.standard.string(forKey: "interview.practice.track") ?? "공채"
    @Published var questions: [PracticeQuestion] = []
    @Published var available = 0
    @Published var contentFields: [PracticeContentField] = []
    @Published var selectedField = ""
    @Published var selectedRegion = ""
    @Published private(set) var favoriteQuestionIDs: Set<String> = []
    @Published private(set) var questionProgress: [String: PracticeQuestionProgress] = [:]
    func refreshQuestionProgress() {
        guard let portalAccount else { questionProgress = [:]; return }
        questionProgress = (try? store?.questionProgress(account: portalAccount, mode: mode)) ?? [:]
    }
    private var favoritesKey: String? {
        guard let portalAccount else { return nil }
        let scope = SHA256.hash(data: Data(portalAccount.utf8)).map { String(format: "%02x", $0) }.joined()
        return "interview.practice.favorites." + scope
    }
    var catalogQuestions: [PracticeQuestion] {
        bank.filter {
            InterviewPracticePolicy.eligible(category: $0.category, tracks: $0.tracks, mode: mode, track: track) &&
            InterviewPracticePolicy.matchesSelection(fields: $0.fieldIDs ?? [], regions: $0.regions ?? [], field: selectedField, region: mode == "job" ? selectedRegion : "")
        }
    }
    func toggleFavorite(_ id: String) {
        guard isPortalPractice, configurableQuestions, !sessionLoading, let favoritesKey,
              catalogQuestions.contains(where: { $0.id == id }) else { return }
        if favoriteQuestionIDs.contains(id) { favoriteQuestionIDs.remove(id) }
        else { favoriteQuestionIDs.insert(id) }
        UserDefaults.standard.set(favoriteQuestionIDs.sorted(), forKey: favoritesKey)
    }
    func startQuickPractice() {
        guard screen == .prep, isPortalPractice, configurableQuestions else { return }
        let ids = Array(catalogQuestions.shuffled().prefix(3)).map(\.id)
        guard !ids.isEmpty else { return }
        start(questionIDs: ids)
    }
    var availableRegions: [String] {
        Array(Set(bank.filter { InterviewPracticePolicy.eligible(category: $0.category, tracks: $0.tracks, mode: mode, track: track) }.flatMap { $0.regions ?? [] })).sorted()
    }
    func changeField(_ value: String) { guard screen == .prep else { return }; selectedField = value; refreshQuestions() }
    func changeRegion(_ value: String) { guard screen == .prep else { return }; selectedRegion = value; refreshQuestions() }

    @Published var number = 0
    @Published var jobQuestionCount = 3
    @Published var personalityQuestionCount = 3
    var configurableQuestions: Bool { mode == "job" || mode == "personality" }
    var selectedQuestionCount: Int { mode == "personality" ? personalityQuestionCount : jobQuestionCount }
    @Published var liveCaptionsEnabled = false
    var streamsCaptions: Bool { mode == "ai" || liveCaptionsEnabled }
    private var reviewStartedAt: Date?
    private var activePracticeRecordID: String?
    private var resultCameFromRecords = false
    var isNavigationRoot: Bool { screen == .menu || (isPortalPractice && screen == .prep) }
    /// Only the outermost screen dismisses the native practice flow.
    func navigateBack() -> Bool {
        guard screen != .live && screen != .jobReview else { return false }
        cancelPendingStart()
        if isNavigationRoot { return true }
        media.stop(); stopPlayback(); notice = ""
        if screen == .result && resultCameFromRecords {
            showRecords()
        } else {
            screen = isPortalPractice ? .prep : .menu
        }
        return false
    }
    func showRecord(_ saved: PracticeRecord) {
        guard !isPortalPractice || (portalAccount != nil && saved.accountID == portalAccount && saved.mode == mode) else { return }
        stopPlayback(); resultCameFromRecords = true; record = saved; screen = .result
    }
    var canAutomaticallySubmitCurrentAnswers: Bool {
        if feedbackDeferred || usesOnDemandFeedback { return false }
        guard let activePracticeRecordID else { return false }
        return record?.id == activePracticeRecordID
    }
    var visibleRecords: [PracticeRecord] {
        guard isPortalPractice else { return records }
        guard let account = portalAccount else { return [] }
        return records.filter { $0.mode == mode && $0.accountID == account }
    }
    var canRepeatJobQuestions: Bool { mode == "job" && record?.id == activePracticeRecordID && !questions.isEmpty }
    @Published private(set) var avatarURL: URL?
    @Published private(set) var questionPlayer: AVPlayer?
    private var questionEndObserver: NSObjectProtocol?
    private var questionPlaybackTask: Task<Void, Never>?
    @Published var countdown: Int?
    @Published var talking = false
    @Published private(set) var questionAudioNotice = ""
    @Published var answering = false
    @Published var transcript = ""
    let meter = PracticeMeter()
    var hint: String { get { meter.hint } set { if meter.hint != newValue { meter.hint = newValue } } }
    var remaining: TimeInterval { get { meter.remaining } set { if abs(meter.remaining - newValue) > 0.08 { meter.remaining = newValue } } }
    @Published var recordingReady = false
    @Published var elapsed = 0
    var sessionLimitSeconds: Int { configurableQuestions ? max(600, questions.count * 120) : 600 }
    @Published var notice = "답변 음성은 이 기기에만 저장됩니다."
    @Published var record: PracticeRecord?
    @Published var records: [PracticeRecord] = []
    @Published var recordVideo = false
    @Published var videoSaving = false
    @Published var videoPlayer: AVPlayer?
    @Published var videoPresented = false
    @Published var bridgeReady = false
    var usesLocalAI: Bool { !usesPC && bridge.isLocal }
    var usesPC: Bool { cliRequest != nil }
    var usesOnDemandFeedback: Bool {
        let selected = screen == .result ? record?.mode ?? mode : mode
        return usesPC && isPortalPractice && ["job", "personality"].contains(selected)
    }
    // The first student beta focuses on recording and self-review.
    func defersFeedback(in practiceMode: String) -> Bool {
        isPortalPractice && ["job", "personality"].contains(practiceMode)
    }
    var feedbackDeferred: Bool { defersFeedback(in: screen == .result ? record?.mode ?? mode : mode) }
    var analyzesAnswers: Bool { !feedbackDeferred && bridgeReady && (usesPC || consent) && !usesOnDemandFeedback }
    var cliRequest: PracticeCLI.Request?
    private var cliTasks: [String: Task<Void, Never>] = [:]
    private var exampleTasks: [String: Task<Void, Never>] = [:]
    @Published var needsConsent = false
    let answerPlayback = PracticeAnswerPlayback()
    let media = InterviewMedia()
    private let bridge = PracticeBridge()
    private var bank = PracticeQuestion.load()
    var sessionLoader: (() async throws -> [String: Any])?
    var portalAccount: String?
    var isPortalPractice: Bool { sessionLoader != nil }
    @Published var sessionLoading = false
    @Published private(set) var starting = false
    var preflight: PracticeMicrophoneChecking = InterviewMicMonitor()
    var requestMicrophonePermission: (@escaping (Bool) -> Void) -> Void = { AVAudioSession.sharedInstance().requestRecordPermission($0) }
    private var startTask: Task<Void, Never>?
    var makeAccountStore: (String) throws -> PracticeStore = { account in
        let scope = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("InterviewAccounts/" + scope, isDirectory: true)
        return try PracticeStore(root: root)
    }
    @Published var catalogLoaded = false
    func refreshPortal() async throws {
        guard let sessionLoader else { return }
        let data = try await sessionLoader()
        try Task.checkCancellation()
        guard !disposed else { throw CancellationError() }
        guard let account = data["accountId"] as? String, !account.isEmpty,
              let newTrack = data["track"] as? String,
              let rows = data["questions"] as? [[String: Any]] else { throw InterviewError.invalidResponse }
        if let portalAccount, portalAccount != account { throw InterviewError.connection }
        portalAccount = account; track = newTrack
        if let favoritesKey { favoriteQuestionIDs = Set(UserDefaults.standard.stringArray(forKey: favoritesKey) ?? []) }
        if let selected = data["mode"] as? String, ["job", "personality", "ai"].contains(selected) { mode = selected }
        store = try makeAccountStore(account)
        try store?.migrateLegacyCLI(account: account)
        refreshQuestionProgress()
        syncPracticeRecords()
        let receivedFields: [PracticeContentField] = (data["fields"] as? [[String: Any]] ?? []).compactMap { row in
            guard let id = row["id"] as? String, let label = row["label"] as? String else { return nil }
            return PracticeContentField(id: id, label: label)
        }
        let bundled = PracticeQuestion.load()
        bank = rows.compactMap { row in
            guard let id = row["id"] as? String, let prompt = row["prompt"] as? String, let tracks = row["tracks"] as? [String] else { return nil }
            let clip = bundled.first { $0.id == id && $0.prompt == prompt }
            var question = PracticeQuestion(id: id, prompt: prompt, spokenPrompt: prompt, file: clip?.file ?? "", category: row["category"] as? String ?? (mode == "job" ? "job" : "personality"), tracks: tracks)
            question.fieldIDs = row["fieldIds"] as? [String]; question.regions = row["regions"] as? [String]
            return question
        }
        let usedFields = Set(bank.filter { InterviewPracticePolicy.eligible(category: $0.category, tracks: $0.tracks, mode: mode, track: track) }.flatMap { $0.fieldIDs ?? [] })
        contentFields = receivedFields.filter { usedFields.contains($0.id) && (mode != "job" || InterviewPracticePolicy.contentFieldAllowed($0.id, track: track)) }
        if !selectedField.isEmpty && !contentFields.contains(where: { $0.id == selectedField }) { selectedField = "" }
        refreshQuestions()
        catalogLoaded = true
    }
    private var store: PracticeStore?
    let archive = PracticeArchiveSync()
    @Published var archiveNotice = ""
    func syncPracticeRecords() {
        archive.store = store; archive.account = portalAccount; archive.mode = mode
        archive.onStatus = { [weak self] in self?.archiveNotice = $0 }
        archive.onSynced = { [weak self] saved in
            guard let self else { return }
            if self.record?.id == saved.id { self.record = saved }
            if let index = self.records.firstIndex(where: { $0.id == saved.id }) { self.records[index] = saved }
        }
        archive.schedule()
    }
    private let recorder = PracticeRecorder()
    private var player: AVAudioPlayer?
    private var audioRouteObserver: NSObjectProtocol?
    private let playbackQueue = DispatchQueue(label: "interview.practice.playback", qos: .userInitiated)
    private var captions: PracticeCaptions?
    private var pendingCaptions: [UUID: PracticeCaptions] = [:]
    private var openingTask: Task<Void, Never>?
    private var ticker: Task<Void, Never>?
    private var answerTicker: Task<Void, Never>?
    private var analysisTask: Task<Void, Never>?
    private var playbackMeter: Task<Void, Never>?
    private var generation = 0
    private var consent = false
    private var transcriptPrefix = ""
    private var speaking = false
    private var startedAt = Date()
    private var answerStartedAt = Date()
    private var disposed = false
    var showsInterviewer: Bool { mode == "ai" }
    var question: String { questions.indices.contains(number - 1) ? questions[number - 1].displayPrompt : "" }
    var modeTitle: String {
        let displayedMode = screen == .result ? record?.mode ?? mode : mode
        return displayedMode == "job" ? "직무(전공) 연습모드" : displayedMode == "personality" ? "인성 연습모드" : "실전 모의면접 (AI)"
    }
    override init() {
        super.init()
        audioRouteObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.screen == .live, self.talking, self.countdown == nil else { return }
                try? PracticeAudioRouting.preferSpeakerForBuiltInOutput()
            }
        }
        if !InterviewPracticePolicy.tracks.contains(track) { track = "공채" }
        do { store = try PracticeStore() } catch { notice = "기록 저장 공간을 준비하지 못했습니다. 다시 실행해주세요." }
    }
    func load() async {
        if ProcessInfo.processInfo.arguments.contains("--practice-result-ui-fixture"), !isPortalPractice {
            mode = "job"; notice = ""
            var preview = PracticeRecord(id: UUID().uuidString, mode: "job", track: "공채")
            preview.completed = !ProcessInfo.processInfo.arguments.contains("--practice-incomplete-result-fixture")
            for (index, status) in ["O", "partial", "X"].enumerated() {
                let rows: [[String: Any]] = [["index": 0, "label": "핵심 항목", "claim": "상황을 확인하고 보고한다.", "status": status, "quote": status == "X" ? "" : "상황을 확인합니다.", "reason": "가상 답변 판정 근거"]]
                let data = try! JSONSerialization.data(withJSONObject: rows)
                var turn = PracticeTurn(id: index + 1, question: "가상 질문 \(index + 1)", audio: "preview.wav")
                turn.answer = "상황을 확인합니다."
                turn.exampleAnswer = "상황을 확인하고 동료에게 보고한 뒤 조치를 기록합니다."
                turn.analysis = ["assessment": String(data: data, encoding: .utf8)!, "summary": "가상 연습 결과입니다."]
                preview.turns.append(turn)
            }
            var pending = PracticeTurn(id: 4, question: "분석 중인 가상 질문", audio: "preview.wav")
            pending.analysisPending = true; pending.analysisState = "running"; preview.turns.append(pending)
            if ProcessInfo.processInfo.arguments.contains("--practice-mixed-verdict-fixture") {
                let rows: [[String: Any]] = [
                    ["index": 0, "label": "상황 확인", "claim": "상황을 확인한다.", "status": "O", "quote": "상황을 확인했습니다.", "reason": "두 전사에서 확인됨"],
                    ["index": 1, "label": "보고", "claim": "동료에게 보고한다.", "status": "uncertain", "quote": "", "reason": "두 전사에서 보고 여부가 달라 녹음 확인 필요"]]
                let data = try! JSONSerialization.data(withJSONObject: rows)
                var mixed = PracticeTurn(id: 5, question: "일부 항목 확인용 가상 질문", audio: "preview.wav")
                mixed.analysis = ["assessment": String(data: data, encoding: .utf8)!, "summary": "두 전사에서 판정이 일치하는 항목만 반영했습니다."]
                preview.turns.insert(mixed, at: 0)
            }
            record = preview; screen = .result
            return
        }
        if isPortalPractice { sessionLoading = true; catalogLoaded = false }
        defer { sessionLoading = false }
        if isPortalPractice {
            screen = .prep; bank = []; questions = []
            do { try await refreshPortal() }
            catch { notice = "로그인과 수강 권한을 확인한 뒤 다시 열어주세요."; return }
        }
        if feedbackDeferred { bridgeReady = false; notice = ""; return }
        if let cliRequest, let account = portalAccount {
            bridgeReady = (try? await PracticeCLI(request: cliRequest).ready(account: account)) == true
            notice = usesOnDemandFeedback ? "" : bridgeReady ? "" : "음성 분석 연결을 확인하지 못했습니다. 연결을 다시 확인해주세요."
            return
        }
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
        if bridgeReady { notice = usesLocalAI ? "로컬 AI 연결됨" : "무료 AI 테스트 연결됨 · 테스트용 답변만 사용해주세요." }
        else { notice = "기기 내 녹음·재생 · AI 서버 연결 대기" }
        if ProcessInfo.processInfo.arguments.contains("--interview-question-playback-check"), !isPortalPractice {
            // Hardware playback check: no record means beginAnswer cannot open the microphone.
            mode = "job"; refreshQuestions()
            guard !questions.isEmpty else { return }
            number = 1; screen = .live; speakQuestion()
        }
    }
    func select(_ selectedMode: String) {
        if mode != selectedMode { selectedField = ""; selectedRegion = "" }
        stopPlayback(); media.stop(); avatarURL = nil; recordVideo = false; mode = selectedMode; refreshQuestions(); screen = .prep
    }
    func changeTrack(_ value: String) {
        guard InterviewPracticePolicy.tracks.contains(value), screen == .prep || screen == .menu else { return }
        track = value; UserDefaults.standard.set(value, forKey: "interview.practice.track")
        refreshQuestions()
    }
    func refreshQuestions() {
        let eligible = bank.filter {
            InterviewPracticePolicy.eligible(category: $0.category, tracks: $0.tracks, mode: mode, track: track) &&
            (!configurableQuestions || InterviewPracticePolicy.matchesSelection(fields: $0.fieldIDs ?? [], regions: $0.regions ?? [], field: selectedField, region: mode == "job" ? selectedRegion : ""))
        }

        available = eligible.count; questions = Array(eligible.shuffled().prefix(configurableQuestions ? selectedQuestionCount : 3))
    }
    func setPracticeQuestionCount(_ count: Int) {
        guard configurableQuestions, screen == .prep, [3, 5, 10, 15, 20].contains(count) else { return }
        if mode == "personality" { personalityQuestionCount = count } else { jobQuestionCount = count }
        refreshQuestions()
    }
    func setJobQuestionCount(_ count: Int) {
        guard mode == "job" else { return }
        setPracticeQuestionCount(count)
    }
    func nextJobQuestion() {
        guard mode == "job", screen == .jobReview else { return }
        stopPlayback()
        if number >= questions.count { stop(completed: true, capture: false); return }
        if let reviewStartedAt { startedAt = startedAt.addingTimeInterval(Date().timeIntervalSince(reviewStartedAt)) }
        reviewStartedAt = nil
        number += 1; answering = false; transcript = ""; transcriptPrefix = ""; screen = .live; speakQuestion()
    }
    func repeatJobQuestions() {
        guard canRepeatJobQuestions, screen == .result else { return }
        stopPlayback(); screen = .prep
    }
    func start(allowAI: Bool? = nil, questionIDs: [String]? = nil) {
        guard !disposed, screen == .prep, !sessionLoading, !starting else { return }
        if isPortalPractice {
            generation += 1; let active = generation
            sessionLoading = true
            catalogLoaded = false
            startTask = Task { [weak self] in
                guard let self else { return }
                defer { if self.generation == active { self.sessionLoading = false; self.startTask = nil } }
                do {
                    try await self.refreshPortal()
                    guard !Task.isCancelled, !self.disposed, self.generation == active, self.screen == .prep else { return }
                    if let questionIDs {
                        // Recheck the current approved catalog before opening the microphone.
                        let selected = questionIDs.compactMap { id in self.catalogQuestions.first { $0.id == id } }
                        guard !selected.isEmpty, selected.count == questionIDs.count else {
                            self.notice = "선택한 질문이 변경되었거나 공개가 종료되었습니다. 질문 목록에서 다시 선택해주세요."
                            return
                        }
                        self.questions = selected
                    }
                    if !self.usesOnDemandFeedback, let request = self.cliRequest, let account = self.portalAccount {
                        self.bridgeReady = try await PracticeCLI(request: request).ready(account: account)
                        guard self.bridgeReady else { self.notice = "음성 분석이 준비되지 않았습니다. 연결을 다시 확인해주세요."; return }
                    }
                    guard !Task.isCancelled, !self.disposed, self.generation == active, self.screen == .prep,
                          UIApplication.shared.applicationState != .background else { return }
                    self.sessionLoading = false; self.startTask = nil
                    self.startVerified(allowAI: allowAI)
                } catch {
                    guard !Task.isCancelled, !self.disposed, self.generation == active else { return }
                    self.notice = "연습 권한을 확인하지 못했습니다. 로그인과 연결 상태를 확인해주세요."
                }
            }
        } else { startVerified(allowAI: allowAI) }
    }
    private func startVerified(allowAI: Bool? = nil) {
        guard screen == .prep, !questions.isEmpty, store != nil, !videoSaving else { return }
        if !usesPC && !feedbackDeferred {
            if bridgeReady && !consent && allowAI == nil { needsConsent = true; return }
            if let allowAI { consent = allowAI }
        }
        generation += 1; let active = generation
        starting = true
        requestMicrophonePermission { [weak self] allowed in
            DispatchQueue.main.async {
                guard let self, !self.disposed, self.generation == active, self.screen == .prep else { return }
                guard allowed else { self.starting = false; self.notice = "설정에서 마이크 권한을 허용해주세요."; return }
                guard UIApplication.shared.applicationState != .background else { self.starting = false; return }
                self.preflight.start(sample: { _, _, _ in }, completion: { [weak self] ready in
                    guard let self, !self.disposed, self.generation == active, self.screen == .prep else { return }
                    self.preflight.stop(); self.starting = false
                    guard ready, UIApplication.shared.applicationState != .background else { self.notice = "사용 가능한 마이크가 없습니다. 연결과 권한을 확인해주세요."; return }
                    self.begin()
                })
            }
        }
    }
    private func begin() {
        media.stopMic(); stopPlayback(); generation += 1
        resultCameFromRecords = false
        do {
            var record = PracticeRecord(id: UUID().uuidString, mode: mode, track: track)
            record.accountID = portalAccount
            record.questionCount = questions.count; record.finished = false
            if configurableQuestions {
                record.fieldID = selectedField.isEmpty ? nil : selectedField
                record.fieldLabel = contentFields.first { $0.id == selectedField }?.label
                record.region = mode == "job" && !selectedRegion.isEmpty ? selectedRegion : nil
            }

            record.completed = false; try store?.save(record); self.record = record; activePracticeRecordID = record.id; notice = ""
            syncPracticeRecords()
            avatarURL = showsInterviewer ? InterviewAvatarVideo.availableURLs.randomElement() : nil
            remaining = InterviewAnswerGate.silenceSeconds
            number = 1; elapsed = 0; countdown = 3; talking = false; hint = "3초 후 시작"; transcript = ""; transcriptPrefix = ""; screen = .live; startedAt = Date(); UIApplication.shared.isIdleTimerDisabled = true
            ticker?.cancel()
            ticker = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    guard !Task.isCancelled, let self, self.screen == .live || self.screen == .jobReview else { return }
                    if self.screen == .jobReview { continue }
                    self.elapsed = self.countdown == nil ? min(self.sessionLimitSeconds, Int(Date().timeIntervalSince(self.startedAt))) : 0
                    if self.elapsed >= self.sessionLimitSeconds { self.stop(completed: false); return }
                }
            }
            // Show the live screen immediately. Camera startup must not gate interview playback.
            if showsInterviewer { media.startCamera() }
            openingTask = Task { [weak self] in
                if let self, self.showsInterviewer, self.recordVideo {
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
        questionAudioNotice = ""
        guard questions.indices.contains(number - 1) else { stop(completed: false); return }
        let active = generation
        if let url = questions[number - 1].url { playQuestionAudio(url, generation: active); return }
        let selected = questions[number - 1], selectedMode = mode
        hint = "질문 음성 준비 중…"
        questionPlaybackTask = Task { [weak self] in
            let url = await PracticeQuestionAudioCache.shared.resolve(mode: selectedMode, id: selected.id, prompt: selected.prompt)
            guard let self, !Task.isCancelled, self.generation == active, self.screen == .live else { return }
            if let url { self.playQuestionAudio(url, generation: active) }
            else { self.questionAudioNotice = "질문 음성을 불러오지 못했습니다. 화면의 질문을 읽고 답변해주세요."; self.beginAnswer() }
        }
    }
    private func playQuestionAudio(_ url: URL, generation active: Int) {
        // The silent avatar is visual only; every mode uses the prepared question audio.
        hint = "질문 음성 준비 중…"
        let stoppedRecorder = recorder
        playbackQueue.async { [weak self] in
            let prepared: Result<AVAudioPlayer, Error>
            do {
                stoppedRecorder.waitUntilStopped()
                try PracticeAudioRouting.configurePlayback()
                let player = try AVAudioPlayer(contentsOf: url)
                player.volume = 1
                guard player.prepareToPlay() else { throw InterviewError.connection }
                prepared = .success(player)
            } catch { prepared = .failure(error) }
            DispatchQueue.main.async {
                guard let self, self.generation == active, self.screen == .live else { return }
                switch prepared {
                case .success(let player):
                    self.player = player; player.delegate = self; player.isMeteringEnabled = true
                    let audio = AVAudioSession.sharedInstance()
                    print("Practice question output: \(audio.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")); mode: \(audio.mode.rawValue)")
                    self.hint = "질문을 듣는 중"
                    self.playbackMeter = Task { [weak self, weak player] in
                        while !Task.isCancelled {
                            try? await Task.sleep(nanoseconds: 80_000_000)
                            guard !Task.isCancelled, let self, let player, self.player === player, self.talking else { return }
                            player.updateMeters()
                            self.meter.updateLevel(min(1, pow(10, player.averagePower(forChannel: 0) / 20) * 3))
                        }
                    }
                    if !player.play() { self.questionAudioNotice = "질문 음성을 재생하지 못했습니다. 화면의 질문을 확인해주세요."; self.beginAnswer() }
                case .failure:
                    self.questionAudioNotice = "질문 음성을 재생하지 못했습니다. 화면의 질문을 확인해주세요."; self.beginAnswer()
                }
            }
        }
    }

    private func playQuestionVideo(_ url: URL, generation active: Int) {
        hint = "질문 영상 준비 중…"
        let item = AVPlayerItem(url: url)
        let video = AVPlayer(playerItem: item)
        video.actionAtItemEnd = .pause
        questionPlayer = video
        questionEndObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.generation == active, self.screen == .live else { return }
                self.clearQuestionVideo(); self.beginAnswer()
            }
        }
        questionPlaybackTask = Task { [weak self] in
            guard let self else { return }
            do {
                try self.configurePlayback()
                for _ in 0..<100 {
                    guard !Task.isCancelled, self.generation == active else { return }
                    if item.status == .failed { throw InterviewError.connection }
                    if item.status == .readyToPlay {
                        self.hint = "질문을 듣는 중"; video.play(); return
                    }
                    try await Task.sleep(nanoseconds: 50_000_000)
                }
                throw InterviewError.connection
            } catch {
                guard !Task.isCancelled, self.generation == active else { return }
                self.clearQuestionVideo()
                self.notice = "질문 영상을 재생하지 못했습니다. 질문을 확인하고 답변해 주세요."
                self.beginAnswer()
            }
        }
    }
    private func clearQuestionVideo() {
        questionPlaybackTask?.cancel(); questionPlaybackTask = nil
        if let observer = questionEndObserver { NotificationCenter.default.removeObserver(observer) }
        questionEndObserver = nil
        questionPlayer?.pause(); questionPlayer?.replaceCurrentItem(with: nil); questionPlayer = nil
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
    func setLiveCaptions(_ enabled: Bool) {
        liveCaptionsEnabled = enabled
        captions?.close(); captions = nil
        transcriptPrefix = transcript
        if enabled && screen == .live && recordingReady && !talking {
            openCaptions(active: generation)
        }
    }
    private func openCaptions(active: Int) {
        if !usesPC && bridgeReady && consent && bridge.liveCaptions && streamsCaptions {
            captions = bridge.captions(question: question, mode: mode, onText: { [weak self] text, _ in
                guard let self, self.generation == active, self.screen == .live else { return }
                self.transcript = self.transcriptPrefix.isEmpty ? text : self.transcriptPrefix + " " + text
            }, onFailure: { [weak self] in
                guard let self, self.generation == active else { return }; self.notice = "실시간 자막 연결이 끊겼습니다. 녹음은 계속됩니다."
            })
        }
    }
    private func beginAnswer() {
        guard screen == .live, let record, let store else { return }
        talking = true; meter.level = 0; recordingReady = false; hint = "마이크 준비 중…"; answerStartedAt = Date()
        let active = generation
        openCaptions(active: active)
        do {
            let url = try store.audio(record.id, "\(number).wav")
            recorder.start(url: url, noiseDb: media.noiseDb, completion: { [weak self] result in
                guard let self, self.generation == active, self.screen == .live else { return }
                switch result {
                case .success: self.playCue()
                case .failure:
                    self.notice = "마이크 입력이나 녹음 파일을 확인하지 못해 면접을 중단했습니다. 권한과 저장 공간을 확인해주세요."
                    self.stop(completed: false)
                }
            }) { [weak self] level, speaking, data in
                guard let self, self.generation == active, self.screen == .live, !self.talking else { return }
                self.meter.updateLevel(level); self.speaking = speaking; self.captions?.pcm(data)
            }

        } catch {
            notice = "마이크 입력이나 녹음 파일을 확인하지 못해 면접을 중단했습니다. 권한과 저장 공간을 확인해주세요."
            stop(completed: false)
        }
    }
    private func currentAnswerBytes() -> Int {
        guard let record, let store else { return 0 }
        do {
            let url = try store.audio(record.id, "\(number).wav")
            return try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        } catch { return 0 }
    }
    private func startAnswerTimer(_ active: Int) {
            answerTicker = Task { [weak self] in
                var gate = InterviewAnswerGate(now: ProcessInfo.processInfo.systemUptime)
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                    guard !Task.isCancelled, let self, self.generation == active, self.screen == .live else { return }
                    let now = ProcessInfo.processInfo.systemUptime
                    let elapsed = Date().timeIntervalSince(self.answerStartedAt)
                    let bytes = self.currentAnswerBytes()
                    if elapsed >= 120 || bytes >= 44 + 120 * 32000 {
                        if gate.hasInput { self.answer() }
                        else { self.notice = "마이크 입력이 확인되지 않아 면접을 중단했습니다. 기기 설정을 확인해주세요."; self.stop(completed: false) }
                        return
                    }
                    // Local input sets the silence deadline; network caption latency must not delay it.
                    let state = gate.sample(now: now, speaking: self.speaking)
                    self.remaining = gate.remaining(now: now)
                    self.hint = state == .speaking ? "답변을 듣는 중" : state == .pause ? "다음 질문까지 \(Int(ceil(self.remaining)))초" : "이제 답변해 주세요"
                    if !gate.hasInput && elapsed >= 8 { self.hint = "마이크 입력이 확인되지 않습니다. 마이크 연결 상태를 확인하고 말씀해주세요." }
                    if state == .complete { self.answer(); return }
                }
            }
    }
    func exampleAnswer(for turn: PracticeTurn) -> String? {
        if let example = turn.exampleAnswer, !example.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return example }
        let id = turn.questionID ?? bank.first(where: { $0.spokenPrompt == turn.question })?.id
        guard let id else { return nil }
        return PracticeQuestion.examples[id]
    }
    func answer() {
        guard screen == .live, !talking, !answering, recordingReady else { return }
        answering = true
        guard captureAnswer() else { stop(completed: false, capture: false); return }
        if mode == "job" { screen = .jobReview; reviewStartedAt = Date(); answering = false; return }
        if number == questions.count { stop(completed: true, capture: false) }
        else { number += 1; answering = false; transcript = ""; transcriptPrefix = ""; speakQuestion() }
    }
    @discardableResult private func captureAnswer() -> Bool {

        let text = transcript, currentNumber = number
        let wasAnswering = !talking
        let currentCaptions = captions; captions = nil
        stopTurn()
        guard var saved = record, let store,
              !saved.turns.contains(where: { $0.id == currentNumber }) else { currentCaptions?.close(); return false }
        do {
            let url = try store.audio(saved.id, "\(currentNumber).wav")
            // Replaying the prompt stops the mic but keeps the earlier partial answer.
            // Ending/backgrounding during replay must still index that saved audio.
            if !wasAnswering && !FileManager.default.fileExists(atPath: url.path) { currentCaptions?.close(); return false }
            let bytes = (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if !wasAnswering && bytes <= 44 { currentCaptions?.close(); return false }
            guard bytes > 44 else { throw InterviewError.invalidResponse }
            let audio = try AVAudioFile(forReading: url)
            guard audio.length > 0 else { throw InterviewError.invalidResponse }
            let shouldAnalyze = analyzesAnswers
            saved.turns.append(PracticeTurn(id: currentNumber, question: question, answer: text, duration: min(120, Double(bytes - 44) / 32000), audio: "\(currentNumber).wav", questionID: questions.indices.contains(currentNumber - 1) ? questions[currentNumber - 1].id : nil, analysisPending: shouldAnalyze))
            saved.turns[saved.turns.count - 1].analysisQuestionPrompt = questions.indices.contains(currentNumber - 1) ? questions[currentNumber - 1].prompt : nil
            if usesOnDemandFeedback { saved.turns[saved.turns.count - 1].analysisState = "not_requested" }
            if usesPC && shouldAnalyze {
                saved.turns[saved.turns.count - 1].analysisRequestID = UUID().uuidString.lowercased()
                saved.turns[saved.turns.count - 1].analysisState = "submitting"
            }
            try store.save(saved); record = saved
            syncPracticeRecords()
            if usesPC {
                currentCaptions?.close()
                if shouldAnalyze { runCLI(saved.id, currentNumber, allowSubmission: true) }
                return true
            }
            let run = saved.id, prompt = questions.indices.contains(currentNumber - 1) ? questions[currentNumber - 1].spokenPrompt : question, selectedMode = mode
            let prefix = transcriptPrefix
            let finish: (String, Bool) -> Void = { [weak self] final, confirmed in
                guard let self else { return }
                self.updateTurn(run, currentNumber) { $0.answer = final }
                if shouldAnalyze {
                    let previous = self.analysisTask
                    self.analysisTask = Task { [weak self] in
                        await previous?.value
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
            return true
        } catch { currentCaptions?.close(); notice = "답변 녹음을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요."; return false }
    }
    private func updateTurn(_ run: String, _ number: Int, change: (inout PracticeTurn) -> Void) {
        guard let store else { return }
        do {
            var saved = try store.load(run)
            guard let index = saved.turns.firstIndex(where: { $0.id == number }) else { return }
            change(&saved.turns[index]); try store.save(saved)
            if record?.id == run { record = saved }
            if let row = records.firstIndex(where: { $0.id == run }) { records[row] = saved }
        } catch { notice = "기록을 갱신하지 못했습니다. 저장 공간을 확인해주세요." }
    }
    func canRequestFeedback(for turn: PracticeTurn) -> Bool {
        !feedbackDeferred && usesOnDemandFeedback && record?.accountID == portalAccount && turn.analysis == nil &&
        !turn.analysisPending && turn.analysisRequestID == nil
    }
    func requestFeedback(_ number: Int) {
        guard screen == .result, let saved = record, let turn = saved.turns.first(where: { $0.id == number }),
              canRequestFeedback(for: turn) else { return }
        // Persist identity before starting any request; repeated taps and resumes reuse it.
        updateTurn(saved.id, number) { row in
            row.analysisRequestID = UUID().uuidString.lowercased()
            row.analysisState = "submitting"; row.analysisPending = true; row.analysisError = false; row.analysisNotice = nil
        }
        runCLI(saved.id, number, allowSubmission: true)
    }
    func refreshPracticeExamples() {
        guard usesOnDemandFeedback, screen == .result, let saved = record, saved.completed,
              let account = portalAccount, saved.accountID == account, let request = cliRequest else { return }
        for turn in saved.turns where turn.exampleAnswer == nil && turn.exampleChecked != true {
            guard let questionID = turn.questionID else { continue }
            let key = saved.id + ":" + String(turn.id)
            guard exampleTasks[key] == nil else { continue }
            exampleTasks[key] = Task { [weak self] in
                guard let self else { return }; defer { self.exampleTasks[key] = nil }
                do {
                    let result = try await request("reference", ["accountId": account, "mode": saved.mode, "questionId": questionID,
                        "questionPrompt": turn.analysisQuestionPrompt ?? turn.remoteQuestionPrompt ?? turn.question])
                    guard !Task.isCancelled, !self.disposed, self.portalAccount == account,
                          result["ok"] as? Bool == true, result["accountId"] as? String == account else { return }
                    self.updateTurn(saved.id, turn.id) { row in
                        row.exampleChecked = true
                        if let example = result["referenceAnswer"] as? String, !example.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { row.exampleAnswer = example }
                    }
                } catch { /* A read failure never starts analysis or removes a saved example. */ }
            }
        }
    }
    private func runCLI(_ run: String, _ number: Int, allowSubmission: Bool, includeCompletedReference: Bool = false) {
        guard let request = cliRequest, let account = portalAccount, let store,
              let saved = try? store.load(run), saved.accountID == account,
              let turn = saved.turns.first(where: { $0.id == number }), let id = turn.analysisRequestID,
              (!["completed", "unknown", "failed", "cancelled"].contains(turn.analysisState ?? "") || (includeCompletedReference && turn.analysisState == "completed" && turn.exampleAnswer == nil)), cliTasks[id] == nil else { return }
        cliTasks[id] = Task { [weak self] in
            guard let self else { return }; defer { self.cliTasks[id] = nil }
            let referenceOnly = turn.analysisState == "completed"
            var submit = allowSubmission && !referenceOnly && !self.defersFeedback(in: saved.mode)
            do {
                while !Task.isCancelled && !self.disposed {
                    let result = try await PracticeCLI(request: request).advance(id: id, account: account, mode: saved.mode,
                        questionID: turn.questionID ?? "", question: turn.analysisQuestionPrompt ?? turn.remoteQuestionPrompt ?? turn.question, audio: try store.audio(run, turn.audio), allowSubmission: submit)
                    guard !Task.isCancelled, !self.disposed, self.portalAccount == account else { return }
                    self.updateTurn(run, number) { row in
                        row.analysisState = result.state; row.analysisPending = result.pending; row.analysisError = ["failed", "unknown", "cancelled"].contains(result.state)
                        row.analysisNotice = result.notice; row.analysis = result.feedback
                        if let example = result.exampleAnswer { row.exampleAnswer = example }
                        if !result.transcript.isEmpty { row.answer = result.transcript }
                    }
                    guard result.pending else { return }
                    submit = false
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                }
            } catch {
                guard !Task.isCancelled, !self.disposed, !referenceOnly else { return }
                self.updateTurn(run, number) { row in
                    row.analysisPending = false; row.analysisState = "connection_required"
                    row.analysisNotice = "전송·분석 상태를 확인하지 못했습니다. 녹음은 보관되어 있습니다. 연결 다시 확인을 눌러주세요."
                }
            }
        }
    }
    func refreshCLIResults(allowSubmission: Bool = false, currentOnly: Bool = false) {
        guard usesPC, let store else { return }
        let saved = currentOnly ? record.map { [$0] } ?? [] : (try? store.list()) ?? []
        for record in saved where record.accountID == portalAccount {
            for turn in record.turns where turn.analysisRequestID != nil { runCLI(record.id, turn.id, allowSubmission: allowSubmission, includeCompletedReference: currentOnly) }
        }
    }
    func foreground() { refreshCLIResults(); refreshPracticeExamples(); syncPracticeRecords() }
    func stop(completed: Bool = false, capture: Bool = true) {
        guard screen == .live || screen == .jobReview else { return }
        if capture { captureAnswer() } else { stopTurn() }
        media.stop(); ticker?.cancel(); UIApplication.shared.isIdleTimerDisabled = false
        if var saved = record {
            saved.completed = completed && saved.turns.count == questions.count && !questions.isEmpty
            saved.finished = true
            do { guard let store else { throw InterviewError.invalidResponse }; try store.save(saved); record = saved; syncPracticeRecords() }
            catch { notice = "기록을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요." }
        }
        screen = .result; answering = false
        if notice.isEmpty { notice = record?.turns.isEmpty == false ? "음성은 이 기기에 저장되었습니다." : "저장된 답변 음성이 없습니다." }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func stopTurn() {
        clearQuestionVideo()
        openingTask?.cancel(); openingTask = nil; countdown = nil
        generation += 1; answerTicker?.cancel(); playbackMeter?.cancel(); recorder.stop(); player?.stop(); player = nil
        captions?.close(); captions = nil; speaking = false; meter.level = 0; recordingReady = false
    }
    func stopPlayback() { answerPlayback.stop(); player?.stop(); player = nil; videoPlayer?.pause(); videoPlayer = nil; videoPresented = false }
    func playVideo() {
        stopPlayback()
        do {
            guard let record, record.video == "interview.mov", let url = try store?.video(record.id), FileManager.default.fileExists(atPath: url.path) else { return }
            try configurePlayback(); videoPlayer = AVPlayer(url: url); videoPresented = true; videoPlayer?.play()
        } catch { notice = "저장된 영상을 재생하지 못했습니다." }
    }
    private func configurePlayback() throws {
        try PracticeAudioRouting.configurePlayback()
    }
    func answerPlaybackKey(_ turn: PracticeTurn) -> String { (record?.id ?? "") + "/" + String(turn.id) }
    private func answerPlaybackURL(_ turn: PracticeTurn) throws -> URL {
        guard let id = record?.id, let store else { throw InterviewError.invalidResponse }
        return try store.audio(id, turn.audio)
    }
    func prepareAnswerPlayback(_ turn: PracticeTurn) {
        let key = answerPlaybackKey(turn)
        do { _ = answerPlayback.prepare(key: key, url: try answerPlaybackURL(turn)) }
        catch { answerPlayback.fail(key: key) }
    }
    func seekAnswerPlayback(_ turn: PracticeTurn, to value: TimeInterval) {
        prepareAnswerPlayback(turn); answerPlayback.seek(to: value)
    }
    func play(_ turn: PracticeTurn) {
        player?.stop(); player = nil
        let key = answerPlaybackKey(turn)
        do { answerPlayback.toggle(key: key, url: try answerPlaybackURL(turn)) }
        catch { answerPlayback.fail(key: key) }
    }

    func showRecords() {
        cancelPendingStart(); media.stop(); stopPlayback()
        guard !isPortalPractice || portalAccount != nil else { notice = "로그인 확인을 마친 뒤 기록을 열어주세요."; return }
        do { records = (try store?.list() ?? []).filter { !isPortalPractice || $0.accountID == portalAccount }; screen = .records } catch { notice = "기록을 불러오지 못했습니다." }
        refreshCLIResults()
    }
    func delete(_ id: String) {
        if archive.transport != nil, let saved = try? store?.load(id), !archive.isSynced(saved) {
            syncPracticeRecords()
            notice = "관리자 기록 전송이 완료된 뒤 기기 기록을 삭제할 수 있습니다."
            return
        }
        // Cancel pending caption work first so it cannot recreate a deleted record.
        stopPlayback()
        if let saved = try? store?.load(id) { for turn in saved.turns { if let request = turn.analysisRequestID { cliTasks[request]?.cancel() } } }
        do { try store?.delete(id); records.removeAll { $0.id == id }; if record?.id == id { record = nil } }
        catch { notice = "기록을 삭제하지 못했습니다." }
    }
    func background() {
        cancelPendingStart()
        media.stop()
        if screen == .result { answerPlayback.interrupt() } else { stopPlayback() }
        if screen == .live || screen == .jobReview { stop() }
        for task in cliTasks.values { task.cancel() }
    }
    func dispose() {
        if screen == .live || screen == .jobReview { stop() }
        disposed = true; cancelPendingStart(); answerPlayback.stop(); media.stop(); stopTurn(); ticker?.cancel()
        for task in cliTasks.values { task.cancel() }; cliTasks = [:]
        for task in exampleTasks.values { task.cancel() }; exampleTasks = [:]
        if let audioRouteObserver { NotificationCenter.default.removeObserver(audioRouteObserver) }
        audioRouteObserver = nil
        for pending in pendingCaptions.values { pending.close() }; pendingCaptions = [:]
        bridge.close()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func cancelPendingStart() {
        if starting || startTask != nil { generation += 1; sessionLoading = false }
        startTask?.cancel(); startTask = nil; preflight.stop(); starting = false
    }
}

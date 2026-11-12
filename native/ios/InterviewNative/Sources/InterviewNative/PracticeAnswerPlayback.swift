#if DEBUG
import Foundation
import AVFoundation
import UIKit
import Combine

@MainActor protocol PracticeAnswerSound: AnyObject {
    var duration: TimeInterval { get }
    var currentTime: TimeInterval { get set }
    var onFinish: ((Bool) -> Void)? { get set }
    func play() -> Bool
    func pause()
    func stop()
}

@MainActor private final class RecordedAnswerSound: NSObject, PracticeAnswerSound, AVAudioPlayerDelegate {
    private let audio: AVAudioPlayer
    var onFinish: ((Bool) -> Void)?
    var duration: TimeInterval { audio.duration }
    var currentTime: TimeInterval { get { audio.currentTime } set { audio.currentTime = newValue } }
    init(url: URL) throws {
        audio = try AVAudioPlayer(contentsOf: url)
        super.init(); audio.delegate = self
        guard audio.prepareToPlay() else { throw InterviewError.connection }
    }
    func play() -> Bool { audio.play() }
    func pause() { audio.pause() }
    func stop() { audio.stop() }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in self?.onFinish?(flag) }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor [weak self] in self?.onFinish?(false) }
    }
}

struct RecordingSegment: Equatable {
    let start: TimeInterval
    let end: TimeInterval
    var duration: TimeInterval { end - start }
    init?(startBytes: Any?, endBytes: Any?) {
        guard let start = startBytes as? NSNumber, let end = endBytes as? NSNumber else { return nil }
        self.start = start.doubleValue / 48_000; self.end = end.doubleValue / 48_000
        guard self.start.isFinite, self.end.isFinite, self.start >= 0, self.end > self.start else { return nil }
    }
}

@MainActor final class PracticeAnswerPlayback: ObservableObject {
    @Published private(set) var key: String?
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var isSeeking = false
    @Published private(set) var error: String?
    private var sound: (any PracticeAnswerSound)?
    private var ticker: Task<Void, Never>?
    var onSystemInterruption: (() -> Void)?
    private var observers: [NSObjectProtocol] = []
    private var startOffset: TimeInterval = 0
    private var resumeAfterSeek = false
    private let makeSound: (URL) throws -> any PracticeAnswerSound
    private let configure: () throws -> Void
    init(makeSound: ((URL) throws -> any PracticeAnswerSound)? = nil,
         configure: (() throws -> Void)? = nil) {
        self.makeSound = makeSound ?? { try RecordedAnswerSound(url: $0) }
        self.configure = configure ?? { try PracticeAudioRouting.configurePlayback() }
        observers.append(NotificationCenter.default.addObserver(forName: UIScene.willDeactivateNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.systemInterrupted() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.systemInterrupted() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            Task { @MainActor [weak self] in self?.systemInterrupted() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            Task { @MainActor [weak self] in self?.systemInterrupted() }
        })
    }
    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }
    private func systemInterrupted() { interrupt(); onSystemInterruption?() }
    // Interruption is always a manual-resume pause, including during scrubbing.
    func interrupt() { pause(); isSeeking = false; resumeAfterSeek = false }
    func rewind() { interrupt(); seek(to: 0) }
    @discardableResult func prepare(key: String, url: URL) -> Bool {
        if self.key == key, sound != nil { return true }
        stop(); self.key = key
        do {
            try configure()
            let audio = try makeSound(url)
            guard audio.duration.isFinite, audio.duration > 0 else { throw InterviewError.invalidResponse }
            sound = audio; duration = audio.duration
            audio.onFinish = { [weak self, weak audio] success in
                guard let self, let audio, self.sound === audio else { return }
                self.ticker?.cancel(); self.isPlaying = false; self.isSeeking = false
                self.resumeAfterSeek = false; self.position = success ? self.duration : max(0, audio.currentTime - self.startOffset)
                if !success { self.error = "녹음 파일을 재생하지 못했습니다. 다시 시도해주세요." }
            }
            return true
        } catch { fail(key: key); return false }
    }
    func selectSegment(_ segment: RecordingSegment?) -> Bool {
        guard let sound else { return false }
        let start = segment?.start ?? 0, end = min(sound.duration, segment?.end ?? sound.duration)
        guard start.isFinite, end.isFinite, start >= 0, end > start else { return false }
        interrupt(); startOffset = start; duration = end - start; position = 0; sound.currentTime = start
        return true
    }
    func toggle(key: String, url: URL) {
        guard prepare(key: key, url: url), !isSeeking else { return }
        if isPlaying { pause() } else { resume() }
    }
    private func resume() {
        guard let sound else { return }
        do {
            try configure()
            if position >= duration { sound.currentTime = startOffset; position = 0 }
            guard sound.play() else { throw InterviewError.connection }
            error = nil; isPlaying = true; ticker?.cancel()
            ticker = Task { [weak self, weak sound] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                    guard !Task.isCancelled, let self, let sound, self.sound === sound, self.isPlaying, !self.isSeeking else { return }
                    self.position = min(self.duration, max(0, sound.currentTime - self.startOffset))
                    if self.position >= self.duration { sound.pause(); self.isPlaying = false; return }
                }
            }
        } catch { isPlaying = false; self.error = "녹음 파일을 재생하지 못했습니다. 다시 시도해주세요." }
    }
    func pause() { sound?.pause(); ticker?.cancel(); isPlaying = false; position = min(duration, max(0, (sound?.currentTime).map { $0 - startOffset } ?? position)) }
    func seek(to value: TimeInterval) {
        guard let sound, value.isFinite else { return }
        position = min(duration, max(0, value)); sound.currentTime = position + startOffset
    }
    func beginSeeking() {
        guard sound != nil, !isSeeking else { return }
        resumeAfterSeek = isPlaying; pause(); isSeeking = true
    }
    func endSeeking() {
        guard isSeeking else { return }
        isSeeking = false
        let shouldResume = resumeAfterSeek && position < duration; resumeAfterSeek = false
        if shouldResume { resume() }
    }
    func fail(key: String) { stop(); self.key = key; error = "녹음 파일을 열지 못했습니다. 기기에 저장된 음성을 확인해주세요." }
    func stop() {
        ticker?.cancel(); ticker = nil; sound?.stop(); sound = nil
        key = nil; startOffset = 0; position = 0; duration = 0; isPlaying = false; isSeeking = false; resumeAfterSeek = false; error = nil
    }
}
enum RecordingDownloadError: Error { case expiredLink }

/// Downloads a signed recording for local seeking; never submits audio for analysis.
@MainActor final class RemoteAnswerPlayback: ObservableObject {
    let playback: PracticeAnswerPlayback
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private var localURL: URL?
    private var cachedFileKey: String?
    @Published private(set) var requestedKey: String?
    private let download: (URL) async throws -> URL
    init(playback: PracticeAnswerPlayback? = nil, download: ((URL) async throws -> URL)? = nil) {
        self.playback = playback ?? PracticeAnswerPlayback(configure: {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        })
        self.download = download ?? { url in
            let config = URLSessionConfiguration.ephemeral
            config.httpCookieStorage = nil; config.urlCache = nil
            config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 90
            let session = URLSession(configuration: config)
            defer { session.finishTasksAndInvalidate() }
            let (temporary, response) = try await session.download(from: url)
            guard let response = response as? HTTPURLResponse else {
                try? FileManager.default.removeItem(at: temporary)
                throw InterviewError.connection
            }
            guard (200..<300).contains(response.statusCode) else {
                try? FileManager.default.removeItem(at: temporary)
                if [400, 401, 403].contains(response.statusCode) { throw RecordingDownloadError.expiredLink }
                throw InterviewError.connection
            }
            let saved = FileManager.default.temporaryDirectory.appendingPathComponent("interview-playback-" + UUID().uuidString + ".wav")
            try FileManager.default.moveItem(at: temporary, to: saved)
            return saved
        }
        self.playback.onSystemInterruption = { [weak self] in
            // A pending download must not start playback after a call ends.
            if self?.loading == true { self?.stop() }
        }
    }
    func toggle(key: String, rawURL: String?, fileKey: String? = nil, segment: RecordingSegment? = nil, refreshURL: (() async throws -> String)? = nil, stopOtherPlayback: () -> Void) {
        let storageKey = fileKey ?? key
        if cachedFileKey == storageKey, let localURL {
            stopOtherPlayback(); requestedKey = key
            if playback.key != key {
                guard playback.prepare(key: key, url: localURL), playback.selectSegment(segment) else { playback.fail(key: key); return }
            }
            playback.toggle(key: key, url: localURL); return
        }
        stopOtherPlayback(); stop(); requestedKey = key
        func validated(_ raw: String?) throws -> URL {
            guard let raw, let url = URL(string: raw), url.scheme == "https", url.host != nil else { throw InterviewError.invalidResponse }
            return url
        }
        if refreshURL == nil, (try? validated(rawURL)) == nil {
            error = "녹음 링크를 불러오지 못했습니다. 기록을 다시 확인해주세요."; return
        }
        loading = true
        let token = generation, download = self.download
        task = Task { [weak self] in
            do {
                let raw = try await refreshURL?() ?? rawURL
                try Task.checkCancellation()
                let url = try validated(raw)
                let file: URL
                do { file = try await download(url) }
                catch RecordingDownloadError.expiredLink {
                    // Refresh only once for an expired/rejected signed URL, never for generic network failures.
                    guard let refreshURL else { throw RecordingDownloadError.expiredLink }
                    try Task.checkCancellation()
                    let renewed = try await refreshURL()
                    try Task.checkCancellation()
                    file = try await download(validated(renewed))
                }
                guard let self, !Task.isCancelled, self.generation == token else {
                    try? FileManager.default.removeItem(at: file); return
                }
                self.localURL = file; self.cachedFileKey = storageKey; self.loading = false
                guard self.playback.prepare(key: key, url: file), self.playback.selectSegment(segment) else { self.playback.fail(key: key); return }
                self.playback.toggle(key: key, url: file)
            } catch {
                guard let self, !Task.isCancelled, self.generation == token else { return }
                self.loading = false
                self.error = "녹음을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요."
            }
        }
    }
    func pause() {
        if loading { stop() } else { playback.interrupt() }
    }
    func rewind() {
        if loading { stop() } else { playback.rewind() }
    }
    func stop() {
        generation = UUID(); task?.cancel(); task = nil
        playback.stop(); loading = false; error = nil
        if let localURL { try? FileManager.default.removeItem(at: localURL) }
        localURL = nil; cachedFileKey = nil; requestedKey = nil
    }
}
#endif

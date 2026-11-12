#if DEBUG
import Foundation
import AVFoundation
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

@MainActor final class PracticeAnswerPlayback: ObservableObject {
    @Published private(set) var key: String?
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var isSeeking = false
    @Published private(set) var error: String?
    private var sound: (any PracticeAnswerSound)?
    private var ticker: Task<Void, Never>?
    private var resumeAfterSeek = false
    private let makeSound: (URL) throws -> any PracticeAnswerSound
    private let configure: () throws -> Void
    init(makeSound: ((URL) throws -> any PracticeAnswerSound)? = nil,
         configure: (() throws -> Void)? = nil) {
        self.makeSound = makeSound ?? { try RecordedAnswerSound(url: $0) }
        self.configure = configure ?? { try PracticeAudioRouting.configurePlayback() }
    }
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
                self.resumeAfterSeek = false; self.position = success ? self.duration : audio.currentTime
                if !success { self.error = "녹음 파일을 재생하지 못했습니다. 다시 시도해주세요." }
            }
            return true
        } catch { fail(key: key); return false }
    }
    func toggle(key: String, url: URL) {
        guard prepare(key: key, url: url), !isSeeking else { return }
        if isPlaying { pause() } else { resume() }
    }
    private func resume() {
        guard let sound else { return }
        do {
            try configure()
            if position >= duration { sound.currentTime = 0; position = 0 }
            guard sound.play() else { throw InterviewError.connection }
            error = nil; isPlaying = true; ticker?.cancel()
            ticker = Task { [weak self, weak sound] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                    guard !Task.isCancelled, let self, let sound, self.sound === sound, self.isPlaying, !self.isSeeking else { return }
                    self.position = min(self.duration, max(0, sound.currentTime))
                }
            }
        } catch { isPlaying = false; self.error = "녹음 파일을 재생하지 못했습니다. 다시 시도해주세요." }
    }
    func pause() { sound?.pause(); ticker?.cancel(); isPlaying = false; position = min(duration, max(0, sound?.currentTime ?? position)) }
    func seek(to value: TimeInterval) {
        guard let sound, value.isFinite else { return }
        position = min(duration, max(0, value)); sound.currentTime = position
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
        key = nil; position = 0; duration = 0; isPlaying = false; isSeeking = false; resumeAfterSeek = false; error = nil
    }
}
#endif

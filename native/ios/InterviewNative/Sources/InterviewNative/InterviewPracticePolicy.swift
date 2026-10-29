import Foundation

public enum InterviewPracticePolicy {
    public static let tracks = ["공채", "항해", "기관", "방제", "관제", "기타"]
    public static func eligible(category: String, tracks: [String], mode: String, track: String) -> Bool {
        guard Self.tracks.contains(track) else { return false }
        return mode == "job" ? category == "job" && tracks.contains(track) : category == "personality"
    }
}

/// Four seconds of local microphone silence advances once, including an empty answer.
public struct InterviewAnswerGate {
    public static let silenceSeconds: TimeInterval = 4
    public enum State { case waiting, speaking, pause, complete }
    private let started: TimeInterval
    private var lastVoice: TimeInterval?
    private var completed = false
    public init(now: TimeInterval) { started = now }
    public mutating func sample(now: TimeInterval, speaking: Bool) -> State {
        if completed { return .complete }
        if speaking { lastVoice = now; return .speaking }
        if now - (lastVoice ?? started) >= Self.silenceSeconds {
            completed = true; return .complete
        }
        if now - started < 0.6 && lastVoice == nil { return .waiting }
        if let lastVoice, now - lastVoice < 1.2 { return .speaking }
        return .pause
    }
    public func remaining(now: TimeInterval) -> TimeInterval {
        max(0, Self.silenceSeconds - (now - (lastVoice ?? started)))
    }
}

/// Android's microphone detector: ignore DC, calibrate ambient noise, require sustained speech.
public struct InterviewMicSignal {
    public private(set) var noiseDb: Double
    public private(set) var calibrating = false
    public private(set) var speaking = false
    public private(set) var level: Float = 0
    private var calibration: [Double] = []
    private var calibrationSeconds = 0.0, loudSeconds = 0.0
    public init(noiseDb: Double = -60) { self.noiseDb = max(-90, min(-20, noiseDb)) }
    public mutating func calibrate() { calibrating = true; calibration = []; calibrationSeconds = 0; loudSeconds = 0; speaking = false; level = 0 }
    public mutating func sample(rms: Double, seconds: Double) {
        let db = 20 * log10(max(0.000001, rms))
        if calibrating {
            calibration.append(db); calibrationSeconds += seconds
            if calibrationSeconds >= 1 {
                let values = calibration.sorted(); noiseDb = max(-90, min(-20, values[(values.count - 1) / 3])); calibrating = false
            }
            return
        }
        let onset = max(-52, noiseDb + 8), release = onset - 3
        if speaking { if db < release { speaking = false; loudSeconds = 0 } }
        else { loudSeconds = db >= onset ? loudSeconds + seconds : 0; speaking = loudSeconds >= 0.12 }
        let target = speaking ? max(0, min(1, (db - release) / max(18, -12 - release))) : 0
        let smoothing = 1 - exp(-seconds / (target > Double(level) ? 0.08 : 0.18))
        level += Float((target - Double(level)) * smoothing)
        if level < 0.005 { level = 0 }
    }
}


public enum InterviewBridgePolicy {
    public static func accepts(_ raw: String, simulator: Bool) -> Bool {
        guard let url = URLComponents(string: raw), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/", let host = url.host else { return false }
        if simulator && url.scheme == "http" && host == "127.0.0.1" && url.port == 8787 { return true }
        guard url.scheme == "https", url.port == 8788 else { return false }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) && Int($0).map { (0...255).contains($0) } == true }) else { return false }
        let octets = parts.compactMap { Int($0) }
        return octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1]))
    }
}

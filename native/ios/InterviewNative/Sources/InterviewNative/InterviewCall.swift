import Foundation
import AVFoundation
import WebRTC

// All mutable call state is confined to the main queue. The server chooses and speaks questions.
final class InterviewCall: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    private static let initialized: Void = { RTCInitializeSSL() }()
    let api: InterviewAPI
    var onReady: ((String, String) -> Void)?
    var onEvent: ((InterviewJSON) -> Void)?
    var onEnd: ((String, Bool) -> Void)?
    private var factory: RTCPeerConnectionFactory?
    private var peer: RTCPeerConnection?
    private var audioTrack: RTCAudioTrack?
    private var channel: RTCDataChannel?
    private var socket: URLSessionWebSocketTask?
    private var runID = ""
    private var sentOffer = false, sessionStarted = false, begun = false, closing = false, ended = false
    private var counter = 0
    private var pending: [Int: (Result<InterviewJSON, Error>) -> Void] = [:]
    private var timers: [DispatchWorkItem] = []
    private var interruption: NSObjectProtocol?
    private var oldCategory: AVAudioSession.Category?
    private var oldMode: AVAudioSession.Mode?
    private var oldOptions: AVAudioSession.CategoryOptions?
    private var finishing: InterviewCall?
    init(api: InterviewAPI) { self.api = api; super.init() }
    private func later(_ seconds: Double, _ body: @escaping () -> Void) {
        let item = DispatchWorkItem(block: body); timers.append(item)
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    }
    func start() {
        guard peer == nil, !ended, !closing else { return }
        _ = Self.initialized
        do {
            let av = AVAudioSession.sharedInstance()
            oldCategory = av.category; oldMode = av.mode; oldOptions = av.categoryOptions
            let rtcAudio = RTCAudioSession.sharedInstance()
            rtcAudio.lockForConfiguration(); defer { rtcAudio.unlockForConfiguration() }
            try rtcAudio.setCategory(AVAudioSession.Category.playAndRecord, with: [.defaultToSpeaker, .allowBluetooth])
            try rtcAudio.setMode(AVAudioSession.Mode.voiceChat)
            try rtcAudio.setActive(true)
            interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification,
                object: nil, queue: .main) { [weak self] _ in self?.stop(failed: true) }
            let f = RTCPeerConnectionFactory(); factory = f
            let config = RTCConfiguration(); config.sdpSemantics = .unifiedPlan
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            guard let p = f.peerConnection(with: config, constraints: constraints, delegate: self) else { throw InterviewError.connection }
            peer = p
            let source = f.audioSource(with: RTCMediaConstraints(mandatoryConstraints: nil,
                optionalConstraints: ["googEchoCancellation": "true", "googNoiseSuppression": "true"]))
            let track = f.audioTrack(with: source, trackId: "student-audio")
            audioTrack = track; p.add(track, streamIds: ["interview"])
            channel = p.dataChannel(forLabel: "oai-events", configuration: RTCDataChannelConfiguration())
            channel?.delegate = self
            p.offer(for: constraints) { [weak self] offer, error in DispatchQueue.main.async {
                guard let self, !self.closing, !self.ended else { return }
                guard error == nil, let offer else { self.stop(failed: true); return }
                p.setLocalDescription(offer) { error in DispatchQueue.main.async {
                    guard !self.closing, !self.ended else { return }
                    if error != nil { self.stop(failed: true) }
                    else if p.iceGatheringState == .complete { self.sendOffer() }
                }}
            }}
            later(15) { [weak self] in if let self, !self.sentOffer { self.stop(failed: true) } }
        } catch { stop(failed: true) }
    }
    private func sendOffer() {
        guard !ended, !closing, !sentOffer, let sdp = peer?.localDescription?.sdp else { return }
        sentOffer = true
        let fields: InterviewJSON = ["requestKey": UUID().uuidString, "sdp": sdp]
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let result = try await api.command("start", fields)
                guard !closing, !ended else { return }
                guard result["transport"] as? String == "websocket", result["url"] as? String == "/api/interview-live-socket",
                      let ticket = result["ticket"] as? String else { throw InterviewError.invalidResponse }
                var req = URLRequest(url: URL(string: InterviewAPI.origin.replacingOccurrences(of: "https:", with: "wss:") + "/api/interview-live-socket")!)
                req.setValue(InterviewAPI.origin, forHTTPHeaderField: "Origin")
                let ws = api.controlSession.webSocketTask(with: req); socket = ws; ws.resume(); receive()
                send("start", fields, ticket: ticket) { [weak self] result in
                    guard let self else { return }
                    switch result {
                    case .failure: self.stop(failed: true)
                    case .success(let value):
                        guard let id = value["runId"] as? String, let answer = value["sdp"] as? String else { self.stop(failed: true); return }
                        self.runID = id
                        guard !self.closing, !self.ended else { return }
                        self.peer?.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: answer)) { error in DispatchQueue.main.async {
                            guard !self.closing, !self.ended else { return }
                            guard error == nil else { self.stop(failed: true); return }
                            self.begin(); self.onReady?(id, value["question"] as? String ?? "")
                            self.heartbeat(); self.later(600) { [weak self] in self?.stop() }
                        }}
                    }
                }
            } catch { stop(failed: true) }
        }
    }
    private func send(_ action: String, _ fields: InterviewJSON = [:], ticket: String? = nil,
                      done: @escaping (Result<InterviewJSON, Error>) -> Void) {
        guard let socket, !ended else { done(.failure(InterviewError.connection)); return }
        counter += 1; let id = counter
        var body = fields; body["action"] = action
        if action != "start" { body["runId"] = runID }
        var message: InterviewJSON = ["id": id, "body": body]
        if let ticket { message["ticket"] = ticket }
        guard let data = try? JSONSerialization.data(withJSONObject: message), let text = String(data: data, encoding: .utf8) else {
            done(.failure(InterviewError.invalidResponse)); return
        }
        pending[id] = done
        later(55) { [weak self] in
            guard let self, let cb = self.pending.removeValue(forKey: id) else { return }
            cb(.failure(InterviewError.connection)); self.stop(failed: true)
        }
        socket.send(.string(text)) { [weak self] error in
            if error != nil { DispatchQueue.main.async { self?.stop(failed: true) } }
        }
    }
    private func receive() {
        socket?.receive { [weak self] result in DispatchQueue.main.async {
            guard let self, !self.ended else { return }
            switch result {
            case .failure: self.stop(failed: true)
            case .success(let message):
                let data: Data
                switch message { case .string(let s): data = Data(s.utf8); case .data(let d): data = d; @unknown default: self.stop(failed: true); return }
                guard let value = (try? JSONSerialization.jsonObject(with: data)) as? InterviewJSON else { self.stop(failed: true); return }
                if let event = value["event"] as? InterviewJSON { if !self.closing { self.onEvent?(event) } }
                else if let id = value["id"] as? Int, let cb = self.pending.removeValue(forKey: id) {
                    if let response = value["result"] as? InterviewJSON, response["ok"] as? Bool == true { cb(.success(response)) }
                    else { cb(.failure(InterviewError.connection)) }
                }
                if !self.ended { self.receive() }
            }
        }}
    }
    private func begin() {
        guard sessionStarted, !runID.isEmpty, !begun, !closing, !ended else { return }
        begun = true; send("begin") { [weak self] result in if case .failure = result { self?.stop(failed: true) } }
    }
    private func heartbeat() {
        guard !closing, !ended else { return }
        send("heartbeat") { [weak self] result in
            switch result {
            case .failure: self?.stop(failed: true)
            case .success(let data):
                let state = (data["run"] as? InterviewJSON)?["state"] as? String ?? ""
                if ["completed", "interrupted", "unknown"].contains(state) { self?.stop() }
            }
        }
        later(10) { [weak self] in self?.heartbeat() }
    }
    func answer(_ done: @escaping (Result<InterviewJSON, Error>) -> Void) { send("answer_done", done: done) }
    func mute(_ value: Bool) { audioTrack?.isEnabled = !value }
    func stop(failed: Bool = false) {
        guard !closing, !ended else { return }; closing = true; finishing = self; audioTrack?.isEnabled = false
        if channel?.readyState == .open,
           let data = try? JSONSerialization.data(withJSONObject: ["type": "session.close", "event_id": UUID().uuidString]) {
            channel?.sendData(RTCDataBuffer(data: data, isBinary: false))
        }
        // Stop hardware capture now; the separate control socket owns durable finalization.
        peer?.close()
        guard !runID.isEmpty, socket != nil else { release(failed); return }
        send("finish") { [weak self] result in
            if case .failure = result { self?.release(true) } else { self?.release(failed) }
        }
        later(20) { [weak self] in self?.release(true) }
    }
    private func release(_ failed: Bool) {
        guard !ended else { return }; ended = true
        timers.forEach { $0.cancel() }; timers.removeAll()
        let callbacks = Array(pending.values); pending.removeAll()
        callbacks.forEach { $0(.failure(InterviewError.connection)) }
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil
        channel?.delegate = nil; channel?.close(); channel = nil
        peer?.close(); peer = nil; audioTrack = nil; factory = nil
        if let interruption { NotificationCenter.default.removeObserver(interruption) }; interruption = nil
        let rtcAudio = RTCAudioSession.sharedInstance(); rtcAudio.lockForConfiguration()
        try? rtcAudio.setActive(false)
        if let oldCategory, let oldMode, let oldOptions {
            try? rtcAudio.setCategory(oldCategory, with: oldOptions)
            try? rtcAudio.setMode(oldMode)
        }
        rtcAudio.unlockForConfiguration()
        onEnd?(runID, failed)
        finishing = nil
    }
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {}
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard !buffer.isBinary else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.ended, !self.closing else { return }
            guard let event = (try? JSONSerialization.jsonObject(with: buffer.data)) as? InterviewJSON else { self.stop(failed: true); return }
            let type = event["type"] as? String
            if type == "session.started" { self.sessionStarted = true; self.begin() }
            if type == "session.closed" { self.stop(); return }
            if type == "error" { self.stop(failed: true); return }
            self.onEvent?(event)
        }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        DispatchQueue.main.async { [weak self] in
            if newState == .failed { self?.stop(failed: true) }
            if newState == .disconnected { self?.later(5) { [weak self] in
                if self?.peer?.iceConnectionState == .disconnected { self?.stop(failed: true) }
            }}
        }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        if newState == .complete { DispatchQueue.main.async { [weak self] in self?.sendOffer() } }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

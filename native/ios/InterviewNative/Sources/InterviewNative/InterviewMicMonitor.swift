import AVFoundation

/// Device checks show actual input volume immediately, independent of speech recognition.
final class InterviewMicMonitor {
    private let queue = DispatchQueue(label: "interview.microphone.check", qos: .userInitiated)
    private var engine: AVAudioEngine?
    func start(sample: @escaping (Float, Double, Bool) -> Void, completion: @escaping (Bool) -> Void) {
        queue.async {
            self.stopOnQueue()
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try session.setActive(true)
                let engine = AVAudioEngine(); self.engine = engine
                try engine.inputNode.setVoiceProcessingEnabled(true)
                let input = engine.inputNode, format = input.outputFormat(forBus: 0)
                guard format.sampleRate > 0, format.channelCount > 0 else { throw InterviewError.connection }
                var signal = InterviewMicSignal(); signal.calibrate()
                var lastUpdate = 0.0, smooth: Float = 0
                var aboveNoiseDuration = 0.0
                input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                    guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
                    let count = Double(buffer.frameLength)
                    var sum = 0.0, squares = 0.0
                    for i in 0..<Int(buffer.frameLength) { let value = Double(channel[i]); sum += value; squares += value * value }
                    let rms = sqrt(max(0, squares / count - pow(sum / count, 2)))
                    signal.sample(rms: rms, seconds: count / format.sampleRate)
                    // Reject ambient input and short taps; sustained voice rises within about 60 ms.
                    let db = 20 * log10(max(0.000001, rms))
                    let threshold = max(-48, signal.noiseDb + 10)
                    aboveNoiseDuration = !signal.calibrating && db >= threshold ? aboveNoiseDuration + count / format.sampleRate : 0
                    let raw: Float = aboveNoiseDuration >= 0.06 ? Float(min(1, max(0, (db - threshold) / max(18, -12 - threshold)))) : 0
                    let factor = Float(1 - exp(-(count / format.sampleRate) / (raw > smooth ? 0.025 : 0.12)))
                    smooth += (raw - smooth) * factor
                    let now = ProcessInfo.processInfo.systemUptime
                    guard now - lastUpdate >= 0.05 else { return }; lastUpdate = now
                    let value = smooth, floor = signal.noiseDb, calibrating = signal.calibrating
                    DispatchQueue.main.async { sample(value, floor, calibrating) }
                }
                try engine.start()
                DispatchQueue.main.async { completion(true) }
            } catch {
                self.stopOnQueue(); DispatchQueue.main.async { completion(false) }
            }
        }
    }
    private func stopOnQueue() {
        if let engine { engine.stop(); engine.inputNode.removeTap(onBus: 0) }; engine = nil
    }
    func stop() { queue.async { self.stopOnQueue() } }
}

#if DEBUG
import AVFoundation

/// One microphone supplies the saved WAV, level detector, and optional caption stream.
final class PracticeRecorder {
    private var engine: AVAudioEngine?
    private var file: FileHandle?
    private let lock = NSLock()
    private let controlQueue = DispatchQueue(label: "interview.practice.audio", qos: .userInitiated)
    private var generation = UUID()
    func start(url: URL, noiseDb: Double = -60, completion: @escaping (Result<Void, Error>) -> Void, sample: @escaping (Float, Bool, Data) -> Void) {
        stop()
        lock.lock(); let active = generation; lock.unlock()
        controlQueue.async {
            do {
                try self.startOnQueue(url: url, noiseDb: noiseDb, active: active, ready: { completion(.success(())) }, sample: sample)
            } catch {
                self.stopEngineOnQueue()
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }
    private func startOnQueue(url: URL, noiseDb: Double, active: UUID, ready: @escaping () -> Void, sample: @escaping (Float, Bool, Data) -> Void) throws {
        stopEngineOnQueue()
        lock.lock(); let valid = generation == active; lock.unlock()
        guard valid else { throw CancellationError() }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
        let engine = AVAudioEngine()
        try engine.inputNode.setVoiceProcessingEnabled(true)
        let input = engine.inputNode.outputFormat(forBus: 0)
        guard input.sampleRate > 0, input.channelCount > 0,
              let output = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: input, to: output) else { throw InterviewError.connection }
        if !FileManager.default.fileExists(atPath: url.path) { try Data(repeating: 0, count: 44).write(to: url, options: .completeFileProtectionUnlessOpen) }
        let file = try FileHandle(forUpdating: url)
        try file.seekToEnd()
        lock.lock()
        guard generation == active else { lock.unlock(); try? file.close(); throw CancellationError() }
        self.file = file; self.engine = engine
        lock.unlock()
        var signal = InterviewMicSignal(noiseDb: noiseDb)
        var receivedAudio = false
        engine.inputNode.installTap(onBus: 0, bufferSize: 2048, format: input) { [weak self] buffer, _ in
            guard let self else { return }
            self.lock.lock(); defer { self.lock.unlock() }
            guard self.generation == active else { return }
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000 / input.sampleRate) + 8
            guard let pcm = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: capacity) else { return }
            var consumed = false
            var conversionError: NSError?
            converter.convert(to: pcm, error: &conversionError) { _, status in
                if consumed { status.pointee = .noDataNow; return nil }
                consumed = true; status.pointee = .haveData; return buffer
            }
            guard conversionError == nil, pcm.frameLength > 0, let samples = pcm.int16ChannelData?[0] else { return }
            
            let count = Int(pcm.frameLength)
            var sum = 0.0, squares = 0.0
            for index in 0..<count { let n = Double(samples[index]); sum += n; squares += n*n }
            let rms = sqrt(max(0, squares / Double(count) - pow(sum / Double(count), 2))) / 32768
            signal.sample(rms: rms, seconds: Double(count) / 16000)
            let level = signal.level, speaking = signal.speaking
            let data = Data(bytes: samples, count: count * 2)
            do { try self.file?.write(contentsOf: data) } catch { return }
            // Engine startup alone does not guarantee that microphone audio is arriving.
            if !receivedAudio { receivedAudio = true; DispatchQueue.main.async { ready() } }
            DispatchQueue.main.async { sample(level, speaking, data) }
        }
        try engine.start()
    }
    private func stopEngineOnQueue() {
        if let engine { engine.stop(); engine.inputNode.removeTap(onBus: 0) }; engine = nil
    }
    func stop() {
        controlQueue.async { self.stopEngineOnQueue() }
        lock.lock(); generation = UUID()
        if let file {
            do {
                let size = try file.seekToEnd()
                if size >= 44, size < UInt64(UInt32.max) {
                    var header = Data("RIFF".utf8)
                    func le(_ value: UInt32, _ count: Int = 4) { for offset in 0..<count { header.append(UInt8(truncatingIfNeeded: value >> (offset * 8))) } }
                    le(UInt32(size - 8)); header.append(Data("WAVEfmt ".utf8)); le(16); le(1, 2); le(1, 2)
                    le(16000); le(32000); le(2, 2); le(16, 2); header.append(Data("data".utf8)); le(UInt32(size - 44))
                    try file.seek(toOffset: 0); try file.write(contentsOf: header); try file.synchronize()
                }
                try file.close()
            } catch { try? file.close() }
        }
        file = nil; lock.unlock()
    }

}
#endif

import AVFoundation
import SwiftUI

// Preview only: no video output, file writer, or camera track on the peer connection.
final class InterviewMedia: ObservableObject {
    @Published var cameraOn = false
    @Published var micOn = false
    @Published var level: Float = 0
    @Published var message = ""
    let capture = AVCaptureSession()
    private let queue = DispatchQueue(label: "interview.camera")
    private var cameraGeneration = 0, micGeneration = 0
    private var engine: AVAudioEngine?
    private var tapInstalled = false
    private var previousAudio: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    func toggleCamera() {
        if cameraOn { stopCamera(); return }
        cameraGeneration += 1; let generation = cameraGeneration
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in DispatchQueue.main.async {
            guard let self, generation == self.cameraGeneration else { return }
            guard granted else { self.message = "카메라 권한을 허용해주세요. 카메라 없이도 면접할 수 있습니다."; return }
            self.cameraOn = true
            self.queue.async {
                do {
                    self.capture.beginConfiguration()
                    self.capture.sessionPreset = .medium
                    self.capture.inputs.forEach { self.capture.removeInput($0) }
                    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else { throw InterviewError.connection }
                    let input = try AVCaptureDeviceInput(device: camera)
                    guard self.capture.canAddInput(input) else { throw InterviewError.connection }
                    self.capture.addInput(input); self.capture.commitConfiguration(); self.capture.startRunning()
                } catch {
                    self.capture.commitConfiguration()
                    DispatchQueue.main.async {
                        guard generation == self.cameraGeneration else { return }
                        self.cameraOn = false; self.message = "카메라를 열지 못했습니다. 카메라 없이 계속할 수 있습니다."
                    }
                }
            }
        }}
    }
    func stopCamera() {
        cameraGeneration += 1; cameraOn = false
        queue.async { self.capture.stopRunning() }
    }
    func toggleMic() {
        if micOn { stopMic(); return }
        micGeneration += 1; let generation = micGeneration
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in DispatchQueue.main.async {
            guard let self, generation == self.micGeneration else { return }
            guard granted else { self.message = "설정에서 마이크 권한을 허용해주세요."; return }
            do {
                let session = AVAudioSession.sharedInstance()
                self.previousAudio = (session.category, session.mode, session.categoryOptions)
                try session.setCategory(.record, mode: .measurement)
                try session.setActive(true)
                let engine = AVAudioEngine(); self.engine = engine
                let input = engine.inputNode, format = engine.inputNode.outputFormat(forBus: 0)
                guard format.sampleRate > 0, format.channelCount > 0 else { throw InterviewError.connection }
                input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                    guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
                    var sum: Float = 0
                    for i in 0..<Int(buffer.frameLength) { sum += channel[i] * channel[i] }
                    let value = min(1, sqrt(sum / Float(buffer.frameLength)) * 5)
                    DispatchQueue.main.async { if self?.micGeneration == generation { self?.level = value } }
                }
                self.tapInstalled = true
                try engine.start(); self.micOn = true
                self.message = "10초 동안 말해보세요. 확인용 음성은 저장하거나 전송하지 않습니다."
                DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
                    if self?.micGeneration == generation { self?.stopMic() }
                }
            } catch { self.stopMic(); self.message = "마이크를 확인하지 못했습니다." }
        }}
    }
    func stopMic() {
        micGeneration += 1
        if let engine { engine.stop(); if tapInstalled { engine.inputNode.removeTap(onBus: 0) } }; engine = nil; tapInstalled = false
        micOn = false; level = 0
        if let previousAudio {
            let session = AVAudioSession.sharedInstance()
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            try? session.setCategory(previousAudio.0, mode: previousAudio.1, options: previousAudio.2)
        }
        previousAudio = nil
    }
    func stop() { stopCamera(); stopMic() }
}

struct InterviewCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    final class Preview: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
    func makeUIView(context: Context) -> Preview {
        let view = Preview(); view.preview.session = session; view.preview.videoGravity = .resizeAspectFill
        return view
    }
    func updateUIView(_ uiView: Preview, context: Context) {}
    static func dismantleUIView(_ uiView: Preview, coordinator: ()) { uiView.preview.session = nil }
}

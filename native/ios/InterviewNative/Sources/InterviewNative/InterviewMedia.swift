import AVFoundation
import SwiftUI

// Production uses preview only. Local practice recording is compiled only in Debug.
final class InterviewMedia: NSObject, ObservableObject {
    @Published var cameraOn = false
    @Published private(set) var cameraReady = false
    private var cameraStarting = false
    @Published var micOn = false
    @Published var level: Float = 0
    @Published var message = ""
    private(set) var noiseDb = -60.0
    private let capture = AVCaptureSession()
    #if DEBUG
    private let movie = AVCaptureMovieFileOutput()
    private var movieDelegate: PracticeMovieDelegate?
    @Published private(set) var videoRecording = false
    func startPracticeVideo(url: URL, started: @escaping (Bool) -> Void, finished: @escaping (Bool) -> Void) {
        queue.async {
            do {
                guard self.capture.isRunning, self.movieDelegate == nil else { throw InterviewError.connection }
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try audioSession.setActive(true)
                if !self.capture.outputs.contains(self.movie) {
                    self.capture.beginConfiguration()
                    defer { self.capture.commitConfiguration() }
                    guard let microphone = AVCaptureDevice.default(for: .audio) else { throw InterviewError.connection }
                    let input = try AVCaptureDeviceInput(device: microphone)
                    guard self.capture.canAddInput(input), self.capture.canAddOutput(self.movie) else { throw InterviewError.connection }
                    self.capture.addInput(input); self.capture.addOutput(self.movie)
                }
                if let connection = self.movie.connection(with: .video) {
                    if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
                    if connection.isVideoMirroringSupported {
                        connection.automaticallyAdjustsVideoMirroring = false; connection.isVideoMirrored = true
                    }
                }
                self.movie.maxRecordedDuration = CMTime(seconds: 610, preferredTimescale: 600)
                self.movie.minFreeDiskSpaceLimit = 100 * 1024 * 1024
                let delegate = PracticeMovieDelegate(started: { [weak self] ok in
                    self?.videoRecording = ok; started(ok)
                }, finished: { [weak self] ok in
                    self?.videoRecording = false
                    self?.queue.async { self?.movieDelegate = nil }
                    finished(ok)
                })
                self.movieDelegate = delegate
                self.movie.startRecording(to: url, recordingDelegate: delegate)
            } catch { print("Practice video start failed: \(error)"); DispatchQueue.main.async { started(false); finished(false) } }
        }
    }
    func stopPracticeVideo() { queue.async { if self.movie.isRecording { self.movie.stopRecording() } } }
    #endif
    // A single preview stays connected for the lifetime of this media controller.
    // Moving it between view hosts must never reconfigure a running capture graph.
    let previewLayer: AVCaptureVideoPreviewLayer
    private var previewObservation: NSKeyValueObservation?
    private var cameraRequestedAt: TimeInterval?
    private var cameraConfigured = false // accessed only on the camera queue
    private let queue = DispatchQueue(label: "interview.camera", qos: .userInitiated)
    private var cameraGeneration = 0, micGeneration = 0
    private let micMonitor = InterviewMicMonitor()
    override init() {
        previewLayer = AVCaptureVideoPreviewLayer()
        super.init()
        // Bind while the session is empty and idle, before any startRunning call.
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.session = capture
        previewObservation = previewLayer.observe(\.isPreviewing, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.cameraReady = self.cameraOn && self.previewLayer.isPreviewing
                if self.cameraReady, let requestedAt = self.cameraRequestedAt {
                    self.cameraRequestedAt = nil
                    #if DEBUG
                    print(String(format: "Interview camera first preview: %.3f s", ProcessInfo.processInfo.systemUptime - requestedAt))
                    #endif
                }
            }
        }
    }
    func toggleCamera() {
        #if targetEnvironment(simulator)
        message = "시뮬레이터에서는 카메라를 사용할 수 없습니다. 실제 아이폰에서 확인해주세요."
        return
        #endif
        if cameraOn { stopCamera(); return }
        startCamera()
    }
    func startCamera() {
        #if targetEnvironment(simulator)
        message = "시뮬레이터에서는 카메라를 사용할 수 없습니다. 실제 아이폰에서 확인해주세요."
        return
        #endif
        guard !cameraOn, !cameraStarting else { return }
        cameraStarting = true; cameraReady = false; cameraRequestedAt = ProcessInfo.processInfo.systemUptime
        cameraGeneration += 1; let generation = cameraGeneration
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in DispatchQueue.main.async {
            guard let self, generation == self.cameraGeneration else { return }
            guard granted else { self.cameraStarting = false; self.message = "카메라 권한을 허용해주세요. 카메라 없이도 면접할 수 있습니다."; return }
            self.cameraOn = true
            self.queue.async {
                do {
                    if !self.cameraConfigured {
                        self.capture.beginConfiguration()
                        // Always balance configuration even if device input creation fails.
                        do {
                            defer { self.capture.commitConfiguration() }
                            self.capture.sessionPreset = .medium
                            self.capture.automaticallyConfiguresApplicationAudioSession = false
                            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else { throw InterviewError.connection }
                            let input = try AVCaptureDeviceInput(device: camera)
                            guard self.capture.canAddInput(input) else { throw InterviewError.connection }
                            self.capture.addInput(input)
                            if let connection = self.previewLayer.connection {
                                if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
                                if connection.isVideoMirroringSupported {
                                    connection.automaticallyAdjustsVideoMirroring = false
                                    connection.isVideoMirrored = true
                                }
                            }
                            self.cameraConfigured = true
                        }
                    }
                    if !self.capture.isRunning { self.capture.startRunning() }
                    DispatchQueue.main.async {
                        guard self.cameraGeneration == generation else { return }
                        self.cameraStarting = false; self.cameraReady = self.cameraOn && self.previewLayer.isPreviewing
                    }
                } catch {
                    DispatchQueue.main.async {
                        guard generation == self.cameraGeneration else { return }
                        self.cameraOn = false; self.cameraReady = false; self.cameraStarting = false; self.message = "카메라를 열지 못했습니다. 카메라 없이 계속할 수 있습니다."
                    }
                }
            }
        }}
    }
    func stopCamera() {
        cameraGeneration += 1; cameraOn = false; cameraReady = false; cameraStarting = false; cameraRequestedAt = nil
        queue.async {
            #if DEBUG
            if self.movie.isRecording { self.movie.stopRecording() }
            #endif
            self.capture.stopRunning()
        }
    }
    func toggleMic() {
        if micOn { stopMic(); return }
        micGeneration += 1; let generation = micGeneration
        micOn = true; level = 0; message = "마이크를 준비하고 있습니다."
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in DispatchQueue.main.async {
            guard let self, generation == self.micGeneration else { return }
            guard granted else { self.micOn = false; self.message = "설정에서 마이크 권한을 허용해주세요."; return }
            self.micMonitor.start(sample: { [weak self] value, floor, calibrating in
                guard let self, self.micGeneration == generation else { return }
                self.level = value; self.noiseDb = floor
                let text = calibrating ? "주변 소음 확인 중…" : ""
                if self.message != text { self.message = text }
            }, completion: { [weak self] success in
                guard let self, self.micGeneration == generation else { return }
                if !success { self.stopMic(); self.message = "마이크를 확인하지 못했습니다."; return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
                    if self?.micGeneration == generation { self?.stopMic() }
                }
            })
        }}
    }
    func stopMic() {
        micGeneration += 1; micOn = false; level = 0
        micMonitor.stop()
    }
    func stop() { stopCamera(); stopMic() }
}

struct InterviewCameraPreview: UIViewRepresentable {
    let media: InterviewMedia
    final class Preview: UIView {
        private var preview: AVCaptureVideoPreviewLayer?
        func mount(_ preview: AVCaptureVideoPreviewLayer) {
            self.preview = preview
            if preview.superlayer !== layer {
                preview.removeFromSuperlayer()
                layer.addSublayer(preview)
            }
            setNeedsLayout()
        }
        override func layoutSubviews() {
            super.layoutSubviews()
            guard let preview, preview.superlayer === layer else { return }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            preview.frame = bounds
            CATransaction.commit()
        }
        func unmount() {
            // SwiftUI can dismantle the old host after mounting the new one.
            // Never detach a preview that already belongs to the live screen.
            if preview?.superlayer === layer { preview?.removeFromSuperlayer() }
            preview = nil
        }
    }
    func makeUIView(context: Context) -> Preview {
        let view = Preview()
        view.mount(media.previewLayer)
        return view
    }
    func updateUIView(_ uiView: Preview, context: Context) {}
    static func dismantleUIView(_ uiView: Preview, coordinator: ()) { uiView.unmount() }
}

#if DEBUG
private final class PracticeMovieDelegate: NSObject, AVCaptureFileOutputRecordingDelegate {
    let started: (Bool) -> Void
    let finished: (Bool) -> Void
    private var didStart = false
    init(started: @escaping (Bool) -> Void, finished: @escaping (Bool) -> Void) {
        self.started = started; self.finished = finished
    }
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        didStart = true; DispatchQueue.main.async { self.started(true) }
    }
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error { print("Practice video finish: \(error)") }
        let completed = error == nil || (error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool == true
        let asset = AVURLAsset(url: url)
        let success = completed && !asset.tracks(withMediaType: .video).isEmpty && !asset.tracks(withMediaType: .audio).isEmpty
        if success { try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path) }
        else { try? FileManager.default.removeItem(at: url) }
        DispatchQueue.main.async {
            if !self.didStart { self.started(false) }
            self.finished(success)
        }
    }
}
#endif

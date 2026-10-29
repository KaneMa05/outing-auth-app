#if DEBUG
import AVFoundation
import SwiftUI

/// Local silent clips overlap at the repeat boundary to avoid a visible end/start flash.
struct InterviewAvatarVideo: UIViewRepresentable {
    static var availableURLs: [URL] {
        ["interviewer-man-1", "interviewer-woman", "interviewer-man-2"].compactMap {
            Bundle.main.url(forResource: $0, withExtension: "mp4", subdirectory: "InterviewAvatar")
        }
    }
    let url: URL
    let paused: Bool
    final class Preview: UIView {
        let surfaces = [AVPlayerLayer(), AVPlayerLayer()]
        override init(frame: CGRect) {
            super.init(frame: frame)
            backgroundColor = .black
            for surface in surfaces { surface.videoGravity = .resizeAspect; layer.addSublayer(surface) }
            surfaces[1].opacity = 0
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
        override func layoutSubviews() {
            super.layoutSubviews()
            CATransaction.begin(); CATransaction.setDisableActions(true)
            for surface in surfaces { surface.frame = bounds }
            CATransaction.commit()
        }
    }
    final class Coordinator {
        let players: [AVPlayer]
        weak var view: Preview?
        private var observations: [(AVPlayer, Any)] = []
        private var active = 0
        private var running = false
        private var transitioning = false
        private var stopped = false
        init(url: URL) {
            players = [AVPlayer(url: url), AVPlayer(url: url)]
            for (index, player) in players.enumerated() {
                player.isMuted = true
                player.preventsDisplaySleepDuringVideoPlayback = false
                player.automaticallyWaitsToMinimizeStalling = false
                player.actionAtItemEnd = .pause
                let token = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.04, preferredTimescale: 600), queue: .main) { [weak self] time in
                    self?.advance(index: index, time: time)
                }
                observations.append((player, token))
            }
        }
        func setPaused(_ paused: Bool) {
            guard !stopped, running != !paused else { return }
            running = !paused
            if paused { players.forEach { $0.pause() } }
            else { players[active].play() }
        }
        private func advance(index: Int, time: CMTime) {
            guard running, !stopped, index == active, !transitioning,
                  let duration = players[index].currentItem?.duration.seconds,
                  duration.isFinite, duration > 1, time.seconds >= duration - 0.4,
                  let view else { return }
            transitioning = true
            let next = 1 - index
            players[next].seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self, weak view] success in
                DispatchQueue.main.async {
                    guard let self, let view, !self.stopped, success else { self?.transitioning = false; return }
                    guard self.running else { self.transitioning = false; return }
                    self.players[next].play()
                    // Both clips remain visible during the dissolve; no empty queue or black layer.
                    CATransaction.begin(); CATransaction.setDisableActions(true)
                    view.layer.insertSublayer(view.surfaces[next], above: view.surfaces[index])
                    CATransaction.commit()
                    CATransaction.begin(); CATransaction.setAnimationDuration(0.3)
                    CATransaction.setCompletionBlock { [weak self] in
                        guard let self, !self.stopped else { return }
                        self.players[index].pause()
                        self.players[index].seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
                        CATransaction.begin(); CATransaction.setDisableActions(true)
                        self.view?.surfaces[index].opacity = 0
                        CATransaction.commit()
                        self.active = next; self.transitioning = false
                        if !self.running { self.players[next].pause() }
                    }
                    view.surfaces[next].opacity = 1
                    CATransaction.commit()
                }
            }
        }
        func stop() {
            stopped = true; running = false
            for (player, token) in observations { player.removeTimeObserver(token) }
            observations = []
            players.forEach { $0.pause(); $0.replaceCurrentItem(with: nil) }
        }
    }
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIView(context: Context) -> Preview {
        let view = Preview()
        for index in 0..<2 { view.surfaces[index].player = context.coordinator.players[index] }
        context.coordinator.view = view
        return view
    }
    func updateUIView(_ uiView: Preview, context: Context) { context.coordinator.setPaused(paused) }
    static func dismantleUIView(_ uiView: Preview, coordinator: Coordinator) {
        coordinator.stop()
        uiView.surfaces.forEach { $0.player = nil }
    }
}
#endif

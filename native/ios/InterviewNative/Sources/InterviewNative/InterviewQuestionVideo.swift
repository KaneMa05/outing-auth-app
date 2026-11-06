#if DEBUG
import AVFoundation
import SwiftUI

/// Optional bundled question clips share the model's playback and completion lifecycle.
struct InterviewQuestionVideo: UIViewRepresentable {
    let player: AVPlayer
    static func url(avatar: String, question: String) -> URL? {
        let safeName = "^[A-Za-z0-9_-]+$"
        guard avatar.range(of: safeName, options: .regularExpression) != nil,
              question.range(of: safeName, options: .regularExpression) != nil else { return nil }
        return Bundle.main.url(forResource: question, withExtension: "mp4", subdirectory: "InterviewQuestionVideo/" + avatar)
    }
    final class Surface: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
    func makeUIView(context: Context) -> Surface {
        let view = Surface()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }
    func updateUIView(_ uiView: Surface, context: Context) { uiView.playerLayer.player = player }
    static func dismantleUIView(_ uiView: Surface, coordinator: ()) { uiView.playerLayer.player = nil }
}
#endif

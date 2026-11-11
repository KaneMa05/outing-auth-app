#if DEBUG
import AVFoundation
import WebRTC

enum InterviewSpeakerAudio {
    /// WebRTC reapplies this configuration when its audio device starts.
    /// Set the engine default too, so it cannot restore the receiver route.
    static func installDefaults() -> RTCAudioSessionConfiguration {
        let previous = RTCAudioSessionConfiguration.webRTC()
        let configuration = RTCAudioSessionConfiguration()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        configuration.mode = AVAudioSession.Mode.videoChat.rawValue
        configuration.categoryOptions = previous.categoryOptions.union([.defaultToSpeaker, .allowBluetooth])
        configuration.sampleRate = previous.sampleRate
        configuration.ioBufferDuration = previous.ioBufferDuration
        configuration.inputNumberOfChannels = previous.inputNumberOfChannels
        configuration.outputNumberOfChannels = previous.outputNumberOfChannels
        RTCAudioSessionConfiguration.setWebRTC(configuration)
        return previous
    }
    static func restoreDefaults(_ previous: RTCAudioSessionConfiguration) {
        RTCAudioSessionConfiguration.setWebRTC(previous)
    }
}
#endif

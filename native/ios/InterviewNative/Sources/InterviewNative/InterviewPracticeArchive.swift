#if DEBUG
import Foundation
import CryptoKit
import AVFoundation

private struct PreparedPracticeArchive: Sendable {
    let data: Data
    let files: [Int: URL]
}

private enum PracticeArchiveEncoder {
    /// Preserve the recording used for local playback; archive a compact speech AAC copy.
    static func compressedAudio(source: URL, destination: URL) throws {
        if FileManager.default.fileExists(atPath: destination.path),
           let cached = try? AVAudioFile(forReading: destination), cached.length > 0 { return }
        let temporary = destination.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".m4a")
        defer { try? FileManager.default.removeItem(at: temporary) }
        try autoreleasepool {
            let input = try AVAudioFile(forReading: source)
            guard input.length > 0, input.processingFormat.sampleRate == 16000,
                  input.processingFormat.channelCount == 1 else { throw InterviewError.invalidResponse }
            let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 16000, AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 32000, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
            let output = try AVAudioFile(forWriting: temporary, settings: settings,
                                         commonFormat: .pcmFormatFloat32, interleaved: false)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 8192) else { throw InterviewError.invalidResponse }
            while input.framePosition < input.length {
                try input.read(into: buffer)
                guard buffer.frameLength > 0 else { throw InterviewError.invalidResponse }
                try output.write(from: buffer)
            }
        }
        // Closing AVAudioFile above finalizes the M4A container before signing/uploading.
        let result = try AVAudioFile(forReading: temporary)
        guard result.length > 0 else { throw InterviewError.invalidResponse }
        if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
        try FileManager.default.moveItem(at: temporary, to: destination)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUnlessOpen], ofItemAtPath: destination.path)
    }
    static func prepare(recordData: Data, root: URL) throws -> PreparedPracticeArchive {
        let record = try JSONDecoder().decode(PracticeRecord.self, from: recordData)
        let store = try PracticeStore(root: root)
        var files: [Int: URL] = [:]
        let turns: [[String: Any]] = try record.turns.map { turn in
            guard (1...20).contains(turn.id) else { throw InterviewError.invalidResponse }
            let source = try store.audio(record.id, turn.audio)
            var hash = "", bytes = 0
            if FileManager.default.fileExists(atPath: source.path) {
                let raw = try Data(contentsOf: source, options: .mappedIfSafe)
                let sourceHash = SHA256.hash(data: raw).map { String(format: "%02x", $0) }.joined()
                let destination = try store.folder(record.id).appendingPathComponent("archive-\(turn.id)-\(sourceHash).m4a")
                try compressedAudio(source: source, destination: destination)
                let compressed = try Data(contentsOf: destination, options: .mappedIfSafe)
                guard compressed.count > 44, compressed.count <= 16_777_216 else { throw InterviewError.invalidResponse }
                bytes = compressed.count
                hash = SHA256.hash(data: compressed).map { String(format: "%02x", $0) }.joined()
                files[turn.id] = destination
            }
            return ["number": turn.id, "questionId": turn.questionID ?? "", "question": turn.question,
                    "answer": turn.answer, "duration": turn.duration, "audioBytes": bytes, "audioHash": hash]
        }
        let body: [String: Any] = ["runId": record.id.lowercased(), "mode": record.mode, "track": record.track,
            "recordedAt": ISO8601DateFormatter().string(from: record.createdAt),
            "fieldId": record.fieldID ?? "", "fieldLabel": record.fieldLabel ?? "", "region": record.region ?? "",
            "questionCount": max(record.questionCount ?? 0, record.turns.map(\.id).max() ?? 0),
            "completed": record.completed, "finished": record.finished ?? true, "turns": turns]
        return PreparedPracticeArchive(data: try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]), files: files)
    }
}

/// An independent retry queue: an unavailable archive never blocks recording or playback.
@MainActor final class PracticeArchiveSync {
    typealias Transport = ([String: Any], [Int: URL]) async throws -> Void
    var transport: Transport?
    var store: PracticeStore?
    var account: String?
    var onStatus: ((String) -> Void)?
    var onSynced: ((PracticeRecord) -> Void)?
    private var task: Task<Void, Never>?
    private var requested = false
    private func fingerprint(_ record: PracticeRecord) throws -> String {
        var copy = record; copy.adminSyncFingerprint = nil
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        return SHA256.hash(data: Data("aac32-v1".utf8) + (try encoder.encode(copy))).map { String(format: "%02x", $0) }.joined()
    }
    func payload(_ record: PracticeRecord) async throws -> (body: [String: Any], files: [Int: URL], fingerprint: String) {
        guard let store, record.accountID == account else { throw InterviewError.invalidResponse }
        let data = try JSONEncoder().encode(record), root = store.root
        // Encoding never runs on the recording/UI actor.
        let prepared = try await Task.detached(priority: .utility) {
            try PracticeArchiveEncoder.prepare(recordData: data, root: root)
        }.value
        guard let body = try JSONSerialization.jsonObject(with: prepared.data) as? [String: Any] else { throw InterviewError.invalidResponse }
        return (body, prepared.files, try fingerprint(record))
    }
    func isSynced(_ record: PracticeRecord) -> Bool {
        guard let value = try? fingerprint(record) else { return false }
        return value == record.adminSyncFingerprint
    }
    func schedule() {
        guard transport != nil, store != nil, account != nil else { return }
        requested = true
        guard task == nil else { return }
        task = Task { [self] in
            defer { task = nil }
            while requested {
                requested = false
                guard let store, let transport, let account else { return }
                do {
                    for record in try store.list().reversed() where record.accountID == account {
                        if isSynced(record) { continue }
                        let value = try await payload(record)
                        try await transport(value.body, value.files)
                        var latest = try store.load(record.id)
                        if try fingerprint(latest) == value.fingerprint {
                            latest.adminSyncFingerprint = value.fingerprint
                            try store.save(latest); onSynced?(latest)
                        }
                    }
                    onStatus?("")
                } catch {
                    onStatus?("관리자 전송 대기 중 · 연습 화면을 다시 열면 자동으로 재시도합니다.")
                    requested = false
                }
            }
        }
    }
    func wait() async { await task?.value }
}
#endif

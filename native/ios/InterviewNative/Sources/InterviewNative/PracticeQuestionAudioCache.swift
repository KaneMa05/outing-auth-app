import Foundation
import CryptoKit

/// Fetch only an exact, checksum-verified public recording for the current prompt.
actor PracticeQuestionAudioCache {
    static let shared = PracticeQuestionAudioCache()
    private struct Clip: Decodable { let id: String, prompt: String, file: String, sha256: String; let bytes: Int }
    private struct Catalog: Decodable { let clips: [Clip] }
    private var catalogs: [String: [String: Clip]] = [:]
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 20
        return URLSession(configuration: config)
    }()
    func resolve(mode: String, id: String, prompt: String) async -> URL? {
        guard ["job", "personality"].contains(mode) else { return nil }
        do {
            let base = URL(string: "https://app.ronparkpass.com/assets/interview-\(mode)-audio/")!
            if catalogs[mode] == nil {
                let url = base.appendingPathComponent("catalog.json")
                let (data, response) = try await session.data(from: url)
                guard (response as? HTTPURLResponse)?.statusCode == 200, response.url == url, data.count <= 8_000_000 else { return nil }
                let catalog = try JSONDecoder().decode(Catalog.self, from: data)
                catalogs[mode] = catalog.clips.reduce(into: [:]) { $0[$1.id] = $1 }
            }
            guard let clip = catalogs[mode]?[id], clip.prompt == prompt,
                  clip.file.range(of: "^[A-Za-z0-9_-]+\\.mp3$", options: .regularExpression) != nil,
                  clip.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  clip.bytes > 0, clip.bytes <= 1_048_576 else { return nil }
            let root = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("PracticeQuestionAudio", isDirectory: true)
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let file = root.appendingPathComponent(clip.file)
            func valid(_ data: Data) -> Bool { data.count == clip.bytes && SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() == clip.sha256 }
            if let data = try? Data(contentsOf: file), valid(data) { return file }
            let url = base.appendingPathComponent(clip.file), (data, response) = try await session.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200, response.url == url, valid(data) else { return nil }
            try data.write(to: file, options: .atomic); return file
        } catch { return nil }
    }
}

#if DEBUG
import Foundation

struct PracticeQuestion: Decodable {
    let id: String, prompt: String, spokenPrompt: String, file: String, category: String
    let tracks: [String]
    var url: URL? {
        guard file.range(of: "^[A-Za-z0-9_-]+\\.mp3$", options: .regularExpression) != nil else { return nil }
        return Bundle.main.url(forResource: "InterviewPracticeAudio", withExtension: nil)?.appendingPathComponent(file)
    }
    static func load() -> [Self] {
        struct Catalog: Decodable { let clips: [PracticeQuestion] }
        guard let folder = Bundle.main.url(forResource: "InterviewPracticeAudio", withExtension: nil),
              let data = try? Data(contentsOf: folder.appendingPathComponent("catalog.json")),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data) else { return [] }
        return catalog.clips.filter { row in
            guard let url = row.url, let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else { return false }
            return size > 1000
        }
    }
}

struct PracticeTurn: Codable, Identifiable {
    var id: Int
    var question: String
    var answer = ""
    var duration: TimeInterval = 0
    var audio: String
    var analysis: [String: String]?
    var analysisPending = false
    var analysisError = false
}
struct PracticeRecord: Codable, Identifiable {
    var id: String
    var mode: String
    var track: String
    var createdAt = Date()
    var video: String?
    var completed = false
    var turns: [PracticeTurn] = []
}
struct PracticeStore {
    let root: URL
    init(root: URL? = nil) throws {
        self.root = try root ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("InterviewPractice", isDirectory: true)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
        var directory = self.root; var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }
    func folder(_ id: String) throws -> URL {
        guard UUID(uuidString: id) != nil else { throw InterviewError.invalidResponse }
        return root.appendingPathComponent(id, isDirectory: true)
    }
    func save(_ record: PracticeRecord) throws {
        let directory = try folder(record.id)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(record).write(to: directory.appendingPathComponent("record.json"), options: [.atomic, .completeFileProtectionUnlessOpen])
    }
    func list() throws -> [PracticeRecord] {
        try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).compactMap {
            guard UUID(uuidString: $0.lastPathComponent) != nil,
                  let data = try? Data(contentsOf: $0.appendingPathComponent("record.json")) else { return nil }
            return try? JSONDecoder().decode(PracticeRecord.self, from: data)
        }.sorted { $0.createdAt > $1.createdAt }
    }
    func load(_ id: String) throws -> PracticeRecord {
        try JSONDecoder().decode(PracticeRecord.self, from: Data(contentsOf: folder(id).appendingPathComponent("record.json")))
    }
    func audio(_ id: String, _ file: String) throws -> URL {
        guard file.range(of: "^[0-9]+\\.wav$", options: .regularExpression) != nil else { throw InterviewError.invalidResponse }
        return try folder(id).appendingPathComponent(file)
    }
    func video(_ id: String) throws -> URL { try folder(id).appendingPathComponent("interview.mov") }
    func delete(_ id: String) throws { try FileManager.default.removeItem(at: folder(id)) }
}
#endif

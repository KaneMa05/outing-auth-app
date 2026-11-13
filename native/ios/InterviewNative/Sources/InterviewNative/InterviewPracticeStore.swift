#if DEBUG
import Foundation

struct PracticeRecording: Decodable {
    let id: String, prompt: String, spokenPrompt: String, file: String
    let displayPrompt: String?
    static let catalog: [String: Self] = {
        struct Catalog: Decodable { let version: Int; let clips: [PracticeRecording] }
        guard let folder = Bundle.main.url(forResource: "InterviewRecordedAudio", withExtension: nil),
              let data = try? Data(contentsOf: folder.appendingPathComponent("catalog.json")),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data), catalog.version == 1 else { return [:] }
        return catalog.clips.reduce(into: [:]) { result, clip in result[clip.id] = clip }
    }()
    static func matching(id: String, prompt: String) -> Self? {
        guard let recording = catalog[id], recording.prompt == prompt else { return nil }
        return recording
    }
    var url: URL? {
        guard id.range(of: "^q-[a-f0-9]+$", options: .regularExpression) != nil,
              file.range(of: "^" + id + "-[a-f0-9]{16}\\.mp3$", options: .regularExpression) != nil,
              let folder = Bundle.main.url(forResource: "InterviewRecordedAudio", withExtension: nil) else { return nil }
        let url = folder.appendingPathComponent(file)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }
}

struct PracticeContentField: Identifiable {
    let id: String, label: String
}

struct PracticeQuestion: Decodable {
    let id: String, prompt: String, spokenPrompt: String, file: String, category: String
    let tracks: [String]
    var fieldIDs: [String]? = nil
    var regions: [String]? = nil
    var recording: PracticeRecording? { PracticeRecording.matching(id: id, prompt: prompt) }
    var displayPrompt: String { recording?.displayPrompt ?? recording?.spokenPrompt ?? spokenPrompt }
    static let examples: [String: String] = {
        guard let folder = Bundle.main.url(forResource: "InterviewPracticeAudio", withExtension: nil),
              let data = try? Data(contentsOf: folder.appendingPathComponent("examples.json")),
              let examples = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return examples
    }()
    var url: URL? {
        if let recording { return recording.url }
        // An edited question must not play the recording of its previous wording.
        if PracticeRecording.catalog[id] != nil { return nil }
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

struct PracticeAssessment: Decodable, Identifiable {
    let index: Int
    let label: String
    let claim: String
    let status: String
    let quote: String
    let reason: String
    var id: Int { index }
    var symbol: String { status == "O" ? "○" : status == "partial" ? "△" : status == "X" ? "×" : "—" }
    var statusLabel: String { status == "O" ? "충족" : status == "partial" ? "부분 충족" : status == "X" ? "미충족" : "판정 보류" }
}
struct PracticeTurn: Codable, Identifiable {
    var assessment: [PracticeAssessment] {
        guard let raw = analysis?["assessment"], let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([PracticeAssessment].self, from: data)) ?? []
    }

    var feedbackSummary: String? {
        guard let summary = analysis?["summary"] else { return nil }
        let rows = assessment
        if !rows.isEmpty, rows.allSatisfy({ ["O", "partial", "X"].contains($0.status) }),
           summary.hasPrefix("음성 인식 결과가 일부 달라 근거와 판정이 일치하는 ") {
            return "음성 인식에 일부 차이가 있지만 \(rows.count)개 항목 모두의 근거와 판정을 확인했습니다."
        }
        return summary
    }

    var overallAssessment: String {
        let rows = assessment
        guard !rows.isEmpty, !rows.contains(where: { !["O", "partial", "X"].contains($0.status) }) else { return "uncertain" }
        if rows.allSatisfy({ $0.status == "O" }) { return "O" }
        return rows.contains(where: { $0.status == "O" || $0.status == "partial" }) ? "partial" : "X"
    }
    var id: Int
    var question: String
    var answer = ""
    var duration: TimeInterval = 0
    var audio: String
    var questionID: String?
    var analysis: [String: String]?
    var exampleAnswer: String?
    var exampleChecked: Bool?
    var analysisPending = false
    var analysisError = false
    var remoteRequestID: String?
    var remoteSubmitted: Bool?
    var remoteQuestionPrompt: String?
    var analysisQuestionPrompt: String?
    var analysisRequestID: String?
    var analysisState: String?
    var analysisNotice: String?
}
struct PracticeRecord: Codable, Identifiable {
    var id: String
    var mode: String
    var track: String
    var createdAt = Date()
    var video: String?
    var fieldID: String?
    var fieldLabel: String?
    var region: String?
    var completed = false
    var turns: [PracticeTurn] = []
    var accountID: String?
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
    // Only called for the currently authenticated account's own scoped folder.
    func migrateLegacyCLI(account: String) throws {
        for var record in try list() where record.accountID == nil {
            record.accountID = account
            for index in record.turns.indices {
                guard record.turns[index].analysisRequestID == nil,
                      let id = record.turns[index].remoteRequestID else { continue }
                record.turns[index].analysisRequestID = id
                record.turns[index].analysisQuestionPrompt = record.turns[index].remoteQuestionPrompt
                record.turns[index].analysisState = record.turns[index].analysis != nil ? "completed" : record.turns[index].analysisError ? "failed" : "connection_required"
            }
            try save(record)
        }
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

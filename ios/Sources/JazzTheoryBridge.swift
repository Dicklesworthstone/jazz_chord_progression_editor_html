import Foundation
import JavaScriptCore

struct JazzContinuationCandidate: Codable, Equatable, Identifiable {
    let candidateID: String
    let chordSymbol: String
    let category: String
    let providerID: String
    let rank: Int
    let voiceLeadingScore: Int
    let tensionDelta: Int
    let preservedGuideTones: Bool
    let expectedMotion: String
    let whyExplanation: String
    let whyNotConsiderations: [String]

    var id: String { candidateID }

    private enum CodingKeys: String, CodingKey {
        case candidateID = "candidateId"
        case chordSymbol
        case category
        case providerID = "providerId"
        case rank
        case voiceLeadingScore
        case tensionDelta
        case preservedGuideTones
        case expectedMotion
        case whyExplanation
        case whyNotConsiderations
    }
}

struct JazzContinuationOption: Equatable, Identifiable {
    let candidate: JazzContinuationCandidate
    let sourceRevision: Int

    var id: String { candidate.id }
}

enum JazzTheoryBridgeIssue: LocalizedError, Equatable {
    case unavailable(String)
    case refused(String)
    case malformed

    var errorDescription: String? {
        switch self {
        case let .unavailable(message): "Theory engine unavailable: \(message)"
        case let .refused(message): "Theory engine refused this context: \(message)"
        case .malformed: "The theory engine returned a malformed result."
        }
    }
}

@MainActor
final class JazzTheoryBridge {
    private static let requestSchema = "frankenjazz.native-continuation-request.v1"
    private static let responseSchema = "frankenjazz.native-continuation-response.v1"
    private static let engineSchema = "changes.continuation-result.v1"
    private static let maximumResponseBytes = 128_000
    private static let categories: Set<String> = [
        "smooth", "functional", "colorful", "exploratory", "resolve",
        "continue-pattern", "approach-target", "increase-color", "explore"
    ]
    private static let providerIDs: Set<String> = [
        "provider.functional.circle-cadence", "provider.modal.step-vamp",
        "provider.chromatic.tritone-approach", "provider.diminished.passing",
        "provider.sequence.descending-fifths", "provider.line-cliche.minor-step",
        "provider.nonfunctional.planing", "dominant-resolution", "turnaround",
        "diatonic-next", "two-five-approach", "tritone-approach", "backdoor"
    ]

    private let context: JSContext?
    private let loadIssue: String?

    convenience init(bundle: Bundle = .main) {
        let nestedURL = bundle.url(
            forResource: "frankenjazz-theory-bridge",
            withExtension: "js",
            subdirectory: "TheoryBridge"
        )
        let resourceURL = nestedURL ?? bundle.url(
            forResource: "frankenjazz-theory-bridge",
            withExtension: "js"
        )
        let script = resourceURL.flatMap { try? String(contentsOf: $0, encoding: .utf8) }
        self.init(script: script)
    }

    init(script: String?) {
        guard let script, !script.isEmpty, let context = JSContext() else {
            self.context = nil
            loadIssue = "The bundled source-owned engine could not be loaded."
            return
        }
        context.evaluateScript(script)
        guard context.exception == nil,
              !context.objectForKeyedSubscript("FrankenJazzTheoryBridge").isUndefined else {
            self.context = nil
            loadIssue = "The bundled source-owned engine did not initialize."
            return
        }
        self.context = context
        loadIssue = nil
    }

    func continuations(for symbols: [String]) -> Result<[JazzContinuationCandidate], JazzTheoryBridgeIssue> {
        guard let context else {
            return .failure(.unavailable(loadIssue ?? "Missing JavaScriptCore context."))
        }
        guard (1...8).contains(symbols.count),
              symbols.allSatisfy({ !$0.isEmpty && $0.count <= 128 }) else {
            return .failure(.refused("The selected context must contain 1 through 8 bounded chord symbols."))
        }

        let request: [String: Any] = ["schema": Self.requestSchema, "context": symbols]
        guard JSONSerialization.isValidJSONObject(request),
              let data = try? JSONSerialization.data(withJSONObject: request),
              let raw = String(data: data, encoding: .utf8) else {
            return .failure(.malformed)
        }

        context.exception = nil
        guard let bridge = context.objectForKeyedSubscript("FrankenJazzTheoryBridge"),
              let value = bridge.invokeMethod("continuations", withArguments: [raw]),
              context.exception == nil,
              let response = value.toString(),
              let responseData = response.data(using: .utf8),
              responseData.count <= Self.maximumResponseBytes,
              let envelope = try? JSONDecoder().decode(ResponseEnvelope.self, from: responseData),
              envelope.schema == Self.responseSchema else {
            return .failure(.malformed)
        }

        guard envelope.ok else {
            return .failure(.refused(envelope.refusal?.message ?? "No continuation is available."))
        }
        guard envelope.engineSchema == Self.engineSchema,
              let workSteps = envelope.workSteps,
              (0...100_000).contains(workSteps),
              let candidates = envelope.candidates,
              candidates.count <= 8,
              Set(candidates.map(\.candidateID)).count == candidates.count,
              Set(candidates.map(\.rank)).count == candidates.count,
              candidates.allSatisfy(Self.isValid) else {
            return .failure(.malformed)
        }
        return .success(candidates.sorted { $0.rank < $1.rank })
    }

    private static func isValid(_ candidate: JazzContinuationCandidate) -> Bool {
        !candidate.candidateID.isEmpty && candidate.candidateID.count <= 256
            && !candidate.chordSymbol.isEmpty && candidate.chordSymbol.count <= 128
            && Self.categories.contains(candidate.category)
            && Self.providerIDs.contains(candidate.providerID)
            && (1...8).contains(candidate.rank)
            && (0...100).contains(candidate.voiceLeadingScore)
            && (-5...5).contains(candidate.tensionDelta)
            && ["stepwise", "cycle-fifth", "chromatic", "common-tone"].contains(candidate.expectedMotion)
            && !candidate.whyExplanation.isEmpty && candidate.whyExplanation.count <= 1_000
            && candidate.whyNotConsiderations.count <= 8
            && candidate.whyNotConsiderations.allSatisfy { $0.count <= 500 }
    }

    private struct ResponseEnvelope: Decodable {
        struct Refusal: Decodable { let code: String; let message: String }

        let schema: String
        let ok: Bool
        let engineSchema: String?
        let workSteps: Int?
        let candidates: [JazzContinuationCandidate]?
        let refusal: Refusal?
    }
}

import Foundation

// Musical key names are canonical one- and two-letter domain notation.
// swiftlint:disable identifier_name
enum JazzKey: String, CaseIterable, Codable, Identifiable, Sendable {
    case c = "C"
    case db = "Db"
    case d = "D"
    case eb = "Eb"
    case e = "E"
    case f = "F"
    case gb = "Gb"
    case g = "G"
    case ab = "Ab"
    case a = "A"
    case bb = "Bb"
    case b = "B"

    var id: String { rawValue }
    var pitchClass: Int { JazzTheory.pitchClass(for: rawValue) ?? 0 }
    var prefersFlats: Bool { [Self.db, .eb, .f, .gb, .ab, .bb].contains(self) }
}
// swiftlint:enable identifier_name

enum GrooveStyle: String, CaseIterable, Codable, Identifiable, Sendable {
    case mediumSwing = "Medium swing"
    case uptempoSwing = "Uptempo swing"
    case ballad = "Ballad"
    case bossaNova = "Bossa nova"
    case straightEighths = "Straight eighths"
    case syncopatedSixteenths = "Syncopated sixteenths"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .mediumSwing: "metronome"
        case .uptempoSwing: "hare"
        case .ballad: "moon.stars"
        case .bossaNova: "water.waves"
        case .straightEighths: "equal.square"
        case .syncopatedSixteenths: "waveform.path.ecg"
        }
    }
}

enum InstrumentTone: String, CaseIterable, Codable, Identifiable, Sendable {
    case mellowKeys = "Mellow keys"
    case electricPiano = "Electric piano"
    case vibraphone = "Vibraphone"
    case warmPad = "Warm pad"
    case analogPoly = "Analog poly"
    case concertGrand = "Concert grand"
    case flute = "Flute"
    case organ = "Organ"
    case guitar = "Guitar"
    case uprightBass = "Upright bass"
    case concertVibes = "Concert vibes"
    case bluesGuitar = "Blues guitar"
    case clarinet = "Clarinet"
    case dreadnoughtGuitar = "Steel dreadnought"
    case ukulele = "Re-entrant ukulele"

    /// Stable parity identity from the original web document contract.
    /// Raw values intentionally remain the native v1 persisted spellings so
    /// charts saved before the complete instrument catalog still decode.
    var originalID: String {
        switch self {
        case .mellowKeys: "mellow-keys"
        case .electricPiano: "fm-electric-piano"
        case .vibraphone: "vibraphone"
        case .warmPad: "warm-pad"
        case .analogPoly: "analog-poly"
        case .concertGrand: "concert-grand"
        case .flute: "flute"
        case .organ: "organ"
        case .guitar: "guitar"
        case .uprightBass: "upright-bass"
        case .concertVibes: "concert-vibes"
        case .bluesGuitar: "blues-guitar"
        case .clarinet: "clarinet"
        case .dreadnoughtGuitar: "dreadnought-guitar"
        case .ukulele: "ukulele"
        }
    }

    var displayName: String {
        switch self {
        case .mellowKeys: "Mellow Keys"
        case .electricPiano: "FM Electric Piano"
        case .vibraphone: "Vibraphone"
        case .warmPad: "Warm Pad"
        case .analogPoly: "Analog Poly"
        case .concertGrand: "Concert Grand"
        case .flute: "Flute"
        case .organ: "Organ"
        case .guitar: "Guitar"
        case .uprightBass: "Upright Bass"
        case .concertVibes: "Concert Vibes"
        case .bluesGuitar: "Blues Guitar"
        case .clarinet: "Clarinet"
        case .dreadnoughtGuitar: "Steel Dreadnought"
        case .ukulele: "Re-entrant Ukulele"
        }
    }

    /// Zero-based General MIDI program used when the native document is
    /// exported. Synthesis-only colors use the nearest honest GM family.
    var midiProgram: UInt8 {
        switch self {
        case .mellowKeys: 4
        case .electricPiano: 5
        case .vibraphone, .concertVibes: 11
        case .warmPad: 89
        case .analogPoly: 81
        case .concertGrand: 0
        case .flute: 73
        case .organ: 16
        case .guitar, .ukulele: 24
        case .uprightBass: 32
        case .bluesGuitar: 27
        case .clarinet: 71
        case .dreadnoughtGuitar: 25
        }
    }

    var id: String { originalID }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        guard let decoded = Self.allCases.first(where: {
            $0.originalID == value || $0.rawValue == value
        }) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unknown FrankenJazz instrument ID: \(value)"
            )
        }
        self = decoded
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(originalID)
    }

    var symbol: String {
        switch self {
        case .electricPiano: "pianokeys"
        case .mellowKeys: "music.quarternote.3"
        case .vibraphone: "bell"
        case .warmPad: "waveform.path"
        case .analogPoly: "waveform"
        case .concertGrand: "pianokeys.inverse"
        case .flute: "wind"
        case .organ: "building.columns"
        case .guitar: "guitars"
        case .uprightBass: "music.note"
        case .concertVibes: "bell.and.waves.left.and.right"
        case .bluesGuitar: "guitars.fill"
        case .clarinet: "music.note.list"
        case .dreadnoughtGuitar: "guitars"
        case .ukulele: "music.quarternote.3"
        }
    }
}

enum VoicingFamily: String, CaseIterable, Codable, Identifiable, Sendable {
    case balanced = "Balanced"
    case shell = "Shell"
    case rootlessA = "Rootless A"
    case rootlessB = "Rootless B"
    case open = "Open"
    case spread = "Spread"

    var id: String { rawValue }
    var note: String {
        switch self {
        case .balanced: "Compact and complete"
        case .shell: "Root, third, and seventh"
        case .rootlessA: "Guide tones with the ninth"
        case .rootlessB: "Guide tones with upper color"
        case .open: "Open fifths across both hands"
        case .spread: "Maximum register separation"
        }
    }
}

struct JazzChordEvent: Identifiable, Codable, Equatable, Sendable {
    var id: UUID
    var symbol: String
    var beats: Double
    var annotation: String
    /// Exact ascending MIDI pitches captured from an automatic realization.
    /// `nil` keeps this event linked to the chart's current voicing family.
    var frozenMIDIPitches: [Int]?
    /// User-authored pitches. Order and doublings are intentional document data.
    var manualMIDIPitches: [Int]?

    init(
        id: UUID = UUID(),
        symbol: String,
        beats: Double = 4,
        annotation: String = "",
        frozenMIDIPitches: [Int]? = nil,
        manualMIDIPitches: [Int]? = nil
    ) {
        self.id = id
        self.symbol = symbol
        self.beats = beats
        self.annotation = annotation
        self.frozenMIDIPitches = frozenMIDIPitches
        self.manualMIDIPitches = manualMIDIPitches
    }
}

struct JazzMeasure: Identifiable, Codable, Equatable, Sendable {
    var id: UUID
    var chords: [JazzChordEvent]

    init(id: UUID = UUID(), chords: [JazzChordEvent]) {
        self.id = id
        self.chords = chords
    }
}

struct JazzChart: Identifiable, Codable, Equatable, Sendable {
    static let schema = "frankenjazz.chart.v1"

    var schema: String
    var id: UUID
    var title: String
    var key: JazzKey
    var tempoBPM: Double
    var groove: GrooveStyle
    var instrument: InstrumentTone
    var voicingFamily: VoicingFamily
    var measures: [JazzMeasure]
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        key: JazzKey = .c,
        tempoBPM: Double = 132,
        groove: GrooveStyle = .mediumSwing,
        instrument: InstrumentTone = .electricPiano,
        voicingFamily: VoicingFamily = .balanced,
        measures: [JazzMeasure]
    ) {
        schema = Self.schema
        self.id = id
        self.title = title
        self.key = key
        self.tempoBPM = tempoBPM
        self.groove = groove
        self.instrument = instrument
        self.voicingFamily = voicingFamily
        self.measures = measures
        updatedAt = Date()
    }

    var chordCount: Int { measures.reduce(0) { $0 + $1.chords.count } }
    var barCount: Int { measures.count }
    var durationBeats: Double { measures.reduce(0) { total, measure in total + measure.chords.reduce(0) { $0 + $1.beats } } }

    var chartText: String { JazzTheory.formatChartText(measures) }
}

struct ParsedChart: Equatable, Sendable {
    var measures: [JazzMeasure]
    var normalizedText: String
}

enum ChartParseIssue: LocalizedError, Equatable {
    case empty
    case tooLong(limit: Int)
    case tooManyMeasures(limit: Int)
    case emptyMeasure(index: Int)
    case tooManyChords(measure: Int, limit: Int)
    case invalidSymbol(symbol: String, measure: Int)
    case unsupportedChordSuffix(fragment: String, symbol: String, measure: Int)
    case invalidDuration(token: String, measure: Int)
    case invalidMeasureDuration(measure: Int)

    var errorDescription: String? {
        switch self {
        case .empty: "Enter at least one bar, such as | Dm7 G7 | Cmaj7 |."
        case let .tooLong(limit): "This chart is larger than the \(limit.formatted())-character safety limit."
        case let .tooManyMeasures(limit): "A chart can contain at most \(limit) measures."
        case let .emptyMeasure(index): "Measure \(index) is empty. Remove it or add a chord."
        case let .tooManyChords(measure, limit): "Measure \(measure) has more than \(limit) chord events."
        case let .invalidSymbol(symbol, measure): "‘\(symbol)’ in measure \(measure) is not a supported chord symbol."
        case let .unsupportedChordSuffix(fragment, symbol, measure): "‘\(symbol)’ in measure \(measure) uses the unsupported chord suffix ‘\(fragment)’; remove it or choose a supported quality."
        case let .invalidDuration(token, measure): "‘\(token)’ in measure \(measure) has an invalid beat duration. Use a positive value such as :2."
        case let .invalidMeasureDuration(measure): "The explicit durations in measure \(measure) must total exactly four beats."
        }
    }
}

struct ChordDescription: Equatable, Sendable {
    var symbol: String
    var root: String
    var bass: String?
    var suffix: String
    /// Root-relative semitone intervals, retaining octave placement for extensions.
    var intervals: [Int]
    var pitchClasses: [Int]
    var toneNames: [String]
    var romanNumeral: String
    var function: String
    var guideToneNames: [String]
    var colorNote: String
}

struct PlaybackEvent: Identifiable, Sendable {
    var id: UUID
    var chordID: UUID
    var startBeat: Double
    var durationBeats: Double
    var midiPitches: [Int]
    /// Automatic families may receive the renderer's quiet octave-bass color.
    /// Stored exact voicings must sound only their authored pitches.
    var permitsBassReinforcement: Bool
}

struct LibraryEntry: Identifiable, Hashable, Sendable {
    enum Provenance: String, Sendable {
        case publicDomain = "Public domain"
        case device = "Harmonic device"
        case study = "Original study"
        case ownerDirected = "Owner-directed transcription"
    }

    var id: String
    var title: String
    var kicker: String
    var note: String
    var provenance: Provenance
    var chartText: String
    var key: JazzKey
    var tempo: Double?
    var groove: GrooveStyle
}

enum JazzDocumentValidationIssue: LocalizedError, Equatable {
    case schema
    case title
    case tempo
    case measureCount
    case duplicateMeasureID
    case duplicateChordID
    case invalidMeasure(Int)
    case invalidChord(Int)

    var errorDescription: String? {
        switch self {
        case .schema: "The chart schema is not supported."
        case .title: "The chart title must contain 1–120 characters."
        case .tempo: "Tempo must be a finite value from 30 through 320 BPM."
        case .measureCount: "The chart must contain 1–\(JazzTheory.maximumMeasures) measures."
        case .duplicateMeasureID: "Two measures reuse the same stable identity."
        case .duplicateChordID: "Two chord events reuse the same stable identity."
        case let .invalidMeasure(index): "Measure \(index) must contain 1–\(JazzTheory.maximumChordsPerMeasure) events totaling exactly four beats."
        case let .invalidChord(index): "A chord in measure \(index) contains an invalid symbol, duration, annotation, or stored voicing."
        }
    }
}

enum JazzDocumentValidator {
    static let storedVoicingPitchRange = 21...108
    static let maximumStoredVoices = 16

    static func validate(_ chart: JazzChart) throws {
        guard chart.schema == JazzChart.schema else { throw JazzDocumentValidationIssue.schema }
        guard !chart.title.isEmpty, chart.title.count <= 120 else { throw JazzDocumentValidationIssue.title }
        guard chart.tempoBPM.isFinite, (30...320).contains(chart.tempoBPM) else { throw JazzDocumentValidationIssue.tempo }
        guard !chart.measures.isEmpty, chart.measures.count <= JazzTheory.maximumMeasures else {
            throw JazzDocumentValidationIssue.measureCount
        }
        var measureIDs = Set<UUID>()
        var chordIDs = Set<UUID>()
        for (offset, measure) in chart.measures.enumerated() {
            let index = offset + 1
            guard measureIDs.insert(measure.id).inserted else { throw JazzDocumentValidationIssue.duplicateMeasureID }
            let beatTotal = measure.chords.reduce(0) { $0 + $1.beats }
            guard !measure.chords.isEmpty,
                  measure.chords.count <= JazzTheory.maximumChordsPerMeasure,
                  beatTotal.isFinite,
                  abs(beatTotal - 4) < 0.000_001 else {
                throw JazzDocumentValidationIssue.invalidMeasure(index)
            }
            for chord in measure.chords {
                guard chordIDs.insert(chord.id).inserted else { throw JazzDocumentValidationIssue.duplicateChordID }
                let frozenPitchesAreValid = chord.frozenMIDIPitches.map { pitches in
                    !pitches.isEmpty &&
                        pitches.count <= maximumStoredVoices &&
                        pitches == pitches.sorted() &&
                        Set(pitches).count == pitches.count &&
                        pitches.allSatisfy { storedVoicingPitchRange.contains($0) }
                } ?? true
                let manualPitchesAreValid = chord.manualMIDIPitches.map { pitches in
                    !pitches.isEmpty &&
                        pitches.count <= maximumStoredVoices &&
                        pitches.allSatisfy { storedVoicingPitchRange.contains($0) }
                } ?? true
                guard chord.beats.isFinite,
                      chord.beats > 0,
                      chord.beats <= 4,
                      chord.annotation.count <= 500,
                      chord.frozenMIDIPitches == nil || chord.manualMIDIPitches == nil,
                      frozenPitchesAreValid,
                      manualPitchesAreValid,
                      JazzTheory.parseChord(chord.symbol, in: chart.key) != nil else {
                    throw JazzDocumentValidationIssue.invalidChord(index)
                }
            }
        }
    }
}

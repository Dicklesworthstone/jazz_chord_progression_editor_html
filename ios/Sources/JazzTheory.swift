import Foundation

enum JazzTheory {
    static let maximumChartCharacters = 50_000
    static let maximumMeasures = 512
    static let maximumChordsPerMeasure = 8

    private static let sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private static let flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    private static let supportedSuffixes: Set<String> = [
        "", "m", "dim", "°", "dim7", "°7", "m7b5", "ø", "ø7", "mmaj7",
        "maj13", "maj9", "maj7#11", "maj7#5", "maj7", "m13", "13", "m11", "11",
        "add9", "add2", "6/9", "m9", "9", "7alt", "7b9b5", "7b9#5",
        "7#9b5", "7#9#5", "7b9", "7#9", "7b5", "7#5", "m7", "7sus4", "7sus",
        "7", "m6", "6", "sus2", "sus4", "sus", "aug", "+"
    ]

    static func pitchClass(for name: String) -> Int? {
        guard let first = name.first else { return nil }
        let base: Int
        switch first.uppercased() {
        case "C": base = 0
        case "D": base = 2
        case "E": base = 4
        case "F": base = 5
        case "G": base = 7
        case "A": base = 9
        case "B": base = 11
        default: return nil
        }
        let accidental = name.dropFirst().first
        if accidental == "#" { return (base + 1) % 12 }
        if accidental == "b" { return (base + 11) % 12 }
        return base
    }

    static func noteName(_ pitchClass: Int, flats: Bool) -> String {
        (flats ? flatNames : sharpNames)[(pitchClass % 12 + 12) % 12]
    }

    static func parseChart(_ text: String) throws -> ParsedChart {
        guard text.count <= maximumChartCharacters else { throw ChartParseIssue.tooLong(limit: maximumChartCharacters) }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw ChartParseIssue.empty }

        let rawMeasures: [Substring]
        if trimmed.contains("|") {
            var pieces = trimmed.split(separator: "|", omittingEmptySubsequences: false)
            if pieces.first?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
                pieces.removeFirst()
            }
            if pieces.last?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
                pieces.removeLast()
            }
            guard !pieces.isEmpty else { throw ChartParseIssue.empty }
            rawMeasures = pieces
        } else {
            rawMeasures = [Substring(trimmed)]
        }
        guard rawMeasures.count <= maximumMeasures else { throw ChartParseIssue.tooManyMeasures(limit: maximumMeasures) }

        var measures: [JazzMeasure] = []
        for (offset, rawMeasure) in rawMeasures.enumerated() {
            let tokens = rawMeasure.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            let measureIndex = offset + 1
            guard !tokens.isEmpty else { throw ChartParseIssue.emptyMeasure(index: offset + 1) }
            guard tokens.count <= maximumChordsPerMeasure else {
                throw ChartParseIssue.tooManyChords(measure: measureIndex, limit: maximumChordsPerMeasure)
            }

            var parsedTokens: [(symbol: String, beats: Double?)] = []
            for token in tokens {
                let components = token.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
                let symbol = String(components[0])
                let explicitBeats: Double?
                if components.count == 2 {
                    guard let value = Double(components[1]), value.isFinite, value > 0, value <= 4 else {
                        throw ChartParseIssue.invalidDuration(token: token, measure: measureIndex)
                    }
                    explicitBeats = value
                } else {
                    explicitBeats = nil
                }
                guard parseChord(symbol, in: .c) != nil else {
                    if let fragment = unsupportedSuffixFragment(in: symbol) {
                        throw ChartParseIssue.unsupportedChordSuffix(
                            fragment: fragment,
                            symbol: symbol,
                            measure: measureIndex
                        )
                    }
                    throw ChartParseIssue.invalidSymbol(symbol: symbol, measure: measureIndex)
                }
                parsedTokens.append((symbol, explicitBeats))
            }

            let explicitTotal = parsedTokens.compactMap(\.beats).reduce(0, +)
            let implicitCount = parsedTokens.count - parsedTokens.compactMap(\.beats).count
            let implicitBeats: Double
            if implicitCount == 0 {
                guard abs(explicitTotal - 4) < 0.000_001 else {
                    throw ChartParseIssue.invalidMeasureDuration(measure: measureIndex)
                }
                implicitBeats = 0
            } else {
                let remaining = 4 - explicitTotal
                guard remaining > 0.000_001 else {
                    throw ChartParseIssue.invalidMeasureDuration(measure: measureIndex)
                }
                implicitBeats = remaining / Double(implicitCount)
            }

            let chords = parsedTokens.map { token in
                JazzChordEvent(symbol: token.symbol, beats: token.beats ?? implicitBeats)
            }
            measures.append(JazzMeasure(chords: chords))
        }
        let normalized = formatChartText(measures)
        return ParsedChart(measures: measures, normalizedText: normalized)
    }

    static func formatChartText(_ measures: [JazzMeasure]) -> String {
        measures.map { measure in
            let equalDuration = 4 / Double(measure.chords.count)
            let canUseImplicitDurations = measure.chords.allSatisfy { abs($0.beats - equalDuration) < 0.000_001 }
            let tokens = measure.chords.map { chord in
                canUseImplicitDurations ? chord.symbol : "\(chord.symbol):\(formatBeatDuration(chord.beats))"
            }
            return "| " + tokens.joined(separator: " ") + " "
        }.joined() + "|"
    }

    private static func formatBeatDuration(_ beats: Double) -> String {
        if abs(beats.rounded() - beats) < 0.000_001 { return String(Int(beats.rounded())) }
        // Swift's Double description is locale-independent and uses enough
        // digits to reconstruct the same value. A display-only three-decimal
        // rounding could make an otherwise valid four-beat measure unparsable.
        return String(beats)
    }

    // The grammar is deliberately ordered from specific spellings to broad
    // families; flattening it into independent rules would make precedence
    // implicit and allow e.g. mMaj7 to be consumed as m7.
    // swiftlint:disable cyclomatic_complexity function_body_length
    static func parseChord(_ symbol: String, in key: JazzKey) -> ChordDescription? {
        let cleaned = symbol.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleaned.count >= 1,
              cleaned.count <= 48,
              let first = cleaned.first,
              "ABCDEFGabcdefg".contains(first) else { return nil }

        var rootLength = 1
        let characters = Array(cleaned)
        if characters.count > 1, characters[1] == "#" || characters[1] == "b" { rootLength = 2 }
        let rootToken = String(characters[0..<rootLength])
        let root = rootToken.prefix(1).uppercased() + rootToken.dropFirst()
        guard let rootPitch = pitchClass(for: root) else { return nil }

        let tail = String(characters.dropFirst(rootLength))
        // 6/9 is a chord quality, not an inversion. All other slashes retain
        // the lead-sheet meaning of an explicit bass note.
        let isSixNine = tail.lowercased() == "6/9"
        let slashParts = isSixNine
            ? [Substring(tail)]
            : tail.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        let suffix = String(slashParts.first ?? "")
        var bass: String?
        if slashParts.count == 2 {
            let value = String(slashParts[1])
            guard value.count == 1 || value.count == 2, pitchClass(for: value) != nil else { return nil }
            bass = value.prefix(1).uppercased() + String(value.dropFirst())
        }

        guard suffix.range(of: #"^[A-Za-z0-9+#()/ø°-]*$"#, options: .regularExpression) != nil else { return nil }
        let lower = suffix.lowercased()
        guard supportedSuffixes.contains(lower) else { return nil }
        let intervals: [Int]
        switch lower {
        case "dim7", "°7": intervals = [0, 3, 6, 9]
        case "m7b5", "ø", "ø7": intervals = [0, 3, 6, 10]
        case "dim", "°": intervals = [0, 3, 6]
        case "mmaj7": intervals = [0, 3, 7, 11]
        case "maj13": intervals = [0, 4, 7, 11, 14, 21]
        case "maj9": intervals = [0, 4, 7, 11, 14]
        case "maj7#11": intervals = [0, 4, 7, 11, 18]
        case "maj7#5": intervals = [0, 4, 8, 11]
        case "maj7": intervals = [0, 4, 7, 11]
        case "m13": intervals = [0, 3, 7, 10, 14, 21]
        case "13": intervals = [0, 4, 7, 10, 14, 21]
        case "m11": intervals = [0, 3, 7, 10, 14, 17]
        case "11": intervals = [0, 4, 7, 10, 14, 17]
        case "add9", "add2": intervals = [0, 4, 7, 14]
        case "6/9": intervals = [0, 4, 7, 9, 14]
        case "m9": intervals = [0, 3, 7, 10, 14]
        case "9": intervals = [0, 4, 7, 10, 14]
        case "7alt": intervals = [0, 4, 10, 13, 15, 20]
        case "7b9b5": intervals = [0, 4, 6, 10, 13]
        case "7b9#5": intervals = [0, 4, 8, 10, 13]
        case "7#9b5": intervals = [0, 4, 6, 10, 15]
        case "7#9#5": intervals = [0, 4, 8, 10, 15]
        case "7b9": intervals = [0, 4, 7, 10, 13]
        case "7#9": intervals = [0, 4, 7, 10, 15]
        case "7b5": intervals = [0, 4, 6, 10]
        case "7#5": intervals = [0, 4, 8, 10]
        case "m7": intervals = [0, 3, 7, 10]
        case "7sus4", "7sus": intervals = [0, 5, 7, 10]
        case "7": intervals = [0, 4, 7, 10]
        case "m6": intervals = [0, 3, 7, 9]
        case "6": intervals = [0, 4, 7, 9]
        case "sus2": intervals = [0, 2, 7]
        case "sus4", "sus": intervals = [0, 5, 7]
        case "aug", "+": intervals = [0, 4, 8]
        case "m": intervals = [0, 3, 7]
        case "": intervals = [0, 4, 7]
        default: return nil
        }

        let uniqueIntervals = Array(Set(intervals)).sorted()
        let pitchClasses = Array(Set(uniqueIntervals.map { (rootPitch + $0) % 12 })).sorted()
        let flats = root.contains("b") || lower.contains("b") || key.prefersFlats
        let names = uniqueIntervals.map { noteName(rootPitch + $0, flats: flats) }
        let relative = (rootPitch - key.pitchClass + 12) % 12
        let numerals = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"]
        let isMinor = uniqueIntervals.contains(3) && !uniqueIntervals.contains(4)
        let numeral = isMinor ? numerals[relative].lowercased() : numerals[relative]
        let isDominantQuality = uniqueIntervals.contains(4) && uniqueIntervals.contains(10)
        let isDiminishedQuality = uniqueIntervals.contains(3) && uniqueIntervals.contains(6)
        let function: String
        if relative == 7 && isDominantQuality { function = "Dominant pull" }
        else if isDominantQuality { function = "Secondary dominant" }
        else if relative == 11 && isDiminishedQuality { function = "Leading-tone pull" }
        else if [0, 4, 9].contains(relative) { function = "Tonic family" }
        else if [2, 5].contains(relative) { function = "Predominant motion" }
        else { function = "Chromatic color" }
        let guides = uniqueIntervals
            .filter { [3, 4, 9, 10, 11].contains($0 % 12) }
            .prefix(2)
            .map { noteName(rootPitch + $0, flats: flats) }
        let color: String
        let alteredDominantIntervals: Set<Int> = [6, 8, 13, 15, 20]
        if isDominantQuality, !alteredDominantIntervals.isDisjoint(with: uniqueIntervals) { color = "Altered dominant tension" }
        else if lower == "add9" || lower == "add2" { color = "Added ninth without a seventh" }
        else if uniqueIntervals.contains(where: { $0 > 12 }) { color = "Extended upper color" }
        else if uniqueIntervals.contains(11) { color = "Major-seventh sheen" }
        else if isDiminishedQuality { color = "Symmetric instability" }
        else { color = "Core chord tones" }
        return ChordDescription(
            symbol: cleaned,
            root: root,
            bass: bass,
            suffix: suffix,
            intervals: uniqueIntervals,
            pitchClasses: pitchClasses,
            toneNames: names,
            romanNumeral: numeral,
            function: function,
            guideToneNames: Array(guides),
            colorNote: color
        )
    }
    // swiftlint:enable cyclomatic_complexity function_body_length

    static func voicing(for chord: ChordDescription, family: VoicingFamily) -> [Int] {
        guard let rootPitch = pitchClass(for: chord.root) else { return [] }
        var intervals = chord.intervals
        if intervals.isEmpty { intervals = [0, 4, 7] }
        let third = intervals.first(where: { [2, 3, 4, 5].contains($0 % 12) }).map { $0 % 12 } ?? 4
        let fifth = intervals.first(where: { [6, 7, 8].contains($0 % 12) }).map { $0 % 12 } ?? 7
        let seventh = intervals.first(where: { [9, 10, 11].contains($0 % 12) }).map { $0 % 12 } ?? 10
        let ninth = intervals.first(where: { $0 % 12 == 2 }).map { $0 % 12 } ?? 2
        let base = 48 + rootPitch
        var notes: [Int]
        switch family {
        case .balanced:
            notes = intervals.prefix(6).map { base + $0 }
        case .shell:
            notes = [base, base + third, base + seventh]
        case .rootlessA:
            let color = intervals.first(where: { [5, 6, 8, 9].contains($0 % 12) }).map { $0 % 12 } ?? 7
            notes = [base + third, base + seventh, base + ninth, base + 12 + color]
        case .rootlessB:
            let color = intervals.first(where: { [2, 5, 6, 8, 9].contains($0 % 12) }).map { $0 % 12 } ?? 2
            notes = [base + seventh, base + 12 + third, base + 12 + color]
        case .open:
            notes = [base - 12, base + fifth, base + 12 + third, base + 12 + seventh]
        case .spread:
            notes = [base - 12, base + third, base + 12 + seventh, base + 24 + ninth]
        }
        if let bass = chord.bass, let bassPitch = pitchClass(for: bass), bassPitch != rootPitch {
            var bassNote = 36 + bassPitch
            if let lowest = notes.min(), bassNote >= lowest { bassNote -= 12 }
            notes.append(bassNote)
        }
        return Array(Set(notes.map { min(92, max(28, $0)) })).sorted()
    }

    static func transitionMotion(from source: ChordDescription, to destination: ChordDescription, flats: Bool) -> String {
        let sourcePitches = Set(source.pitchClasses)
        let destinationPitches = Set(destination.pitchClasses)
        let common = sourcePitches.intersection(destinationPitches).sorted()
        let commonText = common.isEmpty
            ? "no common tones"
            : "common tone\(common.count == 1 ? "" : "s") " + common.map { noteName($0, flats: flats) }.joined(separator: ", ")

        let moves = sourcePitches.flatMap { start in
            destinationPitches.compactMap { end -> (distance: Int, start: Int, end: Int)? in
                var signed = (end - start + 12) % 12
                if signed > 6 { signed -= 12 }
                return signed == 0 ? nil : (abs(signed), start, end)
            }
        }
        guard let closest = moves.sorted(by: {
            ($0.distance, $0.start, $0.end) < ($1.distance, $1.start, $1.end)
        }).first else {
            return "To \(destination.symbol): \(commonText); the pitch-class set is unchanged."
        }
        return "To \(destination.symbol): \(commonText); nearest motion is \(noteName(closest.start, flats: flats)) to \(noteName(closest.end, flats: flats)) by \(closest.distance) semitone\(closest.distance == 1 ? "" : "s")."
    }

    static func compilePlayback(_ chart: JazzChart) -> [PlaybackEvent] {
        var beat = 0.0
        var events: [PlaybackEvent] = []
        for measure in chart.measures {
            for chord in measure.chords {
                if let description = parseChord(chord.symbol, in: chart.key) {
                    events.append(
                        PlaybackEvent(
                            id: UUID(),
                            chordID: chord.id,
                            startBeat: beat,
                            durationBeats: chord.beats,
                            midiPitches: voicing(for: description, family: chart.voicingFamily)
                        )
                    )
                }
                beat += chord.beats
            }
        }
        return events
    }

    static func transpose(symbol: String, semitones: Int, preferFlats: Bool) -> String {
        guard let first = symbol.first, "ABCDEFGabcdefg".contains(first) else { return symbol }
        let characters = Array(symbol)
        var rootLength = 1
        if characters.count > 1, characters[1] == "#" || characters[1] == "b" { rootLength = 2 }
        let root = String(characters[0..<rootLength])
        guard let rootPitch = pitchClass(for: root) else { return symbol }
        let tail = String(characters.dropFirst(rootLength))
        if tail.lowercased() == "6/9" {
            return noteName(rootPitch + semitones, flats: preferFlats) + tail
        }
        let parts = tail.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        var result = noteName(rootPitch + semitones, flats: preferFlats) + String(parts[0])
        if parts.count == 2, let bassPitch = pitchClass(for: String(parts[1])) {
            result += "/" + noteName(bassPitch + semitones, flats: preferFlats)
        }
        return result
    }

    private static func unsupportedSuffixFragment(in symbol: String) -> String? {
        let cleaned = symbol.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = cleaned.first, "ABCDEFGabcdefg".contains(first) else { return nil }
        let characters = Array(cleaned)
        var rootLength = 1
        if characters.count > 1, characters[1] == "#" || characters[1] == "b" { rootLength = 2 }
        guard characters.count >= rootLength else { return nil }
        let tail = String(characters.dropFirst(rootLength))
        let suffix = tail.lowercased() == "6/9"
            ? tail
            : String(tail.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
        guard !supportedSuffixes.contains(suffix.lowercased()), !suffix.isEmpty else { return nil }
        return suffix
    }
}

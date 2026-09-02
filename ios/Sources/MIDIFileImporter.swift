import Foundation

/// Deterministic, bounded Standard MIDI File import for the native app.
///
/// The importer intentionally produces symbolic chord events rather than
/// pretending MIDI can preserve spelling, annotations, or exact FrankenJazz
/// document state. It accepts ordinary SMF format 0/1 files, pairs note events,
/// groups near-simultaneous onsets, and resolves literal pitch-class sets
/// through the same chord vocabulary the native editor can parse.
enum MIDIFileImporter {
    static let maximumFileBytes = 2_000_000

    struct Result: Sendable {
        var chart: JazzChart
        var sourceTrackCount: Int
        var importedChordCount: Int
        var skippedSonorityCount: Int
        var omittedSourceMeasureCount: Int
        var tempoChangeCount: Int

        var notice: String {
            var details = ["Imported \(importedChordCount) editable chord\(importedChordCount == 1 ? "" : "s") from MIDI at \(Int(chart.tempoBPM.rounded())) BPM."]
            if skippedSonorityCount > 0 {
                details.append("Skipped \(skippedSonorityCount) note stack\(skippedSonorityCount == 1 ? "" : "s") that had no supported chord name.")
            }
            if omittedSourceMeasureCount > 0 {
                details.append("Omitted \(omittedSourceMeasureCount) empty source bar\(omittedSourceMeasureCount == 1 ? "" : "s").")
            }
            if tempoChangeCount > 1 {
                details.append("The native chart uses the tempo active at its first imported chord; \(tempoChangeCount - 1) later tempo change\(tempoChangeCount == 2 ? "" : "s") remain MIDI-only.")
            }
            return details.joined(separator: " ")
        }
    }

    static func importChart(data: Data, title: String) throws -> Result {
        guard data.count <= maximumFileBytes else {
            throw MIDIImportIssue.limitExceeded("The MIDI file is larger than the 2 MB import limit.")
        }
        let decoded = try SMFDecoder.decode(data)
        return try deriveChart(from: decoded, title: title)
    }
}

enum MIDIImportIssue: LocalizedError, Equatable {
    case invalidHeader(offset: Int)
    case unsupportedFormat(Int)
    case invalidTrackCount(Int)
    case smpteDivisionUnsupported
    case zeroDivision
    case truncated(offset: Int)
    case invalidChunk(offset: Int)
    case invalidVariableLengthQuantity(offset: Int)
    case invalidEvent(offset: Int)
    case invalidMeta(type: Int, offset: Int)
    case zeroTempo(offset: Int)
    case unsupportedTempo(Double)
    case unsupportedMeter(numerator: Int, denominator: Int)
    case noteOverlap(track: Int, channel: Int, note: Int)
    case unmatchedNoteOff(track: Int, channel: Int, note: Int)
    case unterminatedNote(track: Int, channel: Int, note: Int)
    case limitExceeded(String)
    case noHarmonicNotes
    case noNamedChords
    case tooManyMeasures(limit: Int)

    var errorDescription: String? {
        switch self {
        case let .invalidHeader(offset): "The MIDI header is invalid near byte \(offset)."
        case let .unsupportedFormat(format): "MIDI format \(format) is not supported. Use a format 0 or format 1 file."
        case let .invalidTrackCount(count): "The MIDI file declares an invalid track count (\(count))."
        case .smpteDivisionUnsupported: "SMPTE-timed MIDI is not supported yet; use pulses-per-quarter-note timing."
        case .zeroDivision: "The MIDI file declares zero pulses per quarter note."
        case let .truncated(offset): "The MIDI file ends unexpectedly near byte \(offset)."
        case let .invalidChunk(offset): "The MIDI chunk structure is invalid near byte \(offset)."
        case let .invalidVariableLengthQuantity(offset): "A MIDI variable-length value is invalid near byte \(offset)."
        case let .invalidEvent(offset): "A MIDI event is invalid near byte \(offset)."
        case let .invalidMeta(type, offset): "MIDI meta event 0x\(String(type, radix: 16, uppercase: true)) has an invalid payload near byte \(offset)."
        case let .zeroTempo(offset): "The MIDI file declares a zero tempo near byte \(offset)."
        case let .unsupportedTempo(bpm): "The tempo active at the first imported chord is \(bpm.formatted(.number.precision(.fractionLength(0...2)))) BPM; the native editor supports 30–320 BPM."
        case let .unsupportedMeter(numerator, denominator): "This native chart is fixed to 4/4, so a \(numerator)/\(denominator) MIDI meter cannot be imported honestly yet."
        case let .noteOverlap(track, channel, note): "Track \(track + 1), channel \(channel + 1) starts MIDI note \(note) twice before releasing it."
        case let .unmatchedNoteOff(track, channel, note): "Track \(track + 1), channel \(channel + 1) releases MIDI note \(note) without a matching note-on."
        case let .unterminatedNote(track, channel, note): "Track \(track + 1), channel \(channel + 1) never releases MIDI note \(note)."
        case let .limitExceeded(message): message
        case .noHarmonicNotes: "The MIDI file contains no completed non-drum notes to analyze."
        case .noNamedChords: "The MIDI note stacks do not match any chord name supported by the native editor."
        case let .tooManyMeasures(limit): "The MIDI file would create more than \(limit) editable measures."
        }
    }
}

private extension MIDIFileImporter {
    struct ChordTemplate {
        var suffix: String
        var offsets: [Int]
        var mayOmitFifth: Bool
    }

    struct Sonority {
        var anchorTick: Int
        var notes: [SMFDecoder.Note]
    }

    struct CellKey: Hashable {
        var measure: Int
        var beat: Int
    }

    struct Cell {
        var anchorTick: Int
        var pitches = Set<Int>()
        var bassMIDI = 127
        var memberCount = 0
    }

    struct ResolvedCell {
        var sourceMeasure: Int
        var beat: Int
        var anchorTick: Int
        var symbol: String
    }

    struct LaneResult {
        var measures: [JazzMeasure]
        var chordCount: Int
        var skippedSonorities: Int
        var omittedMeasures: Int
        var firstAnchorTick: Int
        var score: Int
    }

    static let templates: [ChordTemplate] = [
        ChordTemplate(suffix: "", offsets: [0, 4, 7], mayOmitFifth: false),
        ChordTemplate(suffix: "m", offsets: [0, 3, 7], mayOmitFifth: false),
        ChordTemplate(suffix: "dim", offsets: [0, 3, 6], mayOmitFifth: false),
        ChordTemplate(suffix: "aug", offsets: [0, 4, 8], mayOmitFifth: false),
        ChordTemplate(suffix: "sus2", offsets: [0, 2, 7], mayOmitFifth: false),
        ChordTemplate(suffix: "sus4", offsets: [0, 5, 7], mayOmitFifth: false),
        ChordTemplate(suffix: "6", offsets: [0, 4, 7, 9], mayOmitFifth: true),
        ChordTemplate(suffix: "m6", offsets: [0, 3, 7, 9], mayOmitFifth: true),
        ChordTemplate(suffix: "maj7", offsets: [0, 4, 7, 11], mayOmitFifth: true),
        ChordTemplate(suffix: "7", offsets: [0, 4, 7, 10], mayOmitFifth: true),
        ChordTemplate(suffix: "m7", offsets: [0, 3, 7, 10], mayOmitFifth: true),
        ChordTemplate(suffix: "mMaj7", offsets: [0, 3, 7, 11], mayOmitFifth: true),
        ChordTemplate(suffix: "m7b5", offsets: [0, 3, 6, 10], mayOmitFifth: false),
        ChordTemplate(suffix: "dim7", offsets: [0, 3, 6, 9], mayOmitFifth: false),
        ChordTemplate(suffix: "maj7#5", offsets: [0, 4, 8, 11], mayOmitFifth: false),
        ChordTemplate(suffix: "7sus4", offsets: [0, 5, 7, 10], mayOmitFifth: true),
        ChordTemplate(suffix: "maj9", offsets: [0, 2, 4, 7, 11], mayOmitFifth: true),
        ChordTemplate(suffix: "9", offsets: [0, 2, 4, 7, 10], mayOmitFifth: true),
        ChordTemplate(suffix: "m9", offsets: [0, 2, 3, 7, 10], mayOmitFifth: true),
        ChordTemplate(suffix: "7b9b5", offsets: [0, 1, 4, 6, 10], mayOmitFifth: false),
        ChordTemplate(suffix: "7b9#5", offsets: [0, 1, 4, 8, 10], mayOmitFifth: false),
        ChordTemplate(suffix: "7#9b5", offsets: [0, 3, 4, 6, 10], mayOmitFifth: false),
        ChordTemplate(suffix: "7#9#5", offsets: [0, 3, 4, 8, 10], mayOmitFifth: false)
    ]

    static func deriveChart(from decoded: SMFDecoder.File, title: String) throws -> Result {
        for meter in decoded.meters {
            let denominator = 1 << meter.denominatorPower
            guard meter.numerator == 4, denominator == 4 else {
                throw MIDIImportIssue.unsupportedMeter(numerator: meter.numerator, denominator: denominator)
            }
        }

        let harmonicNotes = decoded.notes.filter { $0.channel != 9 }
        guard !harmonicNotes.isEmpty else { throw MIDIImportIssue.noHarmonicNotes }

        var candidateLanes: [[SMFDecoder.Note]] = [harmonicNotes]
        let lanes = Dictionary(grouping: harmonicNotes) { note in
            LaneKey(track: note.trackIndex, channel: note.channel)
        }
        candidateLanes.append(contentsOf: lanes.keys.sorted {
            $0.track == $1.track ? $0.channel < $1.channel : $0.track < $1.track
        }.compactMap { lanes[$0] })

        var best: LaneResult?
        for notes in candidateLanes {
            guard let candidate = deriveLane(notes: notes, decoded: decoded) else { continue }
            if best == nil || candidate.score > best?.score ?? Int.min {
                best = candidate
            }
        }
        guard let best, best.chordCount > 0 else { throw MIDIImportIssue.noNamedChords }
        guard best.measures.count <= JazzTheory.maximumMeasures else {
            throw MIDIImportIssue.tooManyMeasures(limit: JazzTheory.maximumMeasures)
        }

        let boundedTitle = String(title.prefix(120)).trimmingCharacters(in: .whitespacesAndNewlines)
        let tempo = try tempoBPM(at: best.firstAnchorTick, entries: decoded.tempos)
        let chart = JazzChart(
            title: boundedTitle.isEmpty ? "Imported MIDI" : boundedTitle,
            tempoBPM: tempo,
            groove: .straightEighths,
            measures: best.measures
        )
        try JazzDocumentValidator.validate(chart)
        return Result(
            chart: chart,
            sourceTrackCount: decoded.trackCount,
            importedChordCount: best.chordCount,
            skippedSonorityCount: best.skippedSonorities,
            omittedSourceMeasureCount: best.omittedMeasures,
            tempoChangeCount: decoded.tempos.count
        )
    }

    struct LaneKey: Hashable {
        var track: Int
        var channel: Int
    }

    static func deriveLane(notes: [SMFDecoder.Note], decoded: SMFDecoder.File) -> LaneResult? {
        let sonorities = group(notes: notes, ppq: decoded.ppq, tempos: decoded.tempos)
        guard !sonorities.isEmpty else { return nil }

        var cells: [CellKey: Cell] = [:]
        for sonority in sonorities {
            let roundedBeat = Int((Int64(sonority.anchorTick) * 2 + Int64(decoded.ppq)) / Int64(decoded.ppq * 2))
            let key = CellKey(measure: roundedBeat / 4, beat: roundedBeat % 4)
            var cell = cells[key] ?? Cell(anchorTick: sonority.anchorTick)
            cell.anchorTick = min(cell.anchorTick, sonority.anchorTick)
            for note in sonority.notes {
                cell.pitches.insert(note.key % 12)
                cell.bassMIDI = min(cell.bassMIDI, note.key)
                cell.memberCount += 1
            }
            cells[key] = cell
        }

        var resolved: [ResolvedCell] = []
        var skipped = 0
        for key in cells.keys.sorted(by: { $0.measure == $1.measure ? $0.beat < $1.beat : $0.measure < $1.measure }) {
            guard let cell = cells[key] else { continue }
            let pitchClasses = cell.pitches.sorted()
            guard let symbol = resolveSymbol(pitchClasses: pitchClasses, bassPitchClass: cell.bassMIDI % 12) else {
                skipped += 1
                continue
            }
            resolved.append(ResolvedCell(sourceMeasure: key.measure, beat: key.beat, anchorTick: cell.anchorTick, symbol: symbol))
        }
        guard let first = resolved.first else { return nil }

        let grouped = Dictionary(grouping: resolved, by: \ResolvedCell.sourceMeasure)
        let sourceMeasures = grouped.keys.sorted()
        var measures: [JazzMeasure] = []
        var previousSourceMeasure: Int?
        var omitted = sourceMeasures.first ?? 0
        for sourceMeasure in sourceMeasures {
            guard let sourceChords = grouped[sourceMeasure]?.sorted(by: { $0.beat < $1.beat }), !sourceChords.isEmpty else { continue }
            if let previousSourceMeasure, sourceMeasure > previousSourceMeasure + 1 {
                omitted += sourceMeasure - previousSourceMeasure - 1
            }
            var chords: [JazzChordEvent] = []
            for index in sourceChords.indices {
                let startBeat = index == sourceChords.startIndex ? 0 : sourceChords[index].beat
                let endBeat = index + 1 < sourceChords.endIndex ? sourceChords[index + 1].beat : 4
                let beats = Double(endBeat - startBeat)
                guard beats > 0 else { continue }
                chords.append(JazzChordEvent(symbol: sourceChords[index].symbol, beats: beats))
            }
            if !chords.isEmpty { measures.append(JazzMeasure(chords: chords)) }
            previousSourceMeasure = sourceMeasure
        }
        guard !measures.isEmpty else { return nil }

        let memberCount = cells.values.reduce(0) { $0 + $1.memberCount }
        let score = resolved.count * 1_000 + sourceMeasures.count * 100 + memberCount - skipped * 25 - omitted * 10
        return LaneResult(
            measures: measures,
            chordCount: measures.reduce(0) { $0 + $1.chords.count },
            skippedSonorities: skipped,
            omittedMeasures: omitted,
            firstAnchorTick: first.anchorTick,
            score: score
        )
    }

    static func group(notes: [SMFDecoder.Note], ppq: Int, tempos: [SMFDecoder.Tempo]) -> [Sonority] {
        let sorted = notes.sorted {
            if $0.onTick != $1.onTick { return $0.onTick < $1.onTick }
            if $0.trackIndex != $1.trackIndex { return $0.trackIndex < $1.trackIndex }
            if $0.channel != $1.channel { return $0.channel < $1.channel }
            return $0.key < $1.key
        }
        var groups: [Sonority] = []
        var cursor = 0
        while cursor < sorted.count {
            let anchor = sorted[cursor].onTick
            let microseconds = tempoMicroseconds(at: anchor, entries: tempos)
            let window = 40_000 * ppq / microseconds
            var end = cursor + 1
            while end < sorted.count, sorted[end].onTick - anchor <= window { end += 1 }
            groups.append(Sonority(anchorTick: anchor, notes: Array(sorted[cursor..<end])))
            cursor = end
        }
        return groups
    }

    static func resolveSymbol(pitchClasses: [Int], bassPitchClass: Int) -> String? {
        struct Candidate {
            var symbol: String
            var exactRank: Int
            var inversionRank: Int
            var toneCount: Int
            var templateIndex: Int
            var root: Int
        }
        var candidates: [Candidate] = []
        for root in pitchClasses {
            let offsets = pitchClasses.map { ($0 - root + 12) % 12 }.sorted()
            for (templateIndex, template) in templates.enumerated() {
                let exact: Bool
                if offsets == template.offsets {
                    exact = true
                } else if template.mayOmitFifth, offsets == template.offsets.filter({ $0 != 7 }) {
                    exact = false
                } else {
                    continue
                }
                let rootName = JazzTheory.noteName(root, flats: true)
                var symbol = rootName + template.suffix
                if bassPitchClass != root {
                    symbol += "/" + JazzTheory.noteName(bassPitchClass, flats: true)
                }
                guard JazzTheory.parseChord(symbol, in: .c) != nil else { continue }
                candidates.append(Candidate(
                    symbol: symbol,
                    exactRank: exact ? 0 : 1,
                    inversionRank: bassPitchClass == root ? 0 : 1,
                    toneCount: template.offsets.count,
                    templateIndex: templateIndex,
                    root: root
                ))
            }
        }
        return candidates.sorted {
            if $0.exactRank != $1.exactRank { return $0.exactRank < $1.exactRank }
            if $0.inversionRank != $1.inversionRank { return $0.inversionRank < $1.inversionRank }
            if $0.toneCount != $1.toneCount { return $0.toneCount < $1.toneCount }
            if $0.templateIndex != $1.templateIndex { return $0.templateIndex < $1.templateIndex }
            return $0.root < $1.root
        }.first?.symbol
    }

    static func tempoMicroseconds(at tick: Int, entries: [SMFDecoder.Tempo]) -> Int {
        var value = 500_000
        var selectedTick = -1
        var selectedTrack = Int.max
        for entry in entries where entry.tick <= tick {
            if entry.tick > selectedTick || (entry.tick == selectedTick && entry.trackIndex < selectedTrack) {
                value = entry.microsecondsPerQuarter
                selectedTick = entry.tick
                selectedTrack = entry.trackIndex
            }
        }
        return value
    }

    static func tempoBPM(at tick: Int, entries: [SMFDecoder.Tempo]) throws -> Double {
        let microseconds = tempoMicroseconds(at: tick, entries: entries)
        let bpm = 60_000_000 / Double(microseconds)
        guard (30...320).contains(bpm) else { throw MIDIImportIssue.unsupportedTempo(bpm) }
        return bpm.rounded()
    }
}

private enum SMFDecoder {
    static let headerChunkTag: UInt32 = 0x4D54_6864
    static let trackChunkTag: UInt32 = 0x4D54_726B
    static let maximumTracks = 64
    static let maximumEvents = 524_288
    static let maximumNotes = 131_072
    static let maximumTick = 1_073_741_823
    static let maximumTempoChanges = 4_096
    static let maximumMeterChanges = 1_024
    static let maximumMetaPayloadBytes = 1_024

    struct File: Sendable {
        var ppq: Int
        var trackCount: Int
        var notes: [Note]
        var tempos: [Tempo]
        var meters: [Meter]
    }

    struct Note: Sendable {
        var trackIndex: Int
        var channel: Int
        var key: Int
        var onTick: Int
        var offTick: Int
        var velocity: Int
    }

    struct Tempo: Sendable {
        var tick: Int
        var microsecondsPerQuarter: Int
        var trackIndex: Int
    }

    struct Meter: Sendable {
        var tick: Int
        var numerator: Int
        var denominatorPower: Int
        var trackIndex: Int
    }

    private struct OpenKey: Hashable {
        var channel: Int
        var note: Int
    }

    private struct OpenNote {
        var tick: Int
        var velocity: Int
    }

    private struct Counters {
        var events = 0
        var notes = 0
    }

    static func decode(_ data: Data) throws -> File {
        let bytes = [UInt8](data)
        var reader = ByteReader(bytes: bytes, index: 0, limit: bytes.count)
        let headerOffset = reader.index
        guard try reader.readTag() == headerChunkTag else { throw MIDIImportIssue.invalidHeader(offset: headerOffset) }
        guard try reader.readUInt32() == 6 else { throw MIDIImportIssue.invalidHeader(offset: reader.index - 4) }
        let format = try reader.readUInt16()
        guard format == 0 || format == 1 else { throw MIDIImportIssue.unsupportedFormat(format) }
        let declaredTracks = try reader.readUInt16()
        guard declaredTracks > 0, declaredTracks <= maximumTracks, format != 0 || declaredTracks == 1 else {
            throw MIDIImportIssue.invalidTrackCount(declaredTracks)
        }
        let division = try reader.readUInt16()
        guard division & 0x8000 == 0 else { throw MIDIImportIssue.smpteDivisionUnsupported }
        guard division > 0 else { throw MIDIImportIssue.zeroDivision }

        var allNotes: [Note] = []
        var tempos: [Tempo] = []
        var meters: [Meter] = []
        var counters = Counters()
        var trackIndex = 0
        while trackIndex < declaredTracks {
            let chunkOffset = reader.index
            let tag = try reader.readTag()
            let length = try reader.readUInt32()
            guard length <= reader.limit - reader.index else {
                throw MIDIImportIssue.truncated(offset: reader.index)
            }
            let end = reader.index + length
            if tag == trackChunkTag {
                try parseTrack(
                    bytes: bytes,
                    start: reader.index,
                    end: end,
                    trackIndex: trackIndex,
                    notes: &allNotes,
                    tempos: &tempos,
                    meters: &meters,
                    counters: &counters
                )
                trackIndex += 1
            } else if tag == headerChunkTag || !isPrintableChunkTag(tag) {
                throw MIDIImportIssue.invalidChunk(offset: chunkOffset)
            }
            reader.index = end
        }
        guard trackIndex == declaredTracks else { throw MIDIImportIssue.invalidTrackCount(trackIndex) }

        while reader.index < reader.limit {
            let chunkOffset = reader.index
            guard reader.limit - reader.index >= 8 else { throw MIDIImportIssue.invalidChunk(offset: chunkOffset) }
            let tag = try reader.readTag()
            let length = try reader.readUInt32()
            guard length <= reader.limit - reader.index else { throw MIDIImportIssue.truncated(offset: reader.index) }
            if tag == trackChunkTag || tag == headerChunkTag || !isPrintableChunkTag(tag) {
                throw MIDIImportIssue.invalidChunk(offset: chunkOffset)
            }
            reader.index += length
        }

        tempos.sort { $0.tick == $1.tick ? $0.trackIndex < $1.trackIndex : $0.tick < $1.tick }
        meters.sort { $0.tick == $1.tick ? $0.trackIndex < $1.trackIndex : $0.tick < $1.tick }
        return File(ppq: division, trackCount: declaredTracks, notes: allNotes, tempos: tempos, meters: meters)
    }

    private static func isPrintableChunkTag(_ tag: UInt32) -> Bool {
        [24, 16, 8, 0].allSatisfy { shift in
            let byte = UInt8((tag >> shift) & 0xFF)
            return (0x20...0x7E).contains(byte)
        }
    }

    private static func parseTrack(
        bytes: [UInt8],
        start: Int,
        end: Int,
        trackIndex: Int,
        notes: inout [Note],
        tempos: inout [Tempo],
        meters: inout [Meter],
        counters: inout Counters
    ) throws {
        var reader = ByteReader(bytes: bytes, index: start, limit: end)
        var tick = 0
        var runningStatus: UInt8?
        var openNotes: [OpenKey: OpenNote] = [:]
        var reachedEnd = false

        while reader.index < end {
            let eventOffset = reader.index
            let delta = try reader.readVariableLengthQuantity()
            guard tick <= maximumTick - delta else {
                throw MIDIImportIssue.limitExceeded("The MIDI tick horizon exceeds the import safety limit.")
            }
            tick += delta
            counters.events += 1
            guard counters.events <= maximumEvents else {
                throw MIDIImportIssue.limitExceeded("The MIDI file contains more than \(maximumEvents.formatted()) events.")
            }

            let first = try reader.peekByte()
            let status: UInt8
            if first >= 0x80 {
                status = try reader.readByte()
                runningStatus = status < 0xF0 ? status : nil
            } else {
                guard let runningStatus else { throw MIDIImportIssue.invalidEvent(offset: eventOffset) }
                status = runningStatus
            }

            if status == 0xFF {
                let metaType = Int(try reader.readByte())
                let length = try reader.readVariableLengthQuantity()
                guard length <= maximumMetaPayloadBytes else {
                    throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset)
                }
                let payload = try reader.readBytes(count: length)
                switch metaType {
                case 0x2F:
                    guard length == 0, reader.index == end else {
                        throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset)
                    }
                    reachedEnd = true
                case 0x51:
                    guard length == 3 else { throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset) }
                    let value = Int(payload[0]) << 16 | Int(payload[1]) << 8 | Int(payload[2])
                    guard value > 0 else { throw MIDIImportIssue.zeroTempo(offset: eventOffset) }
                    tempos.append(Tempo(tick: tick, microsecondsPerQuarter: value, trackIndex: trackIndex))
                    guard tempos.count <= maximumTempoChanges else {
                        throw MIDIImportIssue.limitExceeded("The MIDI file contains too many tempo changes.")
                    }
                case 0x58:
                    guard length == 4 else { throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset) }
                    let numerator = Int(payload[0])
                    let power = Int(payload[1])
                    guard (1...32).contains(numerator), power <= 5 else {
                        throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset)
                    }
                    meters.append(Meter(tick: tick, numerator: numerator, denominatorPower: power, trackIndex: trackIndex))
                    guard meters.count <= maximumMeterChanges else {
                        throw MIDIImportIssue.limitExceeded("The MIDI file contains too many meter changes.")
                    }
                case 0x00:
                    guard length == 0 || length == 2 else { throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset) }
                case 0x20, 0x21:
                    guard length == 1 else { throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset) }
                case 0x54:
                    guard length == 5 else { throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset) }
                case 0x59:
                    guard length == 2 else { throw MIDIImportIssue.invalidMeta(type: metaType, offset: eventOffset) }
                case 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x7F:
                    break
                default:
                    // SMF readers are expected to skip well-formed metadata
                    // they do not consume. The bounded payload has already
                    // been read, so an unfamiliar type cannot desynchronize
                    // the track or weaken any resource limit.
                    break
                }
                if reachedEnd { break }
                continue
            }

            if status == 0xF0 || status == 0xF7 {
                let length = try reader.readVariableLengthQuantity()
                guard length <= maximumMetaPayloadBytes else {
                    throw MIDIImportIssue.limitExceeded("A MIDI system-exclusive event exceeds the 1 KB import limit.")
                }
                _ = try reader.readBytes(count: length)
                continue
            }

            guard status < 0xF0 else { throw MIDIImportIssue.invalidEvent(offset: eventOffset) }
            let kind = status & 0xF0
            let channel = Int(status & 0x0F)
            switch kind {
            case 0x80, 0x90:
                let note = Int(try reader.readDataByte())
                let velocity = Int(try reader.readDataByte())
                let key = OpenKey(channel: channel, note: note)
                if kind == 0x90, velocity > 0 {
                    guard openNotes[key] == nil else {
                        throw MIDIImportIssue.noteOverlap(track: trackIndex, channel: channel, note: note)
                    }
                    openNotes[key] = OpenNote(tick: tick, velocity: velocity)
                } else {
                    guard let opened = openNotes.removeValue(forKey: key) else {
                        throw MIDIImportIssue.unmatchedNoteOff(track: trackIndex, channel: channel, note: note)
                    }
                    notes.append(Note(
                        trackIndex: trackIndex,
                        channel: channel,
                        key: note,
                        onTick: opened.tick,
                        offTick: tick,
                        velocity: opened.velocity
                    ))
                    counters.notes += 1
                    guard counters.notes <= maximumNotes else {
                        throw MIDIImportIssue.limitExceeded("The MIDI file contains more than \(maximumNotes.formatted()) paired notes.")
                    }
                }
            case 0xA0, 0xB0, 0xE0:
                _ = try reader.readDataByte()
                _ = try reader.readDataByte()
            case 0xC0, 0xD0:
                _ = try reader.readDataByte()
            default:
                throw MIDIImportIssue.invalidEvent(offset: eventOffset)
            }
        }

        guard reachedEnd else { throw MIDIImportIssue.invalidMeta(type: 0x2F, offset: end) }
        if let unfinished = openNotes.sorted(by: {
            $0.key.channel == $1.key.channel ? $0.key.note < $1.key.note : $0.key.channel < $1.key.channel
        }).first {
            throw MIDIImportIssue.unterminatedNote(track: trackIndex, channel: unfinished.key.channel, note: unfinished.key.note)
        }
    }

    private struct ByteReader {
        let bytes: [UInt8]
        var index: Int
        let limit: Int

        mutating func peekByte() throws -> UInt8 {
            guard index < limit else { throw MIDIImportIssue.truncated(offset: index) }
            return bytes[index]
        }

        mutating func readByte() throws -> UInt8 {
            let value = try peekByte()
            index += 1
            return value
        }

        mutating func readDataByte() throws -> UInt8 {
            let offset = index
            let value = try readByte()
            guard value < 0x80 else { throw MIDIImportIssue.invalidEvent(offset: offset) }
            return value
        }

        mutating func readBytes(count: Int) throws -> [UInt8] {
            guard count >= 0, count <= limit - index else { throw MIDIImportIssue.truncated(offset: index) }
            defer { index += count }
            return Array(bytes[index..<(index + count)])
        }

        mutating func readTag() throws -> UInt32 {
            UInt32(try readByte()) << 24
                | UInt32(try readByte()) << 16
                | UInt32(try readByte()) << 8
                | UInt32(try readByte())
        }

        mutating func readUInt16() throws -> Int {
            Int(try readByte()) << 8 | Int(try readByte())
        }

        mutating func readUInt32() throws -> Int {
            Int(try readByte()) << 24 | Int(try readByte()) << 16 | Int(try readByte()) << 8 | Int(try readByte())
        }

        mutating func readVariableLengthQuantity() throws -> Int {
            let start = index
            var value = 0
            for _ in 0..<4 {
                let byte = try readByte()
                value = value << 7 | Int(byte & 0x7F)
                if byte & 0x80 == 0 { return value }
            }
            throw MIDIImportIssue.invalidVariableLengthQuantity(offset: start)
        }
    }
}

import Foundation

enum MIDIFileWriter {
    private struct Message {
        var tick: Int
        var priority: Int
        var bytes: [UInt8]
    }

    static func makeFile(chart: JazzChart) -> Data {
        let ppq = 480
        var messages: [Message] = []
        let microseconds = Int(60_000_000 / max(30, min(320, chart.tempoBPM)))
        messages.append(Message(tick: 0, priority: 0, bytes: [0xFF, 0x51, 0x03, UInt8((microseconds >> 16) & 0xFF), UInt8((microseconds >> 8) & 0xFF), UInt8(microseconds & 0xFF)]))
        messages.append(Message(tick: 0, priority: 1, bytes: [0xC0, chart.instrument.midiProgram]))
        for event in JazzTheory.compilePlayback(chart) {
            let start = Int((event.startBeat * Double(ppq)).rounded())
            let end = Int(((event.startBeat + max(0.05, event.durationBeats - 0.05)) * Double(ppq)).rounded())
            for pitch in event.midiPitches {
                messages.append(Message(tick: start, priority: 2, bytes: [0x90, UInt8(clamping: pitch), 88]))
                messages.append(Message(tick: end, priority: 0, bytes: [0x80, UInt8(clamping: pitch), 0]))
            }
        }
        messages.sort { lhs, rhs in lhs.tick == rhs.tick ? lhs.priority < rhs.priority : lhs.tick < rhs.tick }

        var track: [UInt8] = []
        var previousTick = 0
        for message in messages {
            track.append(contentsOf: variableLength(message.tick - previousTick))
            track.append(contentsOf: message.bytes)
            previousTick = message.tick
        }
        track.append(contentsOf: [0, 0xFF, 0x2F, 0])

        var bytes: [UInt8] = Array("MThd".utf8)
        bytes.append(contentsOf: uint32(6))
        bytes.append(contentsOf: uint16(0))
        bytes.append(contentsOf: uint16(1))
        bytes.append(contentsOf: uint16(ppq))
        bytes.append(contentsOf: Array("MTrk".utf8))
        bytes.append(contentsOf: uint32(track.count))
        bytes.append(contentsOf: track)
        return Data(bytes)
    }

    private static func variableLength(_ value: Int) -> [UInt8] {
        var remaining = max(0, value)
        var buffer = [UInt8(remaining & 0x7F)]
        remaining >>= 7
        while remaining > 0 {
            buffer.insert(UInt8((remaining & 0x7F) | 0x80), at: 0)
            remaining >>= 7
        }
        return buffer
    }

    private static func uint16(_ value: Int) -> [UInt8] {
        [UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
    }

    private static func uint32(_ value: Int) -> [UInt8] {
        [UInt8((value >> 24) & 0xFF), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
    }
}

enum PerformedMIDIFileIssue: LocalizedError, Equatable, Sendable {
    case invalidChart
    case durationExceeded(maximumBars: Int)
    case emptyPerformance
    case eventLimit
    case pitchLimit
    case channelCapacity
    case invalidEvent(index: Int)
    case invalidMetadata(String)
    case outputLimit

    var errorDescription: String? {
        switch self {
        case .invalidChart:
            "The chart is not valid enough to export as a performed MIDI file."
        case let .durationExceeded(maximumBars):
            "Performed MIDI is limited to \(maximumBars) bars per file."
        case .emptyPerformance:
            "The selected groove produced no performed notes to export."
        case .eventLimit:
            "The performed arrangement contains too many attacks for one MIDI file."
        case .pitchLimit:
            "The performed arrangement contains too many note occurrences for one MIDI file."
        case .channelCapacity:
            "Overlapping unisons need more than the 15 safe MIDI channel lanes."
        case let .invalidEvent(index):
            "Performed attack \(index + 1) contains invalid timing, pitch, or velocity data."
        case let .invalidMetadata(field):
            "The \(field) must be 1–96 UTF-8 bytes without control characters for performed MIDI."
        case .outputLimit:
            "The performed MIDI file would exceed the 1 MB export limit."
        }
    }
}

struct PerformedMIDIFile: Sendable {
    let data: Data
    let attackCount: Int
    let pitchCount: Int
    let bassLaneCount: Int
    let compLaneCount: Int
}

/// Additive SMF format-1 projection of the exact native groove plan.
///
/// The older `MIDIFileWriter` intentionally remains a one-track editable
/// chord document. This writer instead preserves the performed role events
/// that chart playback and dry WAV export consume, without pretending a MIDI
/// program can reproduce FrankenJazz's physical/sample/synthetic timbre.
enum PerformedMIDIFileWriter {
    static let ppq = JazzPerformancePlan.ppq
    static let maximumBars = 16
    static let maximumEvents = 1_024
    static let maximumPitches = 16_384
    static let maximumMarkers = 256
    static let maximumFileBytes = 1_048_576
    static let channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]

    private struct NoteOccurrence {
        var tick: Int
        var endTick: Int
        var note: Int
        var velocity: Int
        var order: Int
    }

    private struct Message {
        var tick: Int
        var isOn: Bool
        var note: Int
        var velocity: Int
        var channel: Int
        var order: Int
    }

    private struct Marker {
        var tick: Int
        var order: Int
        var text: [UInt8]
    }

    static func makeFile(chart: JazzChart) throws -> PerformedMIDIFile {
        let events = JazzPerformancePlan.compile(chart)
        return try makeFile(chart: chart, events: events)
    }

    /// Direct event seam keeps channel-allocation and refusal laws independently
    /// testable without deriving expected bytes from the production compiler.
    static func makeFile(
        chart: JazzChart,
        events: [JazzPerformanceEvent]
    ) throws -> PerformedMIDIFile {
        do {
            try JazzDocumentValidator.validate(chart)
        } catch {
            throw PerformedMIDIFileIssue.invalidChart
        }
        guard chart.measures.count <= maximumBars else {
            throw PerformedMIDIFileIssue.durationExceeded(maximumBars: maximumBars)
        }
        guard !events.isEmpty else { throw PerformedMIDIFileIssue.emptyPerformance }
        guard events.count <= maximumEvents else { throw PerformedMIDIFileIssue.eventLimit }

        let totalTicks = chart.measures.count * 4 * ppq
        var roles: [JazzPerformanceRole: [NoteOccurrence]] = [.bass: [], .comp: []]
        var pitchCount = 0
        var priorTick = -1
        var order = 0
        for (index, event) in events.enumerated() {
            let (endTick, tickOverflow) = event.startTick.addingReportingOverflow(event.gateDurationTicks)
            guard event.startTick >= priorTick,
                  event.startTick >= 0,
                  event.gateDurationTicks > 0,
                  !tickOverflow,
                  endTick <= totalTicks,
                  (1...127).contains(event.velocity),
                  !event.midiPitches.isEmpty,
                  event.midiPitches.count <= JazzDocumentValidator.maximumStoredVoices,
                  event.midiPitches.allSatisfy({ (0...127).contains($0) })
            else { throw PerformedMIDIFileIssue.invalidEvent(index: index) }
            priorTick = event.startTick
            pitchCount += event.midiPitches.count
            guard pitchCount <= maximumPitches else { throw PerformedMIDIFileIssue.pitchLimit }
            for pitch in event.midiPitches {
                order += 1
                roles[event.role, default: []].append(NoteOccurrence(
                    tick: event.startTick,
                    endTick: endTick,
                    note: pitch,
                    velocity: event.velocity,
                    order: order
                ))
            }
        }

        let bassAllocation = try allocate(roles[.bass] ?? [])
        let compAllocation = try allocate(roles[.comp] ?? [])
        guard bassAllocation.lanes + compAllocation.lanes <= channels.count else {
            throw PerformedMIDIFileIssue.channelCapacity
        }
        let bassMessages = applyChannels(bassAllocation.messages, offset: 0)
        let compMessages = applyChannels(compAllocation.messages, offset: bassAllocation.lanes)
        let title = try metadata(chart.title, field: "chart title")
        let markers = try makeMarkers(chart: chart)

        let conductor = conductorTrack(title: title, tempoBPM: chart.tempoBPM, markers: markers, totalTicks: totalTicks)
        let bass = noteTrack(title: Array("Bass".utf8), messages: bassMessages, totalTicks: totalTicks)
        let comp = noteTrack(title: Array("Comp".utf8), messages: compMessages, totalTicks: totalTicks)
        let header = Array("MThd".utf8) + uint32(6) + uint16(1) + uint16(3) + uint16(ppq)
        let bytes = header + chunk("MTrk", conductor) + chunk("MTrk", bass) + chunk("MTrk", comp)
        guard bytes.count <= maximumFileBytes else { throw PerformedMIDIFileIssue.outputLimit }
        return PerformedMIDIFile(
            data: Data(bytes),
            attackCount: events.count,
            pitchCount: pitchCount,
            bassLaneCount: bassAllocation.lanes,
            compLaneCount: compAllocation.lanes
        )
    }

    private static func allocate(_ notes: [NoteOccurrence]) throws -> (messages: [Message], lanes: Int) {
        var held: [[Int: Int]] = []
        var messages: [Message] = []
        for occurrence in notes {
            var lane: Int?
            for index in held.indices where (held[index][occurrence.note] ?? 0) <= occurrence.tick {
                lane = index
                break
            }
            if lane == nil {
                guard held.count < channels.count else { throw PerformedMIDIFileIssue.channelCapacity }
                held.append([:])
                lane = held.count - 1
            }
            guard let lane else { throw PerformedMIDIFileIssue.channelCapacity }
            held[lane][occurrence.note] = occurrence.endTick
            messages.append(Message(
                tick: occurrence.tick, isOn: true, note: occurrence.note,
                velocity: occurrence.velocity, channel: lane, order: occurrence.order
            ))
            messages.append(Message(
                tick: occurrence.endTick, isOn: false, note: occurrence.note,
                velocity: 0, channel: lane, order: occurrence.order
            ))
        }
        messages.sort {
            ($0.tick, $0.isOn ? 1 : 0, $0.order) < ($1.tick, $1.isOn ? 1 : 0, $1.order)
        }
        return (messages, held.count)
    }

    private static func applyChannels(_ messages: [Message], offset: Int) -> [Message] {
        messages.map { message in
            var projected = message
            projected.channel = channels[message.channel + offset]
            return projected
        }
    }

    private static func makeMarkers(chart: JazzChart) throws -> [Marker] {
        var markers: [Marker] = []
        var order = 0
        let sectionsByMeasure = Dictionary(uniqueKeysWithValues: (chart.sections ?? []).map {
            ($0.startMeasureID, $0.name)
        })
        for (measureIndex, measure) in chart.measures.enumerated() {
            let measureTick = measureIndex * 4 * ppq
            if let section = sectionsByMeasure[measure.id] {
                order += 1
                markers.append(Marker(
                    tick: measureTick, order: order,
                    text: try metadata("[\(section)]", field: "section marker")
                ))
            }
            var beat = 0.0
            for chord in measure.chords {
                let tick = measureTick + Int((beat * Double(ppq)).rounded())
                order += 1
                markers.append(Marker(
                    tick: tick, order: order,
                    text: try metadata(chord.symbol, field: "chord marker")
                ))
                beat += chord.beats
            }
        }
        guard markers.count <= maximumMarkers else { throw PerformedMIDIFileIssue.outputLimit }
        return markers.sorted { ($0.tick, $0.order) < ($1.tick, $1.order) }
    }

    private static func conductorTrack(
        title: [UInt8], tempoBPM: Double, markers: [Marker], totalTicks: Int
    ) -> [UInt8] {
        let microseconds = Int((60_000_000 / tempoBPM).rounded())
        var output = [UInt8(0)] + meta(0x03, title)
        output += [0] + meta(0x51, [
            UInt8((microseconds >> 16) & 0xFF),
            UInt8((microseconds >> 8) & 0xFF),
            UInt8(microseconds & 0xFF)
        ])
        output += [0] + meta(0x58, [4, 2, 24, 8])
        var tick = 0
        for marker in markers {
            output += variableLength(marker.tick - tick) + meta(0x06, marker.text)
            tick = marker.tick
        }
        output += variableLength(totalTicks - tick) + meta(0x2F, [])
        return output
    }

    private static func noteTrack(title: [UInt8], messages: [Message], totalTicks: Int) -> [UInt8] {
        var output = [UInt8(0)] + meta(0x03, title)
        var tick = 0
        for message in messages {
            output += variableLength(message.tick - tick)
            output += [
                UInt8((message.isOn ? 0x90 : 0x80) | message.channel),
                UInt8(message.note),
                UInt8(message.isOn ? message.velocity : 0)
            ]
            tick = message.tick
        }
        output += variableLength(totalTicks - tick) + meta(0x2F, [])
        return output
    }

    private static func metadata(_ value: String, field: String) throws -> [UInt8] {
        let bytes = Array(value.utf8)
        guard !bytes.isEmpty, bytes.count <= 96,
              value.unicodeScalars.allSatisfy({ $0.value >= 32 && $0.value != 127 })
        else { throw PerformedMIDIFileIssue.invalidMetadata(field) }
        return bytes
    }

    private static func chunk(_ name: String, _ payload: [UInt8]) -> [UInt8] {
        Array(name.utf8) + uint32(payload.count) + payload
    }

    private static func meta(_ type: UInt8, _ payload: [UInt8]) -> [UInt8] {
        [0xFF, type] + variableLength(payload.count) + payload
    }

    private static func variableLength(_ value: Int) -> [UInt8] {
        var remaining = max(0, value)
        var output = [UInt8(remaining & 0x7F)]
        remaining >>= 7
        while remaining > 0 {
            output.insert(UInt8((remaining & 0x7F) | 0x80), at: 0)
            remaining >>= 7
        }
        return output
    }

    private static func uint16(_ value: Int) -> [UInt8] {
        [UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
    }

    private static func uint32(_ value: Int) -> [UInt8] {
        [
            UInt8((value >> 24) & 0xFF), UInt8((value >> 16) & 0xFF),
            UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)
        ]
    }
}

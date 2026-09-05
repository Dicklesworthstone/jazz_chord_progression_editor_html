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

import Foundation

enum JazzPerformanceRole: String, Sendable {
    case bass
    case comp
}

struct JazzPerformanceEvent: Equatable, Sendable {
    var chordID: UUID
    var role: JazzPerformanceRole
    var startTick: Int
    var gateDurationTicks: Int
    var midiPitches: [Int]
    var velocity: Int
}

/// Native projection of the source-owned `performance-plan` tables. The
/// renderer consumes these role events directly; a groove is no longer a
/// sustained pad plus an unrelated percussion approximation.
enum JazzPerformancePlan {
    static let ppq = 960
    static let performanceReleaseGapTicks = 30
    static let playbackReleaseGapTicks = 24

    private enum BassTone { case root, third, fifth }
    private enum BassPlacement { case nearest, registerFloor }
    private enum CompVoicing { case all, upperVoices, guideTones }

    private struct BassSlot {
        var offset: Int
        var duration: Int
        var tone: BassTone
        var placement: BassPlacement
        var velocity: Int
        var phases: Set<Int>
    }

    private struct CompSlot {
        var offset: Int
        var duration: Int
        var voicing: CompVoicing
        var velocity: Int
        var phases: Set<Int>
    }

    private struct Register {
        var low: Int
        var high: Int
        var anchor: Int
    }

    struct CompRegister {
        var low: Int
        var high: Int
        var ceiling: Int
    }

    private struct ContinuityCost {
        var alignment: Int
        var gaps: Int
        var bottomMotion: Int

        func adding(_ other: ContinuityCost, bottomMotion extraMotion: Int) -> ContinuityCost {
            ContinuityCost(
                alignment: alignment + other.alignment,
                gaps: gaps + other.gaps,
                bottomMotion: bottomMotion + extraMotion
            )
        }
    }

    private struct ContinuityState {
        var shift: Int
        var dropCount: Int
        var notes: [Int]
        var cost: ContinuityCost
        var predecessor: Int
    }

    private struct ContinuityLayer {
        var eventIndex: Int
        var states: [ContinuityState]
    }

    private struct Style {
        var id: String
        var bass: [BassSlot]
        var comp: [CompSlot]
        var bassRegister: Register
        var compRegister: CompRegister
        var cycleVelocity: [Int]
        var swingNumerator: Int
        var swingDenominator: Int
    }

    private struct Draft {
        var role: JazzPerformanceRole
        var slotIndex: Int
        var start: Int
        var duration: Int
        var velocity: Int
        var bassTone: BassTone
        var bassPlacement: BassPlacement
        var compVoicing: CompVoicing
    }

    private static func ticks(_ numerator: Int, _ denominator: Int = 1) -> Int {
        numerator * ppq / denominator
    }

    private static func bass(
        _ offset: (Int, Int), _ duration: (Int, Int), _ tone: BassTone,
        _ placement: BassPlacement, _ velocity: Int, _ phases: [Int]
    ) -> BassSlot {
        BassSlot(
            offset: ticks(offset.0, offset.1), duration: ticks(duration.0, duration.1),
            tone: tone, placement: placement, velocity: velocity, phases: Set(phases)
        )
    }

    private static func comp(
        _ offset: (Int, Int), _ duration: (Int, Int), _ voicing: CompVoicing,
        _ velocity: Int, _ phases: [Int]
    ) -> CompSlot {
        CompSlot(
            offset: ticks(offset.0, offset.1), duration: ticks(duration.0, duration.1),
            voicing: voicing, velocity: velocity, phases: Set(phases)
        )
    }

    private static let defaultBassRegister = Register(low: 28, high: 48, anchor: 45)

    private static let styles: [GrooveStyle: Style] = [
        .ballad: Style(
            id: "ballad-comp@1",
            bass: [
                bass((0, 1), (19, 40), .root, .nearest, 92, [0]),
                bass((0, 1), (7, 2), .root, .registerFloor, 76, [1]),
                bass((1, 2), (19, 40), .root, .nearest, 88, [0]),
                bass((3, 2), (19, 40), .third, .nearest, 86, [0]),
                bass((2, 1), (3, 2), .fifth, .nearest, 84, [0]),
                bass((7, 2), (19, 40), .root, .nearest, 80, [0, 1])
            ],
            comp: [
                comp((0, 1), (33, 40), .all, 90, [0, 1]),
                comp((1, 1), (33, 40), .all, 78, [0, 1]),
                comp((2, 1), (33, 40), .all, 84, [0, 1]),
                comp((3, 1), (33, 40), .all, 76, [0, 1])
            ],
            bassRegister: defaultBassRegister, compRegister: CompRegister(low: 45, high: 68, ceiling: 73),
            cycleVelocity: [0, -5], swingNumerator: 1, swingDenominator: 2
        ),
        .mediumSwing: Style(
            id: "medium-swing@1",
            bass: [
                bass((0, 1), (9, 10), .root, .nearest, 94, [0]),
                bass((1, 1), (9, 10), .fifth, .nearest, 82, [0]),
                bass((2, 1), (9, 10), .third, .nearest, 88, [0]),
                bass((3, 1), (9, 10), .fifth, .nearest, 82, [0])
            ],
            comp: [
                comp((3, 2), (9, 20), .upperVoices, 74, [0]),
                comp((7, 2), (9, 20), .upperVoices, 80, [0])
            ],
            bassRegister: defaultBassRegister, compRegister: CompRegister(low: 60, high: 83, ceiling: 88),
            cycleVelocity: [0], swingNumerator: 1, swingDenominator: 2
        ),
        .bossaNova: Style(
            id: "bossa-nova@1",
            bass: [
                bass((0, 1), (3, 2), .root, .nearest, 90, [0, 1]),
                bass((3, 2), (1, 2), .fifth, .nearest, 76, [0, 1]),
                bass((2, 1), (3, 2), .root, .nearest, 84, [0, 1]),
                bass((7, 2), (19, 40), .fifth, .nearest, 78, [0, 1])
            ],
            comp: [
                comp((0, 1), (3, 4), .upperVoices, 80, [0]),
                comp((3, 2), (1, 2), .upperVoices, 72, [0]),
                comp((5, 2), (1, 2), .upperVoices, 76, [0]),
                comp((1, 2), (1, 2), .upperVoices, 74, [1]),
                comp((2, 1), (3, 4), .upperVoices, 78, [1]),
                comp((7, 2), (19, 40), .upperVoices, 72, [1])
            ],
            bassRegister: defaultBassRegister, compRegister: CompRegister(low: 50, high: 73, ceiling: 78),
            cycleVelocity: [0, -3], swingNumerator: 1, swingDenominator: 2
        ),
        .straightEighths: Style(
            id: "straight-eighths@1",
            bass: [
                bass((0, 1), (9, 10), .root, .nearest, 92, [0, 1]),
                bass((2, 1), (9, 10), .root, .nearest, 86, [0, 1]),
                bass((7, 2), (19, 40), .fifth, .nearest, 78, [1])
            ],
            comp: [
                comp((0, 1), (3, 4), .all, 86, [0, 1]),
                comp((3, 2), (1, 2), .all, 74, [0, 1]),
                comp((2, 1), (3, 4), .all, 80, [0, 1]),
                comp((3, 1), (1, 2), .all, 72, [0, 1])
            ],
            bassRegister: defaultBassRegister, compRegister: CompRegister(low: 48, high: 71, ceiling: 76),
            cycleVelocity: [0, -4], swingNumerator: 1, swingDenominator: 2
        ),
        .uptempoSwing: Style(
            id: "uptempo-swing@1",
            bass: [
                bass((0, 1), (19, 10), .root, .nearest, 94, [0, 1]),
                bass((2, 1), (19, 10), .fifth, .nearest, 86, [0, 1]),
                bass((7, 2), (1, 4), .third, .nearest, 78, [1])
            ],
            comp: [
                comp((3, 2), (9, 20), .upperVoices, 78, [0, 1]),
                comp((3, 1), (9, 20), .upperVoices, 70, [1])
            ],
            bassRegister: defaultBassRegister, compRegister: CompRegister(low: 62, high: 85, ceiling: 90),
            cycleVelocity: [0, -3], swingNumerator: 3, swingDenominator: 5
        ),
        .syncopatedSixteenths: Style(
            id: "syncopated-sixteenths@1",
            bass: [
                bass((0, 1), (7, 16), .root, .nearest, 88, [0]),
                bass((1, 2), (3, 8), .root, .registerFloor, 92, [0]),
                bass((0, 1), (7, 16), .root, .nearest, 88, [1]),
                bass((1, 2), (3, 8), .root, .nearest, 92, [1]),
                bass((0, 1), (7, 16), .root, .nearest, 88, [2]),
                bass((1, 2), (3, 8), .root, .registerFloor, 92, [2]),
                bass((0, 1), (7, 16), .root, .nearest, 92, [3]),
                bass((1, 2), (1, 2), .root, .registerFloor, 84, [3]),
                bass((3, 2), (1, 2), .root, .nearest, 84, [3]),
                bass((5, 2), (3, 8), .third, .nearest, 78, [3]),
                bass((7, 2), (3, 8), .root, .nearest, 66, [3])
            ],
            comp: [
                comp((0, 1), (1, 3), .upperVoices, 89, [0]),
                comp((1, 2), (1, 3), .guideTones, 63, [0]),
                comp((1, 1), (1, 3), .upperVoices, 80, [0]),
                comp((3, 2), (1, 3), .upperVoices, 87, [0]),
                comp((5, 2), (1, 3), .upperVoices, 90, [0]),
                comp((0, 1), (3, 8), .upperVoices, 85, [1]),
                comp((1, 2), (1, 3), .guideTones, 72, [1]),
                comp((1, 1), (3, 8), .upperVoices, 87, [1]),
                comp((2, 1), (3, 8), .upperVoices, 89, [1]),
                comp((3, 1), (3, 8), .upperVoices, 90, [1]),
                comp((0, 1), (1, 3), .upperVoices, 89, [2]),
                comp((1, 2), (1, 3), .guideTones, 63, [2]),
                comp((1, 1), (1, 3), .upperVoices, 80, [2]),
                comp((3, 2), (1, 3), .upperVoices, 87, [2]),
                comp((5, 2), (1, 3), .upperVoices, 90, [2]),
                comp((0, 1), (1, 3), .upperVoices, 86, [3]),
                comp((1, 2), (1, 3), .guideTones, 60, [3]),
                comp((1, 1), (1, 3), .upperVoices, 77, [3]),
                comp((3, 2), (1, 3), .upperVoices, 84, [3]),
                comp((5, 2), (1, 3), .upperVoices, 87, [3])
            ],
            bassRegister: Register(low: 41, high: 61, anchor: 54),
            compRegister: CompRegister(low: 53, high: 76, ceiling: 79),
            cycleVelocity: [0, -2, -1, -3], swingNumerator: 1, swingDenominator: 2
        )
    ]

    static func styleID(for groove: GrooveStyle) -> String {
        styles[groove]?.id ?? ""
    }

    static func compile(_ chart: JazzChart) -> [JazzPerformanceEvent] {
        guard let style = styles[chart.groove] else { return [] }
        let source = JazzTheory.compilePlayback(chart)
        var output: [JazzPerformanceEvent] = []
        var previousBass: Int?
        var previousCompBottom: Int?

        for event in source {
            let eventStart = Int((event.startBeat * Double(ppq)).rounded())
            let eventDuration = Int((event.durationBeats * Double(ppq)).rounded())
            let eventEnd = eventStart + eventDuration
            let measureIndex = eventStart / (4 * ppq)
            let measureStart = measureIndex * 4 * ppq
            let phase = measureIndex % style.cycleVelocity.count
            let accent = style.cycleVelocity[phase]
            let voices = event.midiPitches.sorted()
            guard !voices.isEmpty else { continue }

            var drafts: [Draft] = []
            for (index, slot) in style.bass.enumerated() where slot.phases.contains(phase) {
                let start = measureStart + swung(slot.offset, style: style)
                guard start >= eventStart, start < eventEnd else { continue }
                drafts.append(Draft(
                    role: .bass, slotIndex: index, start: start, duration: slot.duration,
                    velocity: slot.velocity + accent, bassTone: slot.tone,
                    bassPlacement: slot.placement, compVoicing: .all
                ))
            }
            for (index, slot) in style.comp.enumerated() where slot.phases.contains(phase) {
                let start = measureStart + swung(slot.offset, style: style)
                guard start >= eventStart, start < eventEnd else { continue }
                drafts.append(Draft(
                    role: .comp, slotIndex: index, start: start, duration: slot.duration,
                    velocity: slot.velocity + accent, bassTone: .root,
                    bassPlacement: .nearest, compVoicing: slot.voicing
                ))
            }

            addArrivalDraft(role: .bass, eventStart: eventStart, phase: phase, accent: accent, style: style, drafts: &drafts)
            addArrivalDraft(role: .comp, eventStart: eventStart, phase: phase, accent: accent, style: style, drafts: &drafts)
            drafts.sort {
                ($0.start, $0.role == .bass ? 0 : 1, $0.slotIndex)
                    < ($1.start, $1.role == .bass ? 0 : 1, $1.slotIndex)
            }
            drafts = drafts.enumerated().filter { index, draft in
                index == 0 || drafts[index - 1].role != draft.role || drafts[index - 1].start != draft.start
            }.map(\.element)

            if let firstBass = drafts.firstIndex(where: { $0.role == .bass }) {
                drafts[firstBass].bassTone = .root
            }

            for index in drafts.indices {
                let draft = drafts[index]
                let nextSameRole = drafts[(index + 1)...].first(where: { $0.role == draft.role })?.start
                let limit = min(eventEnd, nextSameRole ?? eventEnd)
                let hardEnd = min(draft.start + draft.duration, limit)
                let clearedEnd = min(hardEnd, limit - performanceReleaseGapTicks)
                let end = clearedEnd > draft.start ? clearedEnd : hardEnd
                guard end > draft.start else { continue }

                let pitches: [Int]
                if draft.role == .bass {
                    let sourcePitch = bassPitch(for: draft.bassTone, voices: voices)
                    guard let placed = placeBass(
                        sourcePitch, previous: previousBass,
                        placement: draft.bassPlacement, register: style.bassRegister
                    ) else { continue }
                    previousBass = placed
                    pitches = [placed]
                } else {
                    let chosen = compVoices(voices, rule: draft.compVoicing)
                    guard let placed = placeComp(
                        chosen, bass: previousBass, register: style.compRegister,
                        previousBottom: previousCompBottom
                    ) else { continue }
                    previousCompBottom = placed.first
                    pitches = placed
                }
                let clippedDuration = end - draft.start
                let gateGap = min(playbackReleaseGapTicks, clippedDuration - 1)
                output.append(JazzPerformanceEvent(
                    chordID: event.chordID, role: draft.role, startTick: draft.start,
                    gateDurationTicks: max(1, clippedDuration - gateGap), midiPitches: pitches,
                    velocity: min(127, max(1, draft.velocity))
                ))
            }
        }
        let ordered = output.sorted {
            ($0.startTick, $0.role == .bass ? 0 : 1) < ($1.startTick, $1.role == .bass ? 0 : 1)
        }
        return leadCompRegisters(in: ordered, register: style.compRegister)
    }

    private static func swung(_ offset: Int, style: Style) -> Int {
        let withinBeat = offset % ppq
        guard withinBeat * 2 == ppq else { return offset }
        return offset - withinBeat
            + roundedDivide(ppq * style.swingNumerator, by: style.swingDenominator)
    }

    private static func roundedDivide(_ numerator: Int, by denominator: Int) -> Int {
        (2 * numerator + denominator) / (2 * denominator)
    }

    private static func addArrivalDraft(
        role: JazzPerformanceRole, eventStart: Int, phase: Int, accent: Int,
        style: Style, drafts: inout [Draft]
    ) {
        guard !drafts.contains(where: { $0.role == role && $0.start == eventStart }) else {
            if role == .comp {
                for index in drafts.indices where drafts[index].role == .comp && drafts[index].start == eventStart {
                    if drafts[index].compVoicing == .guideTones { drafts[index].compVoicing = .upperVoices }
                }
            }
            return
        }
        if role == .bass,
           let pair = style.bass.enumerated().first(where: { $0.element.phases.contains(phase) }) {
            let slot = pair.element
            drafts.append(Draft(
                role: .bass, slotIndex: pair.offset, start: eventStart, duration: slot.duration,
                velocity: slot.velocity + accent, bassTone: slot.tone,
                bassPlacement: slot.placement, compVoicing: .all
            ))
        } else if role == .comp,
                  let pair = style.comp.enumerated().first(where: { $0.element.phases.contains(phase) }) {
            let slot = pair.element
            drafts.append(Draft(
                role: .comp, slotIndex: pair.offset, start: eventStart, duration: slot.duration,
                velocity: slot.velocity + accent, bassTone: .root, bassPlacement: .nearest,
                compVoicing: slot.voicing == .guideTones ? .upperVoices : slot.voicing
            ))
        }
    }

    private static func bassPitch(for tone: BassTone, voices: [Int]) -> Int {
        let root = voices[0]
        let rootClass = root % 12
        func find(_ intervals: [Int]) -> Int? {
            for interval in intervals {
                if let match = voices.first(where: { (($0 % 12) - rootClass + 12) % 12 == interval }) {
                    return match
                }
            }
            return nil
        }
        switch tone {
        case .root: return root
        case .third: return find([4, 3]) ?? find([7, 8, 6]) ?? root
        case .fifth: return find([7, 8, 6]) ?? find([4, 3]) ?? root
        }
    }

    private static func placeBass(
        _ pitch: Int, previous: Int?, placement: BassPlacement, register: Register
    ) -> Int? {
        let target = placement == .registerFloor ? register.low : (previous ?? register.anchor)
        var best: Int?
        for candidate in register.low...register.high {
            guard ((candidate - pitch) % 12 + 12) % 12 == 0 else { continue }
            if let current = best {
                if (abs(candidate - target), candidate) < (abs(current - target), current) {
                    best = candidate
                }
            } else {
                best = candidate
            }
        }
        return best
    }

    private static func compVoices(_ voices: [Int], rule: CompVoicing) -> [Int] {
        let keep: Int
        switch rule {
        case .all: return voices
        case .upperVoices: keep = 3
        case .guideTones: keep = 2
        }
        return voices.count > keep ? Array(voices.suffix(keep)) : voices
    }

    private static func placeComp(
        _ voices: [Int], bass: Int?, register: CompRegister, previousBottom: Int?
    ) -> [Int]? {
        var work = voices
        while work.count > 3, let first = work.first, let last = work.last, last - first > 19 {
            work.removeFirst()
        }
        let floor = max(register.low, (bass ?? (register.low - 4)) + 4)
        let leadFrom = previousBottom ?? register.low
        while !work.isEmpty {
            guard let first = work.first, let last = work.last else { return nil }
            let homeShift = floorDivide(register.low - first + 11, by: 12)
            let candidates = [homeShift, homeShift + 1].filter {
                first + 12 * $0 >= floor && first + 12 * $0 <= register.high
                    && last + 12 * $0 <= register.ceiling
            }
            if let shift = candidates.min(by: {
                (abs(first + 12 * $0 - leadFrom), $0) < (abs(first + 12 * $1 - leadFrom), $1)
            }) {
                return work.map { $0 + 12 * shift }
            }
            if work.count == 1 { return work.map { $0 + 12 * (homeShift + 1) } }
            work.removeFirst()
        }
        return nil
    }

    /// Exact native counterpart of the source `leadCompRegisters` policy V2.
    /// It finds the whole-phrase minimum rather than committing greedily at the
    /// opening chord, and accounts for every bass held during a comp gate.
    static func leadCompRegisters(
        in events: [JazzPerformanceEvent], register: CompRegister
    ) -> [JazzPerformanceEvent] {
        let bassEvents = events.filter { $0.role == .bass }
        var layers: [ContinuityLayer] = []
        var latestBass: Int?

        for (eventIndex, event) in events.enumerated() {
            if event.role == .bass {
                latestBass = event.midiPitches.first
                continue
            }
            guard let highest = event.midiPitches.last else { continue }
            var floor = max(register.low, (latestBass ?? (register.low - 4)) + 4)
            for held in bassEvents where held.startTick < event.startTick + event.gateDurationTicks
                && event.startTick < held.startTick + held.gateDurationTicks {
                if let pitch = held.midiPitches.first { floor = max(floor, pitch + 4) }
            }

            var states: [ContinuityState] = []
            for dropCount in event.midiPitches.indices {
                let bottom = event.midiPitches[dropCount]
                let home = floorDivide(register.low - bottom + 11, by: 12)
                let shifts = [home, home + 1].filter { shift in
                    bottom + 12 * shift >= floor
                        && bottom + 12 * shift <= register.high
                        && highest + 12 * shift <= register.ceiling
                }
                guard !shifts.isEmpty else { continue }

                for shift in shifts {
                    let notes = event.midiPitches.dropFirst(dropCount).map { $0 + 12 * shift }
                    if let previous = layers.last?.states {
                        var best: ContinuityState?
                        for (predecessor, prefix) in previous.enumerated() {
                            let edge = alignmentCost(from: prefix.notes, to: notes)
                            guard let prefixBottom = prefix.notes.first else { continue }
                            let cost = prefix.cost.adding(
                                edge,
                                bottomMotion: abs(bottom + 12 * shift - prefixBottom)
                            )
                            let candidate = ContinuityState(
                                shift: shift, dropCount: dropCount, notes: notes,
                                cost: cost, predecessor: predecessor
                            )
                            if best == nil || costLess(cost, than: best!.cost) { best = candidate }
                        }
                        if let best { states.append(best) }
                    } else {
                        states.append(ContinuityState(
                            shift: shift, dropCount: dropCount, notes: notes,
                            cost: ContinuityCost(alignment: 0, gaps: 0, bottomMotion: 0),
                            predecessor: -1
                        ))
                    }
                }
                break
            }
            guard !states.isEmpty else { continue }
            layers.append(ContinuityLayer(eventIndex: eventIndex, states: states))
        }

        guard let last = layers.last else { return events }
        var winner = 0
        for index in last.states.indices.dropFirst()
            where costLess(last.states[index].cost, than: last.states[winner].cost) {
            winner = index
        }
        var placements: [Int: (shift: Int, dropCount: Int)] = [:]
        for layer in layers.reversed() {
            guard layer.states.indices.contains(winner) else { return events }
            let state = layer.states[winner]
            placements[layer.eventIndex] = (state.shift, state.dropCount)
            winner = state.predecessor
        }

        var result = events
        for (eventIndex, placement) in placements {
            result[eventIndex].midiPitches = result[eventIndex].midiPitches
                .dropFirst(placement.dropCount)
                .map { $0 + 12 * placement.shift }
        }
        return result
    }

    private static func alignmentCost(from: [Int], to: [Int]) -> ContinuityCost {
        var row = (0...to.count).map {
            ContinuityCost(alignment: 12 * $0, gaps: $0, bottomMotion: 0)
        }
        for (fromIndex, fromPitch) in from.enumerated() {
            var next = [ContinuityCost(
                alignment: 12 * (fromIndex + 1), gaps: fromIndex + 1, bottomMotion: 0
            )]
            for (toIndex, toPitch) in to.enumerated() {
                let diagonal = row[toIndex]
                let above = row[toIndex + 1]
                let left = next[toIndex]
                let options = [
                    ContinuityCost(
                        alignment: diagonal.alignment + abs(fromPitch - toPitch),
                        gaps: diagonal.gaps, bottomMotion: 0
                    ),
                    ContinuityCost(
                        alignment: above.alignment + 12, gaps: above.gaps + 1,
                        bottomMotion: 0
                    ),
                    ContinuityCost(
                        alignment: left.alignment + 12, gaps: left.gaps + 1,
                        bottomMotion: 0
                    )
                ]
                next.append(options.dropFirst().reduce(options[0]) {
                    costLess($1, than: $0) ? $1 : $0
                })
            }
            row = next
        }
        return row[to.count]
    }

    private static func costLess(_ left: ContinuityCost, than right: ContinuityCost) -> Bool {
        if left.alignment != right.alignment { return left.alignment < right.alignment }
        if left.gaps != right.gaps { return left.gaps < right.gaps }
        return left.bottomMotion < right.bottomMotion
    }

    private static func floorDivide(_ value: Int, by divisor: Int) -> Int {
        let remainder = ((value % divisor) + divisor) % divisor
        return (value - remainder) / divisor
    }
}

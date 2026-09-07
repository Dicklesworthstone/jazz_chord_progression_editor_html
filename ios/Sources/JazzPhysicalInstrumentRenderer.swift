import Foundation
import FrankenJazzDSP

struct JazzPhysicalInstrumentMetadata: Equatable, Sendable {
    var algorithmID: String
    var maximumRenderSeconds: Double
    var bufferCacheLimit: Int
    var outputLevel: Double
    var packIndex: Int32?
    var courseOpenMIDIs: [Int]
}

struct JazzPhysicalRender: Sendable {
    var algorithmID: String
    var requestedMIDIPitch: Int
    var renderedMIDIPitches: [Int]
    var left: [Float]
    var right: [Float]
    var sampleRate: Double
}

struct JazzPhysicalCacheSnapshot: Equatable, Sendable {
    var entryCount: Int
    var hitCount: Int
    var missCount: Int
    var evictionCount: Int
}

struct JazzPhysicalGlobalCacheSnapshot: Equatable, Sendable {
    var entryCount: Int
    var pcmByteCount: Int
}

/// Native host for the exact Rust renderer source used by the original web
/// app. The original DSP owns process-global scratch for some physical models,
/// so every FFI call is serialized even though chart renders run off-main.
enum JazzPhysicalInstrumentRenderer {
    private struct RenderCacheKey: Hashable, Sendable {
        var midis: [Int]
        var velocities: [Int]
        var sampleRateBits: UInt64
        var maximumFrames: Int
    }

    private struct CachedPCM: Sendable {
        var left: [Float]
        var right: [Float]

        var byteCount: Int { (left.count + right.count) * MemoryLayout<Float>.size }
    }

    private final class RenderCache: @unchecked Sendable {
        private struct State {
            var values: [RenderCacheKey: CachedPCM] = [:]
            var recency: [RenderCacheKey] = []
            var hitCount = 0
            var missCount = 0
            var evictionCount = 0
        }

        private struct GlobalKey: Hashable {
            var tone: InstrumentTone
            var render: RenderCacheKey
        }

        private let lock = NSLock()
        private var states: [InstrumentTone: State] = [:]
        private var globalRecency: [GlobalKey] = []
        private var totalPCMBytes = 0

        func value(for key: RenderCacheKey, tone: InstrumentTone) -> CachedPCM? {
            lock.lock()
            defer { lock.unlock() }
            var state = states[tone] ?? State()
            guard let value = state.values[key] else {
                state.missCount += 1
                states[tone] = state
                return nil
            }
            state.hitCount += 1
            state.recency.removeAll { $0 == key }
            state.recency.append(key)
            states[tone] = state
            let globalKey = GlobalKey(tone: tone, render: key)
            globalRecency.removeAll { $0 == globalKey }
            globalRecency.append(globalKey)
            return value
        }

        func insert(_ value: CachedPCM, for key: RenderCacheKey, tone: InstrumentTone, limit: Int) {
            lock.lock()
            defer { lock.unlock() }
            var state = states[tone] ?? State()
            if let previous = state.values[key] {
                totalPCMBytes -= previous.byteCount
            }
            state.values[key] = value
            state.recency.removeAll { $0 == key }
            state.recency.append(key)
            states[tone] = state
            totalPCMBytes += value.byteCount
            let globalKey = GlobalKey(tone: tone, render: key)
            globalRecency.removeAll { $0 == globalKey }
            globalRecency.append(globalKey)
            while (states[tone]?.recency.count ?? 0) > limit,
                  let oldest = states[tone]?.recency.first {
                evict(oldest, tone: tone)
            }
            while globalRecency.count > JazzPhysicalInstrumentRenderer.maximumGlobalCacheEntries ||
                    totalPCMBytes > JazzPhysicalInstrumentRenderer.maximumGlobalCachePCMBytes,
                  let oldest = globalRecency.first {
                evict(oldest.render, tone: oldest.tone)
            }
        }

        func snapshot(for tone: InstrumentTone) -> JazzPhysicalCacheSnapshot {
            lock.lock()
            defer { lock.unlock() }
            let state = states[tone] ?? State()
            return JazzPhysicalCacheSnapshot(
                entryCount: state.values.count,
                hitCount: state.hitCount,
                missCount: state.missCount,
                evictionCount: state.evictionCount
            )
        }

        func reset() {
            lock.lock()
            states.removeAll(keepingCapacity: false)
            globalRecency.removeAll(keepingCapacity: false)
            totalPCMBytes = 0
            lock.unlock()
        }

        func globalSnapshot() -> JazzPhysicalGlobalCacheSnapshot {
            lock.lock()
            defer { lock.unlock() }
            return JazzPhysicalGlobalCacheSnapshot(
                entryCount: globalRecency.count,
                pcmByteCount: totalPCMBytes
            )
        }

        private func evict(_ key: RenderCacheKey, tone: InstrumentTone) {
            var state = states[tone] ?? State()
            if let removed = state.values.removeValue(forKey: key) {
                totalPCMBytes -= removed.byteCount
                state.evictionCount += 1
            }
            state.recency.removeAll { $0 == key }
            states[tone] = state
            let globalKey = GlobalKey(tone: tone, render: key)
            globalRecency.removeAll { $0 == globalKey }
        }
    }

    static let minimumMIDIPitch = 21
    static let maximumMIDIPitch = 108
    static let minimumVelocity = 1
    static let maximumVelocity = 127
    static let minimumSampleRate = 8_000.0
    static let maximumSampleRate = 96_000.0
    static let maximumGlobalCacheEntries = 256
    static let maximumGlobalCachePCMBytes = 100_663_296
    private static let truncationFadeSeconds = 0.015
    private static let engineLock = NSLock()
    private static let renderCache = RenderCache()

    private static let metadataByTone: [InstrumentTone: JazzPhysicalInstrumentMetadata] = [
        .concertGrand: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.concert-grand@1",
            maximumRenderSeconds: 8,
            bufferCacheLimit: 96,
            outputLevel: 0.3,
            packIndex: nil,
            courseOpenMIDIs: []
        ),
        .flute: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.waveguide-flute@2",
            maximumRenderSeconds: 5,
            bufferCacheLimit: 64,
            outputLevel: 2.8,
            packIndex: nil,
            courseOpenMIDIs: []
        ),
        .guitar: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.plucked-archtop@2",
            maximumRenderSeconds: 6,
            bufferCacheLimit: 64,
            outputLevel: 0.5,
            packIndex: 0,
            courseOpenMIDIs: [40, 45, 50, 55, 59, 64]
        ),
        .bluesGuitar: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.plucked-electric@2",
            maximumRenderSeconds: 6,
            bufferCacheLimit: 64,
            outputLevel: 0.46,
            packIndex: 1,
            courseOpenMIDIs: [40, 45, 50, 55, 59, 64]
        ),
        .clarinet: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.waveguide-clarinet@1",
            maximumRenderSeconds: 5,
            bufferCacheLimit: 128,
            outputLevel: 1.1,
            packIndex: nil,
            courseOpenMIDIs: []
        ),
        .dreadnoughtGuitar: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.plucked-dreadnought@1",
            maximumRenderSeconds: 5,
            bufferCacheLimit: 64,
            outputLevel: 0.5,
            packIndex: 2,
            courseOpenMIDIs: [40, 45, 50, 55, 59, 64]
        ),
        .ukulele: JazzPhysicalInstrumentMetadata(
            algorithmID: "changes.dsp.plucked-ukulele@1",
            maximumRenderSeconds: 3,
            bufferCacheLimit: 64,
            outputLevel: 0.65,
            packIndex: 3,
            courseOpenMIDIs: [67, 60, 64, 69]
        )
    ]

    static func metadata(for tone: InstrumentTone) -> JazzPhysicalInstrumentMetadata? {
        metadataByTone[tone]
    }

    static func render(
        tone: InstrumentTone,
        midi: Int,
        velocity: Int,
        sampleRate: Double,
        maximumSeconds: Double? = nil,
        cancellation: JazzRenderCancellationToken? = nil
    ) -> JazzPhysicalRender? {
        guard let metadata = metadata(for: tone),
              (minimumMIDIPitch...maximumMIDIPitch).contains(midi),
              (minimumVelocity...maximumVelocity).contains(velocity),
              sampleRate.isFinite,
              (minimumSampleRate...maximumSampleRate).contains(sampleRate),
              maximumSeconds == nil || (maximumSeconds?.isFinite == true && (maximumSeconds ?? 0) > 0)
        else { return nil }

        let renderedMidi = tone.renderedMIDIPitch(for: midi)
        let naturalFrames = noteFrames(tone: tone, midi: renderedMidi, sampleRate: sampleRate)
        let seconds = min(maximumSeconds ?? metadata.maximumRenderSeconds, metadata.maximumRenderSeconds)
        let maximumFrames = min(naturalFrames, Int(floor(seconds * sampleRate)))
        guard naturalFrames > 0, maximumFrames > 0 else { return nil }
        let key = RenderCacheKey(
            midis: [renderedMidi],
            velocities: [velocity],
            sampleRateBits: sampleRate.bitPattern,
            maximumFrames: maximumFrames
        )
        guard cancellation?.isCancelled != true else { return nil }
        if let cached = renderCache.value(for: key, tone: tone) {
            guard cancellation?.isCancelled != true else { return nil }
            return JazzPhysicalRender(
                algorithmID: metadata.algorithmID,
                requestedMIDIPitch: midi,
                renderedMIDIPitches: [renderedMidi],
                left: cached.left,
                right: cached.right,
                sampleRate: sampleRate
            )
        }

        var left = [Float](repeating: 0, count: maximumFrames)
        var right = [Float](repeating: 0, count: maximumFrames)
        engineLock.lock()
        let written: Int
        if cancellation?.isCancelled == true {
            written = 0
        } else if tone == .concertGrand {
            written = renderConcertGrandCooperativelyLocked(
                midi: renderedMidi,
                velocity: velocity,
                sampleRate: sampleRate,
                left: &left,
                right: &right,
                maximumFrames: maximumFrames,
                cancellation: cancellation
            )
        } else {
            written = renderLocked(
                tone: tone,
                midi: renderedMidi,
                velocity: velocity,
                sampleRate: sampleRate,
                left: &left,
                right: &right,
                maximumFrames: maximumFrames
            )
        }
        engineLock.unlock()
        guard cancellation?.isCancelled != true else { return nil }
        guard written > 0, written <= maximumFrames else { return nil }
        left.removeSubrange(written...)
        right.removeSubrange(written...)
        if tone == .concertGrand {
            JazzPianoAttackLayer.apply(
                left: &left,
                right: &right,
                midi: renderedMidi,
                velocity: velocity,
                sampleRate: sampleRate
            )
        }
        guard left.allSatisfy(\.isFinite), right.allSatisfy(\.isFinite) else { return nil }
        applyTruncationFade(
            left: &left,
            right: &right,
            wasTruncated: tone != .concertGrand && written == maximumFrames && maximumFrames < naturalFrames,
            sampleRate: sampleRate
        )
        guard cancellation?.isCancelled != true else { return nil }
        let cached = CachedPCM(left: left, right: right)
        renderCache.insert(cached, for: key, tone: tone, limit: metadata.bufferCacheLimit)
        return JazzPhysicalRender(
            algorithmID: metadata.algorithmID,
            requestedMIDIPitch: midi,
            renderedMIDIPitches: [renderedMidi],
            left: left,
            right: right,
            sampleRate: sampleRate
        )
    }

    static func renderChord(
        tone: InstrumentTone,
        midis requestedMIDIs: [Int],
        velocity: Int,
        sampleRate: Double,
        maximumSeconds: Double,
        cancellation: JazzRenderCancellationToken? = nil
    ) -> JazzPhysicalRender? {
        guard let metadata = metadata(for: tone),
              let packIndex = metadata.packIndex,
              !requestedMIDIs.isEmpty,
              requestedMIDIs.allSatisfy({ (minimumMIDIPitch...maximumMIDIPitch).contains($0) }),
              (minimumVelocity...maximumVelocity).contains(velocity),
              sampleRate.isFinite,
              (minimumSampleRate...maximumSampleRate).contains(sampleRate),
              maximumSeconds.isFinite,
              maximumSeconds > 0
        else { return nil }

        let renderedMIDIs = canonicalPluckedVoicing(
            requestedMIDIs.map { tone.renderedMIDIPitch(for: $0) },
            openStrings: metadata.courseOpenMIDIs
        )
        guard !renderedMIDIs.isEmpty else { return nil }
        let velocities = [Int](repeating: velocity, count: renderedMIDIs.count)
        let naturalFrames = Int(plk2_note_frames(packIndex, Int32(renderedMIDIs[0]), Float(sampleRate)))
        let maximumFrames = min(
            naturalFrames,
            Int(floor(min(maximumSeconds, metadata.maximumRenderSeconds) * sampleRate))
        )
        guard naturalFrames > 0, maximumFrames > 0 else { return nil }
        let key = RenderCacheKey(
            midis: renderedMIDIs,
            velocities: velocities,
            sampleRateBits: sampleRate.bitPattern,
            maximumFrames: maximumFrames
        )
        guard cancellation?.isCancelled != true else { return nil }
        if let cached = renderCache.value(for: key, tone: tone) {
            guard cancellation?.isCancelled != true else { return nil }
            return JazzPhysicalRender(
                algorithmID: metadata.algorithmID,
                requestedMIDIPitch: requestedMIDIs[0],
                renderedMIDIPitches: renderedMIDIs,
                left: cached.left,
                right: cached.right,
                sampleRate: sampleRate
            )
        }

        let midi32 = renderedMIDIs.map(Int32.init)
        let velocity32 = velocities.map(Int32.init)
        var left = [Float](repeating: 0, count: maximumFrames)
        var right = [Float](repeating: 0, count: maximumFrames)
        engineLock.lock()
        let written = cancellation?.isCancelled == true ? 0 : renderPluckedChordCooperativelyLocked(
            packIndex: packIndex,
            midis: midi32,
            velocities: velocity32,
            sampleRate: sampleRate,
            left: &left,
            right: &right,
            maximumFrames: maximumFrames,
            cancellation: cancellation
        )
        engineLock.unlock()
        guard cancellation?.isCancelled != true else { return nil }
        guard written > 0, written <= maximumFrames else { return nil }
        left.removeSubrange(written...)
        right.removeSubrange(written...)
        guard left.allSatisfy(\.isFinite), right.allSatisfy(\.isFinite) else { return nil }
        applyTruncationFade(left: &left, right: &right, wasTruncated: written == maximumFrames && maximumFrames < naturalFrames, sampleRate: sampleRate)
        guard cancellation?.isCancelled != true else { return nil }
        let cached = CachedPCM(left: left, right: right)
        renderCache.insert(cached, for: key, tone: tone, limit: metadata.bufferCacheLimit)
        return JazzPhysicalRender(
            algorithmID: metadata.algorithmID,
            requestedMIDIPitch: requestedMIDIs[0],
            renderedMIDIPitches: renderedMIDIs,
            left: left,
            right: right,
            sampleRate: sampleRate
        )
    }

    static func cacheSnapshot(for tone: InstrumentTone) -> JazzPhysicalCacheSnapshot {
        renderCache.snapshot(for: tone)
    }

    static func resetCacheForTesting() {
        renderCache.reset()
    }

    static func globalCacheSnapshot() -> JazzPhysicalGlobalCacheSnapshot {
        renderCache.globalSnapshot()
    }

    private static func noteFrames(tone: InstrumentTone, midi: Int, sampleRate: Double) -> Int {
        switch tone {
        case .concertGrand:
            return Int(cg_note_frames(Int32(midi), Float(sampleRate)))
        case .flute:
            return Int(flt2_note_frames(Int32(midi), Float(sampleRate)))
        case .clarinet:
            return Int(clr_note_frames(Int32(midi), Float(sampleRate)))
        case .guitar, .bluesGuitar, .dreadnoughtGuitar, .ukulele:
            guard let pack = metadata(for: tone)?.packIndex else { return 0 }
            return Int(plk2_note_frames(pack, Int32(midi), Float(sampleRate)))
        default:
            return 0
        }
    }

    private static func renderLocked(
        tone: InstrumentTone,
        midi: Int,
        velocity: Int,
        sampleRate: Double,
        left: inout [Float],
        right: inout [Float],
        maximumFrames: Int
    ) -> Int {
        left.withUnsafeMutableBufferPointer { leftBuffer in
            right.withUnsafeMutableBufferPointer { rightBuffer in
                switch tone {
                case .concertGrand:
                    return Int(cg_render(
                        Int32(midi), Int32(velocity), Float(sampleRate),
                        leftBuffer.baseAddress, rightBuffer.baseAddress, Int32(maximumFrames)
                    ))
                case .flute:
                    let stateCapacity = Int(flt2_state_max_bytes())
                    guard stateCapacity > 0 else { return 0 }
                    var state = [UInt8](repeating: 0, count: stateCapacity)
                    let certifiedVelocity = min(velocity, midi >= 72 ? 72 : 90)
                    return state.withUnsafeMutableBufferPointer { stateBuffer in
                        Int(flt2_render_phrase(
                            Int32(midi), Int32(certifiedVelocity), Float(sampleRate),
                            0, 1,
                            leftBuffer.baseAddress, rightBuffer.baseAddress, Int32(maximumFrames),
                            nil, 0, stateBuffer.baseAddress, Int32(stateCapacity)
                        ))
                    }
                case .clarinet:
                    return Int(clr_render(
                        Int32(midi), Int32(velocity), Float(sampleRate),
                        leftBuffer.baseAddress, rightBuffer.baseAddress, Int32(maximumFrames)
                    ))
                case .guitar, .bluesGuitar, .dreadnoughtGuitar, .ukulele:
                    guard let pack = metadata(for: tone)?.packIndex else { return 0 }
                    return Int(plk2_render(
                        pack, Int32(midi), Int32(velocity), Float(sampleRate),
                        leftBuffer.baseAddress, rightBuffer.baseAddress, Int32(maximumFrames)
                    ))
                default:
                    return 0
                }
            }
        }
    }

    /// Uses the exact bounded runtime already exercised by the original web
    /// app. Every incomplete call advances at most one Rust work quantum.
    private static func renderConcertGrandCooperativelyLocked(
        midi: Int,
        velocity: Int,
        sampleRate: Double,
        left: inout [Float],
        right: inout [Float],
        maximumFrames: Int,
        cancellation: JazzRenderCancellationToken?
    ) -> Int {
        let maximumSteps = Int(cg_runtime_max_steps(Int32(maximumFrames)))
        guard maximumSteps > 0 else { return 0 }
        var handle = Int32(cg_runtime_init(
            Int32(midi), Int32(velocity), Float(sampleRate), Int32(maximumFrames)
        ))
        guard handle > 0 else { return 0 }
        defer {
            if handle > 0 { _ = cg_runtime_reset(handle) }
        }
        return left.withUnsafeMutableBufferPointer { leftBuffer in
            right.withUnsafeMutableBufferPointer { rightBuffer in
                for _ in 0..<maximumSteps {
                    guard cancellation?.isCancelled != true else { return 0 }
                    let status = cg_runtime_step(
                        handle,
                        leftBuffer.baseAddress,
                        rightBuffer.baseAddress,
                        Int32(maximumFrames)
                    )
                    if status == 2 {
                        let written = Int(cg_runtime_written_frames(handle))
                        guard cg_runtime_reset(handle) == 1 else { return 0 }
                        handle = 0
                        return written
                    }
                    guard status == 1,
                          cancellation?.completedCooperativeStep() != false
                    else { return 0 }
                }
                return 0
            }
        }
    }

    /// Simultaneous guitar-family voicings use the same opaque cooperative
    /// session as the web app, preserving the one-body model and bit identity.
    private static func renderPluckedChordCooperativelyLocked(
        packIndex: Int32,
        midis: [Int32],
        velocities: [Int32],
        sampleRate: Double,
        left: inout [Float],
        right: inout [Float],
        maximumFrames: Int,
        cancellation: JazzRenderCancellationToken?
    ) -> Int {
        let maximumSteps = Int(plk2_chord_runtime_max_steps(Int32(maximumFrames)))
        guard maximumSteps > 0 else { return 0 }
        return midis.withUnsafeBufferPointer { midiBuffer in
            velocities.withUnsafeBufferPointer { velocityBuffer in
                var handle = Int32(plk2_chord_runtime_init(
                    packIndex,
                    midiBuffer.baseAddress,
                    velocityBuffer.baseAddress,
                    Int32(midis.count),
                    Float(sampleRate),
                    Int32(maximumFrames)
                ))
                guard handle > 0 else { return 0 }
                let runtimeHandle = handle
                let cancellationHandler = cancellation?.registerCancellationHandler {
                    _ = plk2_chord_runtime_cancel(runtimeHandle)
                }
                defer {
                    cancellation?.unregisterCancellationHandler(cancellationHandler)
                    if handle > 0 { _ = plk2_chord_runtime_reset(handle) }
                }
                guard cancellation?.enteredCooperativeRuntime() != false else { return 0 }
                return left.withUnsafeMutableBufferPointer { leftBuffer in
                    right.withUnsafeMutableBufferPointer { rightBuffer in
                        for _ in 0..<maximumSteps {
                            guard cancellation?.isCancelled != true else { return 0 }
                            let status = plk2_chord_runtime_step(
                                handle,
                                leftBuffer.baseAddress,
                                rightBuffer.baseAddress,
                                Int32(maximumFrames)
                            )
                            if status == 2 {
                                // Completion consumes the opaque Rust session and
                                // makes its handle stale. Reset is only for an
                                // incomplete exit from this loop.
                                handle = 0
                                return maximumFrames
                            }
                            if status == 3 { return 0 }
                            guard status == 1,
                                  cancellation?.completedCooperativeStep() != false
                            else { return 0 }
                        }
                        return 0
                    }
                }
            }
        }
    }

    private static func canonicalPluckedVoicing(_ pitches: [Int], openStrings: [Int]) -> [Int] {
        guard !openStrings.isEmpty else { return [] }
        var result = Array(pitches.sorted().prefix(openStrings.count))
        let floorPitch = openStrings.min() ?? minimumMIDIPitch
        var guardCount = 0
        while !pluckedAssignmentFeasible(result, openStrings: openStrings), guardCount < 16 {
            guardCount += 1
            if result.allSatisfy({ $0 - 12 >= floorPitch }) {
                result = result.map { $0 - 12 }
            } else if result.count > 1 {
                result.removeLast()
            } else {
                break
            }
        }
        return pluckedAssignmentFeasible(result, openStrings: openStrings) ? result : []
    }

    private static func pluckedAssignmentFeasible(_ pitches: [Int], openStrings: [Int]) -> Bool {
        guard !pitches.isEmpty, pitches.count <= openStrings.count else { return false }
        func assign(_ noteIndex: Int, usedCourses: Int) -> Bool {
            if noteIndex == pitches.count { return true }
            for course in openStrings.indices where usedCourses & (1 << course) == 0 {
                let fret = pitches[noteIndex] - openStrings[course]
                if (0...24).contains(fret), assign(noteIndex + 1, usedCourses: usedCourses | (1 << course)) {
                    return true
                }
            }
            return false
        }
        return assign(0, usedCourses: 0)
    }

    private static func applyTruncationFade(
        left: inout [Float],
        right: inout [Float],
        wasTruncated: Bool,
        sampleRate: Double
    ) {
        guard wasTruncated else { return }
        let fadeFrames = min(Int(round(truncationFadeSeconds * sampleRate)), left.count)
        guard fadeFrames > 0 else { return }
        for index in 0..<fadeFrames {
            let gain = Float(fadeFrames - index) / Float(fadeFrames)
            let frame = left.count - fadeFrames + index
            left[frame] *= gain
            right[frame] *= gain
        }
    }
}

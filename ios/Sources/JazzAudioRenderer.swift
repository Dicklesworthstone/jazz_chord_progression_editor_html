import Foundation

struct JazzRenderedAudio: Sendable {
    var left: [Float]
    var right: [Float]
    var sampleRate: Double
}

enum JazzAudioRenderer {
    private static let sampleRate = 24_000.0
    private static let maximumSeconds = 12.0 * 60.0
    private static let cancellationQuantumFrames = 2_048
    static let transportClickAccentMIDIPitch = 88
    static let transportClickBeatMIDIPitch = 81
    static let transportClickGateSeconds = 0.06

    private struct StereoBuffer {
        var left: [Float]
        var right: [Float]
    }

    private struct NoteRequest {
        var midi: Int
        var velocity: Double
        /// Original 1...127 performance velocity. Synthetic recipes use this
        /// for both the Web Audio velocity curve and velocity-sensitive FM.
        var midiVelocity: Int
        /// Chord-wide headroom is independent of performance velocity in the
        /// original engine (`outputLevel / sqrt(voiceCount)`).
        var normalizationGain: Double
        var start: Int
        var duration: Double
        var tone: InstrumentTone
        var pan: Double
    }

    nonisolated static func signature(for chart: JazzChart) -> String {
        let chords = chart.measures.flatMap(\.chords)
        let changes = chords.map { chord -> String in
                let realization: String
                if let pitches = chord.manualMIDIPitches {
                    realization = "manual[" + pitches.map(String.init).joined(separator: ".") + "]"
                } else if let pitches = chord.frozenMIDIPitches {
                    realization = "frozen[" + pitches.map(String.init).joined(separator: ".") + "]"
                } else {
                    realization = "automatic"
                }
                return "\(chord.symbol):\(chord.beats):\(realization)"
            }
            .joined(separator: ",")
        return [
            String(chart.tempoBPM),
            chart.groove.rawValue,
            chart.instrument.originalID,
            chart.voicingFamily.rawValue,
            changes
        ].joined(separator: "-")
    }

    nonisolated static func render(
        chart: JazzChart,
        cancellation: JazzRenderCancellationToken? = nil
    ) -> JazzRenderedAudio? {
        guard cancellation?.isCancelled != true else { return nil }
        let totalSeconds = chart.durationBeats * 60 / chart.tempoBPM
        guard totalSeconds > 0, totalSeconds <= maximumSeconds else { return nil }
        let frameCount = Int((totalSeconds + 0.35) * sampleRate)
        guard frameCount > 0, frameCount <= Int(sampleRate * (maximumSeconds + 1)) else { return nil }

        var stereo = StereoBuffer(
            left: [Float](repeating: 0, count: frameCount),
            right: [Float](repeating: 0, count: frameCount)
        )
        guard cancellation?.isCancelled != true,
              mixPerformance(chart, into: &stereo, cancellation: cancellation),
              validateFinite(stereo, cancellation: cancellation)
        else { return nil }
        return JazzRenderedAudio(left: stereo.left, right: stereo.right, sampleRate: sampleRate)
    }

    /// Renders one short, bounded note for the inspector piano. This function
    /// is deliberately pure: tests can verify every instrument without
    /// starting AVAudioEngine or sending samples to an output device.
    nonisolated static func renderPreview(
        midi: Int,
        tone: InstrumentTone,
        duration: Double = 0.82,
        cancellation: JazzRenderCancellationToken? = nil
    ) -> JazzRenderedAudio? {
        guard cancellation?.isCancelled != true,
              (21...108).contains(midi),
              duration.isFinite,
              (0.08...3).contains(duration)
        else { return nil }
        let frameCount = Int((duration + 0.04) * sampleRate)
        var stereo = StereoBuffer(
            left: [Float](repeating: 0, count: frameCount),
            right: [Float](repeating: 0, count: frameCount)
        )
        guard mixNote(
            NoteRequest(
                midi: midi, velocity: 0.62, midiVelocity: 96, normalizationGain: 1,
                start: 0, duration: duration, tone: tone, pan: 0
            ),
            into: &stereo,
            cancellation: cancellation
        ), validateFinite(stereo, cancellation: cancellation) else { return nil }
        return JazzRenderedAudio(left: stereo.left, right: stereo.right, sampleRate: sampleRate)
    }

    /// Renders a bounded simultaneous chord through the same instrument route
    /// as chart playback. This is still pure and never starts an audio device.
    nonisolated static func renderPreviewChord(
        midis: [Int],
        tone: InstrumentTone,
        duration: Double = 1.15,
        cancellation: JazzRenderCancellationToken? = nil
    ) -> JazzRenderedAudio? {
        let pitches = Array(Set(midis)).sorted()
        guard cancellation?.isCancelled != true,
              (1...10).contains(pitches.count),
              pitches.allSatisfy({ (21...108).contains($0) }),
              duration.isFinite,
              (0.08...3).contains(duration)
        else { return nil }
        let frameCount = Int((duration + 0.04) * sampleRate)
        var stereo = StereoBuffer(
            left: [Float](repeating: 0, count: frameCount),
            right: [Float](repeating: 0, count: frameCount)
        )
        if let chord = JazzPhysicalInstrumentRenderer.renderChord(
            tone: tone,
            midis: pitches,
            velocity: 96,
            sampleRate: sampleRate,
            maximumSeconds: duration,
            cancellation: cancellation
        ) {
            guard mixPhysicalChord(
                chord,
                tone: tone,
                voiceCount: pitches.count,
                start: 0,
                into: &stereo,
                cancellation: cancellation
            ) else { return nil }
        } else {
            for (index, midi) in pitches.enumerated() {
                let pan = pitches.count == 1
                    ? 0
                    : Double(index) / Double(pitches.count - 1) * 0.7 - 0.35
                guard mixNote(
                    NoteRequest(
                        midi: midi,
                        velocity: 0.72 / sqrt(Double(pitches.count)),
                        midiVelocity: 96,
                        normalizationGain: 1 / sqrt(Double(pitches.count)),
                        start: 0,
                        duration: duration,
                        tone: tone,
                        pan: pan
                    ),
                    into: &stereo,
                    cancellation: cancellation
                ) else { return nil }
            }
        }
        guard validateFinite(stereo, cancellation: cancellation) else { return nil }
        return JazzRenderedAudio(left: stereo.left, right: stereo.right, sampleRate: sampleRate)
    }

    /// One bounded 4/4 bar of the original transport's vibraphone clicks.
    /// The engine loops or queues this tiny bar instead of allocating a
    /// chart-length metronome track.
    nonisolated static func renderTransportClickBar(tempoBPM: Double) -> JazzRenderedAudio? {
        guard tempoBPM.isFinite, (30...320).contains(tempoBPM) else { return nil }
        let beatSeconds = 60 / tempoBPM
        let frameCount = Int(ceil(4 * beatSeconds * sampleRate))
        guard frameCount > 0 else { return nil }
        var stereo = StereoBuffer(
            left: [Float](repeating: 0, count: frameCount),
            right: [Float](repeating: 0, count: frameCount)
        )
        for beat in 0..<4 {
            let accent = beat == 0
            guard mixNote(
                NoteRequest(
                    midi: accent ? transportClickAccentMIDIPitch : transportClickBeatMIDIPitch,
                    velocity: accent ? 0.50 : 0.32,
                    midiVelocity: accent ? 80 : 60,
                    normalizationGain: 1,
                    start: Int(Double(beat) * beatSeconds * sampleRate),
                    duration: transportClickGateSeconds,
                    tone: .vibraphone,
                    pan: 0
                ),
                into: &stereo,
                cancellation: nil
            ) else { return nil }
        }
        guard validateFinite(stereo, cancellation: nil) else { return nil }
        return JazzRenderedAudio(left: stereo.left, right: stereo.right, sampleRate: sampleRate)
    }

    private static func mixPerformance(
        _ chart: JazzChart,
        into stereo: inout StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        for event in JazzPerformancePlan.compile(chart) {
            guard cancellation?.isCancelled != true else { return false }
            let start = Int(
                Double(event.startTick) / Double(JazzPerformancePlan.ppq)
                    * 60 / chart.tempoBPM * sampleRate
            )
            let duration = max(
                1 / sampleRate,
                Double(event.gateDurationTicks) / Double(JazzPerformancePlan.ppq)
                    * 60 / chart.tempoBPM
            )
            let voiceCount = max(1, event.midiPitches.count)
            let tone: InstrumentTone = event.role == .bass ? .uprightBass : chart.instrument
            if event.role == .comp, let chord = JazzPhysicalInstrumentRenderer.renderChord(
                tone: tone,
                midis: event.midiPitches,
                velocity: event.velocity,
                sampleRate: sampleRate,
                maximumSeconds: duration,
                cancellation: cancellation
            ) {
                guard mixPhysicalChord(
                    chord,
                    tone: tone,
                    voiceCount: voiceCount,
                    start: start,
                    into: &stereo,
                    cancellation: cancellation
                ) else { return false }
            } else {
                let normalization = 1 / sqrt(Double(voiceCount))
                let velocityGain = pow(Double(event.velocity) / 127, 1.5)
                for (index, midi) in event.midiPitches.enumerated() {
                    let pan = voiceCount == 1
                        ? 0
                        : Double(index) / Double(voiceCount - 1) * 0.7 - 0.35
                    guard mixNote(
                        NoteRequest(
                            midi: midi,
                            velocity: normalization * velocityGain,
                            midiVelocity: event.velocity,
                            normalizationGain: normalization,
                            start: start,
                            duration: duration,
                            tone: tone,
                            pan: pan
                        ),
                        into: &stereo,
                        cancellation: cancellation
                    ) else { return false }
                }
            }
        }
        return true
    }

    private static func validateFinite(
        _ stereo: StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        for index in stereo.left.indices {
            guard shouldContinue(cancellation, atFrame: index) else { return false }
            guard stereo.left[index].isFinite, stereo.right[index].isFinite else { return false }
        }
        return cancellation?.isCancelled != true
    }

    private static func mixNote(
        _ request: NoteRequest,
        into stereo: inout StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        let frames = min(Int(request.duration * sampleRate), stereo.left.count - request.start)
        guard request.start >= 0, frames > 0 else { return true }
        guard cancellation?.isCancelled != true else { return false }
        if let rendered = JazzSampledInstrumentRenderer.render(
            tone: request.tone,
            midi: request.midi,
            velocity: request.midiVelocity,
            sampleRate: sampleRate,
            maximumSeconds: request.duration
        ) {
            return mixSampledNote(rendered, request: request, into: &stereo, cancellation: cancellation)
        }
        guard cancellation?.isCancelled != true else { return false }
        if let rendered = JazzPhysicalInstrumentRenderer.render(
            tone: request.tone,
            midi: request.midi,
            velocity: request.midiVelocity,
            sampleRate: sampleRate,
            maximumSeconds: request.duration,
            cancellation: cancellation
        ) {
            return mixPhysicalNote(rendered, request: request, into: &stereo, cancellation: cancellation)
        }
        guard cancellation?.isCancelled != true else { return false }

        if let rendered = JazzSyntheticInstrumentRenderer.render(
            tone: request.tone,
            midi: request.midi,
            midiVelocity: request.midiVelocity,
            normalizationGain: request.normalizationGain,
            sampleRate: sampleRate,
            duration: request.duration,
            cancellation: cancellation
        ) {
            return mixSyntheticNote(rendered, request: request, into: &stereo, cancellation: cancellation)
        }
        guard cancellation?.isCancelled != true else { return false }

        let renderedMidi = request.tone.renderedMIDIPitch(for: request.midi)
        let frequency = 440 * pow(2, Double(renderedMidi - 69) / 12)
        let recipe = recipe(for: request.tone)
        let leftGain = sqrt((1 - request.pan) * 0.5)
        let rightGain = sqrt((1 + request.pan) * 0.5)
        var sine = recipe.partials.map { _ in 0.0 }
        var cosine = recipe.partials.map { _ in 1.0 }
        let angles = recipe.partials.map { 2 * Double.pi * frequency * $0.ratio / sampleRate }
        let sineSteps = angles.map(sin)
        let cosineSteps = angles.map(cos)
        let tremolo = tremolo(for: request.tone)
        let tremoloAngle = 2 * Double.pi * (tremolo?.rate ?? 1) / sampleRate
        let tremoloSineStep = sin(tremoloAngle)
        let tremoloCosineStep = cos(tremoloAngle)
        var tremoloSine = 0.0
        var tremoloCosine = 1.0
        let decayStep = exp(-1 / (sampleRate * recipe.decay))
        var decayLevel = 1.0

        for frame in 0..<frames {
            guard shouldContinue(cancellation, atFrame: frame) else { return false }
            let time = Double(frame) / sampleRate
            let rise = min(1, time / recipe.attack)
            let releaseStart = max(recipe.attack, request.duration - 0.12)
            let release = time > releaseStart
                ? max(0, (request.duration - time) / max(0.01, request.duration - releaseStart))
                : 1
            let envelope = rise * decayLevel * release
            var sample = 0.0
            for index in recipe.partials.indices {
                sample += sine[index] * recipe.partials[index].level
                let nextSine = sine[index] * cosineSteps[index] + cosine[index] * sineSteps[index]
                cosine[index] = cosine[index] * cosineSteps[index] - sine[index] * sineSteps[index]
                sine[index] = nextSine
            }
            if let tremolo {
                sample *= (1 - tremolo.depth) + tremolo.depth * tremoloSine
                let nextSine = tremoloSine * tremoloCosineStep + tremoloCosine * tremoloSineStep
                tremoloCosine = tremoloCosine * tremoloCosineStep - tremoloSine * tremoloSineStep
                tremoloSine = nextSine
            }
            let driven = sample * envelope * request.velocity
            let value = driven / (1 + abs(driven) * 0.35)
            stereo.left[request.start + frame] += Float(value * leftGain)
            stereo.right[request.start + frame] += Float(value * rightGain)
            decayLevel *= decayStep
        }
        return cancellation?.isCancelled != true
    }

    private static func mixSyntheticNote(
        _ rendered: JazzSyntheticRender,
        request: NoteRequest,
        into stereo: inout StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        let frames = min(rendered.samples.count, stereo.left.count - request.start)
        guard request.start >= 0, frames > 0 else { return true }
        let leftGain = sqrt((1 - request.pan) * 0.5)
        let rightGain = sqrt((1 + request.pan) * 0.5)
        for frame in 0..<frames {
            guard shouldContinue(cancellation, atFrame: frame) else { return false }
            let value = Double(rendered.samples[frame])
            stereo.left[request.start + frame] += Float(value * leftGain)
            stereo.right[request.start + frame] += Float(value * rightGain)
        }
        return cancellation?.isCancelled != true
    }

    private static func mixSampledNote(
        _ rendered: JazzSampledRender,
        request: NoteRequest,
        into stereo: inout StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        let frames = min(rendered.samples.count, stereo.left.count - request.start)
        guard request.start >= 0, frames > 0 else { return true }
        let leftGain = sqrt((1 - request.pan) * 0.5)
        let rightGain = sqrt((1 + request.pan) * 0.5)
        let recipeLevel = request.tone == .uprightBass ? 0.17 : 0.10
        let attackFrames = max(1, Int(0.002 * sampleRate))
        for frame in 0..<frames {
            guard shouldContinue(cancellation, atFrame: frame) else { return false }
            let attack = min(1, Double(frame) / Double(attackFrames))
            let value = Double(rendered.samples[frame]) * request.velocity * recipeLevel * attack
            stereo.left[request.start + frame] += Float(value * leftGain)
            stereo.right[request.start + frame] += Float(value * rightGain)
        }
        return cancellation?.isCancelled != true
    }

    private static func mixPhysicalNote(
        _ rendered: JazzPhysicalRender,
        request: NoteRequest,
        into stereo: inout StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        let frames = min(rendered.left.count, stereo.left.count - request.start)
        guard request.start >= 0,
              frames > 0,
              let metadata = JazzPhysicalInstrumentRenderer.metadata(for: request.tone)
        else { return true }
        let attackFrames = max(1, Int(0.002 * sampleRate))
        let releaseFrames = max(1, min(frames, Int(0.12 * sampleRate)))
        for frame in 0..<frames {
            guard shouldContinue(cancellation, atFrame: frame) else { return false }
            let attack = min(1, Double(frame) / Double(attackFrames))
            let release = frame >= frames - releaseFrames
                ? Double(frames - frame) / Double(releaseFrames)
                : 1
            let gain = request.normalizationGain * metadata.outputLevel * attack * release
            stereo.left[request.start + frame] += Float(Double(rendered.left[frame]) * gain)
            stereo.right[request.start + frame] += Float(Double(rendered.right[frame]) * gain)
        }
        return cancellation?.isCancelled != true
    }

    private static func mixPhysicalChord(
        _ rendered: JazzPhysicalRender,
        tone: InstrumentTone,
        voiceCount: Int,
        start: Int,
        into stereo: inout StereoBuffer,
        cancellation: JazzRenderCancellationToken?
    ) -> Bool {
        let frames = min(rendered.left.count, stereo.left.count - start)
        guard start >= 0,
              frames > 0,
              let metadata = JazzPhysicalInstrumentRenderer.metadata(for: tone)
        else { return true }
        let normalization = metadata.outputLevel / sqrt(Double(max(1, voiceCount)))
        let attackFrames = max(1, Int(0.002 * sampleRate))
        for frame in 0..<frames {
            guard shouldContinue(cancellation, atFrame: frame) else { return false }
            let attack = min(1, Double(frame) / Double(attackFrames))
            let gain = normalization * attack
            stereo.left[start + frame] += Float(Double(rendered.left[frame]) * gain)
            stereo.right[start + frame] += Float(Double(rendered.right[frame]) * gain)
        }
        return cancellation?.isCancelled != true
    }

    private static func shouldContinue(
        _ cancellation: JazzRenderCancellationToken?,
        atFrame frame: Int
    ) -> Bool {
        frame % cancellationQuantumFrames != 0 || cancellation?.isCancelled != true
    }

    private struct Partial {
        var ratio: Double
        var level: Double
    }

    private struct InstrumentRecipe {
        var partials: [Partial]
        var attack: Double
        var decay: Double
    }

    private static func tremolo(for tone: InstrumentTone) -> (rate: Double, depth: Double)? {
        switch tone {
        case .vibraphone: (5.8, 0.16)
        case .concertVibes: (5.6, 0.20)
        case .organ: (6, 0.07)
        default: nil
        }
    }

    private static func recipe(for tone: InstrumentTone) -> InstrumentRecipe {
        switch tone {
        case .electricPiano:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.26),
                    Partial(ratio: 3, level: 0.11),
                    Partial(ratio: 6.7, level: 0.07)
                ],
                attack: 0.006,
                decay: 1.35
            )
        case .mellowKeys:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.16),
                    Partial(ratio: 3, level: 0.06)
                ],
                attack: 0.012,
                decay: 1
            )
        case .vibraphone:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 3.01, level: 0.25),
                    Partial(ratio: 4.18, level: 0.13)
                ],
                attack: 0.003,
                decay: 1.8
            )
        case .warmPad:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 0.997, level: 0.46),
                    Partial(ratio: 1.003, level: 0.46),
                    Partial(ratio: 2, level: 0.11)
                ],
                attack: 0.11,
                decay: 2.2
            )
        case .analogPoly:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 0.5, level: 0.14),
                    Partial(ratio: 0.997, level: 0.48),
                    Partial(ratio: 1.003, level: 0.38),
                    Partial(ratio: 2, level: 0.22),
                    Partial(ratio: 3, level: 0.14),
                    Partial(ratio: 4, level: 0.08)
                ],
                attack: 0.012,
                decay: 1.1
            )
        case .concertGrand:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2.01, level: 0.38),
                    Partial(ratio: 3.03, level: 0.20),
                    Partial(ratio: 4.07, level: 0.12),
                    Partial(ratio: 7.4, level: 0.04)
                ],
                attack: 0.002,
                decay: 1.75
            )
        case .flute:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.11),
                    Partial(ratio: 3, level: 0.05)
                ],
                attack: 0.04,
                decay: 3
            )
        case .organ:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 0.36),
                    Partial(ratio: 2, level: 0.24),
                    Partial(ratio: 3, level: 0.18),
                    Partial(ratio: 4, level: 0.13),
                    Partial(ratio: 6, level: 0.09)
                ],
                attack: 0.012,
                decay: 8
            )
        case .guitar:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.38),
                    Partial(ratio: 3, level: 0.22),
                    Partial(ratio: 4, level: 0.12),
                    Partial(ratio: 5, level: 0.08),
                    Partial(ratio: 7.1, level: 0.04)
                ],
                attack: 0.002,
                decay: 0.72
            )
        case .uprightBass:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.32),
                    Partial(ratio: 3, level: 0.17),
                    Partial(ratio: 4, level: 0.08)
                ],
                attack: 0.012,
                decay: 0.85
            )
        case .concertVibes:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 3.01, level: 0.29),
                    Partial(ratio: 4.18, level: 0.17),
                    Partial(ratio: 6.8, level: 0.08)
                ],
                attack: 0.002,
                decay: 2.8
            )
        case .bluesGuitar:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.48),
                    Partial(ratio: 3, level: 0.31),
                    Partial(ratio: 4, level: 0.18),
                    Partial(ratio: 5, level: 0.13),
                    Partial(ratio: 6, level: 0.08)
                ],
                attack: 0.002,
                decay: 0.82
            )
        case .clarinet:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 3, level: 0.38),
                    Partial(ratio: 5, level: 0.19),
                    Partial(ratio: 7, level: 0.09)
                ],
                attack: 0.025,
                decay: 2.4
            )
        case .dreadnoughtGuitar:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.42),
                    Partial(ratio: 3, level: 0.28),
                    Partial(ratio: 4, level: 0.18),
                    Partial(ratio: 5, level: 0.11),
                    Partial(ratio: 7, level: 0.06)
                ],
                attack: 0.0015,
                decay: 0.78
            )
        case .ukulele:
            InstrumentRecipe(
                partials: [
                    Partial(ratio: 1, level: 1),
                    Partial(ratio: 2, level: 0.52),
                    Partial(ratio: 3, level: 0.31),
                    Partial(ratio: 4, level: 0.17),
                    Partial(ratio: 5, level: 0.09)
                ],
                attack: 0.0015,
                decay: 0.55
            )
        }
    }
}

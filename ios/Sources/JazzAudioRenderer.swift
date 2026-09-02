import Foundation

struct JazzRenderedAudio: Sendable {
    var left: [Float]
    var right: [Float]
    var sampleRate: Double
}

enum JazzAudioRenderer {
    private static let sampleRate = 24_000.0
    private static let maximumSeconds = 12.0 * 60.0

    private struct StereoBuffer {
        var left: [Float]
        var right: [Float]
    }

    private struct NoteRequest {
        var midi: Int
        var velocity: Double
        var start: Int
        var duration: Double
        var tone: InstrumentTone
        var pan: Double
    }

    private struct PercussionRequest {
        var start: Int
        var frequency: Double
        var strength: Double
        var duration: Double
    }

    nonisolated static func signature(for chart: JazzChart) -> String {
        let changes = chart.measures
            .flatMap(\.chords)
            .map { chord in
                let realization = chord.manualMIDIPitches.map { pitches in
                    "manual[" + pitches.map(String.init).joined(separator: ".") + "]"
                } ?? chord.frozenMIDIPitches.map { pitches in
                    "frozen[" + pitches.map(String.init).joined(separator: ".") + "]"
                } ?? "automatic"
                return "\(chord.symbol):\(chord.beats):\(realization)"
            }
            .joined(separator: ",")
        return [
            String(chart.tempoBPM),
            chart.groove.rawValue,
            chart.instrument.rawValue,
            chart.voicingFamily.rawValue,
            changes
        ].joined(separator: "-")
    }

    nonisolated static func render(chart: JazzChart) -> JazzRenderedAudio? {
        let totalSeconds = chart.durationBeats * 60 / chart.tempoBPM
        guard totalSeconds > 0, totalSeconds <= maximumSeconds else { return nil }
        let frameCount = Int((totalSeconds + 0.35) * sampleRate)
        guard frameCount > 0, frameCount <= Int(sampleRate * (maximumSeconds + 1)) else { return nil }

        var stereo = StereoBuffer(
            left: [Float](repeating: 0, count: frameCount),
            right: [Float](repeating: 0, count: frameCount)
        )
        mixChanges(chart, into: &stereo)
        mixGroove(chart, into: &stereo)
        normalize(&stereo)
        return JazzRenderedAudio(left: stereo.left, right: stereo.right, sampleRate: sampleRate)
    }

    private static func mixChanges(_ chart: JazzChart, into stereo: inout StereoBuffer) {
        for event in JazzTheory.compilePlayback(chart) {
            let start = Int(event.startBeat * 60 / chart.tempoBPM * sampleRate)
            let duration = min(
                2.8,
                max(0.16, event.durationBeats * 60 / chart.tempoBPM + 0.28)
            )
            let voiceCount = max(1, event.midiPitches.count)
            for (index, midi) in event.midiPitches.enumerated() {
                let pan = voiceCount == 1
                    ? 0
                    : Double(index) / Double(voiceCount - 1) * 0.7 - 0.35
                mixNote(
                    NoteRequest(
                        midi: midi,
                        velocity: 0.72 / sqrt(Double(voiceCount)),
                        start: start,
                        duration: duration,
                        tone: chart.instrument,
                        pan: pan
                    ),
                    into: &stereo
                )
            }
            if let bass = event.midiPitches.first {
                mixNote(
                    NoteRequest(
                        midi: max(28, bass - 12),
                        velocity: 0.30,
                        start: start,
                        duration: min(duration, 0.58),
                        tone: .mellowKeys,
                        pan: -0.08
                    ),
                    into: &stereo
                )
            }
        }
    }

    private static func mixGroove(_ chart: JazzChart, into stereo: inout StereoBuffer) {
        let beatSeconds = 60 / chart.tempoBPM
        var beat = 0.0
        while beat < chart.durationBeats {
            let beatInBar = Int(beat) % 4
            let start = Int(beat * beatSeconds * sampleRate)
            switch chart.groove {
            case .mediumSwing:
                mixPercussion(
                    PercussionRequest(
                        start: start,
                        frequency: beatInBar == 0 || beatInBar == 2 ? 190 : 265,
                        strength: beatInBar == 0 ? 0.095 : 0.060,
                        duration: 0.055
                    ),
                    into: &stereo
                )
                mixPercussion(
                    PercussionRequest(
                        start: Int((beat + 2.0 / 3.0) * beatSeconds * sampleRate),
                        frequency: 410,
                        strength: 0.035,
                        duration: 0.035
                    ),
                    into: &stereo
                )
            case .uptempoSwing:
                mixPercussion(
                    PercussionRequest(
                        start: start,
                        frequency: beatInBar == 0 || beatInBar == 2 ? 205 : 305,
                        strength: beatInBar == 0 ? 0.080 : 0.052,
                        duration: 0.038
                    ),
                    into: &stereo
                )
                mixPercussion(
                    PercussionRequest(
                        start: Int((beat + 2.0 / 3.0) * beatSeconds * sampleRate),
                        frequency: 520,
                        strength: 0.030,
                        duration: 0.024
                    ),
                    into: &stereo
                )
            case .ballad:
                if beatInBar == 0 || beatInBar == 2 {
                    mixPercussion(
                        PercussionRequest(start: start, frequency: 145, strength: 0.032, duration: 0.075),
                        into: &stereo
                    )
                }
            case .bossaNova:
                mixPercussion(
                    PercussionRequest(
                        start: start,
                        frequency: beatInBar == 0 || beatInBar == 2 ? 105 : 620,
                        strength: beatInBar == 0 ? 0.080 : 0.045,
                        duration: 0.045
                    ),
                    into: &stereo
                )
            case .straightEighths:
                mixPercussion(
                    PercussionRequest(
                        start: start,
                        frequency: beatInBar == 0 ? 170 : 340,
                        strength: beatInBar == 0 ? 0.065 : 0.038,
                        duration: 0.038
                    ),
                    into: &stereo
                )
            case .syncopatedSixteenths:
                let accents: [(offset: Double, strength: Double)] = beatInBar % 2 == 0
                    ? [(0, 0.070), (0.75, 0.040)]
                    : [(0, 0.042), (0.5, 0.034)]
                for accent in accents {
                    mixPercussion(
                        PercussionRequest(
                            start: Int((beat + accent.offset) * beatSeconds * sampleRate),
                            frequency: accent.offset == 0 ? 180 : 680,
                            strength: accent.strength,
                            duration: 0.028
                        ),
                        into: &stereo
                    )
                }
            }
            beat += 1
        }
    }

    private static func normalize(_ stereo: inout StereoBuffer) {
        var peak: Float = 0
        for index in stereo.left.indices {
            peak = max(peak, abs(stereo.left[index]), abs(stereo.right[index]))
        }
        guard peak > 0.92 else { return }
        let gain = 0.92 / peak
        for index in stereo.left.indices {
            stereo.left[index] *= gain
            stereo.right[index] *= gain
        }
    }

    private static func mixPercussion(
        _ request: PercussionRequest,
        into stereo: inout StereoBuffer
    ) {
        let frames = min(Int(request.duration * sampleRate), stereo.left.count - request.start)
        guard request.start >= 0, frames > 0 else { return }
        let angle = 2 * Double.pi * request.frequency / sampleRate
        let sineStep = sin(angle)
        let cosineStep = cos(angle)
        var sine = 0.0
        var cosine = 1.0
        let decayStep = exp(-8 / (request.duration * sampleRate))
        var envelope = 1.0
        var noise = UInt32(
            truncatingIfNeeded: request.start &* 747_796_405 &+ Int(request.frequency)
        ) | 1
        for frame in 0..<frames {
            noise ^= noise << 13
            noise ^= noise >> 17
            noise ^= noise << 5
            let hiss = (Double(noise & 0xFFFF) / 32_767.5 - 1) * 0.22
            let value = (sine + hiss) * envelope * request.strength
            stereo.left[request.start + frame] += Float(value * 0.96)
            stereo.right[request.start + frame] += Float(value)
            let nextSine = sine * cosineStep + cosine * sineStep
            cosine = cosine * cosineStep - sine * sineStep
            sine = nextSine
            envelope *= decayStep
        }
    }

    private static func mixNote(_ request: NoteRequest, into stereo: inout StereoBuffer) {
        let frames = min(Int(request.duration * sampleRate), stereo.left.count - request.start)
        guard request.start >= 0, frames > 0 else { return }
        let frequency = 440 * pow(2, Double(request.midi - 69) / 12)
        let recipe = recipe(for: request.tone)
        let leftGain = sqrt((1 - request.pan) * 0.5)
        let rightGain = sqrt((1 + request.pan) * 0.5)
        var sine = recipe.partials.map { _ in 0.0 }
        var cosine = recipe.partials.map { _ in 1.0 }
        let angles = recipe.partials.map { 2 * Double.pi * frequency * $0.ratio / sampleRate }
        let sineSteps = angles.map(sin)
        let cosineSteps = angles.map(cos)
        let tremoloAngle = 2 * Double.pi * 5.2 / sampleRate
        let tremoloSineStep = sin(tremoloAngle)
        let tremoloCosineStep = cos(tremoloAngle)
        var tremoloSine = 0.0
        var tremoloCosine = 1.0
        let decayStep = exp(-1 / (sampleRate * recipe.decay))
        var decayLevel = 1.0

        for frame in 0..<frames {
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
            if request.tone == .vibraphone {
                sample *= 0.82 + 0.18 * tremoloSine
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
        }
    }
}

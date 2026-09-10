import Foundation

struct JazzSyntheticInstrumentMetadata: Equatable, Sendable {
    enum Topology: String, Sendable {
        case additive
        case fmPair
    }

    var algorithmID: String
    var topology: Topology
    var outputLevel: Double
    var polyphonyLimit: Int
    var oscillatorCount: Int
    var hasTransient: Bool
    var hasTremolo: Bool
    var attackSeconds: Double
    var decaySeconds: Double
    var sustainLevel: Double
    var releaseSeconds: Double
    var filterAttackHz: Double
    var filterPeakHz: Double
    var filterSustainHz: Double
    var filterQ: Double
    var filterDecaySeconds: Double
}

struct JazzSyntheticRender: Sendable {
    var algorithmID: String
    var samples: [Float]
    var sampleRate: Double
}

/// Offline-native realization of the original Web Audio recipe set. The
/// constants below mirror `src/audio/instrument-recipes-contract.ts`; both
/// progression playback and inspector preview enter through this renderer.
enum JazzSyntheticInstrumentRenderer {
    private enum Waveform: Sendable {
        case sine
        case triangle
        case sawtooth
        case pulse25
    }

    private struct Oscillator: Sendable {
        var waveform: Waveform
        var frequencyRatio: Double
        var detuneCents: Double
        var level: Double
    }

    private struct Transient: Sendable {
        var frequencyRatio: Double
        var level: Double
        var decaySeconds: Double
    }

    private struct Tremolo: Sendable {
        var rateHz: Double
        var depth: Double
        var delaySeconds: Double
    }

    private struct FM: Sendable {
        var carrier: Oscillator
        var modulatorFrequencyRatio: Double
        var modulatorDetuneCents: Double
        var peakIndex: Double
        var sustainIndex: Double
        var decaySeconds: Double
        var velocityIndexScaleMinimum: Double
        var velocityIndexScaleMaximum: Double
    }

    private struct Recipe: Sendable {
        var metadata: JazzSyntheticInstrumentMetadata
        var oscillators: [Oscillator]
        var transient: Transient?
        var tremolo: Tremolo?
        var fm: FM?
    }

    static func metadata(for tone: InstrumentTone) -> JazzSyntheticInstrumentMetadata? {
        recipe(for: tone)?.metadata
    }

    static func render(
        tone: InstrumentTone,
        midi: Int,
        velocityGain: Double,
        sampleRate: Double,
        duration: Double,
        cancellation: JazzRenderCancellationToken? = nil
    ) -> JazzSyntheticRender? {
        guard let recipe = recipe(for: tone),
              (21...108).contains(midi),
              velocityGain.isFinite, velocityGain > 0,
              sampleRate.isFinite, (8_000...192_000).contains(sampleRate),
              duration.isFinite, duration > 0
        else { return nil }

        let frameCount = Int(floor(duration * sampleRate))
        guard frameCount > 0 else { return nil }
        let frequency = 440 * pow(2, Double(tone.renderedMIDIPitch(for: midi) - 69) / 12)
        let envelope = recipe.metadata
        let releaseStart = max(
            envelope.attackSeconds + envelope.decaySeconds,
            duration - envelope.releaseSeconds
        )
        var samples = [Float](repeating: 0, count: frameCount)
        var filter = LowPass(sampleRate: sampleRate)
        var phases = recipe.oscillators.map { _ in 0.0 }
        var carrierPhase = 0.0
        var modulatorPhase = 0.0

        for frame in 0..<frameCount {
            if frame % 2_048 == 0, cancellation?.isCancelled == true { return nil }
            let time = Double(frame) / sampleRate
            let amplitude = amplitude(
                at: time,
                releaseStart: releaseStart,
                duration: duration,
                metadata: envelope
            )
            var value = 0.0

            if let fm = recipe.fm {
                let modulatorFrequency = frequency
                    * fm.modulatorFrequencyRatio
                    * pow(2, fm.modulatorDetuneCents / 1_200)
                let modulationProgress = min(1, time / fm.decaySeconds)
                let modulationIndex = fm.peakIndex
                    * pow(max(0.000_001, fm.sustainIndex / fm.peakIndex), modulationProgress)
                let velocityScale = fm.velocityIndexScaleMinimum
                    + (fm.velocityIndexScaleMaximum - fm.velocityIndexScaleMinimum)
                    * min(1, max(0, velocityGain))
                let instantaneousFrequency = frequency * fm.carrier.frequencyRatio
                    + sin(modulatorPhase) * modulatorFrequency * modulationIndex * velocityScale
                carrierPhase += 2 * Double.pi * instantaneousFrequency / sampleRate
                modulatorPhase += 2 * Double.pi * modulatorFrequency / sampleRate
                value = waveform(fm.carrier.waveform, phase: carrierPhase) * fm.carrier.level
            } else {
                for index in recipe.oscillators.indices {
                    let oscillator = recipe.oscillators[index]
                    let componentFrequency = frequency
                        * oscillator.frequencyRatio
                        * pow(2, oscillator.detuneCents / 1_200)
                    phases[index] += 2 * Double.pi * componentFrequency / sampleRate
                    value += waveform(oscillator.waveform, phase: phases[index]) * oscillator.level
                }
                if let transient = recipe.transient, time <= transient.decaySeconds {
                    value += sin(2 * Double.pi * frequency * transient.frequencyRatio * time)
                        * transient.level * max(0, 1 - time / transient.decaySeconds)
                }
            }

            if let tremolo = recipe.tremolo, time >= tremolo.delaySeconds {
                let depth = tremolo.depth / 2
                value *= (1 - depth) + sin(2 * Double.pi * tremolo.rateHz * time) * depth
            }

            if frame % 32 == 0 {
                filter.configure(
                    cutoffHz: filterFrequency(at: time, metadata: envelope),
                    q: envelope.filterQ
                )
            }
            let filtered = filter.process(value)
            let driven = filtered * amplitude * envelope.outputLevel * velocityGain
            samples[frame] = Float(driven / (1 + abs(driven) * 0.35))
        }
        guard cancellation?.isCancelled != true else { return nil }
        return JazzSyntheticRender(
            algorithmID: "changes.audio.\(tone.originalID)@1",
            samples: samples,
            sampleRate: sampleRate
        )
    }

    private static func amplitude(
        at time: Double,
        releaseStart: Double,
        duration: Double,
        metadata: JazzSyntheticInstrumentMetadata
    ) -> Double {
        let held: Double
        if time < metadata.attackSeconds {
            held = time / max(0.000_001, metadata.attackSeconds)
        } else if time < metadata.attackSeconds + metadata.decaySeconds {
            let progress = (time - metadata.attackSeconds) / max(0.000_001, metadata.decaySeconds)
            held = 1 + (metadata.sustainLevel - 1) * progress
        } else {
            held = metadata.sustainLevel
        }
        guard time > releaseStart else { return held }
        return held * max(0, (duration - time) / max(0.000_001, duration - releaseStart))
    }

    private static func filterFrequency(
        at time: Double,
        metadata: JazzSyntheticInstrumentMetadata
    ) -> Double {
        if time < metadata.attackSeconds {
            let progress = time / max(0.000_001, metadata.attackSeconds)
            return metadata.filterAttackHz
                + (metadata.filterPeakHz - metadata.filterAttackHz) * progress
        }
        let decayTime = time - metadata.attackSeconds
        guard decayTime < metadata.filterDecaySeconds else { return metadata.filterSustainHz }
        let progress = decayTime / max(0.000_001, metadata.filterDecaySeconds)
        return metadata.filterPeakHz
            * pow(metadata.filterSustainHz / metadata.filterPeakHz, progress)
    }

    private static func waveform(_ waveform: Waveform, phase: Double) -> Double {
        let cycle = phase / (2 * Double.pi) - floor(phase / (2 * Double.pi))
        switch waveform {
        case .sine: return sin(phase)
        case .triangle: return 1 - 4 * abs(cycle - 0.5)
        case .sawtooth: return 2 * cycle - 1
        case .pulse25: return cycle < 0.25 ? 1 : -1
        }
    }

    private struct LowPass {
        var sampleRate: Double
        var b0 = 1.0
        var b1 = 0.0
        var b2 = 0.0
        var a1 = 0.0
        var a2 = 0.0
        var z1 = 0.0
        var z2 = 0.0

        mutating func configure(cutoffHz: Double, q: Double) {
            let cutoff = min(sampleRate * 0.49, max(20, cutoffHz))
            let omega = 2 * Double.pi * cutoff / sampleRate
            let alpha = sin(omega) / (2 * max(0.01, q))
            let cosine = cos(omega)
            let denominator = 1 + alpha
            b0 = (1 - cosine) / 2 / denominator
            b1 = (1 - cosine) / denominator
            b2 = b0
            a1 = -2 * cosine / denominator
            a2 = (1 - alpha) / denominator
        }

        mutating func process(_ input: Double) -> Double {
            let output = b0 * input + z1
            z1 = b1 * input - a1 * output + z2
            z2 = b2 * input - a2 * output
            return output
        }
    }

    private static func recipe(for tone: InstrumentTone) -> Recipe? {
        switch tone {
        case .mellowKeys:
            return additive(tone, 0.62, 64, 0.008, 0.42, 0.22, 0.55, 2_100, 5_200, 2_100, 0.7, 0.45, [
                Oscillator(waveform: .triangle, frequencyRatio: 1, detuneCents: 0, level: 0.78),
                Oscillator(waveform: .sine, frequencyRatio: 2, detuneCents: 0, level: 0.16),
                Oscillator(waveform: .sine, frequencyRatio: 3, detuneCents: 0, level: 0.06)
            ])
        case .electricPiano:
            return Recipe(
                metadata: metadata(tone, .fmPair, 0.48, 48, 1, false, false, 0.003, 0.85, 0.14, 0.9, 4_200, 9_000, 4_200, 0.5, 0.6),
                oscillators: [], transient: nil, tremolo: nil,
                fm: FM(
                    carrier: Oscillator(waveform: .sine, frequencyRatio: 1, detuneCents: 0, level: 1),
                    modulatorFrequencyRatio: 2, modulatorDetuneCents: 3,
                    peakIndex: 3.2, sustainIndex: 0.55, decaySeconds: 0.65,
                    velocityIndexScaleMinimum: 0.55, velocityIndexScaleMaximum: 1
                )
            )
        case .vibraphone:
            var recipe = additive(tone, 0.5, 48, 0.002, 1.4, 0.45, 1.1, 7_000, 12_000, 7_000, 0.3, 0.25, [
                Oscillator(waveform: .sine, frequencyRatio: 1, detuneCents: 0, level: 0.88),
                Oscillator(waveform: .sine, frequencyRatio: 4, detuneCents: 0, level: 0.12)
            ])
            recipe.transient = Transient(frequencyRatio: 7, level: 0.1, decaySeconds: 0.018)
            recipe.tremolo = Tremolo(rateHz: 5.8, depth: 0.16, delaySeconds: 0.12)
            recipe.metadata.hasTransient = true
            recipe.metadata.hasTremolo = true
            return recipe
        case .warmPad:
            return additive(tone, 0.3, 32, 0.32, 1.2, 0.72, 1.8, 900, 2_800, 1_600, 0.8, 1.4, [
                Oscillator(waveform: .sawtooth, frequencyRatio: 1, detuneCents: -7, level: 0.34),
                Oscillator(waveform: .sawtooth, frequencyRatio: 1, detuneCents: 7, level: 0.34),
                Oscillator(waveform: .triangle, frequencyRatio: 1, detuneCents: 0, level: 0.32)
            ])
        case .analogPoly:
            return additive(tone, 0.34, 48, 0.012, 0.3, 0.52, 0.65, 700, 4_800, 1_300, 4.2, 0.32, [
                Oscillator(waveform: .sawtooth, frequencyRatio: 1, detuneCents: -4, level: 0.48),
                Oscillator(waveform: .pulse25, frequencyRatio: 1, detuneCents: 4, level: 0.36),
                Oscillator(waveform: .sine, frequencyRatio: 0.5, detuneCents: 0, level: 0.16)
            ])
        case .organ:
            var recipe = additive(tone, 0.44, 48, 0.012, 0.08, 0.92, 0.14, 7_500, 9_500, 7_500, 0.4, 0.1, [
                Oscillator(waveform: .sine, frequencyRatio: 1, detuneCents: 0, level: 0.36),
                Oscillator(waveform: .sine, frequencyRatio: 2, detuneCents: 0, level: 0.24),
                Oscillator(waveform: .sine, frequencyRatio: 3, detuneCents: 0, level: 0.18),
                Oscillator(waveform: .sine, frequencyRatio: 4, detuneCents: 0, level: 0.13),
                Oscillator(waveform: .sine, frequencyRatio: 6, detuneCents: 0, level: 0.09)
            ])
            recipe.tremolo = Tremolo(rateHz: 6, depth: 0.07, delaySeconds: 0.08)
            recipe.metadata.hasTremolo = true
            return recipe
        default:
            return nil
        }
    }

    private static func additive(
        _ tone: InstrumentTone, _ output: Double, _ polyphony: Int,
        _ attack: Double, _ decay: Double, _ sustain: Double, _ release: Double,
        _ filterAttack: Double, _ filterPeak: Double, _ filterSustain: Double,
        _ q: Double, _ filterDecay: Double, _ oscillators: [Oscillator]
    ) -> Recipe {
        Recipe(
            metadata: metadata(
                tone, .additive, output, polyphony, oscillators.count, false, false,
                attack, decay, sustain, release,
                filterAttack, filterPeak, filterSustain, q, filterDecay
            ),
            oscillators: oscillators, transient: nil, tremolo: nil, fm: nil
        )
    }

    private static func metadata(
        _ tone: InstrumentTone, _ topology: JazzSyntheticInstrumentMetadata.Topology,
        _ output: Double, _ polyphony: Int, _ oscillators: Int,
        _ transient: Bool, _ tremolo: Bool,
        _ attack: Double, _ decay: Double, _ sustain: Double, _ release: Double,
        _ filterAttack: Double, _ filterPeak: Double, _ filterSustain: Double,
        _ q: Double, _ filterDecay: Double
    ) -> JazzSyntheticInstrumentMetadata {
        JazzSyntheticInstrumentMetadata(
            algorithmID: "changes.audio.\(tone.originalID)@1",
            topology: topology, outputLevel: output, polyphonyLimit: polyphony,
            oscillatorCount: oscillators, hasTransient: transient, hasTremolo: tremolo,
            attackSeconds: attack, decaySeconds: decay, sustainLevel: sustain,
            releaseSeconds: release, filterAttackHz: filterAttack,
            filterPeakHz: filterPeak, filterSustainHz: filterSustain,
            filterQ: q, filterDecaySeconds: filterDecay
        )
    }
}

import CryptoKit
import Foundation

struct JazzPianoAttackSlice: Codable, Equatable, Sendable {
    var midiPitch: Int
    var velocityBucket: Int
    var lowVelocity: Int
    var highVelocity: Int
    var sourceLayer: Int
    var sourceChannel: Int
    var tuningCents: Double
    var byteOffset: Int
    var frameCount: Int
}

/// Exact native port of the original Concert Grand's recorded-attack handoff.
/// The 66 SHA-pinned Salamander slices and their generated index are bundled
/// resources; a malformed payload safely leaves the synthesized note intact.
enum JazzPianoAttackLayer {
    static let attribution = "Salamander Grand Piano V3 by Alexander Holm, CC-BY-3.0"
    static let license = "CC-BY-3.0"
    static let payloadSHA256 = "08bc1a567e615e498baded37966eef2a13b2b34de288e301a833dd8460727980"
    static let payloadByteLength = 2_328_480
    static let payloadSampleRate = 44_100.0
    static let sampleOnlySeconds = 0.18
    static let crossfadeEndSeconds = 0.32
    static let maximumTranspositionSemitones = 3
    static let peakCeiling = 0.945

    private static let attackWindowStartSeconds = 0.02
    private static let attackWindowEndSeconds = 0.18
    private static let matchWindowStartSeconds = 0.18
    private static let matchWindowEndSeconds = 0.32
    private static let maximumDecayCorrectionRatio = 4.0
    private static let peakGuardSlewDecibelsPerSecond = 60.0

    private struct Payload: Sendable {
        var samples: [Int16]
        var slices: [JazzPianoAttackSlice]
    }

    private static let payload = load()

    static var isAvailable: Bool { payload != nil }

    static func slice(for midi: Int, velocity: Int) -> JazzPianoAttackSlice? {
        guard let slices = payload?.slices else { return nil }
        var best: JazzPianoAttackSlice?
        var bestDistance = Int.max
        for slice in slices where (slice.lowVelocity...slice.highVelocity).contains(velocity) {
            let distance = abs(slice.midiPitch - midi)
            if distance <= bestDistance {
                bestDistance = distance
                best = slice
            }
        }
        guard bestDistance <= maximumTranspositionSemitones else { return nil }
        return best
    }

    @discardableResult
    static func apply(
        left: inout [Float],
        right: inout [Float],
        midi: Int,
        velocity: Int,
        sampleRate: Double
    ) -> Bool {
        guard left.count == right.count,
              let payload,
              let slice = slice(for: midi, velocity: velocity),
              slice.byteOffset >= 0,
              slice.byteOffset.isMultiple(of: 2),
              slice.frameCount >= 2,
              slice.byteOffset / 2 + slice.frameCount <= payload.samples.count
        else { return false }

        let frameCount = left.count
        let layerFrames = min(Int(round(crossfadeEndSeconds * sampleRate)), frameCount)
        let soloFrames = min(Int(round(sampleOnlySeconds * sampleRate)), layerFrames)
        let crossfadeFrames = layerFrames - soloFrames
        guard crossfadeFrames > 0 else { return false }
        let attack = transpose(
            payload.samples,
            slice: slice,
            midi: midi,
            sampleRate: sampleRate,
            frames: layerFrames
        )

        let attackStart = min(Int(round(attackWindowStartSeconds * sampleRate)), layerFrames)
        let attackEnd = min(Int(round(attackWindowEndSeconds * sampleRate)), layerFrames)
        let matchStart = min(Int(round(matchWindowStartSeconds * sampleRate)), layerFrames)
        let matchEnd = min(Int(round(matchWindowEndSeconds * sampleRate)), layerFrames)
        let sampleSeamRMS = windowRMS(attack, start: matchStart, end: matchEnd)
        let sampleAttackRMS = windowRMS(attack, start: attackStart, end: attackEnd)
        guard sampleSeamRMS > 1e-9, sampleAttackRMS > 1e-9 else { return false }

        let synthSeamLeft = windowRMS(left, start: matchStart, end: matchEnd)
        let synthSeamRight = windowRMS(right, start: matchStart, end: matchEnd)
        let synthSeamRMS = sqrt((synthSeamLeft * synthSeamLeft + synthSeamRight * synthSeamRight) / 2)
        let synthAttackRMS = sqrt((
            pow(windowRMS(left, start: attackStart, end: attackEnd), 2) +
                pow(windowRMS(right, start: attackStart, end: attackEnd), 2)
        ) / 2)
        guard synthSeamRMS > 1e-9, synthAttackRMS > 1e-9 else { return false }

        let balanceLeft = synthSeamLeft / synthSeamRMS
        let balanceRight = synthSeamRight / synthSeamRMS
        let handoverRadius = max(1, Int(round(Double(matchEnd - matchStart) / 4)))
        let handoverCentre = Int(round(Double(matchStart + matchEnd) / 2))
        let handoverStart = max(0, handoverCentre - handoverRadius)
        let handoverEnd = min(layerFrames, handoverCentre + handoverRadius)
        let sampleHandoverRMS = windowRMS(attack, start: handoverStart, end: handoverEnd)
        let synthHandoverRMS = sqrt((
            pow(windowRMS(left, start: handoverStart, end: handoverEnd), 2) +
                pow(windowRMS(right, start: handoverStart, end: handoverEnd), 2)
        ) / 2)
        guard sampleHandoverRMS > 1e-9, synthHandoverRMS > 1e-9 else { return false }

        let seamGain = synthHandoverRMS / sampleHandoverRMS
        let rawAttackGain = synthAttackRMS / sampleAttackRMS
        let correction = min(
            maximumDecayCorrectionRatio,
            max(1 / maximumDecayCorrectionRatio, rawAttackGain / seamGain)
        )

        let balanceEnergy = balanceLeft * balanceLeft + balanceRight * balanceRight
        var crossEnergy = 0.0
        var sampleEnergy = 0.0
        var synthEnergy = 0.0
        for frame in handoverStart..<handoverEnd {
            let source = Double(attack[frame])
            let carriedLeft = Double(left[frame])
            let carriedRight = Double(right[frame])
            crossEnergy += source * (balanceLeft * carriedLeft + balanceRight * carriedRight)
            sampleEnergy += source * source * balanceEnergy
            synthEnergy += carriedLeft * carriedLeft + carriedRight * carriedRight
        }
        let coherence = sampleEnergy > 0 && synthEnergy > 0
            ? crossEnergy / sqrt(sampleEnergy * synthEnergy)
            : 0
        let polarity = coherence < 0 ? -1.0 : 1.0
        let alignedCoherence = min(abs(coherence), 1)

        let correctionStart = Double(attackStart + attackEnd) / 2
        let correctionEnd = Double(matchStart + matchEnd) / 2
        let correctionSpan = max(1, correctionEnd - correctionStart)
        var synthGain = [Double](repeating: 0, count: layerFrames)
        var sampleGain = [Double](repeating: 0, count: layerFrames)
        for frame in 0..<layerFrames {
            let frameValue = Double(frame)
            let unwind = frameValue <= correctionStart
                ? 1
                : frameValue >= correctionEnd
                    ? 0
                    : 1 - (frameValue - correctionStart) / correctionSpan
            let level = seamGain * pow(correction, unwind)
            if frame < soloFrames {
                sampleGain[frame] = level * polarity
                continue
            }
            let phase = Double(frame - soloFrames) / Double(crossfadeFrames) * Double.pi / 2
            let coherent = 1 / sqrt(1 + alignedCoherence * sin(2 * phase))
            synthGain[frame] = sin(phase) * coherent
            sampleGain[frame] = cos(phase) * level * polarity * coherent
        }

        var synthPeak = 0.0
        for frame in 0..<frameCount {
            synthPeak = max(synthPeak, abs(Double(left[frame])), abs(Double(right[frame])))
        }
        let ceiling = max(peakCeiling, synthPeak)
        var guardGain = [Double](repeating: 1, count: layerFrames)
        for frame in 0..<layerFrames {
            let weight = sampleGain[frame]
            let faded = synthGain[frame]
            let source = Double(attack[frame])
            var allowed = 1.0
            allowed = min(
                allowed,
                allowedLayerGain(
                    carried: faded * Double(left[frame]),
                    added: weight * source * balanceLeft,
                    ceiling: ceiling
                )
            )
            allowed = min(
                allowed,
                allowedLayerGain(
                    carried: faded * Double(right[frame]),
                    added: weight * source * balanceRight,
                    ceiling: ceiling
                )
            )
            guardGain[frame] = allowed > 0 ? allowed : 0
        }

        let slew = pow(10, peakGuardSlewDecibelsPerSecond / (20 * sampleRate))
        if layerFrames >= 2 {
            for frame in stride(from: layerFrames - 2, through: 0, by: -1) {
                guardGain[frame] = min(guardGain[frame], guardGain[frame + 1] * slew)
            }
            for frame in 1..<layerFrames {
                guardGain[frame] = min(guardGain[frame], guardGain[frame - 1] * slew)
            }
        }

        for frame in 0..<layerFrames {
            let weight = sampleGain[frame] * guardGain[frame]
            let faded = synthGain[frame]
            let source = Double(attack[frame])
            left[frame] = Float(faded * Double(left[frame]) + weight * source * balanceLeft)
            right[frame] = Float(faded * Double(right[frame]) + weight * source * balanceRight)
        }
        return true
    }

    private static func allowedLayerGain(carried: Double, added: Double, ceiling: Double) -> Double {
        guard added != 0 else { return 1 }
        return added > 0 ? (ceiling - carried) / added : (-ceiling - carried) / added
    }

    private static func transpose(
        _ samples: [Int16],
        slice: JazzPianoAttackSlice,
        midi: Int,
        sampleRate: Double,
        frames: Int
    ) -> [Float] {
        var output = [Float](repeating: 0, count: frames)
        let base = slice.byteOffset / 2
        let last = slice.frameCount - 1
        let semitones = Double(midi - slice.midiPitch) - slice.tuningCents / 100
        let step = pow(2, semitones / 12) * payloadSampleRate / sampleRate
        func sample(_ offset: Int) -> Double {
            let clamped = min(max(0, offset), last)
            return Double(samples[base + clamped]) / 32_768
        }
        for frame in 0..<frames {
            let position = Double(frame) * step
            let index = Int(floor(position))
            if index >= last { break }
            let time = position - Double(index)
            let p0 = sample(index - 1)
            let p1 = sample(index)
            let p2 = sample(index + 1)
            let p3 = sample(index + 2)
            output[frame] = Float(0.5 * (
                2 * p1 +
                    (p2 - p0) * time +
                    (2 * p0 - 5 * p1 + 4 * p2 - p3) * time * time +
                    (3 * p1 - p0 - 3 * p2 + p3) * time * time * time
            ))
        }
        return output
    }

    private static func windowRMS(_ channel: [Float], start: Int, end: Int) -> Double {
        guard end > start else { return 0 }
        var energy = 0.0
        for frame in start..<end {
            let value = Double(channel[frame])
            energy += value * value
        }
        return sqrt(energy / Double(end - start))
    }

    private static func load() -> Payload? {
        let candidateBundles = [Bundle.main] + Bundle.allBundles + Bundle.allFrameworks
        guard let pcmURL = candidateBundles.lazy.compactMap({
            $0.url(forResource: "piano-attack-samples", withExtension: "pcm")
        }).first,
        let indexURL = candidateBundles.lazy.compactMap({
            $0.url(forResource: "piano-attack-index", withExtension: "json")
        }).first,
        let data = try? Data(contentsOf: pcmURL),
        data.count == payloadByteLength,
        let indexData = try? Data(contentsOf: indexURL),
        let slices = try? JSONDecoder().decode([JazzPianoAttackSlice].self, from: indexData),
        slices.count == 66 else { return nil }

        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == payloadSHA256 else { return nil }
        var samples = [Int16]()
        samples.reserveCapacity(data.count / 2)
        data.withUnsafeBytes { bytes in
            for index in stride(from: 0, to: bytes.count, by: 2) {
                let word = UInt16(bytes[index]) | UInt16(bytes[index + 1]) << 8
                samples.append(Int16(bitPattern: word))
            }
        }
        guard slices.allSatisfy({
            $0.byteOffset >= 0 &&
                $0.byteOffset.isMultiple(of: 2) &&
                $0.frameCount >= 2 &&
                $0.byteOffset / 2 + $0.frameCount <= samples.count
        }) else { return nil }
        return Payload(samples: samples, slices: slices)
    }
}

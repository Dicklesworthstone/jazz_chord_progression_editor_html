import CryptoKit
import Foundation

struct JazzSampledSlice: Equatable, Sendable {
    var midiPitch: Int
    var tuningCents: Double
    var byteOffset: Int
    var frameCount: Int
}

struct JazzSampledRender: Sendable {
    var algorithmID: String
    var requestedMIDIPitch: Int
    var renderedMIDIPitch: Int
    var sourceMIDIPitch: Int
    var samples: [Float]
    var sampleRate: Double
}

struct JazzSampledInstrumentMetadata: Equatable, Sendable {
    var algorithmID: String
    var attribution: String
    var license: String
    var payloadSHA256: String
    var payloadByteLength: Int
    var payloadRate: Double
    var playableRange: ClosedRange<Int>
    var maximumRenderSeconds: Double
    var bufferCacheLimit: Int
    var slices: [JazzSampledSlice]
}

/// Exact native port of `src/audio/sampled-renderer.ts` for the two sampled
/// instruments the original studio deliberately ships instead of its rejected
/// physical replacements. It loads the byte-identical, SHA-pinned CC0 PCM
/// resources and performs the same nearest-key selection, tuning compensation,
/// Catmull-Rom interpolation, and 64-frame truncation guard.
enum JazzSampledInstrumentRenderer {
    private struct LoadedInstrument: Sendable {
        var metadata: JazzSampledInstrumentMetadata
        var samples: [Int16]
    }

    static let minimumMIDIPitch = 21
    static let maximumMIDIPitch = 108
    static let minimumVelocity = 1
    static let maximumVelocity = 127
    static let minimumSampleRate = 8_000.0
    static let maximumSampleRate = 192_000.0
    static let truncationGuardFrames = 64

    static let uprightBassMetadata = JazzSampledInstrumentMetadata(
        algorithmID: "changes.dsp.sampled-upright-bass@1",
        attribution: "VSCO 2 Community Edition, Solo Contrabass Pizzicato, by Versilian Studios / Sam Gossner, CC0-1.0",
        license: "CC0-1.0",
        payloadSHA256: "d39c685343bd49c4c424f74eabdca501161ae94a9a14d8acdba6e604f496f5a9",
        payloadByteLength: 815_638,
        payloadRate: 22_050,
        playableRange: 28...67,
        maximumRenderSeconds: 4,
        bufferCacheLimit: 64,
        slices: [
            JazzSampledSlice(midiPitch: 28, tuningCents: -7, byteOffset: 0, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 31, tuningCents: -35, byteOffset: 70_560, frameCount: 21_192),
            JazzSampledSlice(midiPitch: 34, tuningCents: 3, byteOffset: 112_944, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 36, tuningCents: -5, byteOffset: 183_504, frameCount: 33_827),
            JazzSampledSlice(midiPitch: 38, tuningCents: 8, byteOffset: 251_158, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 40, tuningCents: -14, byteOffset: 321_718, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 42, tuningCents: -8, byteOffset: 392_278, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 45, tuningCents: 43, byteOffset: 462_838, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 49, tuningCents: 5, byteOffset: 533_398, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 52, tuningCents: 2, byteOffset: 603_958, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 56, tuningCents: -10, byteOffset: 674_518, frameCount: 35_280),
            JazzSampledSlice(midiPitch: 59, tuningCents: -12, byteOffset: 745_078, frameCount: 35_280)
        ]
    )

    static let concertVibesMetadata = JazzSampledInstrumentMetadata(
        algorithmID: "changes.dsp.sampled-vibraphone@1",
        attribution: "Versilian Community Sample Library, Vibraphone Soft Mallets, by Versilian Studios / Sam Gossner, CC0-1.0",
        license: "CC0-1.0",
        payloadSHA256: "a7f01856ffcf58271613fd2ee42b342877f0cfb7d30595137724fa2fa1b752cc",
        payloadByteLength: 1_267_200,
        payloadRate: 32_000,
        playableRange: 53...89,
        maximumRenderSeconds: 4,
        bufferCacheLimit: 64,
        slices: [
            JazzSampledSlice(midiPitch: 53, tuningCents: 1, byteOffset: 0, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 57, tuningCents: 0, byteOffset: 115_200, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 60, tuningCents: -1, byteOffset: 230_400, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 64, tuningCents: 0, byteOffset: 345_600, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 67, tuningCents: 0, byteOffset: 460_800, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 71, tuningCents: 0, byteOffset: 576_000, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 74, tuningCents: 0, byteOffset: 691_200, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 77, tuningCents: 0, byteOffset: 806_400, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 81, tuningCents: 0, byteOffset: 921_600, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 84, tuningCents: 0, byteOffset: 1_036_800, frameCount: 57_600),
            JazzSampledSlice(midiPitch: 88, tuningCents: 0, byteOffset: 1_152_000, frameCount: 57_600)
        ]
    )

    private static let uprightBass = load(
        metadata: uprightBassMetadata,
        resource: "upright-bass-samples"
    )
    private static let concertVibes = load(
        metadata: concertVibesMetadata,
        resource: "vibraphone-samples"
    )

    static func metadata(for tone: InstrumentTone) -> JazzSampledInstrumentMetadata? {
        switch tone {
        case .uprightBass: uprightBassMetadata
        case .concertVibes: concertVibesMetadata
        default: nil
        }
    }

    static func sourceSlice(for tone: InstrumentTone, midi: Int) -> JazzSampledSlice? {
        guard let metadata = metadata(for: tone) else { return nil }
        return nearestSlice(to: tone.renderedMIDIPitch(for: midi), in: metadata.slices)
    }

    static func render(
        tone: InstrumentTone,
        midi: Int,
        velocity: Int,
        sampleRate: Double,
        maximumSeconds: Double? = nil
    ) -> JazzSampledRender? {
        guard (minimumMIDIPitch...maximumMIDIPitch).contains(midi),
              (minimumVelocity...maximumVelocity).contains(velocity),
              sampleRate.isFinite,
              (minimumSampleRate...maximumSampleRate).contains(sampleRate),
              maximumSeconds == nil || (maximumSeconds?.isFinite == true && (maximumSeconds ?? 0) > 0),
              let instrument = loadedInstrument(for: tone) else { return nil }

        let metadata = instrument.metadata
        let renderedMidi = tone.renderedMIDIPitch(for: midi)
        let slice = nearestSlice(to: renderedMidi, in: metadata.slices)
        let semitoneShift = Double(renderedMidi - slice.midiPitch) - slice.tuningCents / 100
        let step = pow(2, semitoneShift / 12) * metadata.payloadRate / sampleRate
        let readableFrames = slice.frameCount - 2
        guard readableFrames >= 2, step.isFinite, step > 0 else { return nil }

        let naturalFrames = Int(floor(Double(readableFrames) / step))
        let requestedMaximum = min(maximumSeconds ?? metadata.maximumRenderSeconds, metadata.maximumRenderSeconds)
        let ceilingFrames = min(naturalFrames, Int(floor(requestedMaximum * sampleRate)))
        let frameCount = max(1, ceilingFrames)
        let base = slice.byteOffset / 2
        guard base >= 0, base + slice.frameCount <= instrument.samples.count else { return nil }

        var output = [Float](repeating: 0, count: frameCount)
        for frame in 0..<frameCount {
            let position = Double(frame) * step
            let index = Int(floor(position))
            let fraction = position - Double(index)
            let p0 = sample(instrument.samples, at: base + max(0, index - 1))
            let p1 = sample(instrument.samples, at: base + index)
            let p2 = sample(instrument.samples, at: base + min(readableFrames + 1, index + 1))
            let p3 = sample(instrument.samples, at: base + min(readableFrames + 1, index + 2))
            let a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3
            let b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3
            let c = -0.5 * p0 + 0.5 * p2
            output[frame] = Float(((a * fraction + b) * fraction + c) * fraction + p1)
        }

        if frameCount < naturalFrames {
            let guardFrames = min(truncationGuardFrames, frameCount)
            for index in 0..<guardFrames {
                let frame = frameCount - guardFrames + index
                let weight = 0.5 + 0.5 * cos(Double.pi * Double(index + 1) / Double(guardFrames))
                output[frame] *= Float(weight)
            }
        }

        return JazzSampledRender(
            algorithmID: metadata.algorithmID,
            requestedMIDIPitch: midi,
            renderedMIDIPitch: renderedMidi,
            sourceMIDIPitch: slice.midiPitch,
            samples: output,
            sampleRate: sampleRate
        )
    }

    private static func loadedInstrument(for tone: InstrumentTone) -> LoadedInstrument? {
        switch tone {
        case .uprightBass: uprightBass
        case .concertVibes: concertVibes
        default: nil
        }
    }

    private static func load(
        metadata: JazzSampledInstrumentMetadata,
        resource: String
    ) -> LoadedInstrument? {
        let candidateBundles = [Bundle.main] + Bundle.allBundles + Bundle.allFrameworks
        guard let url = candidateBundles.lazy.compactMap({
            $0.url(forResource: resource, withExtension: "pcm")
        }).first,
        let data = try? Data(contentsOf: url),
        data.count == metadata.payloadByteLength else { return nil }

        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == metadata.payloadSHA256 else { return nil }
        var samples = [Int16]()
        samples.reserveCapacity(data.count / 2)
        data.withUnsafeBytes { bytes in
            for index in stride(from: 0, to: bytes.count, by: 2) {
                let word = UInt16(bytes[index]) | UInt16(bytes[index + 1]) << 8
                samples.append(Int16(bitPattern: word))
            }
        }
        return LoadedInstrument(metadata: metadata, samples: samples)
    }

    private static func nearestSlice(
        to midi: Int,
        in slices: [JazzSampledSlice]
    ) -> JazzSampledSlice {
        slices.min {
            let leftDistance = abs($0.midiPitch - midi)
            let rightDistance = abs($1.midiPitch - midi)
            return leftDistance == rightDistance
                ? $0.midiPitch > $1.midiPitch
                : leftDistance < rightDistance
        } ?? slices[0]
    }

    private static func sample(_ samples: [Int16], at index: Int) -> Double {
        Double(samples[index]) / 32_768
    }
}

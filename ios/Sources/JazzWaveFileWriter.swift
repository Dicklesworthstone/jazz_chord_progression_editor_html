import Foundation

enum JazzWaveFileIssue: LocalizedError, Equatable, Sendable {
    case empty
    case channelLengthMismatch
    case invalidSampleRate
    case durationExceeded(maximumSeconds: Int)
    case nonFiniteSample(channel: String, frame: Int)
    case renderFailed

    var errorDescription: String? {
        switch self {
        case .empty:
            "The chart renderer produced no audio frames."
        case .channelLengthMismatch:
            "The chart renderer produced mismatched stereo channels."
        case .invalidSampleRate:
            "The chart renderer produced an unsupported sample rate."
        case let .durationExceeded(maximumSeconds):
            "Dry WAV export is limited to \(maximumSeconds / 60) minutes per file."
        case let .nonFiniteSample(channel, frame):
            "The \(channel) channel contains an invalid sample at frame \(frame)."
        case .renderFailed:
            "The local performance renderer could not create a safe audio file."
        }
    }
}

struct JazzWaveFile: Sendable {
    let data: Data
    let frameCount: Int
    let sampleRate: Int
    let durationSeconds: Double
    /// Never exceeds one: quiet files are not boosted, while over-range PCM is
    /// reduced just enough to retain deterministic headroom without clipping.
    let peakReductionGain: Double
}

/// Deterministic bounded RIFF/PCM encoder. This type only transforms an
/// already-rendered buffer; it cannot construct or start an audio graph.
enum JazzWaveFileWriter {
    static let maximumDurationSeconds = 180
    static let sampleRate = 24_000
    static let targetPeak = 0.98

    static func makeFile(_ rendered: JazzRenderedAudio) throws -> JazzWaveFile {
        guard !rendered.left.isEmpty else { throw JazzWaveFileIssue.empty }
        guard rendered.left.count == rendered.right.count else {
            throw JazzWaveFileIssue.channelLengthMismatch
        }
        let roundedRate = rendered.sampleRate.rounded()
        guard rendered.sampleRate.isFinite,
              rendered.sampleRate == roundedRate,
              Int(roundedRate) == sampleRate
        else { throw JazzWaveFileIssue.invalidSampleRate }
        guard rendered.left.count <= sampleRate * maximumDurationSeconds else {
            throw JazzWaveFileIssue.durationExceeded(maximumSeconds: maximumDurationSeconds)
        }

        var peak = 0.0
        for frame in rendered.left.indices {
            let left = Double(rendered.left[frame])
            let right = Double(rendered.right[frame])
            guard left.isFinite else {
                throw JazzWaveFileIssue.nonFiniteSample(channel: "left", frame: frame)
            }
            guard right.isFinite else {
                throw JazzWaveFileIssue.nonFiniteSample(channel: "right", frame: frame)
            }
            peak = max(peak, max(abs(left), abs(right)))
        }
        let gain = peak > targetPeak ? targetPeak / peak : 1
        let pcmByteCount = rendered.left.count * 4
        var data = Data(count: 44 + pcmByteCount)
        data.withUnsafeMutableBytes { rawBuffer in
            let bytes = rawBuffer.bindMemory(to: UInt8.self)
            func putASCII(_ text: StaticString, at offset: Int) {
                text.withUTF8Buffer { source in
                    for index in source.indices { bytes[offset + index] = source[index] }
                }
            }
            func putUInt16(_ value: UInt16, at offset: Int) {
                bytes[offset] = UInt8(truncatingIfNeeded: value)
                bytes[offset + 1] = UInt8(truncatingIfNeeded: value >> 8)
            }
            func putUInt32(_ value: UInt32, at offset: Int) {
                bytes[offset] = UInt8(truncatingIfNeeded: value)
                bytes[offset + 1] = UInt8(truncatingIfNeeded: value >> 8)
                bytes[offset + 2] = UInt8(truncatingIfNeeded: value >> 16)
                bytes[offset + 3] = UInt8(truncatingIfNeeded: value >> 24)
            }
            func quantize(_ sample: Float) -> Int16 {
                let scaled = Double(sample) * gain
                let asymmetric = scaled * (scaled < 0 ? 32_768 : 32_767)
                let roundedLikeJavaScript = Int(floor(asymmetric + 0.5))
                return Int16(clamping: roundedLikeJavaScript)
            }

            putASCII("RIFF", at: 0)
            putUInt32(UInt32(36 + pcmByteCount), at: 4)
            putASCII("WAVE", at: 8)
            putASCII("fmt ", at: 12)
            putUInt32(16, at: 16)
            putUInt16(1, at: 20)
            putUInt16(2, at: 22)
            putUInt32(UInt32(sampleRate), at: 24)
            putUInt32(UInt32(sampleRate * 4), at: 28)
            putUInt16(4, at: 32)
            putUInt16(16, at: 34)
            putASCII("data", at: 36)
            putUInt32(UInt32(pcmByteCount), at: 40)
            for frame in rendered.left.indices {
                putUInt16(UInt16(bitPattern: quantize(rendered.left[frame])), at: 44 + frame * 4)
                putUInt16(UInt16(bitPattern: quantize(rendered.right[frame])), at: 46 + frame * 4)
            }
        }
        return JazzWaveFile(
            data: data,
            frameCount: rendered.left.count,
            sampleRate: sampleRate,
            durationSeconds: Double(rendered.left.count) / Double(sampleRate),
            peakReductionGain: gain
        )
    }
}

/// The only chart-to-file composition path. Keeping this seam outside the
/// store makes it directly testable and guarantees export uses the same
/// authoritative performed-groove renderer as transport preparation.
enum JazzDryWaveExporter {
    static let rendererTailSeconds = 0.35

    nonisolated static func makeFile(
        chart: JazzChart,
        cancellation: JazzRenderCancellationToken? = nil
    ) throws -> JazzWaveFile {
        let renderedSeconds = chart.durationBeats * 60 / chart.tempoBPM + rendererTailSeconds
        guard renderedSeconds.isFinite,
              renderedSeconds > 0,
              renderedSeconds <= Double(JazzWaveFileWriter.maximumDurationSeconds)
        else {
            throw JazzWaveFileIssue.durationExceeded(
                maximumSeconds: JazzWaveFileWriter.maximumDurationSeconds
            )
        }
        guard cancellation?.isCancelled != true,
              let rendered = JazzAudioRenderer.render(chart: chart, cancellation: cancellation),
              cancellation?.isCancelled != true
        else { throw JazzWaveFileIssue.renderFailed }
        return try JazzWaveFileWriter.makeFile(rendered)
    }
}

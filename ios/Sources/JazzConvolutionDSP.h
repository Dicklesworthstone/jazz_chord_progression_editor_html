#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

#ifdef __cplusplus
extern "C" {
#endif

typedef struct JazzImpulseObservation {
    uint32_t samplesWritten;
    int32_t peakQ15;
    uint32_t finalStateUint32;
    uint32_t predelayFrames;
    double normalizationScale;
} JazzImpulseObservation;

/// Writes the exact versioned web impulse into caller-owned stereo buffers.
BOOL JazzWriteDeterministicImpulse(
    double sampleRate,
    float *left,
    float *right,
    uint32_t frameCount,
    JazzImpulseObservation *observation
);

/// Creates the persistent wet-only AUv3 stage. It performs normalized stereo
/// convolution with the exact generated impulse using deterministic 1024-frame
/// uniform FFT partitions.
AVAudioUnitEffect *JazzMakeDeterministicConvolutionAudioUnit(void);

uint32_t JazzConvolutionPartitionFrames(void);

#ifdef __cplusplus
}
#endif

NS_ASSUME_NONNULL_END

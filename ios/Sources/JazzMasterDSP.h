#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

#ifdef __cplusplus
extern "C" {
#endif

/// Creates the process-local AUv3 effect used at FrankenJazz's single shared
/// post-dynamics master stage.
AVAudioUnitEffect *JazzMakeSoftClipAudioUnit(void);

/// Pure reference helpers exposed to Swift tests without starting an audio
/// engine or touching an output device.
float JazzSoftClipShape(float sample);
float JazzSoftClipOversampledPair(float previousSample, float currentSample);

#ifdef __cplusplus
}
#endif

NS_ASSUME_NONNULL_END

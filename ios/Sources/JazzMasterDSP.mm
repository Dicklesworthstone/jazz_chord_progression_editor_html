#import "JazzMasterDSP.h"

#import <AudioToolbox/AudioToolbox.h>
#import <algorithm>
#import <cmath>

namespace {

constexpr float kDrive = 1.5F;
constexpr AudioComponentDescription kSoftClipDescription = {
    kAudioUnitType_Effect,
    0x4A534331, // JSC1
    0x4A456D6E, // JEmn
    0,
    0,
};

inline float clampUnit(float sample) {
    return std::max(-1.0F, std::min(1.0F, sample));
}

inline float shape(float sample) {
    return std::tanh(kDrive * clampUnit(sample)) / std::tanh(kDrive);
}

inline float oversampledPair(float previousSample, float currentSample) {
    // Deterministic 2x linear upsampling followed by a two-tap box decimator.
    // The Web Audio contract requires 2x oversampling but does not standardize
    // an implementation kernel across browsers; this fixed kernel makes the
    // native adaptation explicit and reproducible.
    const float midpoint = 0.5F * (previousSample + currentSample);
    return 0.5F * (shape(midpoint) + shape(currentSample));
}

} // namespace

float JazzSoftClipShape(float sample) {
    return shape(sample);
}

float JazzSoftClipOversampledPair(float previousSample, float currentSample) {
    return oversampledPair(previousSample, currentSample);
}

@interface JazzSoftClipAudioUnit : AUAudioUnit
@end

@implementation JazzSoftClipAudioUnit {
    AUAudioUnitBus *_inputBus;
    AUAudioUnitBus *_outputBus;
    AUAudioUnitBusArray *_inputBusArray;
    AUAudioUnitBusArray *_outputBusArray;
    AVAudioPCMBuffer *_inputBuffer;
    float _previousSamples[2];
}

- (instancetype)initWithComponentDescription:(AudioComponentDescription)componentDescription
                                      options:(AudioComponentInstantiationOptions)options
                                        error:(NSError **)outError {
    self = [super initWithComponentDescription:componentDescription options:options error:outError];
    if (self == nil) { return nil; }
    AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:44100 channels:2];
    _inputBus = [[AUAudioUnitBus alloc] initWithFormat:format error:outError];
    if (_inputBus == nil) { return nil; }
    _outputBus = [[AUAudioUnitBus alloc] initWithFormat:format error:outError];
    if (_outputBus == nil) { return nil; }
    _inputBus.maximumChannelCount = 2;
    _outputBus.maximumChannelCount = 2;
    _inputBusArray = [[AUAudioUnitBusArray alloc] initWithAudioUnit:self
                                                           busType:AUAudioUnitBusTypeInput
                                                            busses:@[_inputBus]];
    _outputBusArray = [[AUAudioUnitBusArray alloc] initWithAudioUnit:self
                                                            busType:AUAudioUnitBusTypeOutput
                                                             busses:@[_outputBus]];
    return self;
}

- (AUAudioUnitBusArray *)inputBusses { return _inputBusArray; }
- (AUAudioUnitBusArray *)outputBusses { return _outputBusArray; }
- (NSArray<NSNumber *> *)channelCapabilities { return @[@2, @2]; }
- (BOOL)canProcessInPlace { return YES; }

- (BOOL)allocateRenderResourcesAndReturnError:(NSError **)outError {
    AVAudioFormat *input = _inputBus.format;
    AVAudioFormat *output = _outputBus.format;
    const BOOL supported = input.channelCount == 2 && output.channelCount == 2
        && input.commonFormat == AVAudioPCMFormatFloat32
        && output.commonFormat == AVAudioPCMFormatFloat32
        && !input.interleaved && !output.interleaved
        && input.sampleRate == output.sampleRate;
    if (!supported) {
        if (outError != nullptr) {
            *outError = [NSError errorWithDomain:NSOSStatusErrorDomain
                                            code:kAudioUnitErr_FormatNotSupported
                                        userInfo:nil];
        }
        return NO;
    }
    _inputBuffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:input
                                                frameCapacity:self.maximumFramesToRender];
    if (_inputBuffer == nil) {
        if (outError != nullptr) {
            *outError = [NSError errorWithDomain:NSOSStatusErrorDomain
                                            code:kAudioUnitErr_FailedInitialization
                                        userInfo:nil];
        }
        return NO;
    }
    _previousSamples[0] = 0;
    _previousSamples[1] = 0;
    return [super allocateRenderResourcesAndReturnError:outError];
}

- (void)deallocateRenderResources {
    _inputBuffer = nil;
    _previousSamples[0] = 0;
    _previousSamples[1] = 0;
    [super deallocateRenderResources];
}

- (AUInternalRenderBlock)internalRenderBlock {
    __unsafe_unretained JazzSoftClipAudioUnit *unit = self;
    return ^AUAudioUnitStatus(
        AudioUnitRenderActionFlags *actionFlags,
        const AudioTimeStamp *timestamp,
        AUAudioFrameCount frameCount,
        NSInteger outputBusNumber,
        AudioBufferList *outputData,
        const AURenderEvent *realtimeEventListHead,
        AURenderPullInputBlock pullInputBlock
    ) {
        (void)outputBusNumber;
        (void)realtimeEventListHead;
        if (frameCount > unit.maximumFramesToRender) {
            return kAudioUnitErr_TooManyFramesToProcess;
        }
        if (pullInputBlock == nil) { return kAudioUnitErr_NoConnection; }
        if (unit->_inputBuffer == nil) { return kAudioUnitErr_Uninitialized; }

        const AudioBufferList *original = unit->_inputBuffer.audioBufferList;
        AudioBufferList *inputData = unit->_inputBuffer.mutableAudioBufferList;
        inputData->mNumberBuffers = original->mNumberBuffers;
        const UInt32 byteCount = frameCount * sizeof(float);
        for (UInt32 channel = 0; channel < original->mNumberBuffers; ++channel) {
            inputData->mBuffers[channel].mNumberChannels = original->mBuffers[channel].mNumberChannels;
            inputData->mBuffers[channel].mData = original->mBuffers[channel].mData;
            inputData->mBuffers[channel].mDataByteSize = byteCount;
        }

        AUAudioUnitStatus status = pullInputBlock(
            actionFlags, timestamp, frameCount, 0, inputData
        );
        if (status != noErr) { return status; }
        if (inputData->mNumberBuffers != 2 || outputData->mNumberBuffers != 2) {
            return kAudioUnitErr_FormatNotSupported;
        }

        for (UInt32 channel = 0; channel < 2; ++channel) {
            AudioBuffer &input = inputData->mBuffers[channel];
            AudioBuffer &output = outputData->mBuffers[channel];
            if (output.mData == nullptr) {
                output.mNumberChannels = input.mNumberChannels;
                output.mData = input.mData;
            }
            output.mDataByteSize = byteCount;
            const float *source = static_cast<const float *>(input.mData);
            float *destination = static_cast<float *>(output.mData);
            if (source == nullptr || destination == nullptr) { return kAudio_ParamError; }
            float previous = unit->_previousSamples[channel];
            for (AUAudioFrameCount frame = 0; frame < frameCount; ++frame) {
                const float current = source[frame];
                destination[frame] = oversampledPair(previous, current);
                previous = current;
            }
            unit->_previousSamples[channel] = previous;
        }
        return noErr;
    };
}

@end

AVAudioUnitEffect *JazzMakeSoftClipAudioUnit(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        [AUAudioUnit registerSubclass:JazzSoftClipAudioUnit.class
               asComponentDescription:kSoftClipDescription
                                 name:@"FrankenJazz: Deterministic 2x Tanh Soft Clip"
                              version:0x00010000];
    });
    return [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:kSoftClipDescription];
}

#import "JazzConvolutionDSP.h"

#import <Accelerate/Accelerate.h>
#import <AudioToolbox/AudioToolbox.h>
#import <algorithm>
#import <cmath>
#import <cstdint>
#import <vector>

namespace {

constexpr uint32_t kSeed = 0x58403031;
constexpr uint32_t kChannels = 2;
constexpr uint32_t kDurationSeconds = 4;
constexpr uint32_t kPredelayDivisor = 50;
constexpr int32_t kLowpassAlphaQ15 = 6000;
constexpr int32_t kQ15 = 32768;
constexpr int32_t kEnvelopeMaximumQ15 = 32767;
constexpr uint32_t kPartitionFrames = 1024;
constexpr uint32_t kFFTFrames = kPartitionFrames * 2;
constexpr AudioComponentDescription kConvolutionDescription = {
    kAudioUnitType_Effect,
    0x4A434E31, // JCN1
    0x4A456D6E, // JEmn
    0,
    0,
};

uint32_t nextXorshift32(uint32_t state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
}

unsigned __int128 fourthPower(uint64_t value) {
    const unsigned __int128 square = static_cast<unsigned __int128>(value) * value;
    return square * square;
}

bool writeImpulse(
    double sampleRate,
    float *left,
    float *right,
    uint32_t frameCount,
    JazzImpulseObservation *observation
) {
    if (left == nullptr || right == nullptr || observation == nullptr
        || !std::isfinite(sampleRate) || sampleRate != std::floor(sampleRate)
        || sampleRate < 8000 || sampleRate > 192000
        || frameCount != static_cast<uint32_t>(sampleRate) * kDurationSeconds) {
        return false;
    }

    const uint32_t predelayFrames = static_cast<uint32_t>(sampleRate) / kPredelayDivisor;
    const unsigned __int128 lengthFourth = fourthPower(frameCount);
    uint32_t state = kSeed;
    int32_t peak = 0;
    int32_t lp1[2] = {0, 0};
    int32_t lp2[2] = {0, 0};
    double squareSum = 0;

    for (uint32_t frame = 0; frame < frameCount; ++frame) {
        const int32_t envelope = frame < predelayFrames
            ? 0
            : static_cast<int32_t>(
                (fourthPower(frameCount - frame) * kEnvelopeMaximumQ15) / lengthFourth
            );
        float *outputs[2] = {left, right};
        for (uint32_t channel = 0; channel < kChannels; ++channel) {
            state = nextXorshift32(state);
            const int32_t noise = static_cast<int32_t>(state >> 16) - 32768;
            lp1[channel] += (kLowpassAlphaQ15 * (noise - lp1[channel])) / kQ15;
            lp2[channel] += (kLowpassAlphaQ15 * (lp1[channel] - lp2[channel])) / kQ15;
            const int32_t sampleQ15 = (lp2[channel] * envelope) / kQ15;
            const float sample = static_cast<float>(sampleQ15) / kQ15;
            outputs[channel][frame] = sample;
            peak = std::max(peak, std::abs(sampleQ15));
            squareSum += static_cast<double>(sample) * sample;
        }
    }

    double power = std::sqrt(squareSum / (static_cast<double>(kChannels) * frameCount));
    if (!std::isfinite(power) || power < 0.000125) { power = 0.000125; }
    observation->samplesWritten = frameCount * kChannels;
    observation->peakQ15 = peak;
    observation->finalStateUint32 = state;
    observation->predelayFrames = predelayFrames;
    observation->normalizationScale = (0.00125 / power) * (44100.0 / sampleRate);
    return true;
}

class PartitionedConvolver {
public:
    ~PartitionedConvolver() { clear(); }

    bool prepare(double sampleRate) {
        clear();
        const uint32_t impulseFrames = static_cast<uint32_t>(sampleRate) * kDurationSeconds;
        std::vector<float> left(impulseFrames);
        std::vector<float> right(impulseFrames);
        JazzImpulseObservation observation{};
        if (!writeImpulse(sampleRate, left.data(), right.data(), impulseFrames, &observation)) {
            return false;
        }

        forward_ = vDSP_DFT_zop_CreateSetup(nullptr, kFFTFrames, vDSP_DFT_FORWARD);
        inverse_ = vDSP_DFT_zop_CreateSetup(forward_, kFFTFrames, vDSP_DFT_INVERSE);
        if (forward_ == nullptr || inverse_ == nullptr) {
            clear();
            return false;
        }
        partitionCount_ = (impulseFrames + kPartitionFrames - 1) / kPartitionFrames;
        normalizationScale_ = static_cast<float>(observation.normalizationScale);
        prepareChannel(channels_[0], left);
        prepareChannel(channels_[1], right);
        prepared_ = true;
        return true;
    }

    void clear() {
        prepared_ = false;
        partitionCount_ = 0;
        normalizationScale_ = 0;
        for (Channel &channel : channels_) { channel = Channel{}; }
        if (inverse_ != nullptr) { vDSP_DFT_DestroySetup(inverse_); }
        if (forward_ != nullptr) { vDSP_DFT_DestroySetup(forward_); }
        inverse_ = nullptr;
        forward_ = nullptr;
    }

    bool prepared() const { return prepared_; }

    float process(uint32_t channelIndex, float input) {
        Channel &channel = channels_[channelIndex];
        const float output = channel.output[channel.fill];
        channel.input[channel.fill] = input;
        channel.fill += 1;
        if (channel.fill == kPartitionFrames) {
            processBlock(channel);
            channel.fill = 0;
        }
        return output;
    }

private:
    struct Channel {
        std::vector<float> impulseReal;
        std::vector<float> impulseImag;
        std::vector<float> historyReal;
        std::vector<float> historyImag;
        std::vector<float> input;
        std::vector<float> output;
        std::vector<float> overlap;
        std::vector<float> scratchReal;
        std::vector<float> scratchImag;
        std::vector<float> sumReal;
        std::vector<float> sumImag;
        std::vector<float> timeReal;
        std::vector<float> timeImag;
        uint32_t fill = 0;
        uint32_t historyIndex = 0;
    };

    void prepareChannel(Channel &channel, const std::vector<float> &impulse) {
        const size_t spectrumSize = static_cast<size_t>(partitionCount_) * kFFTFrames;
        channel.impulseReal.assign(spectrumSize, 0);
        channel.impulseImag.assign(spectrumSize, 0);
        channel.historyReal.assign(spectrumSize, 0);
        channel.historyImag.assign(spectrumSize, 0);
        channel.input.assign(kPartitionFrames, 0);
        channel.output.assign(kPartitionFrames, 0);
        channel.overlap.assign(kPartitionFrames, 0);
        channel.scratchReal.assign(kFFTFrames, 0);
        channel.scratchImag.assign(kFFTFrames, 0);
        channel.sumReal.assign(kFFTFrames, 0);
        channel.sumImag.assign(kFFTFrames, 0);
        channel.timeReal.assign(kFFTFrames, 0);
        channel.timeImag.assign(kFFTFrames, 0);

        for (uint32_t partition = 0; partition < partitionCount_; ++partition) {
            std::fill(channel.scratchReal.begin(), channel.scratchReal.end(), 0);
            const uint32_t base = partition * kPartitionFrames;
            const uint32_t count = std::min<uint32_t>(
                kPartitionFrames, static_cast<uint32_t>(impulse.size()) - base
            );
            for (uint32_t frame = 0; frame < count; ++frame) {
                channel.scratchReal[frame] = impulse[base + frame] * normalizationScale_;
            }
            const size_t offset = static_cast<size_t>(partition) * kFFTFrames;
            vDSP_DFT_Execute(
                forward_, channel.scratchReal.data(), channel.scratchImag.data(),
                channel.impulseReal.data() + offset, channel.impulseImag.data() + offset
            );
        }
    }

    void processBlock(Channel &channel) {
        std::copy(channel.input.begin(), channel.input.end(), channel.scratchReal.begin());
        std::fill(
            channel.scratchReal.begin() + kPartitionFrames, channel.scratchReal.end(), 0
        );
        std::fill(channel.scratchImag.begin(), channel.scratchImag.end(), 0);
        const size_t currentOffset = static_cast<size_t>(channel.historyIndex) * kFFTFrames;
        vDSP_DFT_Execute(
            forward_, channel.scratchReal.data(), channel.scratchImag.data(),
            channel.historyReal.data() + currentOffset,
            channel.historyImag.data() + currentOffset
        );
        std::fill(channel.sumReal.begin(), channel.sumReal.end(), 0);
        std::fill(channel.sumImag.begin(), channel.sumImag.end(), 0);

        for (uint32_t partition = 0; partition < partitionCount_; ++partition) {
            const uint32_t historySlot =
                (channel.historyIndex + partitionCount_ - partition) % partitionCount_;
            const size_t historyOffset = static_cast<size_t>(historySlot) * kFFTFrames;
            const size_t impulseOffset = static_cast<size_t>(partition) * kFFTFrames;
            for (uint32_t bin = 0; bin < kFFTFrames; ++bin) {
                const float xr = channel.historyReal[historyOffset + bin];
                const float xi = channel.historyImag[historyOffset + bin];
                const float hr = channel.impulseReal[impulseOffset + bin];
                const float hi = channel.impulseImag[impulseOffset + bin];
                channel.sumReal[bin] += xr * hr - xi * hi;
                channel.sumImag[bin] += xr * hi + xi * hr;
            }
        }

        vDSP_DFT_Execute(
            inverse_, channel.sumReal.data(), channel.sumImag.data(),
            channel.timeReal.data(), channel.timeImag.data()
        );
        const float inverseScale = 1.0F / kFFTFrames;
        for (uint32_t frame = 0; frame < kPartitionFrames; ++frame) {
            channel.output[frame] = channel.timeReal[frame] * inverseScale + channel.overlap[frame];
            channel.overlap[frame] = channel.timeReal[frame + kPartitionFrames] * inverseScale;
        }
        channel.historyIndex = (channel.historyIndex + 1) % partitionCount_;
    }

    Channel channels_[2];
    vDSP_DFT_Setup forward_ = nullptr;
    vDSP_DFT_Setup inverse_ = nullptr;
    uint32_t partitionCount_ = 0;
    float normalizationScale_ = 0;
    bool prepared_ = false;
};

} // namespace

BOOL JazzWriteDeterministicImpulse(
    double sampleRate,
    float *left,
    float *right,
    uint32_t frameCount,
    JazzImpulseObservation *observation
) {
    return writeImpulse(sampleRate, left, right, frameCount, observation) ? YES : NO;
}

uint32_t JazzConvolutionPartitionFrames(void) { return kPartitionFrames; }

@interface JazzConvolutionAudioUnit : AUAudioUnit
@end

@implementation JazzConvolutionAudioUnit {
    AUAudioUnitBus *_inputBus;
    AUAudioUnitBus *_outputBus;
    AUAudioUnitBusArray *_inputBusArray;
    AUAudioUnitBusArray *_outputBusArray;
    AVAudioPCMBuffer *_inputBuffer;
    PartitionedConvolver _convolver;
    double _sampleRate;
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
- (NSTimeInterval)latency { return _sampleRate > 0 ? kPartitionFrames / _sampleRate : 0; }
- (NSTimeInterval)tailTime { return kDurationSeconds; }

- (BOOL)allocateRenderResourcesAndReturnError:(NSError **)outError {
    AVAudioFormat *input = _inputBus.format;
    AVAudioFormat *output = _outputBus.format;
    const BOOL supported = input.channelCount == 2 && output.channelCount == 2
        && input.commonFormat == AVAudioPCMFormatFloat32
        && output.commonFormat == AVAudioPCMFormatFloat32
        && !input.interleaved && !output.interleaved
        && input.sampleRate == output.sampleRate
        && input.sampleRate == std::floor(input.sampleRate)
        && input.sampleRate >= 8000 && input.sampleRate <= 192000;
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
    if (_inputBuffer == nil || !_convolver.prepare(input.sampleRate)) {
        if (outError != nullptr) {
            *outError = [NSError errorWithDomain:NSOSStatusErrorDomain
                                            code:kAudioUnitErr_FailedInitialization
                                        userInfo:nil];
        }
        _inputBuffer = nil;
        _convolver.clear();
        return NO;
    }
    _sampleRate = input.sampleRate;
    return [super allocateRenderResourcesAndReturnError:outError];
}

- (void)deallocateRenderResources {
    _inputBuffer = nil;
    _convolver.clear();
    _sampleRate = 0;
    [super deallocateRenderResources];
}

- (AUInternalRenderBlock)internalRenderBlock {
    __unsafe_unretained JazzConvolutionAudioUnit *unit = self;
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
        if (frameCount > unit.maximumFramesToRender) { return kAudioUnitErr_TooManyFramesToProcess; }
        if (pullInputBlock == nil) { return kAudioUnitErr_NoConnection; }
        if (unit->_inputBuffer == nil || !unit->_convolver.prepared()) {
            return kAudioUnitErr_Uninitialized;
        }

        const AudioBufferList *original = unit->_inputBuffer.audioBufferList;
        AudioBufferList *inputData = unit->_inputBuffer.mutableAudioBufferList;
        inputData->mNumberBuffers = original->mNumberBuffers;
        const UInt32 byteCount = frameCount * sizeof(float);
        for (UInt32 channel = 0; channel < original->mNumberBuffers; ++channel) {
            inputData->mBuffers[channel].mNumberChannels = original->mBuffers[channel].mNumberChannels;
            inputData->mBuffers[channel].mData = original->mBuffers[channel].mData;
            inputData->mBuffers[channel].mDataByteSize = byteCount;
        }
        AUAudioUnitStatus status = pullInputBlock(actionFlags, timestamp, frameCount, 0, inputData);
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
            for (AUAudioFrameCount frame = 0; frame < frameCount; ++frame) {
                destination[frame] = unit->_convolver.process(channel, source[frame]);
            }
        }
        return noErr;
    };
}

@end

AVAudioUnitEffect *JazzMakeDeterministicConvolutionAudioUnit(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        [AUAudioUnit registerSubclass:JazzConvolutionAudioUnit.class
               asComponentDescription:kConvolutionDescription
                                 name:@"FrankenJazz: Deterministic Hall Convolution"
                              version:0x00010000];
    });
    return [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:kConvolutionDescription];
}

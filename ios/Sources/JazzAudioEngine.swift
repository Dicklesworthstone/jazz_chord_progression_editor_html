import AVFoundation
import AudioToolbox
import Foundation

@MainActor
final class JazzAudioEngine: ObservableObject {
    struct MasterGraphSnapshot: Equatable, Sendable {
        var nodeIDs: [String]
        var dcBlockFrequencyHz: Double
        var lowShelfFrequencyHz: Double
        var lowShelfGainDB: Double
        var highShelfFrequencyHz: Double
        var highShelfGainDB: Double
        var dynamicsThresholdDB: Double
        var dynamicsAttackSeconds: Double
        var dynamicsReleaseSeconds: Double
        var maximumReverbSendGain: Double
        var reverbAmount: Double
        var safetyGain: Double
    }

    struct SectionLoopRange: Equatable, Sendable {
        var startBeat: Double
        var endBeat: Double
    }
    struct TransportClickPlan: Equatable, Sendable {
        var leadInBeats: Double
        var chartPhaseBeat: Double
        var firstChartClickOffsetBeats: Double?
        var firstChartClickIsAccent: Bool
    }

    enum ChordStepDirection {
        case previous
        case next
    }

    enum State: Equatable {
        case ready
        case preparing
        case playing
        case paused
        case failed(String)
    }

    @Published private(set) var state: State = .ready
    @Published private(set) var playheadBeat = 0.0
    @Published private(set) var totalBeats = 0.0
    @Published private(set) var activeChordID: UUID?
    @Published private(set) var previewIssue: String?
    @Published var loops = false
    @Published private(set) var sectionLoopRange: SectionLoopRange?
    @Published private(set) var masterVolume = 0.78
    @Published private(set) var reverbAmount = 0.55
    @Published private(set) var isMuted = false
    @Published private(set) var countInEnabled = false
    @Published private(set) var metronomeEnabled = false
    @Published private(set) var isCountingIn = false

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    /// Preview owns a separate node and generation fence. Inspector notes can
    /// therefore coexist with progression playback without seeking, pausing,
    /// replacing, or completing the main transport's scheduled buffer.
    private let previewPlayer = AVAudioPlayerNode()
    /// Clicks own a third node so transport practice controls never rewrite
    /// the chart render or interrupt inspector-note ownership.
    private let clickPlayer = AVAudioPlayerNode()
    /// One persistent native graph is shared by progression, metronome, and
    /// inspector preview nodes. It is constructed once and never rebuilt for
    /// instrument changes, seeks, or rapid keyboard touches.
    private let instrumentBus = AVAudioMixerNode()
    private let toneEQ = AVAudioUnitEQ(numberOfBands: 3)
    private let dryGain = AVAudioMixerNode()
    private let reverbSend = AVAudioMixerNode()
    private let hall = AVAudioUnitReverb()
    private let reverbReturn = AVAudioMixerNode()
    private let sumBus = AVAudioMixerNode()
    private let dynamics = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
        componentType: kAudioUnitType_Effect,
        componentSubType: kAudioUnitSubType_DynamicsProcessor,
        componentManufacturer: kAudioUnitManufacturer_Apple,
        componentFlags: 0,
        componentFlagsMask: 0
    ))
    private let outputLimiter = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
        componentType: kAudioUnitType_Effect,
        componentSubType: kAudioUnitSubType_PeakLimiter,
        componentManufacturer: kAudioUnitManufacturer_Apple,
        componentFlags: 0,
        componentFlagsMask: 0
    ))
    private let safetyGain = AVAudioMixerNode()
    private var buffer: AVAudioPCMBuffer?
    private var scheduledBuffer: AVAudioPCMBuffer?
    private var scheduledPreviewBuffer: AVAudioPCMBuffer?
    private var scheduledLeadInBuffer: AVAudioPCMBuffer?
    private var scheduledClickBar: AVAudioPCMBuffer?
    private var scheduledClickDelay: AVAudioPCMBuffer?
    private var scheduledClickTail: AVAudioPCMBuffer?
    private var events: [PlaybackEvent] = []
    private var tempo = 120.0
    private var timer: Timer?
    private var playbackStart = Date()
    private var startingBeat = 0.0
    private var activeLeadInBeats = 0.0
    private var scheduledEndBeat = 0.0
    private var generation = 0
    private var renderRequest = 0
    private var previewGeneration = 0
    private var cacheSignature = ""
    private var renderTask: Task<Void, Never>?
    private var renderCancellation: JazzRenderCancellationToken?
    private var previewRenderTask: Task<Void, Never>?
    private var previewCancellation: JazzRenderCancellationToken?

    init() {
        engine.attach(player)
        engine.attach(previewPlayer)
        engine.attach(clickPlayer)
        engine.attach(instrumentBus)
        engine.attach(toneEQ)
        engine.attach(dryGain)
        engine.attach(reverbSend)
        engine.attach(hall)
        engine.attach(reverbReturn)
        engine.attach(sumBus)
        engine.attach(dynamics)
        engine.attach(outputLimiter)
        engine.attach(safetyGain)

        configurePersistentGraphParameters()
        engine.connect(player, to: instrumentBus, format: nil)
        engine.connect(previewPlayer, to: instrumentBus, format: nil)
        engine.connect(clickPlayer, to: instrumentBus, format: nil)
        engine.connect(instrumentBus, to: toneEQ, format: nil)
        engine.connect(
            toneEQ,
            to: [
                AVAudioConnectionPoint(node: dryGain, bus: 0),
                AVAudioConnectionPoint(node: reverbSend, bus: 0)
            ],
            fromBus: 0,
            format: nil
        )
        engine.connect(dryGain, to: sumBus, format: nil)
        engine.connect(reverbSend, to: hall, format: nil)
        engine.connect(hall, to: reverbReturn, format: nil)
        engine.connect(reverbReturn, to: sumBus, format: nil)
        engine.connect(sumBus, to: dynamics, format: nil)
        engine.connect(dynamics, to: outputLimiter, format: nil)
        engine.connect(outputLimiter, to: safetyGain, format: nil)
        engine.connect(safetyGain, to: engine.mainMixerNode, format: nil)
        applyMixerVolume()
        applyReverbAmount()
        previewPlayer.volume = 0.82
    }

    deinit {
        renderCancellation?.cancel()
        previewCancellation?.cancel()
        renderTask?.cancel()
        previewRenderTask?.cancel()
        timer?.invalidate()
        player.stop()
        previewPlayer.stop()
        clickPlayer.stop()
        engine.stop()
    }

    var isPlaying: Bool { state == .playing }
    var isPreparing: Bool { state == .preparing }
    var progress: Double { totalBeats > 0 ? min(1, max(0, playheadBeat / totalBeats)) : 0 }

    func prime(chart: JazzChart) {
        let signature = JazzAudioRenderer.signature(for: chart)
        guard cacheSignature != signature, state == .ready else { return }
        tempo = chart.tempoBPM
        events = JazzTheory.compilePlayback(chart)
        totalBeats = chart.durationBeats
        cancelMainRender()
        renderRequest += 1
        let request = renderRequest
        let cancellation = JazzRenderCancellationToken()
        renderCancellation = cancellation
        renderTask = Task { [weak self] in
            let rendered = await Task.detached(priority: .utility) {
                JazzAudioRenderer.render(chart: chart, cancellation: cancellation)
            }.value
            guard let self,
                  self.renderRequest == request,
                  self.renderCancellation === cancellation
            else { return }
            self.renderTask = nil
            self.renderCancellation = nil
            guard self.state == .ready,
                  let rendered, let pcm = self.makePCM(rendered) else { return }
            self.buffer = pcm
            self.cacheSignature = signature
        }
    }

    func toggle(chart: JazzChart) {
        switch state {
        case .playing: pause()
        case .paused: resume()
        case .preparing: stop()
        case .ready, .failed: play(chart: chart, fromBeat: playheadBeat >= chart.durationBeats ? 0 : playheadBeat)
        }
    }

    func play(chart: JazzChart, fromBeat: Double = 0) {
        generation += 1
        let requestedGeneration = generation
        timer?.invalidate()
        player.stop()
        cancelMainRender()
        tempo = chart.tempoBPM
        events = JazzTheory.compilePlayback(chart)
        totalBeats = chart.durationBeats
        let signature = JazzAudioRenderer.signature(for: chart)
        let start = min(max(0, fromBeat), totalBeats)
        if buffer != nil, cacheSignature == signature {
            startPlayer(atBeat: start, includeCountIn: true)
            return
        }
        state = .preparing
        renderRequest += 1
        let request = renderRequest
        let renderChart = chart
        let cancellation = JazzRenderCancellationToken()
        renderCancellation = cancellation
        renderTask = Task { [weak self] in
            let rendered = await Task.detached(priority: .userInitiated) {
                JazzAudioRenderer.render(chart: renderChart, cancellation: cancellation)
            }.value
            guard let self,
                  requestedGeneration == self.generation,
                  request == self.renderRequest,
                  self.renderCancellation === cancellation
            else { return }
            self.renderTask = nil
            self.renderCancellation = nil
            guard let rendered, let pcm = self.makePCM(rendered) else {
                self.state = .failed("The local audio renderer could not create a safe buffer.")
                return
            }
            self.buffer = pcm
            self.cacheSignature = signature
            self.startPlayer(atBeat: start, includeCountIn: true)
        }
    }

    func pause() {
        guard state == .playing else { return }
        updatePlayhead()
        player.pause()
        clickPlayer.pause()
        timer?.invalidate()
        state = .paused
    }

    func resume() {
        guard state == .paused else { return }
        startPlayer(atBeat: playheadBeat)
    }

    func stop() {
        generation += 1
        renderRequest += 1
        cancelMainRender()
        timer?.invalidate()
        player.stop()
        clickPlayer.stop()
        stopPreview()
        scheduledLeadInBuffer = nil
        scheduledClickBar = nil
        scheduledClickDelay = nil
        scheduledClickTail = nil
        activeLeadInBeats = 0
        isCountingIn = false
        playheadBeat = 0
        activeChordID = nil
        state = .ready
    }

    func setSectionLoop(startBeat: Double, endBeat: Double) {
        guard startBeat.isFinite, endBeat.isFinite, startBeat >= 0, endBeat > startBeat else { return }
        loops = false
        sectionLoopRange = SectionLoopRange(startBeat: startBeat, endBeat: endBeat)
        if state == .playing {
            startPlayer(atBeat: startBeat)
        } else {
            playheadBeat = startBeat
            updateActiveChord()
        }
    }

    func clearSectionLoop() {
        let continuesPlaying = state == .playing
        if continuesPlaying { updatePlayhead() }
        let resumeBeat = playheadBeat
        sectionLoopRange = nil
        if continuesPlaying { startPlayer(atBeat: resumeBeat) }
    }

    func restart(chart: JazzChart) {
        play(chart: chart, fromBeat: 0)
    }

    /// Move to an adjacent authored chord boundary. A stopped transport stays
    /// stopped; a running or paused transport follows the same seek/resume law
    /// as the playback rail.
    func stepChord(_ direction: ChordStepDirection, chart: JazzChart) {
        guard let beat = chordTargetBeat(direction, chart: chart) else { return }
        events = JazzTheory.compilePlayback(chart)
        totalBeats = chart.durationBeats
        seek(toBeat: beat)
    }

    func chordTargetBeat(_ direction: ChordStepDirection, chart: JazzChart) -> Double? {
        let starts = JazzTheory.compilePlayback(chart).map(\.startBeat)
        let epsilon = 0.000_001
        switch direction {
        case .previous:
            // Mid-chord Previous returns to that chord's attack; pressing it
            // again from the attack reaches the preceding change.
            return starts.last(where: { $0 < playheadBeat - epsilon })
        case .next:
            return starts.first(where: { $0 > playheadBeat + epsilon })
        }
    }

    func setMasterVolume(_ volume: Double) {
        masterVolume = min(1, max(0, volume.isFinite ? volume : 0.78))
        applyMixerVolume()
    }

    func setReverbAmount(_ amount: Double) {
        reverbAmount = min(1, max(0, amount.isFinite ? amount : 0.55))
        applyReverbAmount()
    }

    func setPlaybackMix(_ mix: JazzPlaybackMix) {
        setMasterVolume(mix.masterVolume)
        setReverbAmount(mix.reverbAmount)
    }

    var masterGraphSnapshot: MasterGraphSnapshot {
        MasterGraphSnapshot(
            nodeIDs: [
                "instrument-bus", "dc-block+tone-eq", "dry-gain", "reverb-send",
                "native-medium-hall", "reverb-return", "dynamics", "native-output-limiter", "safety-gain",
                "master-gain", "destination"
            ],
            dcBlockFrequencyHz: Double(toneEQ.bands[0].frequency),
            lowShelfFrequencyHz: Double(toneEQ.bands[1].frequency),
            lowShelfGainDB: Double(toneEQ.bands[1].gain),
            highShelfFrequencyHz: Double(toneEQ.bands[2].frequency),
            highShelfGainDB: Double(toneEQ.bands[2].gain),
            dynamicsThresholdDB: -18,
            dynamicsAttackSeconds: 0.006,
            dynamicsReleaseSeconds: 0.18,
            maximumReverbSendGain: 0.28,
            reverbAmount: reverbAmount,
            safetyGain: Double(safetyGain.outputVolume)
        )
    }

    func toggleMute() {
        isMuted.toggle()
        applyMixerVolume()
    }

    func setCountInEnabled(_ enabled: Bool) {
        countInEnabled = enabled
    }

    func setMetronomeEnabled(_ enabled: Bool) {
        metronomeEnabled = enabled
        guard state == .playing, !isCountingIn else { return }
        updatePlayhead()
        clickPlayer.stop()
        scheduledClickBar = nil
        scheduledClickDelay = nil
        scheduledClickTail = nil
        guard enabled else { return }
        _ = scheduleClicks(startBeat: playheadBeat, includeCountIn: false)
    }

    nonisolated static func transportClickPlan(
        startBeat: Double,
        countInEnabled: Bool,
        metronomeEnabled: Bool
    ) -> TransportClickPlan {
        let safeStart = startBeat.isFinite ? max(0, startBeat) : 0
        let phase = safeStart.truncatingRemainder(dividingBy: 4)
        let roundedUp = ceil(safeStart - 0.000_001)
        let nextBeat = max(safeStart, roundedUp)
        return TransportClickPlan(
            leadInBeats: countInEnabled ? 4 : 0,
            chartPhaseBeat: phase,
            firstChartClickOffsetBeats: metronomeEnabled ? nextBeat - safeStart : nil,
            firstChartClickIsAccent: metronomeEnabled && Int(nextBeat.rounded()) % 4 == 0
        )
    }

    nonisolated static func playbackWindow(
        requestedBeat: Double,
        totalBeats: Double,
        sectionLoop: SectionLoopRange?
    ) -> SectionLoopRange? {
        guard requestedBeat.isFinite, totalBeats.isFinite, totalBeats > 0 else { return nil }
        if let sectionLoop,
           sectionLoop.startBeat.isFinite,
           sectionLoop.endBeat.isFinite,
           sectionLoop.startBeat >= 0,
           sectionLoop.startBeat < totalBeats,
           sectionLoop.endBeat > sectionLoop.startBeat,
           sectionLoop.endBeat <= totalBeats + 0.000_001 {
            let start = requestedBeat >= sectionLoop.startBeat && requestedBeat < sectionLoop.endBeat
                ? requestedBeat
                : sectionLoop.startBeat
            return SectionLoopRange(startBeat: start, endBeat: min(totalBeats, sectionLoop.endBeat))
        }
        return SectionLoopRange(startBeat: min(max(0, requestedBeat), totalBeats), endBeat: totalBeats)
    }

    /// Plays one bounded inspector note without touching any main-transport
    /// field. Rendering remains off the main actor; rapid taps retire stale
    /// results before they can schedule themselves.
    func preview(midi: Int, tone: InstrumentTone) {
        guard (21...108).contains(midi) else {
            previewIssue = "That key is outside the supported A0–C8 range."
            return
        }
        preview(midis: [midi], tone: tone)
    }

    /// Auditions one note or a simultaneous selected voicing without changing
    /// the progression player, playhead, or transport generation.
    func preview(midis: [Int], tone: InstrumentTone) {
        let pitches = Array(Set(midis)).sorted()
        guard (1...10).contains(pitches.count),
              pitches.allSatisfy({ (21...108).contains($0) }) else {
            previewIssue = "A preview needs 1–10 playable notes in the A0–C8 range."
            return
        }
        previewGeneration += 1
        let request = previewGeneration
        cancelPreviewRender()
        previewPlayer.stop()
        scheduledPreviewBuffer = nil
        previewIssue = nil
        let cancellation = JazzRenderCancellationToken()
        previewCancellation = cancellation
        previewRenderTask = Task { [weak self] in
            let rendered = await Task.detached(priority: .userInitiated) {
                JazzAudioRenderer.renderPreviewChord(
                    midis: pitches,
                    tone: tone,
                    cancellation: cancellation
                )
            }.value
            guard let self,
                  self.previewGeneration == request,
                  self.previewCancellation === cancellation
            else { return }
            self.previewRenderTask = nil
            self.previewCancellation = nil
            guard
                  let rendered, let pcm = self.makePCM(rendered) else { return }
            do {
                try self.configureSession()
                guard self.previewGeneration == request else { return }
                self.scheduledPreviewBuffer = pcm
                self.previewPlayer.scheduleBuffer(pcm, at: nil) { [weak self] in
                    Task { @MainActor in
                        guard let self, self.previewGeneration == request else { return }
                        self.scheduledPreviewBuffer = nil
                    }
                }
                self.previewPlayer.play()
            } catch {
                self.previewIssue = "Note preview is unavailable: \(error.localizedDescription)"
            }
        }
    }

    func stopPreview() {
        previewGeneration += 1
        cancelPreviewRender()
        previewPlayer.stop()
        scheduledPreviewBuffer = nil
        previewIssue = nil
    }

    private func cancelMainRender() {
        renderCancellation?.cancel()
        renderTask?.cancel()
        renderCancellation = nil
        renderTask = nil
    }

    private func cancelPreviewRender() {
        previewCancellation?.cancel()
        previewRenderTask?.cancel()
        previewCancellation = nil
        previewRenderTask = nil
    }

    private func makePCM(_ rendered: JazzRenderedAudio) -> AVAudioPCMBuffer? {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: rendered.sampleRate, channels: 2),
              let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rendered.left.count)),
              let channels = pcm.floatChannelData else { return nil }
        pcm.frameLength = AVAudioFrameCount(rendered.left.count)
        rendered.left.withUnsafeBufferPointer { source in
            if let baseAddress = source.baseAddress { channels[0].update(from: baseAddress, count: source.count) }
        }
        rendered.right.withUnsafeBufferPointer { source in
            if let baseAddress = source.baseAddress { channels[1].update(from: baseAddress, count: source.count) }
        }
        return pcm
    }

    func seek(to fraction: Double) {
        seek(toBeat: min(max(0, fraction), 1) * totalBeats)
    }

    func seek(toBeat beat: Double) {
        let beat = min(max(0, beat), totalBeats)
        if state == .playing || state == .paused {
            startPlayer(atBeat: beat)
        } else {
            playheadBeat = beat
            updateActiveChord()
        }
    }

    private func applyMixerVolume() {
        engine.mainMixerNode.outputVolume = isMuted ? 0 : Float(masterVolume)
    }

    private func applyReverbAmount() {
        reverbSend.outputVolume = Float(reverbAmount * 0.28)
    }

    private func configurePersistentGraphParameters() {
        let bands = toneEQ.bands
        bands[0].filterType = .highPass
        bands[0].frequency = 24
        bands[0].bandwidth = 1
        bands[0].bypass = false
        bands[1].filterType = .lowShelf
        bands[1].frequency = 180
        bands[1].gain = 1.5
        bands[1].bypass = false
        bands[2].filterType = .highShelf
        bands[2].frequency = 6_000
        bands[2].gain = -1
        bands[2].bypass = false

        dryGain.outputVolume = 1
        hall.loadFactoryPreset(.mediumHall)
        hall.wetDryMix = 100
        reverbReturn.outputVolume = 1
        AudioUnitSetParameter(
            dynamics.audioUnit, kDynamicsProcessorParam_Threshold,
            kAudioUnitScope_Global, 0, -18, 0
        )
        // Apple's dynamics processor exposes headroom rather than a direct
        // ratio/knee pair; 18 dB is the stable native adaptation of the web
        // graph's 18 dB knee and 4:1 compression region.
        AudioUnitSetParameter(
            dynamics.audioUnit, kDynamicsProcessorParam_HeadRoom,
            kAudioUnitScope_Global, 0, 18, 0
        )
        AudioUnitSetParameter(
            dynamics.audioUnit, kDynamicsProcessorParam_AttackTime,
            kAudioUnitScope_Global, 0, 0.006, 0
        )
        AudioUnitSetParameter(
            dynamics.audioUnit, kDynamicsProcessorParam_ReleaseTime,
            kAudioUnitScope_Global, 0, 0.18, 0
        )
        // The browser uses a tanh waveshaper here. Apple's native graph uses
        // its transparent peak limiter at the same position; unlike a stock
        // distortion preset this preserves the instruments' intended color.
        AudioUnitSetParameter(
            outputLimiter.audioUnit, kLimiterParam_AttackTime,
            kAudioUnitScope_Global, 0, 0.006, 0
        )
        AudioUnitSetParameter(
            outputLimiter.audioUnit, kLimiterParam_DecayTime,
            kAudioUnitScope_Global, 0, 0.06, 0
        )
        safetyGain.outputVolume = 0.9
    }

    private func configureSession() throws {
#if !targetEnvironment(macCatalyst)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)
#endif
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
        }
    }

    private func startPlayer(atBeat beat: Double, includeCountIn: Bool = false) {
        guard let buffer else {
            state = .failed("No rendered chart is available.")
            return
        }
        do {
            // Every scheduled segment owns a generation. Stopping the previous
            // player during resume/seek can run its completion callback; moving
            // the fence first makes that stale callback harmless.
            generation += 1
            try configureSession()
            player.stop()
            clickPlayer.stop()
            guard let window = Self.playbackWindow(
                requestedBeat: beat,
                totalBeats: totalBeats,
                sectionLoop: sectionLoopRange
            ) else {
                state = .failed("The requested playback range is invalid.")
                return
            }
            let effectiveBeat = window.startBeat
            let seconds = effectiveBeat * 60 / tempo
            let startFrame = AVAudioFramePosition(seconds * buffer.format.sampleRate)
            let endBeat = window.endBeat
            let endFrame = min(
                AVAudioFramePosition(buffer.frameLength),
                AVAudioFramePosition((endBeat * 60 / tempo * buffer.format.sampleRate).rounded())
            )
            let available = max(0, endFrame - startFrame)
            guard available > 0 else {
                playheadBeat = 0
                state = .ready
                return
            }
            let playable = slice(
                buffer,
                startingAt: AVAudioFrameCount(startFrame),
                frameCount: AVAudioFrameCount(available)
            )
            guard let playable else {
                state = .failed("The selected playback position could not be prepared.")
                return
            }
            scheduledBuffer = playable
            let clickPlan = Self.transportClickPlan(
                startBeat: effectiveBeat,
                countInEnabled: includeCountIn && countInEnabled,
                metronomeEnabled: metronomeEnabled
            )
            activeLeadInBeats = clickPlan.leadInBeats
            scheduledLeadInBuffer = nil
            if activeLeadInBeats > 0 {
                let leadInFrames = AVAudioFrameCount(
                    (activeLeadInBeats * 60 / tempo * buffer.format.sampleRate).rounded()
                )
                guard let silence = makeSilence(format: buffer.format, frameCount: leadInFrames) else {
                    state = .failed("The count-in buffer could not be prepared.")
                    return
                }
                scheduledLeadInBuffer = silence
                player.scheduleBuffer(silence, at: nil)
            }
            let scheduledGeneration = generation
            player.scheduleBuffer(playable, at: nil) { [weak self] in
                Task { @MainActor in
                    guard let self, self.generation == scheduledGeneration else { return }
                    self.finishedNaturally()
                }
            }
            startingBeat = effectiveBeat
            scheduledEndBeat = endBeat
            playheadBeat = effectiveBeat
            isCountingIn = activeLeadInBeats > 0
            activeChordID = isCountingIn ? nil : events.last(where: { $0.startBeat <= effectiveBeat })?.chordID
            playbackStart = Date()
            guard scheduleClicks(startBeat: effectiveBeat, includeCountIn: activeLeadInBeats > 0) else {
                state = .failed("The metronome could not be prepared.")
                return
            }
            player.play()
            state = .playing
            installTimer()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func makeSilence(format: AVAudioFormat, frameCount: AVAudioFrameCount) -> AVAudioPCMBuffer? {
        guard frameCount > 0,
              let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
        else { return nil }
        silence.frameLength = frameCount
        return silence
    }

    private func scheduleClicks(startBeat: Double, includeCountIn: Bool) -> Bool {
        guard includeCountIn || metronomeEnabled else { return true }
        guard let rendered = JazzAudioRenderer.renderTransportClickBar(tempoBPM: tempo),
              let bar = makePCM(rendered)
        else { return false }
        scheduledClickBar = bar
        scheduledClickDelay = nil
        scheduledClickTail = nil

        if includeCountIn {
            clickPlayer.scheduleBuffer(bar, at: nil)
        }
        if metronomeEnabled {
            let plan = Self.transportClickPlan(
                startBeat: startBeat,
                countInEnabled: false,
                metronomeEnabled: true
            )
            if let delayBeats = plan.firstChartClickOffsetBeats, delayBeats > 0 {
                let delayFrames = AVAudioFrameCount(
                    (delayBeats * 60 / tempo * bar.format.sampleRate).rounded()
                )
                guard let delay = makeSilence(format: bar.format, frameCount: delayFrames) else { return false }
                scheduledClickDelay = delay
                clickPlayer.scheduleBuffer(delay, at: nil)
            }
            let firstClickBeat = startBeat + (plan.firstChartClickOffsetBeats ?? 0)
            let phase = firstClickBeat.truncatingRemainder(dividingBy: 4)
            let phaseFrame = AVAudioFrameCount(
                (phase * 60 / tempo * bar.format.sampleRate).rounded()
            )
            if phaseFrame > 0, let tail = slice(bar, startingAt: phaseFrame) {
                scheduledClickTail = tail
                clickPlayer.scheduleBuffer(tail, at: nil)
            }
            clickPlayer.scheduleBuffer(bar, at: nil, options: .loops)
        }
        clickPlayer.play()
        return true
    }

    private func slice(_ source: AVAudioPCMBuffer, startingAt start: AVAudioFrameCount) -> AVAudioPCMBuffer? {
        guard start < source.frameLength else { return nil }
        let count = source.frameLength - start
        guard let output = AVAudioPCMBuffer(pcmFormat: source.format, frameCapacity: count),
              let inputChannels = source.floatChannelData,
              let outputChannels = output.floatChannelData else { return nil }
        output.frameLength = count
        for channel in 0..<Int(source.format.channelCount) {
            outputChannels[channel].update(from: inputChannels[channel].advanced(by: Int(start)), count: Int(count))
        }
        return output
    }

    private func slice(
        _ source: AVAudioPCMBuffer,
        startingAt start: AVAudioFrameCount,
        frameCount: AVAudioFrameCount
    ) -> AVAudioPCMBuffer? {
        guard start < source.frameLength, frameCount > 0 else { return nil }
        let count = min(frameCount, source.frameLength - start)
        guard let output = AVAudioPCMBuffer(pcmFormat: source.format, frameCapacity: count),
              let inputChannels = source.floatChannelData,
              let outputChannels = output.floatChannelData else { return nil }
        output.frameLength = count
        for channel in 0..<Int(source.format.channelCount) {
            outputChannels[channel].update(from: inputChannels[channel].advanced(by: Int(start)), count: Int(count))
        }
        return output
    }

    private func installTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1 / 24, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updatePlayhead() }
        }
        if let timer { RunLoop.main.add(timer, forMode: .common) }
    }

    private func updatePlayhead() {
        guard state == .playing else { return }
        let elapsedBeats = Date().timeIntervalSince(playbackStart) * tempo / 60
        isCountingIn = elapsedBeats < activeLeadInBeats
        playheadBeat = min(scheduledEndBeat, startingBeat + max(0, elapsedBeats - activeLeadInBeats))
        if isCountingIn {
            activeChordID = nil
        } else {
            updateActiveChord()
        }
    }

    private func updateActiveChord() {
        activeChordID = events.last(where: { $0.startBeat <= playheadBeat })?.chordID
    }

    private func finishedNaturally() {
        guard state == .playing else { return }
        timer?.invalidate()
        clickPlayer.stop()
        activeLeadInBeats = 0
        isCountingIn = false
        if let sectionLoopRange {
            startPlayer(atBeat: sectionLoopRange.startBeat)
        } else if loops, totalBeats > 0 {
            startPlayer(atBeat: 0)
        } else {
            playheadBeat = totalBeats
            activeChordID = nil
            state = .ready
        }
    }

}

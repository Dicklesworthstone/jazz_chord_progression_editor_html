import AVFoundation
import Foundation

@MainActor
final class JazzAudioEngine: ObservableObject {
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
    @Published private(set) var masterVolume = 0.78
    @Published private(set) var isMuted = false

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    /// Preview owns a separate node and generation fence. Inspector notes can
    /// therefore coexist with progression playback without seeking, pausing,
    /// replacing, or completing the main transport's scheduled buffer.
    private let previewPlayer = AVAudioPlayerNode()
    private var buffer: AVAudioPCMBuffer?
    private var scheduledBuffer: AVAudioPCMBuffer?
    private var scheduledPreviewBuffer: AVAudioPCMBuffer?
    private var events: [PlaybackEvent] = []
    private var tempo = 120.0
    private var timer: Timer?
    private var playbackStart = Date()
    private var startingBeat = 0.0
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
        engine.connect(player, to: engine.mainMixerNode, format: nil)
        engine.connect(previewPlayer, to: engine.mainMixerNode, format: nil)
        applyMixerVolume()
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
            startPlayer(atBeat: start)
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
            self.startPlayer(atBeat: start)
        }
    }

    func pause() {
        guard state == .playing else { return }
        updatePlayhead()
        player.pause()
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
        stopPreview()
        playheadBeat = 0
        activeChordID = nil
        state = .ready
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

    func toggleMute() {
        isMuted.toggle()
        applyMixerVolume()
    }

    /// Plays one bounded inspector note without touching any main-transport
    /// field. Rendering remains off the main actor; rapid taps retire stale
    /// results before they can schedule themselves.
    func preview(midi: Int, tone: InstrumentTone) {
        guard (21...108).contains(midi) else {
            previewIssue = "That key is outside the supported A0–C8 range."
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
                JazzAudioRenderer.renderPreview(midi: midi, tone: tone, cancellation: cancellation)
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

    private func startPlayer(atBeat beat: Double) {
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
            let seconds = beat * 60 / tempo
            let startFrame = AVAudioFramePosition(seconds * buffer.format.sampleRate)
            let available = max(0, AVAudioFramePosition(buffer.frameLength) - startFrame)
            guard available > 0 else {
                playheadBeat = 0
                state = .ready
                return
            }
            let playable = startFrame == 0 ? buffer : slice(buffer, startingAt: AVAudioFrameCount(startFrame))
            guard let playable else {
                state = .failed("The selected playback position could not be prepared.")
                return
            }
            scheduledBuffer = playable
            let scheduledGeneration = generation
            player.scheduleBuffer(playable, at: nil) { [weak self] in
                Task { @MainActor in
                    guard let self, self.generation == scheduledGeneration else { return }
                    self.finishedNaturally()
                }
            }
            startingBeat = beat
            playheadBeat = beat
            playbackStart = Date()
            player.play()
            state = .playing
            installTimer()
        } catch {
            state = .failed(error.localizedDescription)
        }
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

    private func installTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1 / 24, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updatePlayhead() }
        }
        if let timer { RunLoop.main.add(timer, forMode: .common) }
    }

    private func updatePlayhead() {
        guard state == .playing else { return }
        playheadBeat = min(totalBeats, startingBeat + Date().timeIntervalSince(playbackStart) * tempo / 60)
        updateActiveChord()
    }

    private func updateActiveChord() {
        activeChordID = events.last(where: { $0.startBeat <= playheadBeat })?.chordID
    }

    private func finishedNaturally() {
        guard state == .playing else { return }
        timer?.invalidate()
        if loops, totalBeats > 0 {
            startPlayer(atBeat: 0)
        } else {
            playheadBeat = totalBeats
            activeChordID = nil
            state = .ready
        }
    }

}

import { useEffect, useRef } from "preact/hooks";

import { IconButton, UiIcon } from "../primitives";
import type {
  StudioTransportCallbacks,
  StudioTransportView,
  TransportMeterFrame,
} from "./studio-contract";

export type TransportGestureSource = "pointer" | "keyboard";

export type TransportBarProps = Readonly<{
  view: StudioTransportView;
  /** False when the chart has no chord to play; Play then says why. */
  canPlay: boolean;
  onPlay: (source: TransportGestureSource) => void;
  onPause: () => void;
  onStop: () => void;
  callbacks: Pick<
    StudioTransportCallbacks,
    | "onStepChord"
    | "onTempoStep"
    | "onGrooveChange"
    | "onInstrumentChange"
    | "onVolumeCommit"
    | "readMeterFrame"
  >;
}>;

/**
 * V2R-8 footer meter (jcpe-v2r-transport-k88n): a small spectrum strip fed
 * by the engine's analyser tap, exactly the AnalyzerPanel polling law — the
 * animation frame reads the real frame, it never fabricates motion, and a
 * null frame renders the quiet baseline. Display only, aria-hidden; the
 * status line remains the accessible truth.
 */
function MeterStrip({
  readFrame,
}: Readonly<{ readFrame: () => TransportMeterFrame | null }>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readRef = useRef(readFrame);
  readRef.current = readFrame;

  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const context = canvas.getContext("2d");
      if (context === null) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const styles = getComputedStyle(canvas);
      const quiet = styles.getPropertyValue("--ink-4").trim() || "#a9a28c";
      const low = styles.getPropertyValue("--ink-3").trim() || "#6b6353";
      const hot = styles.getPropertyValue("--red").trim() || "#b23a2a";
      const frame = readRef.current();
      const bars = Math.max(6, Math.min(26, Math.floor(width / 5.2)));
      const gap = width > 80 ? 1.5 : 1.2;
      const barWidth = (width - gap * (bars - 1)) / bars;
      const magnitudes = frame?.magnitudes ?? null;
      const bins = magnitudes?.length ?? 0;
      /* Per-frame ceiling, the AnalyzerPanel normalization law: the loudest
       * bin defines full scale so quiet passages still read as motion. */
      let ceiling = 0;
      if (magnitudes !== null) {
        for (const magnitude of magnitudes) {
          if (magnitude > ceiling) ceiling = magnitude;
        }
      }
      for (let index = 0; index < bars; index += 1) {
        let level = 0;
        if (magnitudes !== null && bins > 0) {
          /* Perceptual bin spread: low bars sample low frequencies densely. */
          const from = Math.floor(((index / bars) ** 2.2) * bins * 0.5);
          const to = Math.max(
            from + 1,
            Math.floor((((index + 1) / bars) ** 2.2) * bins * 0.5),
          );
          for (let bin = from; bin < to && bin < bins; bin += 1) {
            const value = magnitudes[bin] ?? 0;
            if (value > level) level = value;
          }
        }
        const scaled = ceiling > 0 ? (level / ceiling) ** 0.82 : 0;
        const live = scaled > 0.03;
        const barHeight = live ? Math.max(1.5, scaled * (height - 1)) : 1.5;
        context.fillStyle = live ? (scaled > 0.6 ? hot : low) : quiet;
        context.fillRect(
          index * (barWidth + gap),
          height - barHeight,
          barWidth,
          barHeight,
        );
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <span class="studio-transport__meter" aria-hidden="true">
      <canvas ref={canvasRef} class="studio-transport__meter-canvas" />
      <span class="studio-transport__meter-unit">Hz</span>
    </span>
  );
}

export function TransportBar({
  view,
  canPlay,
  onPlay,
  onPause,
  onStop,
  callbacks,
}: TransportBarProps) {
  const running = view.audioState === "playing";
  const audioDown =
    view.audioState === "unavailable" || view.audioState === "failed";
  const sounding = view.progressPercent !== null;
  return (
    <section
      class="studio-transport"
      data-audio-state={view.audioState}
      id="transport-bar"
      aria-labelledby="studio-transport-heading"
    >
      <h2 id="studio-transport-heading" class="studio-visually-hidden">
        Transport
      </h2>
      {/*
        The sweep mirrors the exact playhead the status text already
        announces, so it is presentation only and aria-hidden; screen
        readers keep the Position fact as their source of truth. Click-to-
        seek is deferred with the loop toggle: the audio port exposes no
        seek surface yet (see the bead note), and a scrubber that silently
        restarted playback would be a lie about what it did.
      */}
      <div class="studio-transport__sweep" aria-hidden="true">
        <span
          class="studio-transport__sweep-fill"
          style={
            view.progressPercent === null
              ? undefined
              : `inline-size: ${String(view.progressPercent)}%`
          }
          data-active={String(view.progressPercent !== null)}
        />
      </div>

      <div class="studio-transport__row">
        <div
          class="studio-transport__controls"
          role="group"
          aria-label="Playback controls"
          aria-describedby="studio-transport-status-detail"
        >
          <IconButton
            accessibleName="Previous chord"
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canStepPrevious}
            id="studio-transport-previous"
            iconId="chevron-left"
            invalid={false}
            onAction={() => {
              callbacks.onStepChord("previous");
            }}
            type="button"
            variant="ghost"
          />
          <IconButton
            accessibleName="Play"
            busy={false}
            density="comfortable"
            describedBy={["studio-transport-status-detail"]}
            disabled={!canPlay}
            id="studio-transport-play"
            iconId="play"
            invalid={false}
            onAction={(event) => {
              /*
               * The receipt records how the activation reached us. A browser
               * will not open an audio graph without a real user activation,
               * so this is the engine's bookkeeping rather than the gate
               * itself: the gate is the browser, and a scripted click fails
               * there regardless.
               */
              onPlay(event.source === "pointer" ? "pointer" : "keyboard");
            }}
            type="button"
            variant="primary"
          />
          <IconButton
            accessibleName="Pause"
            busy={false}
            density="comfortable"
            describedBy={["studio-transport-status-detail"]}
            disabled={!running}
            id="studio-transport-pause"
            iconId="pause"
            invalid={false}
            onAction={() => {
              onPause();
            }}
            type="button"
            variant="outline"
          />
          <IconButton
            accessibleName="Stop"
            busy={false}
            density="comfortable"
            describedBy={["studio-transport-status-detail"]}
            disabled={!running}
            id="studio-transport-stop"
            iconId="stop"
            invalid={false}
            onAction={() => {
              onStop();
            }}
            type="button"
            variant="outline"
          />
          <IconButton
            accessibleName="Next chord"
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canStepNext}
            id="studio-transport-next"
            iconId="chevron-right"
            invalid={false}
            onAction={() => {
              callbacks.onStepChord("next");
            }}
            type="button"
            variant="ghost"
          />
        </div>

        {/*
          The now block: the sounding (or selected) chord in engraving type,
          with the musical position beneath. Red only while sound runs.
        */}
        <div
          class="studio-transport__now"
          data-sounding={String(sounding)}
          title={view.positionExactLabel}
        >
          <span class="studio-transport__now-chord" data-testid="transport-now-chord">
            {view.currentChordLabel ?? "—"}
          </span>
          <span class="studio-transport__now-place" data-testid="transport-now-place">
            {view.positionLabel}
          </span>
        </div>

        <div class="studio-transport__status">
          <span class="studio-transport__status-icon" aria-hidden="true">
            <UiIcon iconId={audioDown ? "audio-off" : "status"} />
          </span>
          <p>
            <strong>{view.audioStatusLabel}</strong>
            <span id="studio-transport-status-detail">
              {view.audioStatusDetail}
            </span>
          </p>
        </div>

        <MeterStrip readFrame={callbacks.readMeterFrame} />

        <div class="studio-transport__settings">
          <div
            class="studio-transport__tempo"
            role="group"
            aria-label="Tempo"
          >
            <button
              aria-label="Slower"
              class="studio-transport__tempo-step"
              disabled={!view.canTempoDown}
              id="studio-transport-tempo-down"
              onClick={() => {
                callbacks.onTempoStep(-4);
              }}
              type="button"
            >
              −
            </button>
            <span
              class="studio-transport__tempo-value"
              data-testid="transport-tempo-value"
            >
              {view.tempoBpm}
              <span class="studio-transport__tempo-unit"> BPM</span>
            </span>
            <button
              aria-label="Faster"
              class="studio-transport__tempo-step"
              disabled={!view.canTempoUp}
              id="studio-transport-tempo-up"
              onClick={() => {
                callbacks.onTempoStep(4);
              }}
              type="button"
            >
              +
            </button>
          </div>

          <label class="studio-transport__select">
            <span class="studio-visually-hidden">Groove</span>
            <select
              aria-label="Groove"
              id="studio-transport-groove"
              onChange={(event) => {
                callbacks.onGrooveChange(event.currentTarget.value);
              }}
              value={view.grooveStyleId}
            >
              {view.grooveOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label class="studio-transport__select">
            <span class="studio-visually-hidden">Instrument</span>
            <select
              aria-label="Instrument"
              id="studio-transport-instrument"
              onChange={(event) => {
                callbacks.onInstrumentChange(event.currentTarget.value);
              }}
              value={view.instrumentId}
            >
              {view.instrumentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {/*
            The document's master volume. The document is the mix authority
            and the engine reads it when the audio graph starts, so the
            slider says exactly when the committed value applies rather than
            pretending to be a live fader.
          */}
          <label
            class="studio-transport__volume"
            title="Master volume — applies when playback next starts"
          >
            <span class="studio-visually-hidden">
              Master volume. Applies when playback next starts.
            </span>
            <input
              aria-label="Master volume"
              id="studio-transport-volume"
              max={100}
              min={0}
              onChange={(event) => {
                callbacks.onVolumeCommit(
                  Number(event.currentTarget.value) / 100,
                );
              }}
              step={5}
              type="range"
              value={view.masterVolumePercent}
            />
          </label>
        </div>
      </div>
    </section>
  );
}

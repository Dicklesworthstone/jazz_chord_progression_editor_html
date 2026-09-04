import { useEffect, useRef, useState } from "preact/hooks";

import { IconButton, UiIcon } from "../primitives";
import type {
  StudioTransportCallbacks,
  StudioTransportView,
  TransportMeterFrame,
} from "./studio-contract";

export type TransportGestureSource = "pointer" | "keyboard";

/**
 * The master-volume fader (owner report, 2026-08-04): a controlled range
 * whose value came straight from the committed snapshot fought the native
 * drag — any re-render mid-drag (the live playhead poll, a notice timer)
 * snapped the thumb back to the committed value, and the commit itself only
 * lands on release. The drag now moves a LOCAL draft, so the thumb answers
 * the pointer immediately, and exactly ONE document command commits on
 * release (`change`): a full drag is one undoable step, never a tick spray.
 * The committed value re-adopts the thumb whenever no drag is live.
 */
function VolumeSlider({
  committedPercent,
  muted,
  onVolumeCommit,
  onVolumePreview,
  onMuteToggle,
  idSuffix = "",
}: Readonly<{
  committedPercent: number;
  muted: boolean;
  onVolumeCommit: (volume: number) => void;
  onVolumePreview: (volume: number) => void;
  onMuteToggle: () => void;
  /** jcpe-ph6d: the sound sheet renders a second copy of these controls. */
  idSuffix?: string;
}>) {
  const [draftPercent, setDraftPercent] = useState<number | null>(null);
  const muteLabel = muted
    ? "Unmute — the stored volume is unchanged"
    : "Mute — playback continues silently";
  return (
    <div class="studio-transport__volume-group">
      <button
        aria-label={muteLabel}
        aria-pressed={muted}
        class="studio-transport__mute"
        data-muted={muted ? "true" : "false"}
        id={`studio-transport-mute${idSuffix}`}
        onClick={onMuteToggle}
        title={muteLabel}
        type="button"
      >
        <span aria-hidden="true" class="studio-transport__mute-glyph">
          <span class="studio-transport__mute-body" />
          <span class="studio-transport__mute-cone" />
          {muted ? (
            <span class="studio-transport__mute-slash" />
          ) : (
            <span class="studio-transport__mute-wave" />
          )}
        </span>
      </button>
      <label
        class="studio-transport__volume"
        title="Master volume — audible immediately, one undoable step per drag"
      >
        <span class="studio-visually-hidden">
          Master volume. The drag is audible live; releasing commits one
          undoable step.
        </span>
        <input
          aria-label="Master volume"
          id={`studio-transport-volume${idSuffix}`}
          max={100}
          min={0}
          onInput={(event) => {
            const percent = Number(event.currentTarget.value);
            setDraftPercent(percent);
            /* jcpe-v2r-live-mix-btb4: the ride makes the drag audible. */
            onVolumePreview(percent / 100);
          }}
          onChange={(event) => {
            setDraftPercent(null);
            onVolumeCommit(Number(event.currentTarget.value) / 100);
          }}
          step={5}
          type="range"
          value={draftPercent ?? committedPercent}
        />
      </label>
    </div>
  );
}

export type TransportSettingsCallbacks = Pick<
  StudioTransportCallbacks,
  | "onTempoStep"
  | "onGrooveChange"
  | "onInstrumentChange"
  | "onVolumeCommit"
  | "onVolumePreview"
  | "onMuteToggle"
  | "readMixState"
  | "onCountInToggle"
  | "onMetronomeToggle"
  | "readClickToggles"
>;

/**
 * U4 (l3a.12.2): the count-in and metronome toggles. The pressed state is
 * the settled transport receipt's truth (never local optimism); a refusal
 * leaves the prior value standing. Rendered in both the footer cluster and
 * the Sound sheet through the same component with the id suffix law.
 */
function TransportClickToggles({
  callbacks,
  idSuffix,
  view,
}: Readonly<{
  callbacks: TransportSettingsCallbacks;
  idSuffix: "" | "-sheet";
  view: StudioTransportView;
}>) {
  const toggles = callbacks.readClickToggles();
  const enabled =
    view.audioState === "ready" ||
    view.audioState === "playing" ||
    view.audioState === "paused";
  return (
    <div
      class="studio-transport__clicks"
      role="group"
      aria-label="Count-in and metronome"
    >
      <button
        aria-label="Count-in: one bar of clicks before playback"
        aria-pressed={toggles.countInEnabled}
        class="studio-transport__click-toggle"
        disabled={!enabled}
        id={`studio-transport-count-in${idSuffix}`}
        onClick={() => {
          callbacks.onCountInToggle(!toggles.countInEnabled);
        }}
        title={
          toggles.countInEnabled
            ? "Count-in on: one bar of clicks before the next Play"
            : "Count-in off"
        }
        type="button"
      >
        Count-in
      </button>
      <button
        aria-label="Metronome: a click on every beat while playing"
        aria-pressed={toggles.metronomeEnabled}
        class="studio-transport__click-toggle"
        disabled={!enabled}
        id={`studio-transport-metronome${idSuffix}`}
        onClick={() => {
          callbacks.onMetronomeToggle(!toggles.metronomeEnabled);
        }}
        title={
          toggles.metronomeEnabled
            ? "Metronome on: a click on every beat"
            : "Metronome off"
        }
        type="button"
      >
        Metronome
      </button>
    </div>
  );
}

/**
 * The playback-settings cluster: tempo stepper, groove picker, instrument
 * picker, and the master volume/mute group. Shared by the transport footer
 * (desktop widths) and the mobile Sound sheet, because below 71.875rem the
 * footer has no room and these controls previously vanished entirely on
 * phones (owner report, 2026-08-07: "you can't select the instrument or
 * groove at all from the mobile interface"). Ids are suffixed per context
 * (jcpe-ph6d) so the sheet copy never duplicates the footer's ids.
 */
export function TransportSettings({
  callbacks,
  idSuffix,
  view,
}: Readonly<{
  callbacks: TransportSettingsCallbacks;
  idSuffix: "" | "-sheet";
  view: StudioTransportView;
}>) {
  return (
    <div
      class={
        idSuffix === ""
          ? "studio-transport__settings"
          : "studio-transport__settings studio-sound-settings"
      }
    >
      <div
        class="studio-transport__tempo"
        role="group"
        aria-label="Tempo"
      >
        <button
          aria-label="Slower"
          class="studio-transport__tempo-step"
          disabled={!view.canTempoDown}
          id={`studio-transport-tempo-down${idSuffix}`}
          onClick={() => {
            callbacks.onTempoStep(-4);
          }}
          type="button"
        >
          −
        </button>
        <span
          class="studio-transport__tempo-value"
          data-testid={`transport-tempo-value${idSuffix}`}
        >
          {view.tempoBpm}
          <span class="studio-transport__tempo-unit"> BPM</span>
        </span>
        <button
          aria-label="Faster"
          class="studio-transport__tempo-step"
          disabled={!view.canTempoUp}
          id={`studio-transport-tempo-up${idSuffix}`}
          onClick={() => {
            callbacks.onTempoStep(4);
          }}
          type="button"
        >
          +
        </button>
      </div>

      <TransportClickToggles
        callbacks={callbacks}
        idSuffix={idSuffix}
        view={view}
      />

      <label class="studio-transport__select">
        <span class="studio-visually-hidden">Groove</span>
        <select
          aria-label="Groove"
          id={`studio-transport-groove${idSuffix}`}
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
          id={`studio-transport-instrument${idSuffix}`}
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

      <VolumeSlider
        committedPercent={view.masterVolumePercent}
        idSuffix={idSuffix}
        muted={callbacks.readMixState().muted}
        onVolumeCommit={callbacks.onVolumeCommit}
        onVolumePreview={callbacks.onVolumePreview}
        onMuteToggle={callbacks.onMuteToggle}
      />
    </div>
  );
}

export type TransportBarProps = Readonly<{
  view: StudioTransportView;
  /** False when the chart has no chord to play; Play then says why. */
  canPlay: boolean;
  onPlay: (source: TransportGestureSource) => void;
  onPause: () => void;
  onStop: () => void;
  /**
   * When provided, the footer shows the mobile Sound trigger (hidden by CSS
   * at widths where the inline settings cluster is visible).
   */
  onOpenSoundSheet?: () => void;
  /**
   * When provided, the footer shows Library/Harmony triggers in the exact
   * short-viewport window where the sticky panel dock returns to static
   * flow and would otherwise sit buried inside the chart scrollport
   * (jcpe-ui-nits-320-triggers-undo-audit-s9r2). Hidden by CSS everywhere
   * else; the sticky dock remains the tall-phone mechanism.
   */
  onOpenLibrarySheet?: () => void;
  onOpenHarmonySheet?: () => void;
  callbacks: Pick<
    StudioTransportCallbacks,
    | "onStepChord"
    | "onTempoStep"
    | "onGrooveChange"
    | "onInstrumentChange"
    | "onVolumeCommit"
    | "readMeterFrame"
    | "onSeekFraction"
    | "onLoopToggle"
    | "readLoopState"
    | "readLoopRegion"
    | "onVolumePreview"
    | "onMuteToggle"
    | "readMixState"
    | "onRestart"
    | "onSeekBeat"
    | "onCountInToggle"
    | "onMetronomeToggle"
    | "readClickToggles"
    | "readInstrumentBoundaryNotice"
    | "readPendingRunStartBeats"
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
      if (
        canvas.width !== Math.round(width * dpr) ||
        canvas.height !== Math.round(height * dpr)
      ) {
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
  onOpenSoundSheet,
  onOpenLibrarySheet,
  onOpenHarmonySheet,
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
      data-failure-code={view.failureCode ?? undefined}
      id="transport-bar"
      aria-labelledby="studio-transport-heading"
    >
      <h2 id="studio-transport-heading" class="studio-visually-hidden">
        Transport
      </h2>
      {/*
        The sweep mirrors the exact playhead the status text already
        announces; the Position fact stays the screen reader's source of
        truth. Since jcpe-v2r-loop-seek-ukk6 the line is also the scrub
        surface: a click while playing or paused seeks the active run
        through the real X1 seek command, and outside that window the
        surface says so and dispatches nothing — a scrubber that silently
        restarted playback would be a lie about what it did.
      */}
      {(() => {
        /*
         * U4 (l3a.12.2): the scrub line is one accessible slider. Pointer
         * keeps the shipped click-fraction seek; the keyboard law is exact:
         * arrows step one beat, Shift+arrows one bar, PageUp/Down four
         * beats, Home/End the plan bounds — always dispatched as exact
         * rational beats, never from the display sweep. Ready with a
         * playable chart positions the next run's start; everything else
         * disables with the honest label.
         */
        const canSeekRun = running || view.audioState === "paused";
        const canPositionNextRun =
          view.audioState === "ready" && canPlay && view.totalBeats !== null;
        const sliderEnabled = canSeekRun || canPositionNextRun;
        const totalBeats = view.totalBeats ?? 0;
        const pendingStart = callbacks.readPendingRunStartBeats();
        const currentBeat =
          view.audioState === "ready" && pendingStart !== null
            ? pendingStart
            : (view.playheadBeats ?? 0);
        const seekToBeatNumber = (target: number): void => {
          const clamped = Math.min(totalBeats, Math.max(0, target));
          /* Steps are whole or half beats, always exactly representable. */
          const doubled = Math.round(clamped * 2);
          callbacks.onSeekBeat(
            doubled % 2 === 0 ? doubled / 2 : doubled,
            doubled % 2 === 0 ? 1 : 2,
          );
        };
        const onSliderKeyDown = (event: {
          key: string;
          shiftKey: boolean;
          preventDefault: () => void;
        }): void => {
          if (!sliderEnabled) return;
          const bar = view.beatsPerBar;
          let target: number | null = null;
          if (event.key === "ArrowLeft") {
            target = currentBeat - (event.shiftKey ? bar : 1);
          } else if (event.key === "ArrowRight") {
            target = currentBeat + (event.shiftKey ? bar : 1);
          } else if (event.key === "PageDown") {
            target = currentBeat - 4;
          } else if (event.key === "PageUp") {
            target = currentBeat + 4;
          } else if (event.key === "Home") {
            target = 0;
          } else if (event.key === "End") {
            target = totalBeats;
          }
          if (target === null) return;
          event.preventDefault();
          seekToBeatNumber(target);
        };
        return (
          <div
            aria-label={
              canSeekRun
                ? "Seek within the chart"
                : canPositionNextRun
                  ? "Choose where the next Play starts"
                  : "Seek (available while playing)"
            }
            aria-disabled={!sliderEnabled}
            aria-valuemax={totalBeats}
            aria-valuemin={0}
            aria-valuenow={Math.round(currentBeat * 2) / 2}
            aria-valuetext={
              view.audioState === "ready" && pendingStart !== null
                ? `Next run starts at beat ${String(pendingStart)}`
                : `${view.positionLabel} (${view.positionExactLabel})`
            }
            class="studio-transport__sweep"
            data-testid="transport-scrub"
            id="studio-transport-scrub"
            onClick={(event) => {
              if (!sliderEnabled) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width <= 0) return;
              if (canSeekRun) {
                callbacks.onSeekFraction(
                  (event.clientX - bounds.left) / bounds.width,
                );
                return;
              }
              /* Ready: the click positions the next run's start exactly. */
              const fraction = (event.clientX - bounds.left) / bounds.width;
              seekToBeatNumber(fraction * totalBeats);
            }}
            onKeyDown={onSliderKeyDown}
            role="slider"
            tabIndex={sliderEnabled ? 0 : -1}
            title={
              canSeekRun
                ? "Click or use arrow keys to seek"
                : canPositionNextRun
                  ? "Click or use arrow keys to choose the next run's start"
                  : "Seeks while playing"
            }
          >
            {(() => {
              /*
               * V2R-18: the engaged loop's span, drawn under the sweep so the
               * scrub line shows WHAT will repeat. Only the transport's own
               * engaged loop draws — an armed-but-idle intent renders nothing,
               * the same honesty split the toggle keeps. The overlay never
               * intercepts the slider's pointer events (U4 §5.4).
               */
              const region = callbacks.readLoopRegion();
              if (
                region === null ||
                region.endFraction <= region.startFraction
              ) {
                return null;
              }
              return (
                <span
                  aria-hidden="true"
                  class="studio-transport__loop-region"
                  data-testid="transport-loop-region"
                  style={`inset-inline-start: ${String(region.startFraction * 100)}%; inline-size: ${String((region.endFraction - region.startFraction) * 100)}%; pointer-events: none;`}
                />
              );
            })()}
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
        );
      })()}

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
            /* U4 §3.1 (l3a.12.2): Play is enabled in unavailable (the first
             * trusted press performs the gesture-gated initialization),
             * ready, and paused (resumes); disabled while starting, playing,
             * stopping, or failed — those presses could only refuse. */
            disabled={
              !canPlay ||
              view.audioState === "starting" ||
              view.audioState === "playing" ||
              view.audioState === "stopping" ||
              view.audioState === "failed"
            }
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
            /* U4 (l3a.12.2): X1 admits stop from playing AND paused — the
             * paused-state Stop returns the playhead to the run start. */
            disabled={!(running || view.audioState === "paused")}
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
            accessibleName="Restart from the beginning"
            busy={false}
            density="comfortable"
            describedBy={["studio-transport-status-detail"]}
            /* U4: restart is one intent — serialized Stop receipt, then
             * Play from the run start. Enabled when a chart can play and a
             * run exists or the transport is ready. */
            disabled={
              !canPlay ||
              !(
                running ||
                view.audioState === "paused" ||
                view.audioState === "ready" ||
                view.audioState === "unavailable"
              )
            }
            id="studio-transport-restart"
            iconId="restart"
            invalid={false}
            onAction={(event) => {
              callbacks.onRestart(
                event.source === "pointer" ? "pointer" : "keyboard",
              );
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
          {(() => {
            /*
             * jcpe-v2r-loop-seek-ukk6: the toggle shows the pair of truths —
             * armed intent (this press) vs the transport's own engaged loop.
             * Armed-but-not-engaged renders as an outline so the UI never
             * claims the transport is looping before it is.
             */
            const loop = callbacks.readLoopState();
            return (
              <button
                aria-label="Loop the whole chart"
                aria-pressed={loop.enabled}
                class="studio-transport__loop"
                data-engaged={String(loop.engaged)}
                data-testid="transport-loop"
                id="studio-transport-loop"
                onClick={() => {
                  callbacks.onLoopToggle();
                }}
                title={
                  loop.engaged
                    ? "Looping the whole chart"
                    : loop.enabled
                      ? "Loop armed — applies when playback starts"
                      : "Loop the whole chart"
                }
                type="button"
              >
                ↻
              </button>
            );
          })()}
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

        {(() => {
          /*
           * U4 §7 (l3a.12.2): the instrument/groove change boundary, told
           * truthfully — transient while a run sounds, persistent while
           * stopped. The controller clears it on the next accepted
           * notification or replacement; the UI never invents it.
           */
          const notice = callbacks.readInstrumentBoundaryNotice();
          if (notice === null) return null;
          return (
            <p
              class="studio-transport__boundary"
              data-testid="transport-boundary-notice"
              role="status"
            >
              {notice === "next-unstarted-note"
                ? "Takes effect at the next unstarted note"
                : "Applies to the next Play."}
            </p>
          );
        })()}

        <MeterStrip readFrame={callbacks.readMeterFrame} />

        <TransportSettings callbacks={callbacks} idSuffix="" view={view} />

        {onOpenLibrarySheet === undefined ? null : (
          <IconButton
            accessibleName="Library panel"
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            iconId="library"
            id="studio-transport-open-library"
            invalid={false}
            onAction={onOpenLibrarySheet}
            type="button"
            variant="secondary"
          />
        )}
        {onOpenHarmonySheet === undefined ? null : (
          <IconButton
            accessibleName="Harmony Lens panel"
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            iconId="harmony"
            id="studio-transport-open-harmony"
            invalid={false}
            onAction={onOpenHarmonySheet}
            type="button"
            variant="secondary"
          />
        )}
        {onOpenSoundSheet === undefined ? null : (
          <IconButton
            accessibleName="Sound settings — instrument, groove, tempo, volume"
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            iconId="menu"
            id="studio-open-sound-sheet"
            invalid={false}
            onAction={onOpenSoundSheet}
            type="button"
            variant="secondary"
          />
        )}
      </div>
    </section>
  );
}

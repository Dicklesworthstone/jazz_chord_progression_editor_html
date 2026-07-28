import { IconButton, KeyValueList, UiIcon } from "../primitives";
import type { StudioTransportView } from "./studio-contract";

export type TransportGestureSource = "pointer" | "keyboard";

export type TransportBarProps = Readonly<{
  view: StudioTransportView;
  /** False when the chart has no chord to play; Play then says why. */
  canPlay: boolean;
  onPlay: (source: TransportGestureSource) => void;
  onPause: () => void;
  onStop: () => void;
}>;

/*
 * Only the three live controls render. Previous/next chord and loop belong to
 * the U4 package; until their transport commands exist, showing a disabled
 * button advertises capability this build does not have, and a first-time user
 * cannot tell "not wired yet" from "broken".
 */
export function TransportBar({
  view,
  canPlay,
  onPlay,
  onPause,
  onStop,
}: TransportBarProps) {
  const running = view.audioState === "playing";
  const audioDown =
    view.audioState === "unavailable" || view.audioState === "failed";
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
        readers keep the Position fact as their source of truth.
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

      <div
        class="studio-transport__controls"
        role="group"
        aria-label="Playback controls"
        aria-describedby="studio-transport-status-detail"
      >
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
             * The receipt records how the activation reached us. A browser will
             * not open an audio graph without a real user activation, so this
             * is the engine's bookkeeping rather than the gate itself: the gate
             * is the browser, and a scripted click fails there regardless.
             */
            onPlay(event.source === "pointer" ? "pointer" : "keyboard");
          }}
          type="button"
          variant="outline"
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
      </div>

      <div class="studio-transport__facts">
        <KeyValueList
          accessibleName="Transport settings"
          items={[
            {
              description: null,
              id: "transport-position",
              key: "Position",
              value: view.positionLabel,
            },
            {
              description: null,
              id: "transport-current-chord",
              key: "Current chord",
              value: view.currentChordLabel ?? "No chord",
            },
            {
              description: null,
              id: "transport-tempo",
              key: "Tempo",
              value: `${view.tempoBpm.toString()} BPM`,
            },
            {
              description: null,
              id: "transport-instrument",
              key: "Instrument",
              value: view.instrumentLabel,
            },
          ]}
        />
      </div>
    </section>
  );
}

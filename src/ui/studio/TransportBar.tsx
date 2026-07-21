import { IconButton, KeyValueList, UiIcon } from "../primitives";
import type { StudioTransportView } from "./studio-contract";

const disabledTransportControls = [
  { id: "previous", label: "Previous chord", icon: "previous" },
  { id: "play", label: "Play", icon: "play" },
  { id: "pause", label: "Pause", icon: "pause" },
  { id: "stop", label: "Stop", icon: "stop" },
  { id: "next", label: "Next chord", icon: "next" },
  { id: "loop", label: "Loop progression", icon: "loop" },
] as const;

export type TransportBarProps = Readonly<{
  view: StudioTransportView;
}>;

export function TransportBar({ view }: TransportBarProps) {
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

      <div class="studio-transport__status">
        <span class="studio-transport__status-icon" aria-hidden="true">
          <UiIcon iconId="audio-off" />
        </span>
        <p>
          <strong>{view.audioStatusLabel}</strong>
          <span id="studio-audio-unavailable-detail">
            {view.audioStatusDetail}
          </span>
        </p>
      </div>

      <div
        class="studio-transport__controls"
        role="group"
        aria-label="Playback controls"
        aria-describedby="studio-audio-unavailable-detail"
      >
        {disabledTransportControls.map((control) => (
          <IconButton
            accessibleName={control.label}
            busy={false}
            density="comfortable"
            describedBy={["studio-audio-unavailable-detail"]}
            disabled
            key={control.id}
            id={`studio-transport-${control.id}`}
            iconId={control.icon}
            invalid={false}
            onAction={() => undefined}
            type="button"
            variant="outline"
          />
        ))}
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

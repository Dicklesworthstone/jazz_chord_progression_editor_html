import { render } from "preact";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "./application/runtime";
import { createBrowserAudioPlatform } from "./audio/runtime";
import { StudioRoot, StudioStartupFailure } from "./ui/runtime";

const mountPoint = document.querySelector<HTMLElement>("#app");

if (mountPoint === null) {
  throw new Error("Changes could not find its application mount point.");
}

/*
 * The composition root owns adapter choice. The audio stack is built here, not
 * inside the application layer, so the layer that orchestrates playback never
 * reaches for a browser API and stays compilable headless. No `AudioContext`
 * work happens until the first Play carries a trusted gesture receipt.
 */
const audio = createStudioAudio(createBrowserAudioPlatform());

const creation = createStudioController({
  audio,
  nowMs: () => performance.now(),
});

if (creation.ok) {
  /*
   * A pristine first open receives the reviewed starter chart through the
   * same typed command path a user travels (jcpe-b20t). Seeding happens
   * before the first render so the opening paint already shows a playable
   * progression; a seed refusal simply opens the familiar empty studio.
   */
  seedStarterChart(creation.controller);
  render(<StudioRoot controller={creation.controller} />, mountPoint);
} else {
  render(
    <StudioStartupFailure
      message={creation.refusal.message}
      recoveryAction={creation.refusal.recoveryAction}
    />,
    mountPoint,
  );
}

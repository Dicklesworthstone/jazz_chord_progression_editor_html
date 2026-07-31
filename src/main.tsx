import { render } from "preact";

import {
  applySharedStartup,
  createStudioAudio,
  createStudioController,
  decodeShareFragment,
  seedStarterChart,
} from "./application/runtime";
import { createBrowserAudioPlatform } from "./audio/runtime";
import { StudioRoot, StudioStartupFailure } from "./ui/runtime";

const mountPoint = document.querySelector<HTMLElement>("#app");

if (mountPoint === null) {
  throw new Error("JazzChords.org could not find its application mount point.");
}

/*
 * Preact renders BESIDE pre-existing static children, it does not replace
 * them: without this, the "Opening the local studio…" placeholder survives
 * below the shell forever as a dead 24vh scroll zone that phones can
 * rubber-band into. The placeholder's job ends the moment scripts run.
 */
mountPoint.replaceChildren();

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
   * A `#zdoc=` fragment is a shared chart: decode it through the bounded
   * total decoder and apply it through the exact typed command path a user
   * travels. A refused share falls back to the reviewed starter chart with
   * the refusal surfaced, never a half-applied document. With no share
   * present, a pristine first open receives the starter chart (jcpe-b20t).
   * Seeding happens before the first render so the opening paint already
   * shows a playable progression.
   */
  let startupNotice: string | null = null;
  const shared = decodeShareFragment(window.location.hash);
  if (shared.ok) {
    const applied = applySharedStartup(creation.controller, shared.value);
    if (!applied.applied) {
      startupNotice = `The shared chart was not opened: ${applied.reason}`;
      seedStarterChart(creation.controller);
    }
  } else if (shared.code !== "share.fragment_absent") {
    startupNotice = `The share link could not be read: ${shared.message}`;
    seedStarterChart(creation.controller);
  } else {
    seedStarterChart(creation.controller);
  }
  render(
    <StudioRoot
      controller={creation.controller}
      startupNotice={startupNotice}
    />,
    mountPoint,
  );
} else {
  render(
    <StudioStartupFailure
      message={creation.refusal.message}
      recoveryAction={creation.refusal.recoveryAction}
    />,
    mountPoint,
  );
}

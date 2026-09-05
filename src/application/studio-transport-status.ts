import type { TransportState } from "../audio";

/** Projection of an actual X1 outcome; never a synthesized notification. */
export const SETTLED_TRANSPORT_STATUS: Readonly<Record<TransportState,
  "unavailable" | "ready" | "playing" | "paused" | "failed">> = Object.freeze({
  locked: "unavailable", ready: "ready", playing: "playing", paused: "paused",
  interrupted: "paused", fault: "failed", disposed: "unavailable",
});

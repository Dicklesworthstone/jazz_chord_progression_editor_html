/**
 * The browser-bound public entry point for the audio layer.
 *
 * `src/audio/index.ts` is deliberately free of DOM types so that headless
 * consumers — the application layer, and the tools project that runs the
 * contract validators — can reach the engine, transport, and port contracts
 * without dragging `AudioNode` and its relatives into projects compiled with no
 * DOM lib. The one adapter that genuinely needs those types lives here instead,
 * and only the composition root imports it. This mirrors `src/ui/runtime` and
 * `src/application/runtime`.
 */
export { createBrowserAudioPlatform } from "./browser-audio-platform";

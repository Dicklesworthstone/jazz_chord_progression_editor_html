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

/**
 * The embedded module's Standard MIDI File decoder. It lives in this layer
 * because the release contract pins wasm payloads to `src/audio/wasm/`, and it
 * is exported here rather than from the DOM-free barrel because it decodes
 * base64 with `atob`. Only the composition root imports it, and it hands the
 * function to the application layer as an ordinary injected adapter.
 */
export { loadSmfWasmDecoder } from "./smf-wasm";
export type { SmfWasmDecode } from "./smf-wasm";

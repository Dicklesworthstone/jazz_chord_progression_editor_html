import {
  CONCERT_GRAND_WASM_BASE64,
  CONCERT_GRAND_WASM_BYTE_LENGTH,
} from "./wasm/concert-grand-wasm";

/**
 * Host for the embedded module's `smf_*` Standard MIDI File decoder.
 *
 * This file sits in the audio layer for one structural reason: the standalone
 * release contract pins every embedded WebAssembly payload to
 * `src/audio/wasm/`, that directory is layer-private, and the one-file offline
 * law forbids a second wasm asset. So the single embedded module's hosts live
 * here. Nothing in this file touches an audio concept — it copies caller bytes
 * into linear memory, calls one exported function, and copies `i32` words back
 * out. The frozen decode-model types, the sonority laws, and the reverse-T1
 * resolver all live in the export layer, which receives this function by
 * injection through the application composition root and never imports it.
 *
 * The instance is separate from the renderer's: the decoder is loaded lazily on
 * the first import gesture, so a session that never imports a file pays
 * nothing, and neither host can corrupt the other's scratch region.
 */

const PAGE_BYTES = 65_536;

/**
 * Initial output capacity in `i32` words. The decoder reports the exact
 * capacity it needs when this is short, and the retry is deterministic, so
 * this number is a first-guess allocation and never a limit.
 */
const INITIAL_OUTPUT_WORDS = 16_384;

type SmfWasmExports = Readonly<{
  memory: WebAssembly.Memory;
  __heap_base?: WebAssembly.Global;
  smf_decode: (
    input: number,
    inputLength: number,
    out: number,
    outCapacity: number,
  ) => number;
}>;

/**
 * Decodes Standard MIDI File bytes into the module's tagged `i32` record
 * stream. Total: hostile bytes produce a refusal record, never a throw.
 */
export type SmfWasmDecode = (bytes: Uint8Array) => Int32Array;

function decodeWasmBytes(): Uint8Array<ArrayBuffer> {
  const decoded = atob(CONCERT_GRAND_WASM_BASE64);
  if (decoded.length !== CONCERT_GRAND_WASM_BYTE_LENGTH) {
    throw new Error("SMF_WASM_PAYLOAD_LENGTH_MISMATCH");
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function ensureCapacity(
  memory: WebAssembly.Memory,
  offset: number,
  bytes: number,
): void {
  const needed = offset + bytes - memory.buffer.byteLength;
  if (needed > 0) {
    memory.grow(Math.ceil(needed / PAGE_BYTES));
  }
}

function requireExportedFunction(
  exports: Readonly<Record<string, unknown>>,
  name: string,
): CallableFunction {
  const candidate = exports[name];
  if (typeof candidate !== "function") {
    throw new Error(`SMF_WASM_EXPORT_MISSING:${name}`);
  }
  return candidate;
}

let decoderPromise: Promise<SmfWasmDecode> | null = null;

async function instantiate(): Promise<SmfWasmDecode> {
  const payload = decodeWasmBytes();
  const { instance } = await WebAssembly.instantiate(payload, {});
  const rawExports: Readonly<Record<string, unknown>> = instance.exports;
  const memoryCandidate = rawExports["memory"];
  if (!(memoryCandidate instanceof WebAssembly.Memory)) {
    throw new Error("SMF_WASM_EXPORT_MISSING:memory");
  }
  const heapBaseCandidate = rawExports["__heap_base"];
  const exports: SmfWasmExports = {
    memory: memoryCandidate,
    ...(heapBaseCandidate instanceof WebAssembly.Global
      ? { __heap_base: heapBaseCandidate }
      : {}),
    /*
     * Wasm export signatures are not statically typed; the callable is
     * runtime-verified above and asserted to its concrete numeric signature.
     */
    smf_decode: requireExportedFunction(
      rawExports,
      "smf_decode",
    ) as SmfWasmExports["smf_decode"],
  };
  const memory = exports.memory;
  /* Scratch region starts past the module's own data and shadow stack. */
  const heapBase =
    typeof exports.__heap_base?.value === "number"
      ? exports.__heap_base.value
      : memory.buffer.byteLength;
  const scratchBase = Math.ceil((heapBase + 1_024) / 16) * 16;

  return (bytes: Uint8Array): Int32Array => {
    const inputPointer = scratchBase;
    /* Four-byte alignment for the i32 output region. */
    const outputPointer = Math.ceil((scratchBase + bytes.byteLength + 16) / 4) * 4;

    let capacityWords = INITIAL_OUTPUT_WORDS;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      ensureCapacity(
        memory,
        outputPointer,
        Math.max(capacityWords, 1) * 4,
      );
      /* Re-read the buffer on every attempt: growth detaches earlier views. */
      new Uint8Array(memory.buffer, inputPointer, bytes.byteLength).set(bytes);
      const written = exports.smf_decode(
        inputPointer,
        bytes.byteLength,
        outputPointer,
        capacityWords,
      );
      if (written <= capacityWords) {
        return new Int32Array(
          memory.buffer.slice(outputPointer, outputPointer + written * 4),
        );
      }
      capacityWords = written;
    }
    /*
     * Unreachable in practice: the second attempt allocates exactly what the
     * first reported, and the decode is deterministic. Refusing here rather
     * than looping keeps the work bound explicit.
     */
    throw new Error("SMF_WASM_OUTPUT_CAPACITY_UNSTABLE");
  };
}

/**
 * Loads the decoder once per session. A rejection is not cached, so a later
 * import gesture may retry.
 */
export function loadSmfWasmDecoder(): Promise<SmfWasmDecode> {
  decoderPromise ??= instantiate().catch((error: unknown) => {
    decoderPromise = null;
    throw error instanceof Error ? error : new Error(String(error));
  });
  return decoderPromise;
}

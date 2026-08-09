/**
 * Independent proof for the sampled-instrument renderer (jcpe-1miv), now
 * reduced to its retirement laws: both recorded instruments were replaced
 * by physical models (jcpe-sample-elimination-physical-qzgo) and the
 * payload registry is empty. What remains under proof is (a) the checked-in
 * gate corpora keep their pinned bytes and slice geometry, and (b) the
 * renderer refuses every algorithm id loudly instead of shipping silence.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  SAMPLED_RENDERER_POLICY,
  VIBRAPHONE_RENDERER_ALGORITHM_ID,
  loadSampledInstrumentRenderer,
} from "../../src/audio/sampled-renderer";
import {
  UPRIGHT_BASS_SAMPLES_BASE64,
  UPRIGHT_BASS_SAMPLES_BYTE_LENGTH,
  UPRIGHT_BASS_SAMPLES_SHA256,
  UPRIGHT_BASS_SAMPLES_SLICE_INDEX,
} from "../../src/audio/wasm/upright-bass-samples";
import {
  VIBRAPHONE_SAMPLES_BASE64,
  VIBRAPHONE_SAMPLES_BYTE_LENGTH,
  VIBRAPHONE_SAMPLES_SHA256,
  VIBRAPHONE_SAMPLES_SLICE_INDEX,
} from "../../src/audio/wasm/vibraphone-samples";

describe("payload integrity", () => {
  test("upright-bass payload matches its pinned SHA-256 and byte length", () => {
    const bytes = Buffer.from(UPRIGHT_BASS_SAMPLES_BASE64, "base64");
    expect(bytes.byteLength).toBe(UPRIGHT_BASS_SAMPLES_BYTE_LENGTH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      UPRIGHT_BASS_SAMPLES_SHA256,
    );
  });

  test("vibraphone payload matches its pinned SHA-256 and byte length", () => {
    const bytes = Buffer.from(VIBRAPHONE_SAMPLES_BASE64, "base64");
    expect(bytes.byteLength).toBe(VIBRAPHONE_SAMPLES_BYTE_LENGTH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      VIBRAPHONE_SAMPLES_SHA256,
    );
  });

  test("slice indexes tile their payloads exactly with no gaps", () => {
    for (const [index, byteLength] of [
      [UPRIGHT_BASS_SAMPLES_SLICE_INDEX, UPRIGHT_BASS_SAMPLES_BYTE_LENGTH],
      [VIBRAPHONE_SAMPLES_SLICE_INDEX, VIBRAPHONE_SAMPLES_BYTE_LENGTH],
    ] as const) {
      let cursor = 0;
      for (const slice of index) {
        expect(slice.byteOffset).toBe(cursor);
        expect(slice.frameCount).toBeGreaterThan(0);
        cursor += slice.frameCount * 2;
      }
      expect(cursor).toBe(byteLength);
    }
  });
});

describe("renderer laws", () => {
  /* Both sampled instruments left the shipping graph with their physical
   * replacements (jcpe-sample-elimination-physical-qzgo): upright bass ->
   * changes.dsp.plucked-upright-bass@1, vibraphone -> changes.dsp.vibes@2.
   * The payloads above stay in the repository as the replacement gate's
   * reference corpora, so the remaining renderer law is the loud refusal
   * of an empty registry: the engine's dispatch catches the throw and
   * caches null instead of ever rendering silence for a retired id. */

  test("every algorithm id refuses loudly against the empty registry", () => {
    expect(() => loadSampledInstrumentRenderer("changes.dsp.nope@1")).toThrow(
      "SAMPLED_RENDERER_UNKNOWN_ALGORITHM",
    );
    expect(() =>
      loadSampledInstrumentRenderer(VIBRAPHONE_RENDERER_ALGORITHM_ID),
    ).toThrow("SAMPLED_RENDERER_UNKNOWN_ALGORITHM");
    expect(() =>
      loadSampledInstrumentRenderer("changes.dsp.sampled-upright-bass@1"),
    ).toThrow("SAMPLED_RENDERER_UNKNOWN_ALGORITHM");
  });

  test("the policy contract stays pinned for any future recorded payload", () => {
    expect(SAMPLED_RENDERER_POLICY.minimumMidiPitch).toBe(21);
    expect(SAMPLED_RENDERER_POLICY.maximumMidiPitch).toBe(108);
    expect(SAMPLED_RENDERER_POLICY.interpolation).toBe("catmull-rom");
    expect(SAMPLED_RENDERER_POLICY.truncationGuardFrames).toBe(64);
  });
});

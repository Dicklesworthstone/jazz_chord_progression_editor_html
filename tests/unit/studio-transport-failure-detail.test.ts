/**
 * jcpe-uslp: the failure-detail map must be total and curated.
 *
 * Every stable code the transport view can carry — all X1 transport refusal
 * codes, all X0 engine refusal codes, and the interruption marker — must map
 * to a human sentence that names the next safe action, and none may fall
 * through to the generic fallback arm. The fallback itself must stay honest
 * for a future unknown code by naming it.
 */
import { expect, test } from "bun:test";

import {
  AUDIO_ENGINE_REFUSAL_CODES,
  TRANSPORT_INTERRUPTED_FAILURE_CODE,
  TRANSPORT_REFUSAL_CODES,
} from "../../src/audio";
import { transportFailureDetail } from "../../src/application/studio-view-model";

const KNOWN_CODES: readonly string[] = Object.freeze([
  ...TRANSPORT_REFUSAL_CODES,
  ...AUDIO_ENGINE_REFUSAL_CODES,
  TRANSPORT_INTERRUPTED_FAILURE_CODE,
]);

test("every known failure code has a curated cause with a next action", () => {
  expect(KNOWN_CODES.length).toBe(21 + 28 + 1);
  for (const code of KNOWN_CODES) {
    const detail = transportFailureDetail(code);
    expect(detail.length, code).toBeGreaterThan(20);
    expect(detail.endsWith("."), code).toBe(true);
    // The curated map may never leak a raw code at the user.
    expect(detail.includes(code), code).toBe(false);
    // No known code may fall through to the generic fallback.
    expect(detail.startsWith("Audio failed ("), code).toBe(false);
  }
});

test("an unknown future code falls back honestly by naming itself", () => {
  const detail = transportFailureDetail("transport.someday_new");
  expect(detail).toBe(
    "Audio failed (transport.someday_new). Press Stop, then Play.",
  );
});

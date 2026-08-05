/**
 * Seeded adversarial sweep of the salvage byte walker. Deterministic by
 * construction (a fixed-seed LCG, never Math.random): the walker must never
 * throw on hostile bytes, must answer identically across runs, and — the
 * strong law — any bytes it claims to have salvaged must re-walk clean:
 * feeding the repaired file back in finds nothing left to repair.
 */
import { describe, expect, test } from "bun:test";

import { salvageMidiBytes } from "../../src/export/midi-salvage";

function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
}

/** A minimal valid one-track SMF with the given event bytes. */
function smf(trackEvents: readonly number[]): Uint8Array {
  const track = [...trackEvents, 0x00, 0xff, 0x2f, 0x00];
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >>> 24) & 0xff,
    (track.length >>> 16) & 0xff,
    (track.length >>> 8) & 0xff,
    track.length & 0xff,
    ...track,
  ]);
}

/** Random defective-but-walkable note stream: ons/offs with planted faults. */
function randomNoteStream(rand: () => number): number[] {
  const events: number[] = [];
  const count = 4 + (rand() % 24);
  for (let index = 0; index < count; index += 1) {
    const key = 32 + (rand() % 64);
    const channel = rand() % 4;
    const on = rand() % 3 !== 0;
    events.push(
      rand() % 4 === 0 ? 0x00 : 0x60 + (rand() % 32),
      (on ? 0x90 : 0x80) | channel,
      key,
      on ? 1 + (rand() % 126) : 0,
    );
  }
  return events;
}

describe("midi-salvage seeded adversarial sweep", () => {
  test("never throws, answers identically, and salvaged output re-walks clean", () => {
    const rand = makeLcg(0x5eed);
    let salvagedCount = 0;
    for (let round = 0; round < 200; round += 1) {
      const bytes = smf(randomNoteStream(rand));
      const first = salvageMidiBytes(bytes);
      const second = salvageMidiBytes(bytes);
      expect(second).toEqual(first);
      if (first.salvaged) {
        salvagedCount += 1;
        const rewalk = salvageMidiBytes(first.bytes);
        expect(rewalk.salvaged).toBe(false);
        if (!rewalk.salvaged) {
          expect(rewalk.reason).toBe("nothing-to-repair");
        }
      }
    }
    /* The generator plants overlaps/orphans often; prove the sweep bites. */
    expect(salvagedCount).toBeGreaterThan(50);
  });

  test("never throws on raw garbage and truncations", () => {
    const rand = makeLcg(0xbadf00d);
    for (let round = 0; round < 200; round += 1) {
      const length = rand() % 96;
      const garbage = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        garbage[index] = rand() % 256;
      }
      expect(() => salvageMidiBytes(garbage)).not.toThrow();
      /* Truncated prefixes of a real defective file must abort, not throw. */
      const real = smf([
        0x00, 0x90, 60, 100,
        0x10, 0x90, 60, 100,
      ]);
      const cut = real.slice(0, rand() % real.byteLength);
      expect(() => salvageMidiBytes(cut)).not.toThrow();
    }
  });

  test("VLQ length lies inside meta payloads abort instead of misreading", () => {
    /* A meta event whose declared payload length runs past the track end. */
    const result = salvageMidiBytes(
      Uint8Array.from([
        0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
        0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 6,
        0x00, 0xff, 0x01, 0x7f, 0x41, 0x42,
      ]),
    );
    expect(result.salvaged).toBe(false);
    if (!result.salvaged) expect(result.reason).toBe("unreadable");
  });
});

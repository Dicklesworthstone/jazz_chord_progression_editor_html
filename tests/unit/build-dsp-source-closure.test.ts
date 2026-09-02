/**
 * Source-closure ledger for the embedded DSP payload
 * (bead jcpe-deploy-pipeline-restoration-kbvj.2, mechanism half).
 *
 * The observed defect: dsp/concert-grand/src/vibes_v2.rs changed the day
 * after the payload was pinned and nothing watched. These tests prove the
 * closure computation is deterministic and covers the toolchain pins, and
 * that the comparator distinguishes match, drift (with named files), and the
 * pre-ledger state — so whichever gate wiring the owner picks has a proven
 * mechanism underneath. No cargo is involved anywhere here.
 */
import { describe, expect, test } from "bun:test";

import {
  compareDspSourceClosure,
  computeDspSourceClosure,
} from "../../scripts/build-dsp";

function syntheticModule(
  closureSha256: string,
  files: Readonly<Record<string, string>>,
): string {
  return [
    'export const CONCERT_GRAND_WASM_SHA256 =\n  "0000000000000000000000000000000000000000000000000000000000000000";',
    "export const CONCERT_GRAND_DSP_SOURCE_CLOSURE_SHA256 =\n" +
      `  "${closureSha256}";`,
    "export const CONCERT_GRAND_DSP_SOURCE_CLOSURE = Object.freeze(\n" +
      `${JSON.stringify(files, null, 2)} as const,\n)`,
  ].join("\n\n");
}

describe("DSP source-closure ledger", () => {
  test("closure over the real tree is deterministic and covers the pins", async () => {
    const first = await computeDspSourceClosure();
    const second = await computeDspSourceClosure();
    expect(second.closureSha256).toBe(first.closureSha256);
    expect([...second.files.keys()]).toEqual([...first.files.keys()]);
    expect(first.files.has("dsp/concert-grand/Cargo.toml")).toBe(true);
    expect(first.files.has("dsp/concert-grand/Cargo.lock")).toBe(true);
    expect(first.files.has("dsp/concert-grand/rust-toolchain.toml")).toBe(true);
    expect(first.files.has("dsp/concert-grand/src/lib.rs")).toBe(true);
    expect(first.files.has("dsp/concert-grand/src/vibes_v2.rs")).toBe(true);
    /* Staged drafts are NOT closure inputs: nothing compiles them. */
    for (const path of first.files.keys()) {
      expect(path.startsWith("dsp/staging/")).toBe(false);
    }
    for (const hash of first.files.values()) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  test("comparator reports match when the recorded ledger equals the live closure", async () => {
    const live = await computeDspSourceClosure();
    const moduleText = syntheticModule(
      live.closureSha256,
      Object.fromEntries(live.files),
    );
    expect(compareDspSourceClosure(moduleText, live)).toEqual({
      outcome: "match",
      closureSha256: live.closureSha256,
    });
  });

  test("comparator names changed, added, and removed files on drift", async () => {
    const live = await computeDspSourceClosure();
    const recorded = Object.fromEntries(live.files);
    const changedPath = "dsp/concert-grand/src/vibes_v2.rs";
    const removedPath = "dsp/concert-grand/src/retired_module.rs";
    recorded[changedPath] = "f".repeat(64);
    recorded[removedPath] = "e".repeat(64);
    const [addedPath] = [...live.files.keys()].filter(
      (path) => path.endsWith("Cargo.lock"),
    );
    if (addedPath === undefined) throw new Error("closure lost Cargo.lock");
    /* Recorded ledger lacking a live file => that file reads as added. */
    const { [addedPath]: _dropped, ...recordedWithout } = recorded;
    const moduleText = syntheticModule("a".repeat(64), recordedWithout);
    const comparison = compareDspSourceClosure(moduleText, live);
    if (comparison.outcome !== "drift") {
      throw new Error(`expected drift, got ${comparison.outcome}`);
    }
    expect(comparison.changed).toContain(changedPath);
    expect(comparison.added).toContain(addedPath);
    expect(comparison.removed).toContain(removedPath);
    expect(comparison.liveClosureSha256).toBe(live.closureSha256);
    expect(comparison.recordedClosureSha256).toBe("a".repeat(64));
  });

  test("comparator reports ledger-absent for a pre-ledger pin (the current checked-in module)", async () => {
    const live = await computeDspSourceClosure();
    const checkedIn = await Bun.file(
      "src/audio/wasm/concert-grand-wasm.ts",
    ).text();
    /* This assertion is INTENTIONALLY bound to the current repository state:
     * when the payload is next re-pinned with the ledger included, this
     * expectation must flip to "match" (or "drift" if sources moved again) in
     * the same change — forcing the re-pin to acknowledge the ledger. */
    expect(compareDspSourceClosure(checkedIn, live).outcome).toBe(
      "ledger-absent",
    );
  });
});

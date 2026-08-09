/*
 * jcpe-playback-gate-ship-failures-u90y: window-coverage laws.
 *
 * The 2026-08-07 ship-candidate playback gate caught a dreadnought
 * mid-chart refusal whose leading hypothesis was a fold-window gap for
 * recipes wired after the fold policy landed (f9636b2 predates 43faaf8's
 * new recipe ids). The gap turned out to be closed — every current recipe
 * has a window and the Rust plucked windows match — but nothing enforced
 * either fact, so this file freezes both as laws:
 *
 * 1. EVERY shipping recipe id has a playable-window row. A recipe without
 *    a row silently skips folding (foldPitchForRecipe returns the pitch
 *    unchanged for a null window), which reintroduces the exact
 *    out-of-range refusal class the fold policy exists to kill.
 * 2. The TS windows for plucked-v2-backed recipes assert-equal the
 *    committed Rust `plk2_midi_in_range` windows (one source of truth; the
 *    re-land bead recorded this requirement). The Rust side is parsed from
 *    the committed source so a drifting edit on either side fails here.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

import {
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_PLAYABLE_MIDI_WINDOWS,
  playableMidiWindowForRecipeId,
} from "../../src/audio/instrument-recipes-contract";

describe("playable-window coverage law", () => {
  test("every shipping recipe id has a playable window row", () => {
    const missing: string[] = [];
    for (const recipe of AUDIO_INSTRUMENT_RECIPES) {
      if (playableMidiWindowForRecipeId(recipe.id) === null) {
        missing.push(recipe.id);
      }
    }
    expect(missing).toEqual([]);
  });

  test("every window row names a current recipe id (no orphans)", () => {
    const recipeIds = new Set<string>(AUDIO_INSTRUMENT_RECIPES.map((r) => r.id));
    const orphans = Object.keys(AUDIO_PLAYABLE_MIDI_WINDOWS).filter(
      (id) => !recipeIds.has(id),
    );
    expect(orphans).toEqual([]);
  });

  test("every window spans at least the fold-uniqueness minimum (12)", () => {
    for (const [id, window] of Object.entries(
      AUDIO_PLAYABLE_MIDI_WINDOWS as Readonly<Record<string, Readonly<{ low: number; high: number }>>>,
    )) {
      expect(window.high - window.low, id).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("Rust plucked windows assert-equal the TS windows", () => {
  /*
   * Parse the COMMITTED plucked_v2.rs (HEAD, not the worktree — the crate
   * is frequently mid-edit by a concurrent session; the law binds what
   * ships, and the embed is regenerated from committed sources).
   */
  const rustSource = execFileSync(
    "git",
    ["show", "HEAD:dsp/concert-grand/src/plucked_v2.rs"],
    { cwd: import.meta.dir + "/../..", encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );

  function rustRange(pattern: RegExp): { low: number; high: number } {
    const match = pattern.exec(rustSource);
    expect(match, String(pattern)).not.toBeNull();
    if (match === null) throw new Error("unreachable");
    return { low: Number(match[1]), high: Number(match[2]) };
  }

  test("guitar-family window (archtop/electric/dreadnought) matches Rust", () => {
    const rust = rustRange(
      /PLK2_ARCHTOP_PACK \| PLK2_MARSHALL_ELECTRIC_PACK \| PLK2_DREADNOUGHT_PACK => \{\s*\((\d+)\.\.=(\d+)\)\.contains/u,
    );
    const windows = AUDIO_PLAYABLE_MIDI_WINDOWS as Readonly<
      Record<string, Readonly<{ low: number; high: number }>>
    >;
    for (const id of ["guitar", "blues-guitar", "dreadnought-guitar"]) {
      expect(windows[id], id).toEqual(rust);
    }
  });

  test("ukulele window matches Rust", () => {
    const rust = rustRange(/PLK2_UKULELE_PACK => \((\d+)\.\.=(\d+)\)\.contains/u);
    const windows = AUDIO_PLAYABLE_MIDI_WINDOWS as Readonly<
      Record<string, Readonly<{ low: number; high: number }>>
    >;
    expect(windows["ukulele"], "ukulele").toEqual(rust);
  });
});

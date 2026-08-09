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

/*
 * Course-capacity parity (trumpet go-live gate-diff review round): the TS
 * PLUCKED_CHORD_COURSE_CAPACITY map that drives bottom-up chord voicing at
 * the realization seam must equal the Rust packs' physical `string_count`.
 * A drifted capacity either re-opens the 5-voice bass prepare refusal (too
 * high) or silently drops playable voices (too low).
 */
import {
  PLUCKED_CHORD_COURSE_CAPACITY,
  PLUCKED_OPEN_STRING_MIDIS,
  pluckedChordAssignmentFeasible,
} from "../../src/audio/instrument-recipes-contract";

describe("plucked chord course capacity", () => {
  test("TS capacities equal Rust pack string counts, in pack order", () => {
    const source = Bun.spawnSync([
      "git",
      "show",
      "HEAD:dsp/concert-grand/src/plucked_v2.rs",
    ]).stdout.toString();
    const counts = [...source.matchAll(/^\s*string_count:\s*(\d+),/gmu)].map(
      (m) => Number(m[1]),
    );
    /*
     * Four literals in source order: dreadnought(6), ukulele(4),
     * marshall_electric(6), upright_bass(4). archtop_pack() clones
     * dreadnought_pack() (asserted below), so its capacity inherits 6.
     */
    expect(counts).toEqual([6, 4, 6, 4]);
    expect(/pub fn archtop_pack\(\)[^}]*dreadnought_pack\(\)/u.test(source)).toBe(true);
    const expected: Readonly<Record<string, number>> = {
      "changes.dsp.plucked-dreadnought@1": 6,
      "changes.dsp.plucked-ukulele@1": 4,
      "changes.dsp.plucked-electric@2": 6,
      "changes.dsp.plucked-upright-bass@1": 4,
      "changes.dsp.plucked-archtop@2": 6,
    };
    expect({ ...PLUCKED_CHORD_COURSE_CAPACITY }).toEqual(expected);
  });
});

describe("plucked open-string parity", () => {
  test("TS open-string tables equal the Rust pack constructors", async () => {
    const source = await Bun.file(
      "dsp/concert-grand/src/plucked_v2.rs",
    ).text();
    const packOpens = (name: string): number[] => {
      const start = source.indexOf(`pub fn ${name}()`);
      expect(start).toBeGreaterThan(-1);
      const next = source.indexOf("pub fn ", start + 8);
      const body = source.slice(start, next === -1 ? source.length : next);
      return [...body.matchAll(/strings\[\d+\] = string\((\d+),/gu)].map((m) =>
        Number(m[1])
      );
    };
    const dreadnought = packOpens("dreadnought_pack");
    expect(dreadnought).toEqual([
      ...PLUCKED_OPEN_STRING_MIDIS["changes.dsp.plucked-dreadnought@1"] ?? [],
    ]);
    /* archtop clones dreadnought_pack() (no string literals of its own);
     * electric restates standard tuning. */
    expect(/pub fn archtop_pack\(\)[^}]*dreadnought_pack\(\)/u.test(source)).toBe(true);
    expect(packOpens("marshall_electric_pack")).toEqual(dreadnought);
    expect(packOpens("ukulele_pack")).toEqual([
      ...PLUCKED_OPEN_STRING_MIDIS["changes.dsp.plucked-ukulele@1"] ?? [],
    ]);
    expect(packOpens("upright_bass_pack")).toEqual([
      ...PLUCKED_OPEN_STRING_MIDIS["changes.dsp.plucked-upright-bass@1"] ?? [],
    ]);
  });

  test("the fret law mirrors plk2_chord_string_frets on measured cases", () => {
    /* The production failure: a chart comp chord folded to the top of the
     * bass window is unassignable on four bass strings (fret > 24 on the
     * low course); one octave down it lands. Measured against the real
     * wasm ABI 2026-08-09. */
    expect(
      pluckedChordAssignmentFeasible(
        "changes.dsp.plucked-upright-bass@1",
        [59, 60, 64, 67],
      ),
    ).toBe(false);
    expect(
      pluckedChordAssignmentFeasible(
        "changes.dsp.plucked-upright-bass@1",
        [47, 48, 52, 55],
      ),
    ).toBe(true);
    expect(
      pluckedChordAssignmentFeasible(
        "changes.dsp.plucked-upright-bass@1",
        [64, 67],
      ),
    ).toBe(false);
    expect(
      pluckedChordAssignmentFeasible(
        "changes.dsp.plucked-upright-bass@1",
        [48, 55, 60, 64],
      ),
    ).toBe(true);
  });
});

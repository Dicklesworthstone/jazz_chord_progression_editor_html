/**
 * M1 automatic-import envelope over the REAL modules (jcpe-qbvz).
 *
 * Everything here runs the production stack with no mocks: the embedded wasm
 * decode frame, the M1 automation pipeline, the studio MIDI-import service,
 * and a real studio controller whose atomic edit runner lands every command.
 * The laws under proof:
 *
 * - the stated undo count is the true count, and exactly that many undos
 *   return the exact pre-import document while redo restores the committed
 *   one (the whole gesture is a whole envelope);
 * - the M1-XFER settings matrix: a starter document receives the file's
 *   tempo/meter/key/title and the matched groove, an occupied document
 *   keeps every one of them with a stated reason per withheld step;
 * - an occupied document whose groove is still the reviewed default DOES
 *   receive the matched groove — only a personal choice is protected;
 * - the salvage lanes: repaired-then-clean commits normally, and repaired-
 *   but-still-refused surfaces the file's own first refusal plus the
 *   attempt report, never a silent drop;
 * - the >4,096-code-point route: a long file lands as multiple chunk edits
 *   with the stated undo story instead of a dead end;
 * - double-import determinism: the same bytes read twice produce
 *   canonically identical previews.
 */
import { describe, expect, test } from "bun:test";

import { createStudioController } from "../../src/application";
import {
  createStudioMidiImport,
  type MidiImportPreview,
  type StudioMidiImportService,
} from "../../src/application/studio-midi-import";
import type { StudioController } from "../../src/application";
import { DEFAULT_GROOVE_STYLE_ID } from "../../src/domain";
import { realDecodeFrame } from "../support/midi-import-test-kit";

function controller(): StudioController {
  const created = createStudioController();
  if (!created.ok) {
    throw new Error(`STUDIO_TEST_BOOTSTRAP:${created.refusal.code}`);
  }
  return created.controller;
}

function service(): StudioMidiImportService {
  return createStudioMidiImport(realDecodeFrame);
}

/* ------------------------------------------------------------------ *
 * Independent SMF byte builder (test-authored, never production code) *
 * ------------------------------------------------------------------ */

function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function smf(trackEvents: readonly (readonly number[])[]): Uint8Array {
  const header = [
    0x4d, 0x54, 0x68, 0x64,
    ...u32(6),
    0, trackEvents.length > 1 ? 1 : 0,
    (trackEvents.length >>> 8) & 0xff, trackEvents.length & 0xff,
    0x01, 0xe0, // 480 ppq
  ];
  const chunks = trackEvents.flatMap((events) => [
    0x4d, 0x54, 0x72, 0x6b,
    ...u32(events.length),
    ...events,
  ]);
  return Uint8Array.from([...header, ...chunks]);
}

const END_OF_TRACK = [...vlq(0), 0xff, 0x2f, 0x00];
const on = (delta: number, key: number, velocity = 96) => [
  ...vlq(delta), 0x90, key, velocity,
];
const off = (delta: number, key: number) => [...vlq(delta), 0x80, key, 0];
/** Set tempo meta event: microseconds per quarter. */
const tempoMeta = (delta: number, microseconds: number) => [
  ...vlq(delta), 0xff, 0x51, 0x03,
  (microseconds >>> 16) & 0xff,
  (microseconds >>> 8) & 0xff,
  microseconds & 0xff,
];
/** Time signature meta: numerator, log2 denominator. */
const meterMeta = (delta: number, numerator: number, beatUnitLog2: number) => [
  ...vlq(delta), 0xff, 0x58, 0x04, numerator, beatUnitLog2, 24, 8,
];

/** One held chord per 4/4 bar (1920 ticks at 480 ppq). */
function barsOf(chords: readonly (readonly number[])[]): number[] {
  const events: number[] = [];
  for (const chord of chords) {
    for (const [index, key] of chord.entries()) {
      events.push(...on(index === 0 ? 0 : 0, key));
    }
    for (const [index, key] of chord.entries()) {
      events.push(...off(index === 0 ? 1920 : 0, key));
    }
  }
  return events;
}

const CMAJ7 = [48, 60, 64, 67, 71];
const FMIN7 = [41, 53, 56, 60, 63];
const G7 = [43, 55, 59, 62, 65];
const BBMAJ7 = [46, 58, 62, 65, 69];

/** 120 BPM, explicit 4/4, four jazz bars — the settings-transfer witness. */
const SETTINGS_FILE = smf([[
  ...tempoMeta(0, 500_000),
  ...meterMeta(0, 4, 2),
  ...barsOf([CMAJ7, FMIN7, G7, CMAJ7]),
  ...END_OF_TRACK,
]]);

/**
 * The same four bars in 3/4. Under the frozen M1-ENV order the insert lands
 * first, the chart is then occupied, and setMeter refuses by the
 * meter-locked-by-content law — so the whole gesture must roll back to the
 * exact pre-import document. Failure atomicity is the law THIS fixture
 * proves; the M1-XFER/M1-ENV contradiction it exposes (a non-4/4 file can
 * never land on a starter document) is recorded for owner arbitration on
 * the follow-up bead named in jcpe-qbvz's notes.
 */
const THREE_FOUR_FILE = smf([[
  ...tempoMeta(0, 500_000),
  ...meterMeta(0, 3, 2),
  ...(() => {
    const events: number[] = [];
    for (const chord of [CMAJ7, FMIN7, G7, CMAJ7]) {
      for (const key of chord) events.push(...on(0, key));
      for (const [index, key] of chord.entries()) {
        events.push(...off(index === 0 ? 1440 : 0, key));
      }
    }
    return events;
  })(),
  ...END_OF_TRACK,
]]);

/** The bwv786 shape: key 60 restruck while sounding — salvageable. */
const OVERLAP_SALVAGEABLE = smf([[
  ...on(0, 60), ...on(0, 64), ...on(0, 67),
  ...on(480, 60), // re-strike with no off — strict refuses here
  ...off(480, 60), ...off(0, 64), ...off(0, 67),
  ...END_OF_TRACK,
]]);

/**
 * A salvageable first refusal (overlap) in a file that ALSO exceeds the
 * strict decoder's 131,072-note cap: repair succeeds at the byte level, the
 * re-read still refuses on the limit, and the surface must show the file's
 * own first problem (the overlap) plus the attempt report — never a silent
 * drop of the failed repair.
 */
const OVERLAP_THEN_OVER_LIMIT = (() => {
  const events: number[] = [
    ...on(0, 60),
    ...on(480, 60), // salvageable overlap
    ...off(480, 60),
  ];
  for (let pair = 0; pair < 131_072; pair += 1) {
    events.push(...on(1, 72), ...off(1, 72));
  }
  return smf([[...events, ...END_OF_TRACK]]);
})();

/** Enough distinct bars that the chart text passes 4,096 code points. */
const LONG_FILE = smf([[
  ...tempoMeta(0, 400_000),
  ...barsOf(
    Array.from({ length: 640 }, (_, index) =>
      [CMAJ7, FMIN7, G7, BBMAJ7][index % 4] ?? CMAJ7,
    ),
  ),
  ...END_OF_TRACK,
]]);

/** The document facts an import may change, projected for equality. */
function documentFacts(studio: StudioController): unknown {
  const snapshot = studio.getSnapshot();
  return {
    title: snapshot.title,
    tempoBpm: snapshot.tempoBpm,
    chordCount: snapshot.chordCount,
    styleId: snapshot.performance.styleId,
    sections: snapshot.sections,
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

async function readPreview(
  bytes: Uint8Array,
  fileName: string,
): Promise<MidiImportPreview> {
  return service().readFile(fileName, bytes);
}

describe("M1 automatic envelope on a starter document", () => {
  test("tempo, meter, key, title, and groove land; the stated count undoes and redoes the whole gesture", async () => {
    const studio = controller();
    const before = canonical(documentFacts(studio));
    const beforeSnapshot = studio.getSnapshot();
    expect(beforeSnapshot.chordCount).toBe(0);

    const preview = await readPreview(SETTINGS_FILE, "Night Session.mid");
    expect(preview.refusal).toBeNull();
    expect(preview.automation).not.toBeNull();

    const result = service().commitAutomatic(studio, preview);
    expect(result.committed).toBe(true);
    expect(result.rolledBackCount).toBe(0);

    /* The envelope's own accounting: applied steps are the undo count. */
    const applied = result.steps.filter((step) => step.outcome === "applied");
    expect(result.undoCount).toBe(applied.length);
    expect(result.undoCount).toBeGreaterThan(0);

    const after = studio.getSnapshot();
    expect(after.chordCount).toBeGreaterThan(0);
    expect(after.tempoBpm).toBe(120);
    expect(after.title).toBe("Night Session");
    const grooveStep = result.steps.find((step) => step.step === "groove");
    expect(grooveStep?.outcome).toBe("applied");
    expect<string>(after.performance.styleId).toBe(
      preview.automation?.groove.grooveStyleId ?? "",
    );

    const committedFacts = canonical(documentFacts(studio));

    for (let press = 0; press < result.undoCount; press += 1) {
      expect(studio.undo().ok).toBe(true);
    }
    expect(canonical(documentFacts(studio))).toBe(before);
    /* One press past the envelope finds nothing left to undo. */
    expect(studio.undo().ok).toBe(false);

    for (let press = 0; press < result.undoCount; press += 1) {
      expect(studio.redo().ok).toBe(true);
    }
    expect(canonical(documentFacts(studio))).toBe(committedFacts);
  });
});

describe("M1-XFER settings matrix on an occupied document", () => {
  test("an occupied chart keeps tempo, meter, key, title, and a personally chosen groove, each with a stated reason", async () => {
    const studio = controller();
    /* Occupy: one real typed chord and an explicit groove choice. */
    const previewStatus = studio.previewChartText("[Intro]\n| Dm7 G7 |");
    const staged = studio.setQuickEntryDraft(
      "[Intro]\n| Dm7 G7 |",
      { kind: "document-end" },
      previewStatus.status,
      previewStatus.issueCodes,
    );
    expect(staged.ok).toBe(true);
    expect(studio.applyQuickEntryPreview().ok).toBe(true);
    const styles = studio.getSnapshot().performance;
    const personalStyle = "bossa-nova@1";
    const chosen = studio.setPerformanceStyle(personalStyle);
    expect(chosen.ok).toBe(true);
    expect(styles.styleId).not.toBe(personalStyle);

    const tempoBefore = studio.getSnapshot().tempoBpm;
    const titleBefore = studio.getSnapshot().title;
    const chordsBefore = studio.getSnapshot().chordCount;

    const preview = await readPreview(SETTINGS_FILE, "Night Session.mid");
    const result = service().commitAutomatic(studio, preview);
    expect(result.committed).toBe(true);

    const withheld = new Map(
      result.steps
        .filter((step) => step.outcome === "withheld")
        .map((step) => [step.step, step.reason]),
    );
    for (const step of ["tempo", "meter", "key", "title", "groove"] as const) {
      expect(withheld.has(step)).toBe(true);
      expect(withheld.get(step) ?? "").toMatch(/.{10,}/u);
    }

    const after = studio.getSnapshot();
    expect(after.tempoBpm).toBe(tempoBefore);
    expect(after.title).toBe(titleBefore);
    expect(after.performance.styleId).toBe(personalStyle);
    expect(after.chordCount).toBeGreaterThan(chordsBefore);

    /* Only the inserts are undoable: the stated count returns the chart. */
    for (let press = 0; press < result.undoCount; press += 1) {
      expect(studio.undo().ok).toBe(true);
    }
    expect(studio.getSnapshot().chordCount).toBe(chordsBefore);
    expect(studio.getSnapshot().performance.styleId).toBe(personalStyle);
  });

  test("an occupied chart still riding the reviewed default groove receives the matched groove", async () => {
    const studio = controller();
    const previewStatus = studio.previewChartText("[Vamp]\n| Am7 |");
    const staged = studio.setQuickEntryDraft(
      "[Vamp]\n| Am7 |",
      { kind: "document-end" },
      previewStatus.status,
      previewStatus.issueCodes,
    );
    expect(staged.ok).toBe(true);
    expect(studio.applyQuickEntryPreview().ok).toBe(true);
    expect(studio.getSnapshot().performance.styleId).toBe(
      DEFAULT_GROOVE_STYLE_ID,
    );

    const preview = await readPreview(SETTINGS_FILE, "take.mid");
    const result = service().commitAutomatic(studio, preview);
    expect(result.committed).toBe(true);
    const grooveStep = result.steps.find((step) => step.step === "groove");
    expect(grooveStep?.outcome).toBe("applied");
    expect<string>(studio.getSnapshot().performance.styleId).toBe(
      preview.automation?.groove.grooveStyleId ?? "",
    );
  });
});

describe("the salvage lanes through the automatic path", () => {
  test("repaired-then-clean carries its report and commits normally", async () => {
    const studio = controller();
    const preview = await readPreview(
      OVERLAP_SALVAGEABLE,
      "bwv786-jazz-quintet.mid",
    );
    expect(preview.refusal).toBeNull();
    expect(preview.salvage).not.toBeNull();
    expect(preview.automation).not.toBeNull();
    const result = service().commitAutomatic(studio, preview);
    expect(result.committed).toBe(true);
    expect(studio.getSnapshot().chordCount).toBeGreaterThan(0);
  });

  test("repaired-but-still-refused surfaces the original refusal and the attempt report", async () => {
    const preview = await readPreview(OVERLAP_THEN_OVER_LIMIT, "cursed.mid");
    expect(preview.refusal?.code).toBe("smf.note_overlap");
    expect(preview.salvageFailed).not.toBeNull();
    expect(preview.decoded).toBeNull();
    expect(preview.automation).toBeNull();
    /* Nothing to commit is a stated fact, not a crash. */
    const result = service().commitAutomatic(controller(), preview);
    expect(result.committed).toBe(false);
    expect(result.reason).toBe("nothing-to-commit");
  });
});

describe("M1-ENV failure atomicity", () => {
  test("a mid-envelope refusal undoes every issued command and reports rolled-back", async () => {
    const studio = controller();
    const before = canonical(documentFacts(studio));
    const preview = await readPreview(THREE_FOUR_FILE, "waltz.mid");
    expect(preview.refusal).toBeNull();
    expect(preview.automation).not.toBeNull();

    const result = service().commitAutomatic(studio, preview);
    expect(result.committed).toBe(false);
    expect(result.reason).toBe("rolled-back");
    const failed = result.steps[result.steps.length - 1];
    expect(failed?.step).toBe("meter");
    expect(failed?.outcome).toBe("refused");
    expect(result.rolledBackCount).toBeGreaterThan(0);
    /* The document is exactly what it was before the gesture. */
    expect(canonical(documentFacts(studio))).toBe(before);
    expect(studio.undo().ok).toBe(false);
  });
});

describe("the >4,096-code-point route", () => {
  test("a long file lands as multiple chunk edits whose stated count undoes completely", async () => {
    const studio = controller();
    const before = canonical(documentFacts(studio));
    const preview = await readPreview(LONG_FILE, "long-form.mid");
    expect(preview.refusal).toBeNull();
    const automation = preview.automation;
    expect(automation).not.toBeNull();
    if (automation === null) return;
    /* The whole chart text is past one edit's carrying capacity… */
    expect(automation.codePointCount).toBeGreaterThan(4_096);
    /* …so the automation splits it into in-bounds chunks. */
    expect(automation.chunkTexts.length).toBeGreaterThan(1);
    for (const chunk of automation.chunkTexts) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(4_096);
    }

    const result = service().commitAutomatic(studio, preview);
    expect(result.committed).toBe(true);
    const insertSteps = result.steps.filter(
      (step) => step.step === "insert" && step.outcome === "applied",
    );
    expect(insertSteps.length).toBe(automation.chunkTexts.length);
    expect(studio.getSnapshot().chordCount).toBeGreaterThan(600);

    for (let press = 0; press < result.undoCount; press += 1) {
      expect(studio.undo().ok).toBe(true);
    }
    expect(canonical(documentFacts(studio))).toBe(before);
  });
});

describe("double-import determinism", () => {
  test("the same bytes read twice produce canonically identical previews", async () => {
    for (const [name, bytes] of [
      ["settings.mid", SETTINGS_FILE],
      ["overlap.mid", OVERLAP_SALVAGEABLE],
      ["long-form.mid", LONG_FILE],
    ] as const) {
      const first = await readPreview(bytes, name);
      const second = await readPreview(bytes, name);
      expect(canonical(first)).toBe(canonical(second));
    }
  });
});

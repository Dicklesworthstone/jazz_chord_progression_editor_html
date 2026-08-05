/**
 * Share-link laws: the fragment codec is total and refusing, the payload
 * round-trips through a real controller byte-for-byte, and a refused share
 * unwinds every applied command rather than leaving half a chart.
 */
import { describe, expect, test } from "bun:test";

import {
  applySharedStartup,
  buildSharePayload,
  createStudioController,
  decodeShareFragment,
  encodeShareFragment,
  SHARE_FRAGMENT_PREFIX,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";

function freshController(): StudioController {
  const creation = createStudioController();
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

function insertText(controller: StudioController, text: string): void {
  const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
  const preview = controller.previewChartText(text);
  if (preview.status !== "ready") {
    throw new Error(`chart does not parse: ${preview.issueCodes.join(",")}`);
  }
  const drafted = controller.setQuickEntryDraft(
    text,
    { kind: "section-end", sectionId },
    preview.status,
    preview.issueCodes,
  );
  if (!drafted.ok) throw new Error(`draft refused: ${drafted.refusal.code}`);
  const applied = controller.applyQuickEntryPreview();
  if (!applied.ok) throw new Error(`insert refused: ${applied.refusal.code}`);
}

const REFERENCE_PAYLOAD = Object.freeze({
  chartText: "| Dm7:2/1 G7:2/1 | Cmaj7:4/1 |",
  grooveStyleId: "straight-eighths@1" as const,
  tempoBpm: 140,
  title: "Shared reference",
});

describe("share fragment codec", () => {
  test("encode then decode returns the identical payload", () => {
    const encoded = encodeShareFragment(REFERENCE_PAYLOAD);
    if (!encoded.ok) throw new Error(encoded.message);
    expect(encoded.value.startsWith(SHARE_FRAGMENT_PREFIX)).toBe(true);
    const decoded = decodeShareFragment(encoded.value);
    if (!decoded.ok) throw new Error(decoded.message);
    expect(decoded.value).toEqual(REFERENCE_PAYLOAD);
  });

  test("the encoder is deterministic", () => {
    const first = encodeShareFragment(REFERENCE_PAYLOAD);
    const second = encodeShareFragment(REFERENCE_PAYLOAD);
    if (!first.ok || !second.ok) throw new Error("encode refused");
    expect(first.value).toBe(second.value);
  });

  const adversarial: readonly (readonly [string, string, string])[] = [
    ["absent", "#other=1", "share.fragment_absent"],
    ["empty hash", "", "share.fragment_absent"],
    ["future version", "#zdoc=2.abcd", "share.version_unsupported"],
    ["junk base64", "#zdoc=1.!!!!", "share.encoding_invalid"],
    ["bad json", `#zdoc=1.${btoa("not json").replaceAll("=", "")}`, "share.json_invalid"],
    ["array payload", `#zdoc=1.${btoa("[1,2]").replaceAll("=", "")}`, "share.shape_invalid"],
    [
      "missing field",
      `#zdoc=1.${btoa(JSON.stringify({ v: 1, t: "x", b: 120, g: "ballad-comp@1" })).replaceAll("=", "")}`,
      "share.shape_invalid",
    ],
    [
      "extra field",
      `#zdoc=1.${btoa(
        JSON.stringify({ v: 1, t: "x", b: 120, g: "ballad-comp@1", c: "| C |", z: 1 }),
      ).replaceAll("=", "")}`,
      "share.shape_invalid",
    ],
    [
      "wrong type",
      `#zdoc=1.${btoa(
        JSON.stringify({ v: 1, t: "x", b: "120", g: "ballad-comp@1", c: "| C |" }),
      ).replaceAll("=", "")}`,
      "share.shape_invalid",
    ],
    [
      "tempo out of range",
      `#zdoc=1.${btoa(
        JSON.stringify({ v: 1, t: "x", b: 999, g: "ballad-comp@1", c: "| C |" }),
      ).replaceAll("=", "")}`,
      "share.tempo_out_of_range",
    ],
    [
      "fractional tempo",
      `#zdoc=1.${btoa(
        JSON.stringify({ v: 1, t: "x", b: 120.5, g: "ballad-comp@1", c: "| C |" }),
      ).replaceAll("=", "")}`,
      "share.tempo_out_of_range",
    ],
    [
      "unknown groove",
      `#zdoc=1.${btoa(
        JSON.stringify({ v: 1, t: "x", b: 120, g: "trap@9", c: "| C |" }),
      ).replaceAll("=", "")}`,
      "share.groove_unknown",
    ],
    [
      "oversized",
      `#zdoc=1.${"A".repeat(9_000)}`,
      "share.limit_exceeded",
    ],
  ];
  for (const [label, hash, code] of adversarial) {
    test(`refuses ${label} with ${code}`, () => {
      const decoded = decodeShareFragment(hash);
      expect(decoded.ok).toBe(false);
      if (!decoded.ok) {
        expect(decoded.code).toBe(code as never);
        expect(decoded.message.length).toBeGreaterThan(0);
      }
    });
  }
});

describe("share payload from a real chart", () => {
  test("captures title, tempo, groove, and explicit-duration chart text", () => {
    const controller = freshController();
    insertText(controller, "| Dm7 G7 | Cmaj7 |");
    expect(controller.setTitle("Round Trip").ok).toBe(true);
    expect(controller.setTempo(140).ok).toBe(true);
    expect(controller.setPerformanceStyle("bossa-nova@1").ok).toBe(true);
    const payload = buildSharePayload(controller.getSnapshot());
    if (!payload.ok) throw new Error(payload.message);
    expect(payload.value.title).toBe("Round Trip");
    expect(payload.value.tempoBpm).toBe(140);
    expect(payload.value.grooveStyleId).toBe("bossa-nova@1");
    expect(payload.value.chartText).toBe("| Dm7:2/1 G7:2/1 | Cmaj7:4/1 |");
  });

  test("an empty chart refuses to share", () => {
    const controller = freshController();
    const payload = buildSharePayload(controller.getSnapshot());
    expect(payload.ok).toBe(false);
    if (!payload.ok) expect(payload.code).toBe("share.chart_empty");
  });

  test("a chart with an empty bar refuses to share by name", () => {
    const controller = freshController();
    insertText(controller, "| Cmaj7 |");
    const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
    expect(controller.insertMeasure(sectionId, null).ok).toBe(true);
    const payload = buildSharePayload(controller.getSnapshot());
    expect(payload.ok).toBe(false);
    if (!payload.ok) expect(payload.code).toBe("share.chart_has_empty_bar");
  });
});

describe("applying a shared chart", () => {
  test("full round trip through a fresh controller", () => {
    const source = freshController();
    insertText(source, "| Dm7 G7 | Cmaj7 | Fmaj7:2/1 Em7:2/1 |");
    expect(source.setTitle("Round Trip").ok).toBe(true);
    expect(source.setTempo(96).ok).toBe(true);
    expect(source.setPerformanceStyle("medium-swing@1").ok).toBe(true);
    const payload = buildSharePayload(source.getSnapshot());
    if (!payload.ok) throw new Error(payload.message);
    const encoded = encodeShareFragment(payload.value);
    if (!encoded.ok) throw new Error(encoded.message);
    const decoded = decodeShareFragment(encoded.value);
    if (!decoded.ok) throw new Error(decoded.message);

    const target = freshController();
    const applied = applySharedStartup(target, decoded.value);
    expect(applied.applied).toBe(true);
    const snapshot = target.getSnapshot();
    expect(snapshot.title).toBe("Round Trip");
    expect(snapshot.tempoBpm).toBe(96);
    expect(snapshot.performance.styleId).toBe("medium-swing@1");
    const shapes = snapshot.sections.map((section) =>
      section.measures.map((measure) => measure.events.length),
    );
    expect(shapes).toEqual([[2, 1, 2]]);
    // The re-shared chart is byte-identical: sharing is idempotent.
    const reshared = buildSharePayload(snapshot);
    if (!reshared.ok) throw new Error(reshared.message);
    expect(reshared.value.chartText).toBe(payload.value.chartText);
  });

  test("a share carrying the blank studio's own defaults still applies", () => {
    /*
     * Same-value commands refuse rather than record no-ops, so a payload
     * whose title and tempo equal the blank document's defaults must skip
     * those steps. This is exactly what a Copy link on an untitled chart
     * at the default tempo produces — the WebKit reopen caught it live.
     */
    const blank = freshController();
    const defaults = blank.getSnapshot();
    const target = freshController();
    const applied = applySharedStartup(target, {
      chartText: "| Am7:2/1 D7:2/1 | Gmaj7:4/1 |",
      grooveStyleId: "ballad-comp@1",
      tempoBpm: defaults.tempoBpm,
      title: defaults.title,
    });
    expect(applied.applied).toBe(true);
    expect(target.getSnapshot().chordCount).toBe(3);
  });

  test("a studio with content is never touched", () => {
    const controller = freshController();
    insertText(controller, "| Cmaj7 |");
    const before = controller.getSnapshot().revision;
    const applied = applySharedStartup(controller, REFERENCE_PAYLOAD);
    expect(applied.applied).toBe(false);
    expect(controller.getSnapshot().revision).toBe(before);
  });

  test("a full apply is exactly undoable back to pristine", () => {
    /*
     * Pins the unwind law from the outside: whatever command shape the
     * pristine fill uses (one command or fill+append), undoing until the
     * history empties must land back on the untouched blank studio.
     */
    const target = freshController();
    const applied = applySharedStartup(target, REFERENCE_PAYLOAD);
    expect(applied.applied).toBe(true);
    let undos = 0;
    while (target.getSnapshot().history.canUndo && undos < 8) {
      expect(target.undo().ok).toBe(true);
      undos += 1;
    }
    const snapshot = target.getSnapshot();
    expect(snapshot.chordCount).toBe(0);
    expect(snapshot.title).not.toBe(REFERENCE_PAYLOAD.title);
    expect(snapshot.history.canUndo).toBe(false);
    // Title + fill + append + tempo + groove for the two-bar reference.
    expect(undos).toBeGreaterThanOrEqual(3);
  });

  test("an unparseable shared chart unwinds the applied title", () => {
    const controller = freshController();
    const applied = applySharedStartup(controller, {
      ...REFERENCE_PAYLOAD,
      chartText: "| H7 not-a-chord |",
    });
    expect(applied.applied).toBe(false);
    const snapshot = controller.getSnapshot();
    expect(snapshot.chordCount).toBe(0);
    expect(snapshot.title).not.toBe(REFERENCE_PAYLOAD.title);
    expect(snapshot.history.canUndo).toBe(false);
  });
});

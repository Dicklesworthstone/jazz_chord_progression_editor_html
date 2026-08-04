import type { StudioController } from "./studio-controller";

/**
 * The reviewed first-open starter chart (jcpe-b20t).
 *
 * A first-time visitor should see a real progression and reach sound in one
 * press, not stare at an empty chart wondering what the text grammar wants.
 * The chart is an original progression in the mu-major harmonic language —
 * add9 colors, sliding ii–Vs, chromatic approach dominants, maj7#11, a
 * backdoor cadence — not a transcription of any recording.
 *
 * The seed travels the exact typed path a user travels: title command, quick
 * entry draft, then the atomic insert. It therefore commits exactly two
 * undoable commands, and two presses of Undo return the pristine empty
 * chart; nothing here is a side door around the command surface.
 */
export const STARTER_CHART = Object.freeze({
  /*
   * jcpe-x0z9: the owner-directed seed is the Deacon Blues intro (Steely
   * Dan, Aja 1977) — the famous chromatic descent, two chords per bar,
   * closing on the Ebmaj7 / E7#9 turnaround. Every symbol is proven
   * playable through the real transport composition by the seed gates.
   */
  title: "Deacon Blues",
  chartText:
    "| Cmaj7 Bm7#5 | Bbmaj7 Am7#5 | Dmaj7 C#m7#5 | Cmaj7 Bm7#5 | Ebmaj7 | E7#9 |",
  /**
   * The chart lands in two atomic inserts because the closed insertion-plan
   * vocabulary has no fill-and-append statement: the opening bar fills the
   * pristine empty measure (`fits-measure`), and the remainder appends at
   * the section end (`completes-measures`). One insert aimed at either
   * target alone would leave a hollow first bar or refuse as overfill.
   */
  firstBarText: "| Cmaj7 Bm7#5 |",
  remainingBarsText:
    "| Bbmaj7 Am7#5 | Dmaj7 C#m7#5 | Cmaj7 Bm7#5 | Ebmaj7 | E7#9 |",
  /** Undo presses that return the pristine studio: title + two inserts. */
  undoDepth: 3,
} as const);

export type SeedStarterChartResult = Readonly<{
  seeded: boolean;
  reason:
    | "seeded"
    | "document-not-pristine"
    | "title-refused"
    | "draft-refused"
    | "insert-refused";
}>;

/**
 * Seed the starter chart into a pristine studio. A studio that already has
 * content — a recovered document, a prior command, an edited title — is never
 * touched: the starter chart is a welcome, not an overwrite. A refusal at any
 * step leaves the studio exactly usable (at worst titled but empty) and
 * reports itself; the caller renders regardless, because an empty studio is
 * strictly better than no studio.
 */
export function seedStarterChart(
  controller: StudioController,
): SeedStarterChartResult {
  const snapshot = controller.getSnapshot();
  const pristine =
    snapshot.chordCount === 0 &&
    snapshot.sections.length === 1 &&
    !snapshot.history.canUndo &&
    snapshot.quickEntry.text.length === 0;
  if (!pristine) {
    return Object.freeze({ seeded: false, reason: "document-not-pristine" });
  }
  const sectionId = snapshot.sections[0]?.id;
  const measureId = snapshot.sections[0]?.measures[0]?.id;
  if (sectionId === undefined || measureId === undefined) {
    return Object.freeze({ seeded: false, reason: "document-not-pristine" });
  }
  const titled = controller.setTitle(STARTER_CHART.title);
  if (!titled.ok) {
    return Object.freeze({ seeded: false, reason: "title-refused" });
  }
  const inserts: readonly (readonly [
    string,
    Parameters<StudioController["setQuickEntryDraft"]>[1],
  ])[] = [
    [STARTER_CHART.firstBarText, { kind: "measure-start", measureId }],
    [STARTER_CHART.remainingBarsText, { kind: "section-end", sectionId }],
  ];
  for (const [text, target] of inserts) {
    const preview = controller.previewChartText(text);
    const drafted = controller.setQuickEntryDraft(
      text,
      target,
      preview.status,
      preview.issueCodes,
    );
    if (!drafted.ok) {
      return Object.freeze({ seeded: false, reason: "draft-refused" });
    }
    const inserted = controller.applyQuickEntryPreview();
    if (!inserted.ok) {
      return Object.freeze({ seeded: false, reason: "insert-refused" });
    }
  }
  /*
   * An insert queues a chart focus request so an editing user lands on what
   * they changed. Nobody edited anything here, and honoring it would steal
   * the document's initial keyboard position from the skip link, so the
   * seed acknowledges its own request before first paint.
   */
  const focusRequest = controller.getSnapshot().focusRequest;
  if (focusRequest !== null) {
    controller.acknowledgeFocus(focusRequest.sequence);
  }
  return Object.freeze({ seeded: true, reason: "seeded" });
}

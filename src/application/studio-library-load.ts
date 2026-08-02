import type {
  StudioController,
  StudioControllerActionResult,
} from "./studio-controller";
import {
  PROGRESSION_LIBRARY,
  type ProgressionLibraryEntry,
} from "./studio-progression-library";

/**
 * The one library-load gesture (jcpe-my0j).
 *
 * Loading a library entry is ONE document gesture — replace the chart,
 * retitle it, set its groove and its tempo — through the same controller
 * actions each control uses alone. The first wiring chained UI callbacks
 * instead, and every link failed the owner: the chart APPENDED after
 * whatever was already written, the title never changed, and the tempo
 * commit read a stale render's draft. This helper is that gesture moved to
 * the application layer (the `seedStarterChart` precedent), so the surface
 * only renders its results and a test can drive the real path.
 *
 * The gesture ends with an EXPLICIT stop when a run is live. Playback plans
 * are immutable and the chart is the source of truth: a run bound to the
 * replaced chart would keep sounding the old plan while the playhead
 * highlights the new one, and its X1 notifications — echoing the superseded
 * (documentId, planRevision) — could never satisfy A0's acceptance law
 * again, which is exactly how "Stopping playback" stuck forever. The stop
 * is dispatched AFTER the edits so its settlement identity is the current
 * document's, letting the jcpe-my0j receipt settlement land instead of
 * being ignored-stale.
 */
export type LoadProgressionLibraryEntryResult = Readonly<{
  /** Null when the entry id names nothing; every step is then null too. */
  entry: ProgressionLibraryEntry | null;
  /** Clear of the previous chart; null when the chart was already empty. */
  cleared: StudioControllerActionResult | null;
  /** Quick-entry staging of the entry's chart text. */
  staged: StudioControllerActionResult | null;
  /** The atomic insert; null when staging refused. */
  inserted: StudioControllerActionResult | null;
  titled: StudioControllerActionResult | null;
  groove: StudioControllerActionResult | null;
  /** Null when the entry declares no canonical tempo. */
  tempo: StudioControllerActionResult | null;
  /** The explicit stop; null when no run was live at the gesture's end. */
  stopped: StudioControllerActionResult | null;
}>;

const NOT_FOUND: LoadProgressionLibraryEntryResult = Object.freeze({
  entry: null,
  cleared: null,
  staged: null,
  inserted: null,
  titled: null,
  groove: null,
  tempo: null,
  stopped: null,
});

/** Transport states a live run occupies; `stopping` is already on its way. */
const LIVE_TRANSPORT_STATUSES: readonly string[] = Object.freeze([
  "starting",
  "playing",
  "paused",
]);

export function loadProgressionLibraryEntry(
  controller: StudioController,
  entryId: string,
): LoadProgressionLibraryEntryResult {
  const entry = PROGRESSION_LIBRARY.find(
    (candidate) => candidate.id === entryId,
  );
  if (entry === undefined) return NOT_FOUND;
  let cleared: StudioControllerActionResult | null = null;
  if (controller.getSnapshot().chordCount > 0) {
    cleared = controller.clearChart();
  }
  /*
   * Any snapshot taken before the clear holds stale ids; the section-end
   * target must come from the LIVE snapshot or the staging refuses and the
   * chart loads empty — exactly the defect the owner heard.
   */
  const fresh = controller.getSnapshot();
  const lastSection = fresh.sections[fresh.sections.length - 1];
  const preview = controller.previewChartText(entry.chartText);
  const staged = controller.setQuickEntryDraft(
    entry.chartText,
    lastSection === undefined
      ? null
      : { kind: "section-end", sectionId: lastSection.id },
    preview.status,
    preview.issueCodes,
  );
  const inserted = staged.ok ? controller.applyQuickEntryPreview() : null;
  const titled = controller.setTitle(entry.title);
  const groove = controller.setPerformanceStyle(entry.grooveStyleId);
  const tempo =
    entry.tempoBpm === undefined ? null : controller.setTempo(entry.tempoBpm);
  /*
   * Last, so the stop's dispatch-time settlement identity is the replaced
   * document's current revision. Stopping first would capture the pre-edit
   * revision, and the synchronous edits above land before the queued stop
   * ever processes — the settlement would be ignored-stale and the surface
   * would stick at "Stopping playback" again.
   */
  const stopped = LIVE_TRANSPORT_STATUSES.includes(
    controller.getSnapshot().transport.status,
  )
    ? controller.stopProgression()
    : null;
  return Object.freeze({
    entry,
    cleared,
    staged,
    inserted,
    titled,
    groove,
    tempo,
    stopped,
  });
}

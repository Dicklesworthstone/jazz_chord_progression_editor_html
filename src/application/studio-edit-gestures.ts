import type {
  StudioController,
  StudioControllerActionResult,
} from "./studio-controller";
import type { StudioViewModel } from "./studio-view-model";

/**
 * Composed edit gestures for the two routine chart edits the 2026-08-02 UX
 * audit found taxing the user for the domain's own bookkeeping (jcpe-yvni):
 *
 * - deleting a chord from a full bar interrogated the user with the
 *   incomplete-measure dialog on every routine delete;
 * - duplicating a chord whose copies could not fit the focused bar refused
 *   outright instead of landing the copy anywhere.
 *
 * The incomplete-measure DOMAIN law is untouched: a measure may only stay
 * short because someone said why, and every published short measure still
 * stores a reason. What changes is who writes the routine reason — these
 * gestures pass a reviewed constant, and the deliberate card-menu path
 * ("Declare this measure's completion") remains the way to state a custom
 * one, replacing the constant verbatim.
 *
 * Each gesture composes EXISTING controller intents, the same way the
 * library-load gesture in `src/ui/App.tsx` composes clear + stage + apply
 * through controller actions alone. The pinned A0 command vocabulary gains
 * no new kind here, and every dispatched action keeps its pinned
 * operation-to-command binding (U1-OP-006 insert, U1-OP-008 delete,
 * U1-OP-009 duplicate).
 */

/**
 * The reviewed completion reason a routine delete writes into a bar it
 * leaves short. Stored verbatim, rendered verbatim, replaced only by the
 * deliberate "Declare this measure's completion" path.
 */
export const DELETE_AUTO_COMPLETION_REASON = "Shortened by delete";

/**
 * The reviewed completion reason a duplicate writes into a bar its copies
 * leave short — the focused bar when they fit, or the fresh following bar
 * the overfill resolution creates.
 */
export const DUPLICATE_AUTO_COMPLETION_REASON = "Shortened by duplicate";

/**
 * The controller surface the gestures compose. Structural, so the real
 * controller and the App's bound action map both satisfy it.
 */
export type StudioEditGestureActions = Readonly<{
  getSnapshot: () => StudioViewModel;
  deleteSelection: (
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  duplicateSelection: (
    destinationMeasureId?: string | null,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  insertMeasure: (
    sectionId: string,
    beforeMeasureId: string | null,
  ) => StudioControllerActionResult;
}>;

/** Static proof the live controller satisfies the gesture surface. */
const GESTURE_SURFACE_PROOF = (
  controller: StudioController,
): StudioEditGestureActions => controller;
void GESTURE_SURFACE_PROOF;

/**
 * Delete the selection, declaring any bar the delete leaves short with the
 * reviewed constant instead of interrogating the user. The controller's
 * delete command carries its completion updates atomically, so the whole
 * gesture is exactly one undoable A0 command.
 */
export function deleteSelectionAutoDeclaring(
  actions: StudioEditGestureActions,
): StudioControllerActionResult {
  return actions.deleteSelection(DELETE_AUTO_COMPLETION_REASON);
}

/** Exact "numerator/denominator" beat label, or null when not that shape. */
function parseExactLabel(label: string): readonly [bigint, bigint] | null {
  const match = /^(\d+)\/(\d+)$/u.exec(label);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const denominator = BigInt(match[2]);
  if (denominator === 0n) return null;
  return [BigInt(match[1]), denominator];
}

/**
 * Whether the selected chords' exact total duration fits one bar. Exact
 * cross-multiplied bigint arithmetic over the view model's own labels; no
 * float ever decides a musical outcome.
 */
function selectionFitsOneBar(snapshot: StudioViewModel): boolean {
  const selected = new Set(snapshot.bookmarks.selectedEventIds);
  let totalN = 0n;
  let totalD = 1n;
  let capacity: readonly [bigint, bigint] | null = null;
  for (const section of snapshot.sections) {
    for (const measure of section.measures) {
      capacity ??= parseExactLabel(measure.capacityBeatLabel);
      for (const event of measure.events) {
        if (!selected.has(event.id)) continue;
        const duration = parseExactLabel(event.durationBeatLabel);
        if (duration === null) return false;
        const [dn, dd] = duration;
        totalN = totalN * dd + dn * totalD;
        totalD *= dd;
      }
    }
  }
  if (capacity === null) return false;
  const [cn, cd] = capacity;
  return totalN * cd <= cn * totalD;
}

/**
 * Duplicate the selection so the copy LANDS by default.
 *
 * First the plain duplicate is attempted against the focused bar, with any
 * short result auto-declared. When that refuses because the copies overfill
 * the bar, the gesture performs the deterministic reviewed resolution the
 * refusal names: the same "split this bar here" end state the overfill
 * authority (U1_MEASURE_FILL_AUTHORITY) lists first — the copies land in a
 * fresh bar immediately after the focused one, exactly as if the overfull
 * bar had been split at the first copied chord. With existing intents that
 * is insert-measure followed by duplicate-into-it: the pinned command
 * vocabulary has no composite command, so the minimal sequence is two
 * undoable steps (undo removes the copies, a second undo the fresh bar).
 *
 * A selection whose copies exceed one whole bar has no reviewed automatic
 * resolution; the original refusal is returned for the surface to state
 * with every named remedy.
 */
export function duplicateSelectionAutoResolving(
  actions: StudioEditGestureActions,
): StudioControllerActionResult {
  const attempt = actions.duplicateSelection(
    null,
    DUPLICATE_AUTO_COMPLETION_REASON,
  );
  if (attempt.ok || attempt.refusal.code !== "u1.duration_overfills_measure") {
    return attempt;
  }
  const snapshot = actions.getSnapshot();
  if (!selectionFitsOneBar(snapshot)) return attempt;
  const focusEventId = snapshot.bookmarks.selectionFocusEventId;
  if (focusEventId === null) return attempt;
  let ownerSectionId: string | null = null;
  let beforeMeasureId: string | null = null;
  let knownMeasureIds: ReadonlySet<string> | null = null;
  for (const section of snapshot.sections) {
    for (const [index, measure] of section.measures.entries()) {
      if (!measure.events.some((event) => event.id === focusEventId)) continue;
      ownerSectionId = section.id;
      beforeMeasureId = section.measures[index + 1]?.id ?? null;
      knownMeasureIds = new Set(section.measures.map((entry) => entry.id));
    }
  }
  if (ownerSectionId === null || knownMeasureIds === null) return attempt;
  const priorMeasureIds = knownMeasureIds;
  const sectionId = ownerSectionId;
  const inserted = actions.insertMeasure(sectionId, beforeMeasureId);
  if (!inserted.ok) return attempt;
  /*
   * The render-time snapshot predates the insert, so the fresh bar's id must
   * come from the LIVE snapshot — the same law the library-load gesture
   * learned the hard way.
   */
  const fresh = actions.getSnapshot();
  const freshSection = fresh.sections.find(
    (section) => section.id === sectionId,
  );
  const freshMeasure = freshSection?.measures.find(
    (measure) => !priorMeasureIds.has(measure.id),
  );
  if (freshMeasure === undefined) return attempt;
  return actions.duplicateSelection(
    freshMeasure.id,
    DUPLICATE_AUTO_COMPLETION_REASON,
  );
}

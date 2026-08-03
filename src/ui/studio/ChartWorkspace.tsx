import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import {
  Badge,
  Button,
  EmptyState,
  KeyValueList,
} from "../primitives";
import type {
  StudioCardMenuAction,
  StudioChartView,
  StudioPanelSide,
  StudioViewMode,
} from "./studio-contract";

export type ChartWorkspaceProps = Readonly<{
  view: StudioChartView;
  onRequestPanelSheet: (side: StudioPanelSide) => void;
  onSelectChord: (chordId: string, extend: boolean) => void;
  onRovingFocusChange: (chordId: string) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onInsertMeasure: (sectionId: string, beforeMeasureId: string | null) => void;
  onInsertSection: () => void;
  onApplyInlineSymbol: (chordId: string, symbolText: string) => void;
  onApplyDuration: (chordId: string, beatText: string) => void;
  onCancelPendingEdit: () => void;
  onDeclareMeasureCompletion: (measureId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onAnnotateSection: (sectionId: string, annotation: string) => void;
  onSetSectionBoundary: (
    sectionId: string,
    boundary: "reset" | "continue",
  ) => void;
  onDropChordOnMeasure: (measureId: string) => void;
  onCardMenuOpenChange: (chordId: string | null) => void;
  onCardMenuAction: (chordId: string, action: StudioCardMenuAction) => void;
  onSplitDuration: (chordId: string, firstBeats: string) => void;
  onSplitSection: (sectionId: string, beforeMeasureId: string) => void;
  onJoinSections: (sectionId: string) => void;
  onDeleteMeasure: (measureId: string) => void;
  onSplitAtBar: (beforeEventId: string) => void;
  onSetInsertionPoint: (measureId: string) => void;
  onRangeModeChange: (active: boolean) => void;
  onRangeEdgeFromFocus: (edge: "start" | "end") => void;
  onRangeEdgeToChord: (edge: "start" | "end", chordId: string) => void;
  onRangeDraftChange: (edge: "start" | "end", value: string) => void;
  onRangeDraftCommit: (edge: "start" | "end") => void;
  onRangeCancel: () => void;
  onRangeClear: () => void;
  onViewModeChange: (mode: StudioViewMode) => void;
}>;

/** Reviewed project threshold; a shorter movement stays a tap and a scroll. */
const DRAG_THRESHOLD_CSS_PX = 8;

/**
 * Beat-proportional lead-sheet spacing: a chord that holds four beats takes
 * roughly twice the ink of one holding two, the way an engraved chart
 * spaces symbols. The label is the frozen selector string ("N beats" or
 * "N/D beats"); only its leading exact count is read, and the result is
 * clamped so a long pedal tone cannot starve its neighbors. Presentation
 * only — no duration is ever computed or altered here.
 */
const DURATION_BEATS_PATTERN = /^(\d+)(?:\/(\d+))?/u;

function chordBeatFlexGrow(durationLabel: string): number {
  const match = DURATION_BEATS_PATTERN.exec(durationLabel);
  if (match === null) return 1;
  const numerator = Number(match[1]);
  const denominator = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 1;
  }
  return Math.min(16, Math.max(0.5, numerator / denominator));
}

/**
 * Lead-sheet symbol layout: the root (letter plus accidentals) renders at
 * display size while the quality tail and slash bass step down, the way an
 * engraved chart sets them. This is wrapping only — the concatenated text
 * content stays exactly the stored symbol, so the exact-spelling law and
 * every text-matching test see the unchanged string.
 */
const SYMBOL_ROOT_PATTERN = /^([A-G](?:bb|##|[b#♭♯𝄫𝄪])?)(.*)$/u;

function LeadSheetSymbol({ text }: Readonly<{ text: string }>) {
  const match = SYMBOL_ROOT_PATTERN.exec(text);
  if (match === null) return <>{text}</>;
  const root = match[1] ?? "";
  const tail = match[2] ?? "";
  const slashAt = tail.indexOf("/");
  const quality = slashAt < 0 ? tail : tail.slice(0, slashAt);
  const bass = slashAt < 0 ? "" : tail.slice(slashAt);
  return (
    <>
      <span class="studio-symbol__root">{root}</span>
      {quality.length > 0 ? (
        <span class="studio-symbol__quality">{quality}</span>
      ) : null}
      {bass.length > 0 ? (
        <span class="studio-symbol__bass">{bass}</span>
      ) : null}
    </>
  );
}

/**
 * A transition a dirty inline symbol draft can interrupt. Each one is recorded
 * literally so Apply and Discard resume exactly the action the caller asked
 * for, rather than a guess about what they meant.
 */
type DeferredSwitch =
  | Readonly<{ kind: "focus-card"; chordId: string }>
  | Readonly<{
      kind: "select-card";
      chordId: string;
      extend: boolean;
      focusAfter: boolean;
    }>
  | Readonly<{ kind: "edit-symbol"; chordId: string }>
  | Readonly<{ kind: "edit-duration"; chordId: string }>
  | Readonly<{ kind: "split-duration"; chordId: string }>
  | Readonly<{ kind: "menu-action"; chordId: string; action: StudioCardMenuAction }>
  | null;

/** Visual order of every chord card, used only for roving-focus movement. */
/**
 * The chord after `chordId` inside its own measure, or null when the chord
 * is missing or already last in its bar. This is the only legal split-at-bar
 * boundary the overfill fix can name.
 */
function nextChordInSameMeasure(
  view: StudioChartView,
  chordId: string | null,
): string | null {
  if (chordId === null) return null;
  for (const section of view.sections) {
    for (const measure of section.measures) {
      const index = measure.chords.findIndex((chord) => chord.id === chordId);
      if (index === -1) continue;
      const next = measure.chords[index + 1];
      return next === undefined ? null : next.id;
    }
  }
  return null;
}

function chartChordOrder(view: StudioChartView): readonly string[] {
  return view.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.chords.map((chord) => chord.id),
    ),
  );
}

/**
 * Resolve the nearest declared card action for an event target. Every control
 * inside a chord card is discriminated by `data-card-action` and handled by the
 * card's own delegated listeners, so a card owns exactly three static
 * listeners no matter how many controls it renders. That is the design answer
 * to the confirmed legacy failure where touch listeners multiplied with each
 * document mutation.
 */
function cardActionAt(target: EventTarget | null): Readonly<{
  action: string;
  element: HTMLElement;
}> | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>("[data-card-action]");
  const action = element?.dataset["cardAction"];
  return element === null || action === undefined ? null : { action, element };
}

export function ChartWorkspace({
  view,
  onRequestPanelSheet,
  onSelectChord,
  onRovingFocusChange,
  onDeleteSelection,
  onDuplicateSelection,
  onMoveSelection,
  onInsertMeasure,
  onInsertSection,
  onApplyInlineSymbol,
  onApplyDuration,
  onCancelPendingEdit,
  onDeclareMeasureCompletion,
  onRenameSection,
  onAnnotateSection,
  onSetSectionBoundary,
  onDropChordOnMeasure,
  onCardMenuOpenChange,
  onCardMenuAction,
  onSplitDuration,
  onSplitSection,
  onJoinSections,
  onDeleteMeasure,
  onSplitAtBar,
  onSetInsertionPoint,
  onRangeModeChange,
  onRangeEdgeFromFocus,
  onRangeEdgeToChord,
  onRangeDraftChange,
  onRangeDraftCommit,
  onRangeCancel,
  onRangeClear,
  onViewModeChange,
}: ChartWorkspaceProps) {
  /**
   * Raw inline text stays component-local. Escape restores the exact prior
   * source text and blur neither commits nor coerces it.
   */
  const [editing, setEditing] = useState<Readonly<{
    chordId: string;
    draft: string;
  }> | null>(null);
  const [durationEdit, setDurationEdit] = useState<Readonly<{
    chordId: string;
    draft: string;
  }> | null>(null);
  const [splitEdit, setSplitEdit] = useState<Readonly<{
    chordId: string;
    draft: string;
  }> | null>(null);
  /**
   * The transition a dirty inline draft interrupted. Switching away from an
   * open symbol editor never decides for the caller: the interrupted action is
   * held here verbatim and re-run only after Apply or Discard.
   */
  const [deferredSwitch, setDeferredSwitch] = useState<DeferredSwitch>(null);
  /** Presentation-only: the section whose boundary menu is open, or none. */
  const [openBoundaryMenuId, setOpenBoundaryMenuId] = useState<string | null>(
    null,
  );
  /**
   * The demo-chart banner's dismissal. Component state on purpose: the
   * banner is a greeting, not a document fact, so it never persists and
   * never reaches the controller.
   */
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  /**
   * A completed drag ends with a click on the captured handle. Without this the
   * drop and the handle's own keyboard-equivalent activation would both publish
   * a boundary, which is two edges from one gesture.
   */
  const dragConsumedClick = useRef(false);
  /**
   * One drag session at a time. Its three transient listeners live on the
   * captured handle and are removed on pointerup, pointercancel, and unmount,
   * so document mutation can never multiply them.
   */
  const dragSession = useRef<Readonly<{
    /** One session covers both card drags and range-boundary handle drags. */
    kind: "card" | "range-start" | "range-end";
    chordId: string;
    handle: HTMLElement;
    originX: number;
    originY: number;
    started: boolean;
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
    onCancel: () => void;
  }> | null>(null);

  const endDragSession = (): void => {
    const session = dragSession.current;
    if (session === null) return;
    session.handle.removeEventListener("pointermove", session.onMove);
    session.handle.removeEventListener("pointerup", session.onEnd);
    session.handle.removeEventListener("pointercancel", session.onCancel);
    dragSession.current = null;
    setDragging(null);
  };

  useEffect(() => endDragSession, []);

  /**
   * Release a session whose handle left the document.
   *
   * A card can be unmounted while its drag is still live — an undo, a delete
   * repair, or any other out-of-band command removes the chord the pointer is
   * holding. The detached handle can never fire `pointerup` or `pointercancel`
   * again, so without this the session ref stayed set forever: `beginDrag`
   * returned early on every later attempt and dragging was dead for the rest of
   * the session. Ending it here is the "capture is released on unmount" half of
   * the reviewed pointer policy, applied per card rather than only to the
   * region.
   */
  useEffect(() => {
    const session = dragSession.current;
    if (session === null) return;
    if (document.contains(session.handle)) return;
    endDragSession();
  });

  /**
   * Give the keyboard the editor, and give the card back when it closes.
   *
   * `autoFocus` alone is neither sufficient nor portable on a dynamically
   * inserted input. Chromium and Firefox ignore it, so F2 opened an editor the
   * caret never entered and every keystroke went to the card underneath;
   * WebKit honours it and then drops focus to the document body when the input
   * unmounts, which strands the chart's only tab stop and silently swallows
   * every following key. Focus is therefore moved explicitly on open and
   * returned to the owning card on close, identically in all three engines.
   */
  const openEditorChordId =
    editing?.chordId ?? durationEdit?.chordId ?? splitEdit?.chordId ?? null;
  const lastEditorChordId = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = lastEditorChordId.current;
    lastEditorChordId.current = openEditorChordId;
    if (openEditorChordId !== null) {
      document
        .querySelector<HTMLElement>(
          `[data-chord-id="${openEditorChordId}"] [data-card-action="editor"]`,
        )
        ?.focus();
      return;
    }
    if (previous === null) return;
    // The card may itself be gone — a committed split or join replaces it — in
    // which case the roving focus request A0 published owns the repair.
    document
      .querySelector<HTMLElement>(`[data-chord-id="${previous}"]`)
      ?.focus();
  }, [openEditorChordId]);

  const measureIdAtPoint = (clientX: number, clientY: number): string | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const measure = element?.closest<HTMLElement>("[data-measure-id]");
    return measure?.dataset["measureId"] ?? null;
  };

  const chordIdAtPoint = (clientX: number, clientY: number): string | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const card = element?.closest<HTMLElement>("[data-chord-id]");
    return card?.dataset["chordId"] ?? null;
  };

  const beginDrag = (
    chordId: string,
    handle: HTMLElement,
    event: PointerEvent,
    kind: "card" | "range-start" | "range-end" = "card",
  ): void => {
    if (dragSession.current !== null) return;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; the session still
      // starts so that its transient listeners are installed and released.
    }

    const onMove = (moveEvent: PointerEvent): void => {
      const session = dragSession.current;
      if (session === null) return;
      const distance = Math.hypot(
        moveEvent.clientX - session.originX,
        moveEvent.clientY - session.originY,
      );
      if (!session.started) {
        // Below the reviewed threshold this stays a tap and a scroll.
        if (distance < DRAG_THRESHOLD_CSS_PX) return;
        dragSession.current = { ...session, started: true };
        setDragging(session.kind === "card" ? session.chordId : session.kind);
      }
      // preventDefault only after a real drag threshold is crossed.
      moveEvent.preventDefault();
    };
    const onEnd = (endEvent: PointerEvent): void => {
      const session = dragSession.current;
      const started = session?.started ?? false;
      const sessionKind = session?.kind ?? "card";
      const chord = session?.chordId ?? null;
      endDragSession();
      if (!started) return;
      if (sessionKind !== "card") {
        // A range handle sets its own edge from whatever card it was released
        // over. Releasing over nothing publishes nothing.
        dragConsumedClick.current = true;
        const droppedOn = chordIdAtPoint(endEvent.clientX, endEvent.clientY);
        if (droppedOn !== null) {
          onRangeEdgeToChord(
            sessionKind === "range-start" ? "start" : "end",
            droppedOn,
          );
        }
        return;
      }
      if (chord === null) return;
      const measureId = measureIdAtPoint(endEvent.clientX, endEvent.clientY);
      if (measureId !== null) onDropChordOnMeasure(measureId);
    };
    const onCancel = (): void => {
      endDragSession();
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onCancel);
    dragSession.current = {
      chordId,
      handle,
      kind,
      onCancel,
      onEnd,
      onMove,
      originX: event.clientX,
      originY: event.clientY,
      started: false,
    };
  };

  const order = chartChordOrder(view);
  /**
   * The chart always keeps exactly one tab stop. A roving id that no longer
   * names a rendered chord — after an undo, a delete, or a join — must fall
   * back to the first card, or the whole chart would drop out of the tab
   * order and become unreachable by keyboard.
   */
  const rovingId = view.rovingFocusId;
  const focusId =
    rovingId !== null && order.includes(rovingId)
      ? rovingId
      : (order[0] ?? null);
  const allChords = view.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.chords),
  );
  const chordById = (chordId: string) =>
    allChords.find((candidate) => candidate.id === chordId);

  /**
   * Roving focus moves the tab stop AND the DOM focus together. Moving only
   * the tab stop would leave activation on the previously focused card.
   */
  const focusChord = (chordId: string): void => {
    onRovingFocusChange(chordId);
    document
      .querySelector<HTMLElement>(`[data-chord-id="${chordId}"]`)
      ?.focus();
  };

  const moveFocus = (currentId: string, step: -1 | 1 | "first" | "last"): void => {
    if (order.length === 0) return;
    if (step === "first" || step === "last") {
      // Home and End always republish the roving focus, even when the tab stop
      // is already there: the chart's single tab stop is A0-facing state, not
      // an inference from where the DOM focus happens to be.
      const edge = step === "first" ? order[0] : order.at(-1);
      if (edge !== undefined) {
        guardedSwitch({ chordId: edge, kind: "focus-card" });
      }
      return;
    }
    const index = order.indexOf(currentId);
    if (index < 0) return;
    const next = order[Math.min(Math.max(index + step, 0), order.length - 1)];
    if (next !== undefined && next !== currentId) {
      guardedSwitch({ chordId: next, kind: "focus-card" });
    }
  };

  /* jcpe-disi.6: the context bar exists exactly while something is chosen. */
  const chartHasSelection = allChords.some(
    (chord) => chord.selected || chord.inRange,
  );
  const rangedCount = allChords.filter((chord) => chord.inRange).length;
  const singleSelectedChordId =
    rangedCount > 1
      ? null
      : (allChords.find((chord) => chord.selected)?.id ?? null);

  /**
   * jcpe-disi.5: bar selection is range selection over the bar's chords —
   * the same two gestures a person performs by hand, so the dirty-draft
   * guard applies exactly as it would to those clicks.
   */
  const selectMeasureChords = (measureId: string): void => {
    const measure = view.sections
      .flatMap((section) => section.measures)
      .find((candidate) => candidate.id === measureId);
    if (measure === undefined) return;
    const first = measure.chords[0];
    const last = measure.chords[measure.chords.length - 1];
    if (first === undefined || last === undefined) return;
    guardedSwitch({
      chordId: first.id,
      extend: false,
      focusAfter: false,
      kind: "select-card",
    });
    if (last.id !== first.id) {
      guardedSwitch({
        chordId: last.id,
        extend: true,
        focusAfter: false,
        kind: "select-card",
      });
    }
  };

  const beginInlineEdit = (chordId: string): void => {
    const chord = chordById(chordId);
    if (chord === undefined || !chord.inlineEditable) return;
    setEditing({ chordId, draft: chord.symbolText });
  };

  const beginDurationEdit = (chordId: string): void => {
    const chord = chordById(chordId);
    if (chord === undefined) return;
    setDurationEdit({
      chordId,
      draft: chord.durationLabel.replace(" beats", ""),
    });
  };

  const beginSplitEdit = (chordId: string): void => {
    if (chordById(chordId) === undefined) return;
    setSplitEdit({ chordId, draft: "" });
  };

  /**
   * A draft is dirty while it differs from the chord's own stored symbol text.
   * Reopening the editor and typing the same text back is not a change, so it
   * must not raise a prompt.
   */
  const dirtyEdit =
    editing !== null && editing.draft !== chordById(editing.chordId)?.symbolText
      ? editing
      : null;

  const runSwitch = (next: DeferredSwitch): void => {
    if (next === null) return;
    switch (next.kind) {
      case "focus-card":
        focusChord(next.chordId);
        return;
      case "select-card":
        if (next.focusAfter) onRovingFocusChange(next.chordId);
        onSelectChord(next.chordId, next.extend);
        if (next.focusAfter) {
          document
            .querySelector<HTMLElement>(`[data-chord-id="${next.chordId}"]`)
            ?.focus();
        }
        return;
      case "edit-symbol":
        beginInlineEdit(next.chordId);
        return;
      case "edit-duration":
        beginDurationEdit(next.chordId);
        return;
      case "split-duration":
        beginSplitEdit(next.chordId);
        return;
      case "menu-action":
        onCardMenuAction(next.chordId, next.action);
        return;
    }
  };

  /**
   * Switching away from a dirty inline draft prompts Apply, Discard, or
   * Continue editing (contract 5.3). A clean editor, or an action on the very
   * chord being edited, is never interrupted.
   */
  const guardedSwitch = (next: NonNullable<DeferredSwitch>): void => {
    if (dirtyEdit === null || dirtyEdit.chordId === next.chordId) {
      runSwitch(next);
      return;
    }
    setDeferredSwitch(next);
  };

  const focusInlineEditor = (): void => {
    document
      .querySelector<HTMLElement>('[data-testid="inline-symbol-editor"]')
      ?.focus();
  };

  const closeMenu = (chordId: string): void => {
    onCardMenuOpenChange(null);
    document.querySelector<HTMLElement>(`[data-chord-id="${chordId}"]`)?.focus();
  };

  const closeBoundaryMenu = (sectionId: string): void => {
    setOpenBoundaryMenuId(null);
    document
      .querySelector<HTMLElement>(`#studio-section-boundary-${sectionId}`)
      ?.focus();
  };

  /**
   * Roving movement inside the section-boundary menu. Like the card menu, the
   * active item is transient presentation state with no application meaning.
   */
  const onBoundaryMenuKeyDown = (
    sectionId: string,
    event: KeyboardEvent,
  ): void => {
    if (openBoundaryMenuId !== sectionId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeBoundaryMenu(sectionId);
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const menu = document.querySelector<HTMLElement>(
      `#studio-section-boundary-menu-${sectionId}`,
    );
    if (menu === null) return;
    const items = [
      ...menu.querySelectorAll<HTMLElement>('[data-menu-role="item"]'),
    ];
    if (items.length === 0) return;
    event.preventDefault();
    const last = items.length - 1;
    const current = items.findIndex((item) => item === document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : Math.min(
              Math.max(
                (current < 0 ? 0 : current) +
                  (event.key === "ArrowDown" ? 1 : -1),
                0,
              ),
              last,
            );
    items[next]?.focus();
  };

  /** Menu items that open a component-local editor rather than dispatching. */
  const runMenuAction = (chordId: string, action: StudioCardMenuAction): void => {
    if (action === "edit-symbol") {
      onCardMenuOpenChange(null);
      guardedSwitch({ chordId, kind: "edit-symbol" });
      return;
    }
    if (action === "edit-duration") {
      onCardMenuOpenChange(null);
      guardedSwitch({ chordId, kind: "edit-duration" });
      return;
    }
    if (action === "split-duration") {
      onCardMenuOpenChange(null);
      guardedSwitch({ chordId, kind: "split-duration" });
      return;
    }
    guardedSwitch({ action, chordId, kind: "menu-action" });
  };

  /** One of the card's exactly three static listeners. */
  const onCardClick = (chordId: string, event: MouseEvent): void => {
    const hit = cardActionAt(event.target);
    switch (hit?.action) {
      case "editor":
        return;
      case "drag":
        // A tap on the handle still selects. Only `pointerdown` starts a drag,
        // so the handle can never swallow a tap the way the legacy chart did.
        break;
      case "menu":
        onCardMenuOpenChange(view.openMenuChordId === chordId ? null : chordId);
        return;
      case "delete":
        // jcpe-disi.2: the × handle is the menu's Delete one click closer.
        // The menu vocabulary acts on the SELECTION, so the × first makes
        // its own chord the selection — the controller is synchronous, and
        // selection changes are bookmark moves, not history commands, so
        // the gesture still lands as ONE undoable delete.
        onSelectChord(chordId, false);
        runMenuAction(chordId, "delete");
        return;
      case "item": {
        const value = hit.element.dataset["menuAction"];
        if (hit.element.getAttribute("aria-disabled") === "true") return;
        if (value !== undefined) {
          runMenuAction(chordId, value as StudioCardMenuAction);
        }
        return;
      }
      case "symbol":
        // A double activation opens the inline editor; a single one selects.
        // jcpe-disi.1: activating the symbol of the chord that is ALREADY the
        // selection also edits — select, then click again to change your
        // mind. Shift keeps extending and an active range keeps its
        // range-edge semantics, so neither gesture can fall into the editor.
        if (
          event.detail >= 2 ||
          (!event.shiftKey &&
            !view.range.active &&
            chordById(chordId)?.selected === true)
        ) {
          guardedSwitch({ chordId, kind: "edit-symbol" });
          return;
        }
        break;
      case undefined:
      default:
        break;
    }
    guardedSwitch({
      chordId,
      extend: event.shiftKey,
      focusAfter: false,
      kind: "select-card",
    });
  };

  /** One of the card's exactly three static listeners. */
  const onCardPointerDown = (chordId: string, event: PointerEvent): void => {
    const hit = cardActionAt(event.target);
    if (hit?.action !== "drag") return;
    beginDrag(chordId, hit.element, event);
  };

  const menuItemElements = (chordId: string): readonly HTMLElement[] => {
    const card = document.querySelector<HTMLElement>(
      `[data-chord-id="${chordId}"]`,
    );
    return card === null
      ? []
      : [...card.querySelectorAll<HTMLElement>('[data-card-action="item"]')];
  };

  /**
   * Roving movement inside an open menu. Reading `document.activeElement` here
   * is not the DOM-focus inference the contract forbids: that rule governs
   * chart focus repair, which must render the A0 focus request. A transient
   * menu's active item is component-local presentation state with no
   * application meaning.
   */
  const moveMenuFocus = (
    chordId: string,
    step: -1 | 1 | "first" | "last",
  ): void => {
    const items = menuItemElements(chordId);
    if (items.length === 0) return;
    const active = document.activeElement;
    const current = items.findIndex((item) => item === active);
    const last = items.length - 1;
    const nextIndex =
      step === "first"
        ? 0
        : step === "last"
          ? last
          : Math.min(Math.max((current < 0 ? 0 : current) + step, 0), last);
    items[nextIndex]?.focus();
  };

  /** One of the card's exactly three static listeners. */
  const onCardKeyDown = (chordId: string, event: KeyboardEvent): void => {
    // Keys that arrive from inside an open menu drive the menu, not the chart.
    if (
      view.openMenuChordId === chordId &&
      cardActionAt(event.target)?.action === "item"
    ) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveMenuFocus(chordId, 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          moveMenuFocus(chordId, -1);
          return;
        case "Home":
          event.preventDefault();
          moveMenuFocus(chordId, "first");
          return;
        case "End":
          event.preventDefault();
          moveMenuFocus(chordId, "last");
          return;
        case "Escape":
        case "Tab":
          event.preventDefault();
          closeMenu(chordId);
          return;
        default:
          return;
      }
    }
    if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      onCardMenuOpenChange(chordId);
      return;
    }
    if (event.key === "ContextMenu") {
      event.preventDefault();
      onCardMenuOpenChange(chordId);
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      switch (event.key) {
        case "d":
        case "D":
          event.preventDefault();
          onDuplicateSelection();
          return;
        case "ArrowLeft":
          event.preventDefault();
          onMoveSelection("previous");
          return;
        case "ArrowRight":
          event.preventDefault();
          onMoveSelection("next");
          return;
        case "t":
        case "T":
          event.preventDefault();
          guardedSwitch({ chordId, kind: "edit-duration" });
          return;
        case "s":
        case "S":
          event.preventDefault();
          guardedSwitch({ chordId, kind: "split-duration" });
          return;
        case "j":
        case "J":
          event.preventDefault();
          onCardMenuAction(chordId, "join-next");
          return;
        case "m":
        case "M": {
          // U1-OP-012 move-to-boundary: the destination is the boundary the
          // insertion point already names, so the key never invents one.
          event.preventDefault();
          const destination = view.sections
            .flatMap((entry) => entry.measures)
            .find((measure) => measure.isInsertionTarget);
          if (destination !== undefined) {
            onDropChordOnMeasure(destination.id);
          }
          return;
        }
        default:
          return;
      }
    }
    if (event.ctrlKey || event.metaKey) return;
    if (event.shiftKey) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const index = order.indexOf(chordId);
        const next = order[index + (event.key === "ArrowRight" ? 1 : -1)];
        if (next !== undefined) {
          guardedSwitch({
            chordId: next,
            extend: true,
            focusAfter: true,
            kind: "select-card",
          });
        }
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
    }
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(chordId, 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(chordId, -1);
        return;
      case "Home":
        event.preventDefault();
        moveFocus(chordId, "first");
        return;
      case "End":
        event.preventDefault();
        moveFocus(chordId, "last");
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        guardedSwitch({
          chordId,
          extend: event.shiftKey,
          focusAfter: false,
          kind: "select-card",
        });
        return;
      case "F2":
        event.preventDefault();
        guardedSwitch({ chordId, kind: "edit-symbol" });
        return;
      case "Escape":
        event.preventDefault();
        // Escape restores the exact prior source text by closing the editor,
        // and cancels any prompt the caller has not answered yet.
        setDeferredSwitch(null);
        setEditing(null);
        setSplitEdit(null);
        if (view.openMenuChordId !== null) onCardMenuOpenChange(null);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        onDeleteSelection();
        return;
      default:
    }
  };

  /**
   * Chart-scope shortcuts. This is the chart region's single static listener;
   * it never registers anything per rendered node.
   */
  /**
   * The measure and section a structural chart shortcut acts on. The insertion
   * point wins because it is the explicit published bookmark for "where
   * structural work goes"; only when nothing is aimed does the focused card's
   * own measure stand in, and the first measure last.
   */
  const chartContext = (): Readonly<{
    section: StudioChartView["sections"][number];
    measure: StudioChartView["sections"][number]["measures"][number];
  }> | null => {
    for (const section of view.sections) {
      for (const measure of section.measures) {
        if (measure.isInsertionTarget) return { measure, section };
      }
    }
    for (const section of view.sections) {
      for (const measure of section.measures) {
        if (measure.chords.some((chord) => chord.id === focusId)) {
          return { measure, section };
        }
      }
    }
    const first = view.sections[0];
    const firstMeasure = first?.measures[0];
    return first === undefined || firstMeasure === undefined
      ? null
      : { measure: firstMeasure, section: first };
  };

  const onChartKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const firstSection = view.sections[0];
    switch (event.key) {
      case "i":
      case "I":
        if (firstSection === undefined) return;
        event.preventDefault();
        onInsertMeasure(firstSection.id, null);
        return;
      case "n":
      case "N":
        event.preventDefault();
        onInsertSection();
        return;
      case "p":
      case "P": {
        event.preventDefault();
        const target = view.sections
          .flatMap((entry) => entry.measures)
          .find((measure) =>
            measure.chords.some((chord) => chord.id === focusId),
          );
        if (target !== undefined) onSetInsertionPoint(target.id);
        return;
      }
      case "k":
      case "K": {
        event.preventDefault();
        const context = chartContext();
        if (context !== null && context.measure.canSplitSectionHere) {
          onSplitSection(context.section.id, context.measure.id);
        }
        return;
      }
      case "l":
      case "L": {
        event.preventDefault();
        const context = chartContext();
        if (context !== null && context.section.canJoinNextSection) {
          onJoinSections(context.section.id);
        }
        return;
      }
      case "c":
      case "C": {
        event.preventDefault();
        const context = chartContext();
        if (context !== null) onDeclareMeasureCompletion(context.measure.id);
        return;
      }
      case "b":
      case "B": {
        event.preventDefault();
        const context = chartContext();
        if (context === null) return;
        onSetSectionBoundary(
          context.section.id,
          context.section.voiceLeadingBoundary === "reset"
            ? "continue"
            : "reset",
        );
        return;
      }
      case "r":
      case "R":
        event.preventDefault();
        onRangeModeChange(!view.range.active);
        return;
      case "v":
      case "V":
        event.preventDefault();
        onViewModeChange(view.viewMode === "compact" ? "teaching" : "compact");
        return;
      default:
    }
  };

  const teaching = view.viewMode === "teaching";

  return (
    <section
      id="chart-workspace"
      class="studio-chart"
      aria-labelledby="studio-chart-heading"
      data-view-mode={view.viewMode}
      tabIndex={-1}
      onKeyDown={onChartKeyDown}
    >
      {view.isSeededDemo && !demoBannerDismissed ? (
        <div class="studio-demo-banner" data-testid="demo-banner" role="status">
          <p>
            This is a demo chart — press Play to hear it, or Clear to start
            your own.
          </p>
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={false}
            id="studio-dismiss-demo-banner"
            invalid={false}
            label="Dismiss"
            onAction={() => {
              setDemoBannerDismissed(true);
            }}
            type="button"
            variant="ghost"
          />
        </div>
      ) : null}
      <header class="studio-chart__header">
        <div>
          <p class="studio-kicker">Lead sheet</p>
          <h2 id="studio-chart-heading">Chart workspace</h2>
          <p class="studio-chart__selection" data-testid="chart-selection-status">
            {view.selectionStatusLabel}
          </p>
        </div>

        <div
          class="studio-chart__edit-actions"
          role="group"
          aria-label="Chart edits"
        >
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canMoveSelection}
            id="studio-move-previous"
            invalid={false}
            label="Move previous"
            onAction={() => {
              onMoveSelection("previous");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canMoveSelection}
            id="studio-move-next"
            invalid={false}
            label="Move next"
            onAction={() => {
              onMoveSelection("next");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canDuplicateSelection}
            id="studio-duplicate-selection"
            invalid={false}
            label="Duplicate selection"
            onAction={onDuplicateSelection}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canDeleteSelection}
            id="studio-delete-selection"
            invalid={false}
            label="Delete selection"
            onAction={onDeleteSelection}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-insert-section"
            invalid={false}
            label={view.appendSectionLabel}
            onAction={onInsertSection}
            type="button"
            variant="secondary"
          />
        </div>

        <div
          class="studio-chart__view-actions"
          role="group"
          aria-label="Chart presentation"
        >
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-toggle-view-mode"
            invalid={false}
            label={teaching ? "Compact view" : "Teaching view"}
            onAction={() => {
              onViewModeChange(teaching ? "compact" : "teaching");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-select-range"
            invalid={false}
            label={view.range.active ? "Close range mode" : "Select range"}
            onAction={() => {
              onRangeModeChange(!view.range.active);
            }}
            type="button"
            variant="secondary"
          />
          <p class="studio-chart__view-status" data-testid="chart-view-mode">
            {teaching ? "Teaching view" : "Compact view"}
          </p>
        </div>

        <div
          class="studio-mobile-panel-actions"
          role="group"
          aria-label="Studio panels"
        >
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-open-library-sheet"
            invalid={false}
            label="Library"
            onAction={() => {
              onRequestPanelSheet("library");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-open-harmony-sheet"
            invalid={false}
            label="Harmony Lens"
            onAction={() => {
              onRequestPanelSheet("harmony");
            }}
            type="button"
            variant="secondary"
          />
        </div>

        <div class="studio-chart-summary">
          <KeyValueList
            accessibleName="Chart summary"
            items={[
              {
                description: null,
                id: "chart-summary-sections",
                key: "Sections",
                value: view.sectionCountLabel,
              },
              {
                description: null,
                id: "chart-summary-measures",
                key: "Measures",
                value: view.measureCountLabel,
              },
              {
                description: null,
                id: "chart-summary-chords",
                key: "Chords",
                value: view.chordCountLabel,
              },
            ]}
          />
        </div>
      </header>

      {view.range.active ? (
        <div
          class="studio-range-bar"
          role="group"
          aria-label="Select range"
          data-testid="range-selection-bar"
          onKeyDown={(event) => {
            // Range-scope bindings. They act only from the bar's own controls,
            // so typing an exact beat is never intercepted.
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.target instanceof HTMLInputElement) return;
            if (event.key === "Home") {
              event.preventDefault();
              onRangeEdgeFromFocus("start");
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              onRangeEdgeFromFocus("end");
              return;
            }
            if (event.key === "Escape") {
              // U1-OP-030 clears the range and stays in the mode; the Cancel
              // control is the separate restore-the-prior-range-and-exit path.
              event.preventDefault();
              onRangeClear();
            }
          }}
        >
          <p class="studio-range-bar__status" data-testid="range-status">
            {/* A range whose two edges are the same boundary spans no beats at
                all. Saying so is the honest statement; inventing a beat label
                for an empty span is not. */}
            {!view.range.hasRange
              ? "No range set"
              : view.range.startBeatLabel === null ||
                  view.range.endBeatLabel === null
                ? "Range spans no beats yet; set its other boundary"
                : `Range ${view.range.startBeatLabel} to ${view.range.endBeatLabel} beats`}
          </p>
          {/* U1-CMP-023 RangeBoundaryHandle. Dragging a handle onto a card is
              an optional enhancement: the same edge is reachable from the
              handle's own Enter/Space, from Set start/Set end, and from the
              exact beat fields, so no range action ever requires a drag. */}
          {(["start", "end"] as const).map((edge) => (
            <button
              aria-label={`Range ${edge} boundary handle`}
              class="studio-range-bar__handle"
              data-dragging={dragging === `range-${edge}` ? "true" : "false"}
              data-range-edge={edge}
              data-testid="range-boundary-handle"
              id={`studio-range-handle-${edge}`}
              key={edge}
              onClick={() => {
                // The click that closes a real drag is the drop, not a second
                // activation: exactly one boundary is published per gesture.
                if (dragConsumedClick.current) {
                  dragConsumedClick.current = false;
                  return;
                }
                onRangeEdgeFromFocus(edge);
              }}
              onPointerDown={(event) => {
                beginDrag(
                  "",
                  event.currentTarget,
                  event,
                  edge === "start" ? "range-start" : "range-end",
                );
              }}
              title={`Drag onto a chord, or press Enter to use the focused chord as the range ${edge}.`}
              type="button"
            >
              {edge === "start" ? "⟦" : "⟧"}
            </button>
          ))}
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-range-set-start"
            invalid={false}
            label="Set start"
            onAction={() => {
              onRangeEdgeFromFocus("start");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-range-set-end"
            invalid={false}
            label="Set end"
            onAction={() => {
              onRangeEdgeFromFocus("end");
            }}
            type="button"
            variant="secondary"
          />
          <label class="studio-range-bar__field" for="studio-range-start-beat">
            <span>Start beat</span>
            <input
              id="studio-range-start-beat"
              data-testid="range-start-beat"
              type="text"
              inputMode="text"
              value={view.range.startDraft}
              onInput={(event) => {
                onRangeDraftChange("start", event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onRangeDraftCommit("start");
              }}
            />
          </label>
          <label class="studio-range-bar__field" for="studio-range-end-beat">
            <span>End beat</span>
            <input
              id="studio-range-end-beat"
              data-testid="range-end-beat"
              type="text"
              inputMode="text"
              value={view.range.endDraft}
              onInput={(event) => {
                onRangeDraftChange("end", event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onRangeDraftCommit("end");
              }}
            />
          </label>
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-range-done"
            invalid={false}
            label="Done"
            onAction={() => {
              onRangeModeChange(false);
            }}
            type="button"
            variant="primary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-range-cancel"
            invalid={false}
            label="Cancel range"
            onAction={onRangeCancel}
            type="button"
            variant="secondary"
          />
        </div>
      ) : null}

      {view.editRefusal === null ? null : (
        <p
          class="studio-chart__refusal"
          data-testid="chart-edit-refusal"
          data-code={view.editRefusal.code}
          role="status"
        >
          <strong>{view.editRefusal.message}</strong>
          <span>{view.editRefusal.recoveryAction}</span>
          {/*
            The overfill strip renders one button per named remedy below, so
            repeating them as prose would say everything twice; every other
            code still states its reviewed resolutions verbatim. The joined
            list is its own block (jcpe-yvni): rendered inline it ran
            straight on from the recovery sentence with no space between.
          */}
          {view.editRefusal.resolutions.length === 0 ||
          view.editRefusal.code === "u1.duration_overfills_measure" ? null : (
            <span class="studio-chart__resolutions">
              {view.editRefusal.resolutions.join(" · ")}
            </span>
          )}
          {view.editRefusal.code === "u1.duration_overfills_measure" ? (
            <span class="studio-chart__refusal-actions">
              {/*
                One button per reviewed remedy (jcpe-yvni). The overfill
                authority names four: move-following-events, split-at-bar,
                shorten-the-duration, and cancel.
              */}
              <Button
                busy={false}
                density="comfortable"
                describedBy={[]}
                disabled={false}
                id="studio-move-following"
                invalid={false}
                label="Move following chords"
                onAction={() => {
                  const chordId = view.rovingFocusId;
                  if (chordId !== null) {
                    onCardMenuAction(chordId, "move-following");
                  }
                }}
                type="button"
                variant="secondary"
              />
              {/*
                The reviewed overfill authority names split-at-bar as a peer
                of move-following-events (jcpe-aacz). The split boundary is
                the chord after the focused one in its own bar; when the
                focused chord is the bar's last, there is nothing to split
                before and the fix is not offered rather than
                offered-and-refused.
              */}
              {nextChordInSameMeasure(view, view.rovingFocusId) !== null ? (
                <Button
                  busy={false}
                  density="comfortable"
                  describedBy={[]}
                  disabled={false}
                  id="studio-split-at-bar"
                  invalid={false}
                  label="Split this bar here"
                  onAction={() => {
                    const boundary = nextChordInSameMeasure(
                      view,
                      view.rovingFocusId,
                    );
                    if (boundary !== null) {
                      onSplitAtBar(boundary);
                    }
                  }}
                  type="button"
                  variant="secondary"
                />
              ) : null}
              {view.rovingFocusId !== null ? (
                <Button
                  busy={false}
                  density="comfortable"
                  describedBy={[]}
                  disabled={false}
                  id="studio-shorten-duration"
                  invalid={false}
                  label="Shorten the duration"
                  onAction={() => {
                    const chordId = view.rovingFocusId;
                    if (chordId !== null) {
                      guardedSwitch({ chordId, kind: "edit-duration" });
                    }
                  }}
                  type="button"
                  variant="secondary"
                />
              ) : null}
            </span>
          ) : null}
          {view.editRefusal.code === "u1.duration_overfills_measure" ||
          view.editRefusal.needsIncompleteReason ? (
            <span class="studio-chart__reason">
              {/* For a reason-required refusal the declaration itself happens
                  in U1-CMP-019, which the refusal opens; a short bar is never
                  declared in passing. Cancel abandons the pending edit either
                  way — every named remedy has a control, including this one. */}
              <Button
                busy={false}
                density="comfortable"
                describedBy={[]}
                disabled={false}
                id="studio-cancel-pending-edit"
                invalid={false}
                label="Cancel"
                onAction={onCancelPendingEdit}
                type="button"
                variant="secondary"
              />
            </span>
          ) : null}
        </p>
      )}

      {view.sections.length === 0 ? (
        <div class="studio-chart__empty-document">
          <EmptyState
            description="The chart has no measures or chord events."
            illustration={null}
            primaryAction={null}
            secondaryAction={null}
            title="No sections yet"
          />
        </div>
      ) : (
        <ol class="studio-section-list">
          {view.sections.map((section, sectionIndex) => {
            const sectionHeadingId = `studio-section-${sectionIndex.toString()}-heading`;

            return (
              <li key={section.id}>
                <section
                  class="studio-section"
                  aria-labelledby={sectionHeadingId}
                  data-section-id={section.id}
                  tabIndex={-1}
                >
                  <header class="studio-section__header">
                    <div class="studio-section__identity">
                      <span class="studio-section__letter" aria-hidden="true">
                        {section.label}
                      </span>
                      <div>
                        <p class="studio-kicker">Section</p>
                        <h3 id={sectionHeadingId}>{section.label}</h3>
                      </div>
                    </div>
                    <Badge label={section.measureCountLabel} tone="neutral" />
                  </header>

                  <div class="studio-section__metadata">
                    <label
                      class="studio-section__field"
                      for={`studio-section-name-${section.id}`}
                    >
                      <span>Section name</span>
                      <input
                        id={`studio-section-name-${section.id}`}
                        data-testid="section-name-field"
                        type="text"
                        value={section.label}
                        onChange={(event) => {
                          onRenameSection(
                            section.id,
                            event.currentTarget.value,
                          );
                        }}
                      />
                    </label>
                    <label
                      class="studio-section__field"
                      for={`studio-section-note-${section.id}`}
                    >
                      <span>Section note</span>
                      <input
                        id={`studio-section-note-${section.id}`}
                        data-testid="section-annotation-field"
                        type="text"
                        value={section.annotation}
                        onChange={(event) => {
                          onAnnotateSection(
                            section.id,
                            event.currentTarget.value,
                          );
                        }}
                      />
                    </label>
                    {/* U1-CMP-020 SectionBoundaryMenu. The current boundary is
                        stated beside a real menu whose radio items name both
                        boundaries, so the choice is never a guess about which
                        way a toggle will flip. */}
                    <div
                      class="studio-section__boundary"
                      role="group"
                      aria-label={`Voice leading at section ${section.label}`}
                      onKeyDown={(event) => {
                        onBoundaryMenuKeyDown(section.id, event);
                      }}
                    >
                      <span data-testid="section-boundary-label">
                        {section.voiceLeadingLabel}
                      </span>
                      <button
                        aria-controls={`studio-section-boundary-menu-${section.id}`}
                        aria-expanded={
                          openBoundaryMenuId === section.id ? "true" : "false"
                        }
                        aria-haspopup="menu"
                        class="studio-section__boundary-trigger"
                        data-menu-role="trigger"
                        id={`studio-section-boundary-${section.id}`}
                        onClick={() => {
                          setOpenBoundaryMenuId(
                            openBoundaryMenuId === section.id
                              ? null
                              : section.id,
                          );
                        }}
                        type="button"
                      >
                        Section boundary
                      </button>
                      {openBoundaryMenuId === section.id ? (
                        <div
                          aria-label={`Section boundary options for ${section.label}`}
                          class="studio-section__boundary-menu"
                          data-testid="section-boundary-menu"
                          id={`studio-section-boundary-menu-${section.id}`}
                          role="menu"
                        >
                          {(["reset", "continue"] as const).map((boundary) => (
                            <button
                              aria-checked={
                                section.voiceLeadingBoundary === boundary
                                  ? "true"
                                  : "false"
                              }
                              class="studio-section__boundary-item"
                              data-menu-role="item"
                              id={`studio-section-boundary-${boundary}-${section.id}`}
                              key={boundary}
                              onClick={() => {
                                closeBoundaryMenu(section.id);
                                onSetSectionBoundary(section.id, boundary);
                              }}
                              role="menuitemradio"
                              type="button"
                            >
                              {boundary === "reset"
                                ? "Reset voice leading"
                                : "Continue voice leading"}
                            </button>
                          ))}
                          <button
                            aria-disabled={
                              section.canJoinNextSection ? "false" : "true"
                            }
                            class="studio-section__boundary-item"
                            data-menu-role="item"
                            id={`studio-join-sections-${section.id}`}
                            onClick={() => {
                              if (!section.canJoinNextSection) return;
                              closeBoundaryMenu(section.id);
                              onJoinSections(section.id);
                            }}
                            role="menuitem"
                            title={
                              section.canJoinNextSection
                                ? undefined
                                : "This section has no following section to join."
                            }
                            type="button"
                          >
                            Join with next section
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <ol class="studio-measure-list">
                    {section.measures.map((measure, measureIndex) => {
                      const measureHeadingId = `studio-section-${sectionIndex.toString()}-measure-${measureIndex.toString()}-heading`;

                      return (
                        <li key={measure.id}>
                          <div class="studio-insertion-target">
                            <Button
                              busy={false}
                              density="comfortable"
                              describedBy={[]}
                              disabled={false}
                              id={`studio-insert-before-${measure.id}`}
                              invalid={false}
                              label={measure.insertBeforeLabel}
                              onAction={() => {
                                onInsertMeasure(section.id, measure.id);
                              }}
                              type="button"
                              variant="ghost"
                            />
                          </div>
                          <article
                            class="studio-measure"
                            tabIndex={-1}
                            data-measure-id={measure.id}
                            data-drop-label={measure.dropLabel}
                            data-measure-state={measure.state}
                            aria-labelledby={measureHeadingId}
                          >
                            <header class="studio-measure__header">
                              <div class="studio-measure__tag">
                                <h4 id={measureHeadingId}>
                                  {/*
                                    jcpe-disi.5: the bar's name selects the
                                    bar. The button replays exactly what a
                                    person does by hand — select the first
                                    chord, shift-extend to the last — so it
                                    rides the existing selection channels
                                    and no new state kind exists. An empty
                                    bar has nothing to select and stays a
                                    plain label.
                                  */}
                                  {measure.chords.length === 0 ? (
                                    <>Measure {measure.number}</>
                                  ) : (
                                    <button
                                      class="studio-measure__select"
                                      data-testid="measure-select"
                                      type="button"
                                      aria-label={`Select all chords in measure ${measure.number.toString()}`}
                                      onClick={() => {
                                        selectMeasureChords(measure.id);
                                      }}
                                    >
                                      Measure {measure.number}
                                    </button>
                                  )}
                                </h4>
                                <span class="studio-meter-signature">
                                  {measure.meterLabel}
                                </span>
                                {/*
                                  A declared-short bar stays visibly marked in
                                  BOTH views (jcpe-yvni): the teaching facts
                                  carry the stored reason, and this badge is
                                  the compact view's affordance, titled with
                                  the same verbatim reason.
                                */}
                                {measure.completionReason === null ? null : (
                                  <span
                                    class="studio-measure__completion-badge"
                                    data-testid="measure-completion-badge"
                                    title={measure.completionReason}
                                  >
                                    <Badge label="Short bar" tone="warning" />
                                  </span>
                                )}
                              </div>
                              <div class="studio-measure__tools">
                              <Button
                                busy={false}
                                density="comfortable"
                                describedBy={[]}
                                disabled={measure.isInsertionTarget}
                                id={`studio-target-measure-${measure.id}`}
                                invalid={false}
                                label={
                                  measure.isInsertionTarget
                                    ? "Quick entry aims here"
                                    : measure.targetLabel
                                }
                                onAction={() => {
                                  onSetInsertionPoint(measure.id);
                                }}
                                type="button"
                                variant="ghost"
                              />
                              {measure.canSplitSectionHere ? (
                                <Button
                                  busy={false}
                                  density="comfortable"
                                  describedBy={[]}
                                  disabled={false}
                                  id={`studio-split-section-${measure.id}`}
                                  invalid={false}
                                  label={`Split section before measure ${String(measure.number)}`}
                                  onAction={() => {
                                    onSplitSection(section.id, measure.id);
                                  }}
                                  type="button"
                                  variant="ghost"
                                />
                              ) : null}
                              {measure.canDelete ? (
                                <Button
                                  busy={false}
                                  density="comfortable"
                                  describedBy={[]}
                                  disabled={false}
                                  id={`studio-delete-measure-${measure.id}`}
                                  invalid={false}
                                  label={measure.deleteLabel}
                                  onAction={() => {
                                    onDeleteMeasure(measure.id);
                                  }}
                                  type="button"
                                  variant="ghost"
                                />
                              ) : null}
                              </div>
                            </header>

                            <div class="studio-measure__canvas">
                              <div
                                class="studio-measure__staff"
                                aria-hidden="true"
                              >
                                <span />
                                <span />
                                <span />
                                <span />
                              </div>
                              {measure.state === "empty" ? (
                                <div class="studio-measure__empty-copy">
                                  <span
                                    class="studio-measure__empty-mark"
                                    aria-hidden="true"
                                  >
                                    —
                                  </span>
                                  <strong>Empty measure</strong>
                                  <span>Type chart text to fill this bar.</span>
                                </div>
                              ) : (
                                <ol
                                  class="studio-measure__chords"
                                  aria-label={`Measure ${measure.number.toString()} chords`}
                                >
                                  {measure.chords.map((chord) => (
                                    <li
                                      key={chord.id}
                                      style={{
                                        flexGrow: chordBeatFlexGrow(
                                          chord.durationLabel,
                                        ),
                                      }}
                                    >
                                      <article
                                        class="studio-chord-card"
                                        data-chord-id={chord.id}
                                        data-selected={String(chord.selected)}
                                        data-in-range={String(chord.inRange)}
                                        data-playing={String(chord.playing)}
                                        aria-label={chord.accessibleName}
                                        aria-current={
                                          chord.selected ? "true" : undefined
                                        }
                                        tabIndex={chord.id === focusId ? 0 : -1}
                                        onClick={(event) => {
                                          onCardClick(chord.id, event);
                                        }}
                                        onKeyDown={(event) => {
                                          onCardKeyDown(chord.id, event);
                                        }}
                                        onPointerDown={(event) => {
                                          onCardPointerDown(chord.id, event);
                                        }}
                                      >
                                        {editing?.chordId === chord.id ? (
                                          <input
                                            class="studio-chord-card__editor"
                                            data-card-action="editor"
                                            data-testid="inline-symbol-editor"
                                            type="text"
                                            value={editing.draft}
                                            aria-label={`Chord symbol for chord ${String(chord.ordinal)}`}
                                            autoFocus
                                            onInput={(event) => {
                                              setEditing({
                                                chordId: chord.id,
                                                draft: event.currentTarget.value,
                                              });
                                            }}
                                            onKeyDown={(event) => {
                                              event.stopPropagation();
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                onApplyInlineSymbol(
                                                  chord.id,
                                                  editing.draft,
                                                );
                                                setEditing(null);
                                              }
                                              if (event.key === "Escape") {
                                                event.preventDefault();
                                                setEditing(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span
                                            class="studio-chord-card__symbol"
                                            data-card-action="symbol"
                                            title={
                                              chord.selected
                                                ? "Edit this chord — click its symbol again, or press F2"
                                                : undefined
                                            }
                                          >
                                            <LeadSheetSymbol
                                              text={chord.symbolText}
                                            />
                                          </span>
                                        )}
                                        {deferredSwitch !== null &&
                                        editing?.chordId === chord.id ? (
                                          <div
                                            class="studio-chord-card__prompt"
                                            data-card-action="editor"
                                            data-testid="dirty-draft-prompt"
                                            role="group"
                                            aria-label={`Unapplied symbol draft for chord ${String(chord.ordinal)}`}
                                          >
                                            <p class="studio-chord-card__prompt-text">
                                              This chord holds an unapplied
                                              draft.
                                            </p>
                                            <Button
                                              busy={false}
                                              density="dense"
                                              describedBy={[]}
                                              disabled={false}
                                              id={`studio-dirty-apply-${chord.id}`}
                                              invalid={false}
                                              label="Apply"
                                              onAction={() => {
                                                const next = deferredSwitch;
                                                onApplyInlineSymbol(
                                                  chord.id,
                                                  editing.draft,
                                                );
                                                setEditing(null);
                                                setDeferredSwitch(null);
                                                runSwitch(next);
                                              }}
                                              type="button"
                                              variant="primary"
                                            />
                                            <Button
                                              busy={false}
                                              density="dense"
                                              describedBy={[]}
                                              disabled={false}
                                              id={`studio-dirty-discard-${chord.id}`}
                                              invalid={false}
                                              label="Discard"
                                              onAction={() => {
                                                const next = deferredSwitch;
                                                // Closing the editor restores
                                                // the exact stored text; the
                                                // draft is never written back.
                                                setEditing(null);
                                                setDeferredSwitch(null);
                                                runSwitch(next);
                                              }}
                                              type="button"
                                              variant="secondary"
                                            />
                                            <Button
                                              busy={false}
                                              density="dense"
                                              describedBy={[]}
                                              disabled={false}
                                              id={`studio-dirty-continue-${chord.id}`}
                                              invalid={false}
                                              label="Continue editing"
                                              onAction={() => {
                                                setDeferredSwitch(null);
                                                focusInlineEditor();
                                              }}
                                              type="button"
                                              variant="ghost"
                                            />
                                          </div>
                                        ) : null}
                                        {durationEdit?.chordId === chord.id ? (
                                          <input
                                            class="studio-chord-card__editor"
                                            data-card-action="editor"
                                            data-testid="duration-editor"
                                            type="text"
                                            value={durationEdit.draft}
                                            aria-label={`Exact beats for chord ${String(chord.ordinal)}`}
                                            autoFocus
                                            onInput={(event) => {
                                              setDurationEdit({
                                                chordId: chord.id,
                                                draft: event.currentTarget.value,
                                              });
                                            }}
                                            onKeyDown={(event) => {
                                              event.stopPropagation();
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                onApplyDuration(
                                                  chord.id,
                                                  durationEdit.draft,
                                                );
                                                setDurationEdit(null);
                                              }
                                              if (event.key === "Escape") {
                                                event.preventDefault();
                                                setDurationEdit(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span class="studio-chord-card__duration">
                                            {chord.durationLabel}
                                          </span>
                                        )}
                                        {splitEdit?.chordId === chord.id ? (
                                          <input
                                            class="studio-chord-card__editor"
                                            data-card-action="editor"
                                            data-testid="split-editor"
                                            type="text"
                                            value={splitEdit.draft}
                                            aria-label={`Exact beats for the first half of chord ${String(chord.ordinal)}`}
                                            autoFocus
                                            onInput={(event) => {
                                              setSplitEdit({
                                                chordId: chord.id,
                                                draft: event.currentTarget.value,
                                              });
                                            }}
                                            onKeyDown={(event) => {
                                              event.stopPropagation();
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                onSplitDuration(
                                                  chord.id,
                                                  splitEdit.draft,
                                                );
                                                setSplitEdit(null);
                                              }
                                              if (event.key === "Escape") {
                                                event.preventDefault();
                                                setSplitEdit(null);
                                              }
                                            }}
                                          />
                                        ) : null}
                                        <span
                                          class="studio-chord-card__handle"
                                          data-card-action="drag"
                                          data-testid="chord-drag-handle"
                                          data-dragging={String(
                                            dragging === chord.id,
                                          )}
                                          aria-hidden="true"
                                        />
                                        <button
                                          class="studio-chord-card__more"
                                          data-card-action="menu"
                                          data-testid="chord-card-more"
                                          type="button"
                                          aria-haspopup="menu"
                                          aria-expanded={
                                            view.openMenuChordId === chord.id
                                          }
                                          aria-label={`More actions for chord ${String(chord.ordinal)}`}
                                          tabIndex={-1}
                                        >
                                          ⋯
                                        </button>
                                        <button
                                          class="studio-chord-card__delete"
                                          data-card-action="delete"
                                          data-testid="chord-card-delete"
                                          type="button"
                                          aria-label={`Delete chord ${String(chord.ordinal)}`}
                                          tabIndex={-1}
                                        >
                                          ×
                                        </button>
                                        {view.openMenuChordId === chord.id ? (
                                          <div
                                            class="studio-chord-card__menu"
                                            data-testid="chord-card-menu"
                                            role="menu"
                                            aria-label={`Chord ${String(chord.ordinal)} actions`}
                                          >
                                            {chord.menuItems.map((item) => (
                                              <button
                                                key={item.action}
                                                class="studio-chord-card__menu-item"
                                                data-card-action="item"
                                                data-menu-action={item.action}
                                                type="button"
                                                role="menuitem"
                                                aria-disabled={
                                                  item.disabledReason !== null
                                                }
                                                title={
                                                  item.disabledReason ??
                                                  undefined
                                                }
                                              >
                                                {item.label}
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                        <span class="studio-chord-card__marks">
                                          <Badge
                                            label={chord.voicingMode}
                                            tone="neutral"
                                          />
                                          {chord.hasAnnotation ? (
                                            <Badge
                                              label="note"
                                              tone="info"
                                            />
                                          ) : null}
                                        </span>
                                        {teaching ? (
                                          <ul
                                            class="studio-chord-card__teaching"
                                            data-testid="chord-teaching-notes"
                                          >
                                            {chord.teachingNotes.map((note) => (
                                              <li key={note}>{note}</li>
                                            ))}
                                          </ul>
                                        ) : null}
                                      </article>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>

                            <div class="studio-measure__facts">
                              <KeyValueList
                                accessibleName={`Measure ${measure.number.toString()} facts`}
                                items={[
                                  {
                                    description: null,
                                    id: `${measure.id}-duration`,
                                    key: "Duration",
                                    value: measure.durationLabel,
                                  },
                                  {
                                    description: null,
                                    id: `${measure.id}-fill`,
                                    key: "Fill",
                                    value: measure.fillLabel,
                                  },
                                  {
                                    description: null,
                                    id: `${measure.id}-capacity`,
                                    key: "Capacity",
                                    value: measure.capacityLabel,
                                  },
                                  {
                                    description: null,
                                    id: `${measure.id}-position`,
                                    key: "Position",
                                    value: `${measure.startBeatLabel}–${measure.endBeatLabel}`,
                                  },
                                  ...(measure.completionReason === null
                                    ? []
                                    : [
                                        {
                                          // Shown in both views: the stored
                                          // reason is a musical fact the
                                          // author supplied, not an analysis
                                          // the teaching view adds.
                                          description: null,
                                          id: `${measure.id}-completion-reason`,
                                          key: "Reason",
                                          value: measure.completionReason,
                                        },
                                      ]),
                                  ...(teaching
                                    ? [
                                        {
                                          description: null,
                                          id: `${measure.id}-completion`,
                                          key: "Completion",
                                          value: measure.completionLabel,
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </div>
                          </article>
                        </li>
                      );
                    })}
                    <li class="studio-insertion-target studio-insertion-target--append">
                      <Button
                        busy={false}
                        density="comfortable"
                        describedBy={[]}
                        disabled={false}
                        id={`studio-append-measure-${section.id}`}
                        invalid={false}
                        label={section.appendMeasureLabel}
                        onAction={() => {
                          onInsertMeasure(section.id, null);
                        }}
                        type="button"
                        variant="ghost"
                      />
                    </li>
                  </ol>
                </section>
              </li>
            );
          })}
        </ol>
      )}

      {/*
        jcpe-disi.6: the context action bar. The verbs that apply to the
        current selection ride sticky at the chart's block-end — in reach
        beside long charts and under the thumb at phone widths — and leave
        with the selection. Names deliberately differ from the top
        toolbar's so role+name queries stay unambiguous.
      */}
      {chartHasSelection ? (
        <div
          aria-label="Selection actions"
          class="studio-context-bar"
          data-testid="context-action-bar"
          role="toolbar"
        >
          <p class="studio-context-bar__status">
            {view.selectionStatusLabel}
          </p>
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={!view.canMoveSelection}
            id="studio-context-move-earlier"
            invalid={false}
            label="Move earlier"
            onAction={() => {
              onMoveSelection("previous");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={!view.canMoveSelection}
            id="studio-context-move-later"
            invalid={false}
            label="Move later"
            onAction={() => {
              onMoveSelection("next");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={!view.canDuplicateSelection}
            id="studio-context-duplicate"
            invalid={false}
            label="Duplicate chords"
            onAction={onDuplicateSelection}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={!view.canDeleteSelection}
            id="studio-context-delete"
            invalid={false}
            label="Delete chords"
            onAction={onDeleteSelection}
            type="button"
            variant="secondary"
          />
          {singleSelectedChordId === null ? null : (
            <Button
              busy={false}
              density="dense"
              describedBy={[]}
              disabled={false}
              id="studio-context-duration"
              invalid={false}
              label="Duration"
              onAction={() => {
                beginDurationEdit(singleSelectedChordId);
              }}
              type="button"
              variant="secondary"
            />
          )}
        </div>
      ) : null}
    </section>
  );
}

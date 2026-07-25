import { useEffect, useRef, useState } from "preact/hooks";

import {
  Badge,
  Button,
  EmptyState,
  KeyValueList,
} from "../primitives";
import type {
  StudioChartView,
  StudioPanelSide,
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
  onConfirmIncompleteMeasure: (reason: string) => void;
  onCancelPendingEdit: () => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onAnnotateSection: (sectionId: string, annotation: string) => void;
  onSetSectionBoundary: (
    sectionId: string,
    boundary: "reset" | "continue",
  ) => void;
  onDropChordOnMeasure: (measureId: string) => void;
}>;

/** Reviewed project threshold; a shorter movement stays a tap and a scroll. */
const DRAG_THRESHOLD_CSS_PX = 8;

/** Visual order of every chord card, used only for roving-focus movement. */
function chartChordOrder(view: StudioChartView): readonly string[] {
  return view.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.chords.map((chord) => chord.id),
    ),
  );
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
  onConfirmIncompleteMeasure,
  onCancelPendingEdit,
  onRenameSection,
  onAnnotateSection,
  onSetSectionBoundary,
  onDropChordOnMeasure,
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
  const [reasonDraft, setReasonDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  /**
   * One drag session at a time. Its three transient listeners live on the
   * captured handle and are removed on pointerup, pointercancel, and unmount,
   * so document mutation can never multiply them.
   */
  const dragSession = useRef<Readonly<{
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

  const measureIdAtPoint = (clientX: number, clientY: number): string | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const measure = element?.closest<HTMLElement>("[data-measure-id]");
    return measure?.dataset["measureId"] ?? null;
  };

  const beginDrag = (chordId: string, event: PointerEvent): void => {
    if (dragSession.current !== null) return;
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) return;
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
        setDragging(session.chordId);
      }
      // preventDefault only after a real drag threshold is crossed.
      moveEvent.preventDefault();
    };
    const onEnd = (endEvent: PointerEvent): void => {
      const session = dragSession.current;
      const started = session?.started ?? false;
      const chord = session?.chordId ?? null;
      endDragSession();
      if (!started || chord === null) return;
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
      onCancel,
      onEnd,
      onMove,
      originX: event.clientX,
      originY: event.clientY,
      started: false,
    };
  };
  const order = chartChordOrder(view);
  const focusId = view.rovingFocusId ?? order[0] ?? null;

  /**
   * Roving focus moves the tab stop AND the DOM focus together. Moving only
   * the tab stop would leave activation on the previously focused card.
   */
  const focusChord = (chordId: string): void => {
    onRovingFocusChange(chordId);
    const card = document.querySelector<HTMLElement>(
      `[data-chord-id="${chordId}"]`,
    );
    card?.focus();
  };

  const moveFocus = (currentId: string, step: -1 | 1 | "first" | "last"): void => {
    if (order.length === 0) return;
    if (step === "first") {
      const first = order[0];
      if (first !== undefined) focusChord(first);
      return;
    }
    if (step === "last") {
      const last = order.at(-1);
      if (last !== undefined) focusChord(last);
      return;
    }
    const index = order.indexOf(currentId);
    if (index < 0) return;
    const next = order[Math.min(Math.max(index + step, 0), order.length - 1)];
    if (next !== undefined && next !== currentId) focusChord(next);
  };

  const beginInlineEdit = (chordId: string): void => {
    const chord = view.sections
      .flatMap((section) => section.measures)
      .flatMap((measure) => measure.chords)
      .find((candidate) => candidate.id === chordId);
    if (chord === undefined || !chord.inlineEditable) return;
    setEditing({ chordId, draft: chord.symbolText });
  };

  const beginDurationEdit = (chordId: string): void => {
    const chord = view.sections
      .flatMap((section) => section.measures)
      .flatMap((measure) => measure.chords)
      .find((candidate) => candidate.id === chordId);
    if (chord === undefined) return;
    setDurationEdit({ chordId, draft: chord.durationLabel.replace(" beats", "") });
  };

  const onCardKeyDown = (chordId: string, event: KeyboardEvent): void => {
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key === "d" || event.key === "D") {
        event.preventDefault();
        onDuplicateSelection();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onMoveSelection("previous");
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onMoveSelection("next");
        return;
      }
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        beginDurationEdit(chordId);
        return;
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
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
        onSelectChord(chordId, event.shiftKey);
        return;
      case "F2":
        event.preventDefault();
        beginInlineEdit(chordId);
        return;
      case "Escape":
        event.preventDefault();
        setEditing(null);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        onDeleteSelection();
        return;
      default:
    }
  };
  return (
    <section
      id="chart-workspace"
      class="studio-chart"
      aria-labelledby="studio-chart-heading"
      tabIndex={-1}
    >
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

      {view.editRefusal === null ? null : (
        <p
          class="studio-chart__refusal"
          data-testid="chart-edit-refusal"
          data-code={view.editRefusal.code}
          role="status"
        >
          <strong>{view.editRefusal.message}</strong>
          <span>{view.editRefusal.recoveryAction}</span>
          {view.editRefusal.resolutions.length === 0 ? null : (
            <span class="studio-chart__resolutions">
              {view.editRefusal.resolutions.join(" · ")}
            </span>
          )}
          {view.editRefusal.needsIncompleteReason ? (
            <span class="studio-chart__reason">
              <label for="studio-incomplete-reason">
                Reason for the incomplete measure
              </label>
              <input
                id="studio-incomplete-reason"
                data-testid="incomplete-reason-field"
                type="text"
                value={reasonDraft}
                onInput={(event) => {
                  setReasonDraft(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  onConfirmIncompleteMeasure(reasonDraft);
                  setReasonDraft("");
                }}
              />
              <Button
                busy={false}
                density="comfortable"
                describedBy={[]}
                disabled={reasonDraft.trim().length === 0}
                id="studio-confirm-incomplete"
                invalid={false}
                label="Confirm incomplete measure"
                onAction={() => {
                  onConfirmIncompleteMeasure(reasonDraft);
                  setReasonDraft("");
                }}
                type="button"
                variant="primary"
              />
              <Button
                busy={false}
                density="comfortable"
                describedBy={[]}
                disabled={false}
                id="studio-cancel-pending-edit"
                invalid={false}
                label="Cancel"
                onAction={() => {
                  setReasonDraft("");
                  onCancelPendingEdit();
                }}
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
                    <div
                      class="studio-section__boundary"
                      role="group"
                      aria-label={`Voice leading at section ${section.label}`}
                    >
                      <span data-testid="section-boundary-label">
                        {section.voiceLeadingLabel}
                      </span>
                      <Button
                        busy={false}
                        density="comfortable"
                        describedBy={[]}
                        disabled={false}
                        id={`studio-section-boundary-${section.id}`}
                        invalid={false}
                        label={
                          section.voiceLeadingBoundary === "reset"
                            ? "Continue voice leading"
                            : "Reset voice leading"
                        }
                        onAction={() => {
                          onSetSectionBoundary(
                            section.id,
                            section.voiceLeadingBoundary === "reset"
                              ? "continue"
                              : "reset",
                          );
                        }}
                        type="button"
                        variant="secondary"
                      />
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
                            data-measure-id={measure.id}
                            data-drop-label={measure.dropLabel}
                            data-measure-state={measure.state}
                            aria-labelledby={measureHeadingId}
                          >
                            <header class="studio-measure__header">
                              <h4 id={measureHeadingId}>
                                Measure {measure.number}
                              </h4>
                              <span class="studio-meter-signature">
                                {measure.meterLabel}
                              </span>
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
                                    <li key={chord.id}>
                                      <article
                                        class="studio-chord-card"
                                        data-chord-id={chord.id}
                                        data-selected={String(chord.selected)}
                                        data-in-range={String(chord.inRange)}
                                        aria-label={chord.accessibleName}
                                        aria-current={
                                          chord.selected ? "true" : undefined
                                        }
                                        tabIndex={chord.id === focusId ? 0 : -1}
                                        onClick={(event) => {
                                          onSelectChord(
                                            chord.id,
                                            event.shiftKey,
                                          );
                                        }}
                                        onKeyDown={(event) => {
                                          onCardKeyDown(chord.id, event);
                                        }}
                                      >
                                        {editing?.chordId === chord.id ? (
                                          <input
                                            class="studio-chord-card__editor"
                                            data-testid="inline-symbol-editor"
                                            type="text"
                                            value={editing.draft}
                                            aria-label={`Chord symbol for chord ${String(chord.ordinal)}`}
                                            autoFocus
                                            onClick={(event) => {
                                              event.stopPropagation();
                                            }}
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
                                            onDblClick={() => {
                                              beginInlineEdit(chord.id);
                                            }}
                                          >
                                            {chord.symbolText}
                                          </span>
                                        )}
                                        {durationEdit?.chordId === chord.id ? (
                                          <input
                                            class="studio-chord-card__editor"
                                            data-testid="duration-editor"
                                            type="text"
                                            value={durationEdit.draft}
                                            aria-label={`Exact beats for chord ${String(chord.ordinal)}`}
                                            autoFocus
                                            onClick={(event) => {
                                              event.stopPropagation();
                                            }}
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
                                        <span
                                          class="studio-chord-card__handle"
                                          data-testid="chord-drag-handle"
                                          data-dragging={String(
                                            dragging === chord.id,
                                          )}
                                          aria-hidden="true"
                                          onPointerDown={(event) => {
                                            beginDrag(chord.id, event);
                                          }}
                                        />
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
    </section>
  );
}

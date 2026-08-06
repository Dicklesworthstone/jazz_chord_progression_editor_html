import { Button } from "../primitives";
import type { StudioMidiImportView } from "./studio-contract";

/**
 * U1 MIDI import surface.
 *
 * Local files only: the runtime boundary forbids every network capability, so
 * the one way a file enters is a `<input type="file">` the person operates and
 * a `FileReader` on that gesture. Nothing is fetched, and the decoder itself
 * lives behind an application service — this surface dispatches an intent and
 * renders what comes back.
 *
 * Nothing is committed from the picker. The preview states, per sonority, what
 * the reverse-T1 resolver actually found: the chosen symbol, every ranked
 * alternative with its evidence, and — where no template matched — the literal
 * pitch classes and the plain fact that the import wrote no chord there. A
 * refused file shows its frozen code, the detection byte offset, and the track
 * being read, because "could not read that file" teaches nobody anything.
 *
 * Ids carry the panel context: the mobile sheet renders a second copy of the
 * library panel while open (jcpe-ph6d), and a duplicated id breaks every
 * label/for and aria reference in the document.
 */
export type MidiImportPanelProps = Readonly<{
  context: "rail" | "sheet";
  view: StudioMidiImportView;
  onChooseFile: (file: File) => void;
  onCommit: () => void;
  onDiscard: () => void;
  /** Toggle the bounded pre-Add audition of the file's own first bars. */
  onAudition: () => void;
  /** Replace the absolute M1-OVR override set; the app re-plans atomically. */
  onOverridesChange: (next: Readonly<{
    excludedTrackIndices: readonly number[];
    alternativeChoices: readonly Readonly<{
      span: Readonly<{ measureIndex: number; startTick: number }>;
      alternativeOrdinal: number;
    }>[];
    grooveStyleId: string | null;
  }>) => void;
  /** Opens the ⌘K command lane — the paste-chart-text route lives there. */
  onOpenCommandLane?: (() => void) | undefined;
}>;

export function MidiImportPanel({
  context,
  view,
  onChooseFile,
  onCommit,
  onDiscard,
  onAudition,
  onOverridesChange,
  onOpenCommandLane,
}: MidiImportPanelProps) {
  /*
   * M1-OVR: the panel translates one control gesture into the ABSOLUTE
   * next override set from its own view state; the application re-plans
   * on the retained bytes and swaps the preview atomically (doc §12).
   */
  const overrides = view.overrides;
  const currentOverrides = () => ({
    excludedTrackIndices:
      overrides === null
        ? []
        : overrides.tracks
            .filter((track) => track.excluded)
            .map((track) => track.index),
    alternativeChoices:
      overrides === null
        ? []
        : overrides.spans
            .filter((span) => span.chosenOrdinal !== 0)
            .map((span) => ({
              span: {
                measureIndex: span.measureIndex,
                startTick: span.startTick,
              },
              alternativeOrdinal: span.chosenOrdinal,
            })),
    grooveStyleId: overrides === null ? null : overrides.grooveOverrideId,
  });
  const headingId = `studio-midi-import-heading-${context}`;
  const fieldId = `studio-midi-import-file-${context}`;
  const statusId = `studio-midi-import-status-${context}`;

  return (
    <section
      class="studio-midi-import"
      data-testid={`midi-import-${context}`}
      aria-labelledby={headingId}
    >
      <p class="studio-kicker">Import</p>
      <h3 id={headingId}>Import a MIDI file</h3>
      <p class="studio-midi-import__hint" id={`${fieldId}-hint`}>
        The file is read on this device and never uploaded. Nothing is added to
        the chart until you press Add.
      </p>
      {/*
        The dashed drop-zone treatment wraps the REAL file input: the label
        forwards the click, and the input itself stays focusable and visible
        to assistive tech (clipped, not display:none).
      */}
      <label class="studio-midi-import__choose" for={fieldId}>
        <span class="studio-midi-import__choose-copy">Choose a MIDI file</span>
        <span class="studio-midi-import__choose-hint">Standard MIDI file</span>
        {/*
          The input fills the drop zone invisibly, so the GENUINE control is
          the 44px+ target the size law measures — not a clipped 1px proxy
          (jcpe-v2r-gates-xaib, U0-ENV-004). Opacity keeps it focusable and
          visible to assistive tech; display:none would not.
        */}
        <input
          accept=".mid,.midi,audio/midi,audio/x-midi"
          aria-describedby={`${fieldId}-hint ${statusId}`}
          class="studio-midi-import__field"
          data-testid="midi-import-file"
          id={fieldId}
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0];
            if (chosen === undefined) return;
            onChooseFile(chosen);
          }}
          type="file"
        />
      </label>
      {onOpenCommandLane === undefined ? null : (
        <button
          class="studio-midi-import__paste"
          id={`studio-midi-import-paste-${context}`}
          onClick={onOpenCommandLane}
          type="button"
        >
          <span>Paste chart text</span>
          <kbd aria-hidden="true">⌘K</kbd>
        </button>
      )}

      <p
        class="studio-midi-import__status"
        data-testid="midi-import-status"
        id={statusId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {view.statusLabel}
      </p>

      {view.refusal === null ? null : (
        <div
          class="studio-midi-import__refusal"
          data-testid="midi-import-refusal"
          role="status"
        >
          <p class="studio-midi-import__refusal-sentence">
            {view.refusal.sentence}
          </p>
          <code class="studio-midi-import__code">{view.refusal.code}</code>
          <p class="studio-midi-import__refusal-where">{view.refusal.where}</p>
          {view.salvageFailed === null ? null : (
            <p
              class="studio-midi-import__salvage-note"
              data-testid="midi-import-salvage-failed"
            >
              {`Repair was tried — ${view.salvageFailed.note} — but the repaired file still could not be read.`}
            </p>
          )}
        </div>
      )}

      {/*
        The salvage account renders BEFORE the summary it qualifies: a
        preview built from repaired bytes must say so before it says
        anything else (V2R-13, jcpe-v2r-import-ariu).
      */}
      {view.salvage === null ? null : (
        <div
          class="studio-midi-import__salvage"
          data-testid="midi-import-salvage"
          role="status"
        >
          <p class="studio-midi-import__salvage-note">{view.salvage.note}</p>
          {view.salvage.repairLines.length === 0 ? null : (
            <ul class="studio-midi-import__salvage-repairs">
              {view.salvage.repairLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        The automatic result card: what one press of Add will do, in user
        language, before it happens. The forensic detail lives in Advanced.
      */}
      {view.auto === null ? null : (
        <div class="studio-midi-import__summary" data-testid="midi-import-auto">
          <p class="studio-midi-import__fact-value">{view.auto.headline}</p>
          {/*
            Hear before shipping (jcpe-qyyn): a bounded, cancelable series
            of click-previews sounding the file's OWN first bars at its own
            tempo — the harmony and rhythm skeleton, on this document's
            instrument. The groove performance plays after Add, through the
            real transport; the copy promises exactly what this plays.
          */}
          <button
            aria-pressed={view.auditioning}
            class="studio-midi-import__audition"
            data-testid="midi-import-audition"
            id={`studio-midi-import-audition-${context}`}
            onClick={onAudition}
            type="button"
          >
            {view.auditioning
              ? "Stop the audition"
              : "Audition the first bars"}
          </button>
          <p
            class="studio-midi-import__law"
            data-testid="midi-import-groove-evidence"
          >
            {view.auto.grooveEvidence}
          </p>
          <ul class="studio-midi-import__facts">
            {view.auto.cardLines.map((fact) => (
              <li class="studio-midi-import__fact" key={fact.id}>
                <span class="studio-midi-import__fact-key">{fact.label}</span>
                <span class="studio-midi-import__fact-value">{fact.value}</span>
              </li>
            ))}
          </ul>
          {view.auto.notes.map((note) => (
            <p class="studio-midi-import__law" key={note}>
              {note}
            </p>
          ))}
        </div>
      )}

      {view.summary === null && view.sonorities.length === 0 ? null : (
        <details
          class="studio-midi-import__advanced"
          data-testid="midi-import-advanced"
        >
          <summary data-testid="midi-import-advanced-summary">
            Advanced: chart text, readings, and every sonority
          </summary>
          {view.summary === null ? null : (
            <div
              class="studio-midi-import__summary"
              data-testid="midi-import-summary"
            >
              <ul class="studio-midi-import__facts">
                {view.summary.facts.map((fact) => (
                  <li class="studio-midi-import__fact" key={fact.id}>
                    <span class="studio-midi-import__fact-key">{fact.label}</span>
                    <span class="studio-midi-import__fact-value">{fact.value}</span>
                  </li>
                ))}
              </ul>
              <p class="studio-midi-import__law">{view.summary.durationLawNote}</p>
              <pre
                class="studio-midi-import__chart"
                data-testid="midi-import-chart-text"
              >
                {view.summary.chartText}
              </pre>
            </div>
          )}
          {/*
            The M1-TRACE ledger (jcpe-qyyn): every stage's input digest,
            work counters, and decisions, machine-readable, collapsed twice
            deep so it costs nothing until a person or a spec wants it.
          */}
          {view.traceJson === null ? null : (
            <details
              class="studio-midi-import__trace"
              data-testid="midi-import-trace"
            >
              <summary>Import trace (machine-readable)</summary>
              <pre>{view.traceJson}</pre>
            </details>
          )}
          {overrides === null ? null : (
            <div
              class="studio-midi-import__overrides"
              data-testid="midi-import-overrides"
            >
              <p class="studio-midi-import__label">Overrides</p>
              <ul class="studio-midi-import__override-tracks">
                {overrides.tracks.map((track) => (
                  <li key={`track-${String(track.index)}`}>
                    <label>
                      <input
                        checked={!track.excluded}
                        data-testid="midi-import-track-include"
                        id={`studio-midi-import-track-${String(track.index)}-${context}`}
                        onChange={() => {
                          const next = currentOverrides();
                          onOverridesChange({
                            ...next,
                            excludedTrackIndices: track.excluded
                              ? next.excludedTrackIndices.filter(
                                  (index) => index !== track.index,
                                )
                              : [...next.excludedTrackIndices, track.index].sort(
                                  (left, right) => left - right,
                                ),
                          });
                        }}
                        type="checkbox"
                      />
                      <span>{`${track.label} — ${track.role}`}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {overrides.spans.length === 0 ? null : (
                <ul class="studio-midi-import__override-spans">
                  {overrides.spans.map((span) => (
                    <li key={`span-${String(span.measureIndex)}-${String(span.startTick)}`}>
                      <label>
                        <span>{span.label}</span>
                        <select
                          data-testid="midi-import-alternative-picker"
                          id={`studio-midi-import-alt-${String(span.measureIndex)}-${String(span.startTick)}-${context}`}
                          onChange={(event) => {
                            const ordinal = Number.parseInt(
                              event.currentTarget.value,
                              10,
                            );
                            const next = currentOverrides();
                            onOverridesChange({
                              ...next,
                              alternativeChoices: [
                                ...next.alternativeChoices.filter(
                                  (choice) =>
                                    choice.span.measureIndex !==
                                      span.measureIndex ||
                                    choice.span.startTick !== span.startTick,
                                ),
                                ...(ordinal === 0
                                  ? []
                                  : [
                                      {
                                        span: {
                                          measureIndex: span.measureIndex,
                                          startTick: span.startTick,
                                        },
                                        alternativeOrdinal: ordinal,
                                      },
                                    ]),
                              ],
                            });
                          }}
                          value={String(span.chosenOrdinal)}
                        >
                          {span.options.map((option, ordinal) => (
                            <option key={option} value={String(ordinal)}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <label class="studio-midi-import__override-groove">
                <span>Groove</span>
                <select
                  data-testid="midi-import-groove-override"
                  id={`studio-midi-import-groove-override-${context}`}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onOverridesChange({
                      ...currentOverrides(),
                      grooveStyleId: value === "" ? null : value,
                    });
                  }}
                  value={overrides.grooveOverrideId ?? ""}
                >
                  <option value="">Matched automatically</option>
                  {overrides.grooveOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {view.sonorities.length === 0 ? null : (
            <ol class="studio-midi-import__sonorities" data-testid="midi-import-sonorities">
              {view.sonorities.map((row) => (
                <li
                  class="studio-midi-import__sonority"
                  data-testid="midi-import-sonority"
                  data-written={row.written ? "true" : "false"}
                  key={row.id}
                >
                  <span class="studio-midi-import__sonority-where">{row.where}</span>
                  <span class="studio-midi-import__sonority-symbol">
                    {row.symbolText ?? "no chord written"}
                  </span>
                  <span class="studio-midi-import__sonority-evidence">
                    {row.evidence}
                  </span>
                  {row.alternatives.length === 0 ? null : (
                    <span
                      class="studio-midi-import__sonority-alternatives"
                      data-testid="midi-import-alternatives"
                    >
                      {`Also reads as: ${row.alternatives.join(" · ")}`}
                    </span>
                  )}
                  {row.customNote === null ? null : (
                    <span
                      class="studio-midi-import__sonority-custom"
                      data-testid="midi-import-custom"
                    >
                      {row.customNote}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      {view.blockedReason === null ? null : (
        <p
          class="studio-midi-import__blocked"
          data-testid="midi-import-blocked"
          role="status"
        >
          {view.blockedReason}
        </p>
      )}

      {view.summary === null &&
      view.refusal === null &&
      view.auto === null &&
      view.sonorities.length === 0 ? null : (
        <div class="studio-midi-import__actions">
          <Button
            busy={false}
            density="comfortable"
            describedBy={[statusId]}
            disabled={!view.canCommit}
            id={`studio-midi-import-commit-${context}`}
            invalid={false}
            label="Add to the chart"
            onAction={onCommit}
            type="button"
            variant="primary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id={`studio-midi-import-discard-${context}`}
            invalid={false}
            label="Discard this import"
            onAction={onDiscard}
            type="button"
            variant="secondary"
          />
        </div>
      )}
    </section>
  );
}

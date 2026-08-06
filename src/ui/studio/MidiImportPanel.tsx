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
  /** Opens the ⌘K command lane — the paste-chart-text route lives there. */
  onOpenCommandLane?: (() => void) | undefined;
}>;

export function MidiImportPanel({
  context,
  view,
  onChooseFile,
  onCommit,
  onDiscard,
  onOpenCommandLane,
}: MidiImportPanelProps) {
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

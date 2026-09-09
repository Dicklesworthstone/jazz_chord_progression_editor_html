import { diagnosticProse } from "./entry-diagnostics";
import { EntryRepairControls, useEntryRepair } from "./EntryRepair";
import { useState } from "preact/hooks";

import { PROGRESSION_LIBRARY, STARTER_CHART } from "../../application/runtime";
import { MidiImportPanel } from "./MidiImportPanel";
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  UiIcon,
} from "../primitives";
import type {
  StudioMidiImportView,
  StudioPlaybackSettingsView,
  StudioQuickEntryTokenView,
  StudioQuickEntryView,
} from "./studio-contract";

/**
 * Palette vocabulary. Every root/quality pair concatenates to a symbol the
 * real T0 grammar parses `ready` AND the real voicing/playback path plays
 * (both proven exhaustively in tests/unit/studio-starter-chart.test.ts); a
 * chip that produced an unplayable chord would hand a first-time user a
 * refusal on Play. Display labels may use proper accidental glyphs, but
 * appended draft text is the plain ASCII the grammar and the hint teach.
 */
export const PALETTE_ROOTS = [
  { id: "c", text: "C", label: "C" },
  { id: "d-flat", text: "Db", label: "D♭" },
  { id: "d", text: "D", label: "D" },
  { id: "e-flat", text: "Eb", label: "E♭" },
  { id: "e", text: "E", label: "E" },
  { id: "f", text: "F", label: "F" },
  { id: "f-sharp", text: "F#", label: "F♯" },
  { id: "g", text: "G", label: "G" },
  { id: "a-flat", text: "Ab", label: "A♭" },
  { id: "a", text: "A", label: "A" },
  { id: "b-flat", text: "Bb", label: "B♭" },
  { id: "b", text: "B", label: "B" },
] as const;

export const PALETTE_QUALITIES = [
  { id: "maj7", suffix: "maj7", label: "maj7" },
  { id: "m7", suffix: "m7", label: "m7" },
  { id: "dom7", suffix: "7", label: "7" },
  { id: "six-nine", suffix: "6/9", label: "6/9" },
  { id: "add9", suffix: "add9", label: "add9" },
  { id: "m9", suffix: "m9", label: "m9" },
  { id: "m7b5", suffix: "m7b5", label: "m7♭5" },
  { id: "dim7", suffix: "dim7", label: "dim7" },
  { id: "sus4", suffix: "sus4", label: "sus4" },
  { id: "thirteen", suffix: "13", label: "13" },
  { id: "seven-flat9", suffix: "7b9", label: "7♭9" },
  { id: "maj7-sharp11", suffix: "maj7#11", label: "maj7♯11" },
] as const;

export type LibraryPanelContentProps = Readonly<{
  headingId: string;
  context: "rail" | "sheet";
  quickEntry: StudioQuickEntryView;
  midiImport: StudioMidiImportView;
  playback: StudioPlaybackSettingsView;
  onMidiImportChooseFile: (files: readonly File[]) => void;
  onMidiImportSelectCandidate: (ordinal: number) => void;
  onMidiImportCommit: () => void;
  onMidiImportDiscard: () => void;
  onMidiImportAudition: () => void;
  onMidiImportOverridesChange: Parameters<
    typeof MidiImportPanel
  >[0]["onOverridesChange"];
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
  onTempoDraftChange: (value: string) => void;
  onTempoCommit: () => void;
  onGrooveStyleChange: (styleId: string) => void;
  onLoadLibraryEntry: (entryId: string, focusOwnerId?: string) => void;
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  onRecoveryDurationDraftChange: (value: string) => void;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
  /** Opens the ⌘K command lane; the import panel's paste route points there. */
  onOpenCommandLane?: (() => void) | undefined;
}>;

/**
 * Reviewed demo charts. Every entry must parse `ready` under the real T0
 * grammar — a demo that gets refused would teach a first-time user that the
 * app is broken, which is worse than no demo at all.
 */
const DEMO_PROGRESSIONS = [
  {
    id: "two-five-one",
    label: "ii–V–I",
    chartText: "| Dm7 G7 | Cmaj7 |",
  },
  {
    id: "turnaround",
    label: "Turnaround",
    chartText: "| Cmaj7 A7 | Dm7 G7 |",
  },
  {
    id: "mu-major-journey",
    label: STARTER_CHART.title,
    chartText: STARTER_CHART.chartText,
  },
] as const;

const TOKEN_STATE_LABELS = {
  valid: "Parsed",
  insertable: "Recoverable",
  invalid: "Not parsed",
} as const;

/**
 * One preview row. An `insertable` row carries the only action that can commit
 * it, so the statement and the affordance are never separated: the row states
 * why it cannot be inserted and the same row's control stays disabled.
 */
function QuickEntryToken({
  token,
  acknowledged,
  onInsertRecoveredChord,
  repair,
}: Readonly<{
  token: StudioQuickEntryTokenView;
  acknowledged: boolean;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
  repair: ReturnType<typeof useEntryRepair>;
}>) {
  const globalOrdinal = token.globalOrdinal;
  const blockedReason = acknowledged
    ? token.blockedReason
    : (token.blockedReason ??
      "Accept the layout-loss statement before recovering a chord.");
  return (
    <li
      class="studio-quick-entry__token"
      data-testid="quick-entry-token"
      data-state={token.state}
      data-global-ordinal={
        globalOrdinal === null ? undefined : String(globalOrdinal)
      }
    >
      <span class="studio-quick-entry__token-state">
        {TOKEN_STATE_LABELS[token.state]}
      </span>
      {token.diagnosticRange === null ? (
        <code class="studio-quick-entry__token-text">{token.sourceText}</code>
      ) : (
        <button type="button" class="studio-entry-repair__action" disabled={repair.composing}
          aria-label={`Repair ${token.sourceText || "text at end of draft"}: ${diagnosticProse(token.diagnosticCode ?? "")}`}
          onClick={() => { repair.select(token); }}>
          {token.sourceText || "End of draft"} · Repair
        </button>
      )}
      {token.durationLabel === null ? null : (
        <span class="studio-quick-entry__token-duration">
          {token.durationLabel} beats
        </span>
      )}
      {token.requiresDuration ? (
        <span class="studio-quick-entry__token-duration">
          Needs an exact duration
        </span>
      ) : null}
      {token.diagnosticCode === null ? null : (
        // Prose first, the frozen T0 code verbatim beside it: the sentence
        // is for the writer, the code stays for the grammar authority.
        <>
          <span
            class="studio-quick-entry__token-note"
            data-testid="quick-entry-token-prose"
          >
            {diagnosticProse(token.diagnosticCode)}
          </span>
          <code class="studio-quick-entry__token-code">
            {token.diagnosticCode}
          </code>
        </>
      )}
      {token.diagnosticRange === null ? null : (
        // The T0 range verbatim: a code without the characters it covers makes
        // the reader search a long draft for the offending token.
        <span
          class="studio-quick-entry__token-range"
          data-testid="quick-entry-token-range"
        >
          {`characters ${String(token.diagnosticRange.start)}–${String(token.diagnosticRange.end)}`}
        </span>
      )}
      {token.requiresCompletionReason ? (
        <span class="studio-quick-entry__token-note">
          Leaves the measure short; a reason is required.
        </span>
      ) : null}
      {token.state === "insertable" && globalOrdinal !== null ? (
        <>
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={blockedReason !== null}
            id={`studio-recover-chord-${String(globalOrdinal)}`}
            invalid={false}
            label="Insert this chord"
            onAction={() => {
              onInsertRecoveredChord(globalOrdinal);
            }}
            type="button"
            variant="secondary"
          />
          {blockedReason === null ? null : (
            <span class="studio-quick-entry__token-note">{blockedReason}</span>
          )}
        </>
      ) : null}
    </li>
  );
}

/**
 * A parsed draft lists one row per parsed event; a refused draft lists one row
 * per chord T0 recovered plus one row per diagnostic, and never a parsed row.
 */
function QuickEntryTokenList({
  view,
  onInsertRecoveredChord,
  repair,
}: Readonly<{
  view: StudioQuickEntryView;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
  repair: ReturnType<typeof useEntryRepair>;
}>) {
  if (view.tokens.length === 0) return null;
  return (
    <>
      <ol class="studio-quick-entry__tokens" data-testid="quick-entry-tokens">
        {view.tokens.map((token) => (
          <QuickEntryToken
            acknowledged={view.recovery.acknowledged}
            key={`${token.state}-${String(token.ordinal)}`}
            onInsertRecoveredChord={onInsertRecoveredChord}
            token={token}
            repair={repair}
          />
        ))}
      </ol>
      {view.truncationNotice === null ? null : (
        <p
          class="studio-quick-entry__truncation"
          data-testid="quick-entry-truncation"
        >
          {view.truncationNotice}
        </p>
      )}
    </>
  );
}

/** Raw chart text stays caller-owned: the field never rewrites what was typed. */
function QuickEntryPanel({
  view,
  onDraftChange,
  onInsert,
  onClear,
  onRecoveryAcknowledgeChange,
  onRecoveryDurationDraftChange,
  onInsertRecoveredChord,
}: Readonly<{
  view: StudioQuickEntryView;
  onDraftChange: (value: string) => void;
  onInsert: () => void;
  onClear: () => void;
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  onRecoveryDurationDraftChange: (value: string) => void;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
}>) {
  const repair = useEntryRepair(view, onDraftChange);
  const insert = (): void => { repair.finish(); onInsert(); };
  const clear = (): void => { repair.finish(); onClear(); };
  /**
   * Alt+Enter (U1-OP-005) acts on the first row that can actually be committed.
   * When none can, it publishes nothing rather than choosing a blocked row.
   */
  const firstRecoverable =
    view.tokens.find(
      (token) =>
        token.state === "insertable" &&
        token.globalOrdinal !== null &&
        token.blockedReason === null,
    )?.globalOrdinal ?? null;
  const showRecovery =
    view.recovery.available ||
    view.tokens.some((token) => token.state === "insertable");
  /** The field appears only where T0 actually left a duration to the caller. */
  const needsCallerDuration = view.tokens.some((token) => token.requiresDuration);
  /**
   * Palette root selection is pure presentation: it only decides what text the
   * next quality chip appends to the draft, so it lives here rather than in
   * application state. Appending near the draft cap is disabled instead of
   * letting a chip manufacture a refusal the typist never typed.
   */
  const [paletteRoot, setPaletteRoot] = useState<string>("C");
  const paletteFull =
    view.codePointCount + 16 > view.maxCodePoints;
  const appendPaletteChord = (suffix: string): void => {
    const base = view.draftText;
    const separator = base.length === 0 || base.endsWith(" ") ? "" : " ";
    onDraftChange(`${base}${separator}${paletteRoot}${suffix} `);
  };
  return (
    <section class="studio-quick-entry" aria-labelledby="studio-quick-entry-heading">
      <h3 id="studio-quick-entry-heading">Quick entry</h3>
      <label class="studio-quick-entry__label" for="studio-quick-entry-field">
        Chart text
      </label>
      <p class="studio-quick-entry__hint" id="studio-quick-entry-hint">
        Bars sit between | marks; chords are symbols such as Dm7 or Cmaj7.
        Press Enter to add them to the chart.
      </p>
      <textarea
        ref={repair.field}
        data-ui-local-escape={repair.active || repair.composing ? "true" : undefined}
        id="studio-quick-entry-field"
        class="studio-quick-entry__field"
        data-testid="quick-entry-field"
        rows={3}
        spellcheck={false}
        value={view.draftText}
        placeholder="| Dm7 G7 | Cmaj7 |"
        aria-describedby="studio-quick-entry-status studio-quick-entry-hint"
        onInput={(event) => {
          repair.changeDraft(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (repair.guardKey(event)) return;
          if (event.key === "Enter" && event.altKey) {
            event.preventDefault();
            if (firstRecoverable !== null) {
              onInsertRecoveredChord(firstRecoverable);
            }
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            insert();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            clear();
          }
        }}
      />
      <EntryRepairControls repair={repair} />
      <p
        id="studio-quick-entry-status"
        class="studio-quick-entry__status"
        data-testid="quick-entry-status"
        role="status"
      >
        <span>{view.statusLabel}</span>
        <span class="studio-quick-entry__target">{view.targetLabel}</span>
        <span class="studio-quick-entry__count">
          {String(view.codePointCount)} / {String(view.maxCodePoints)}
        </span>
      </p>
      <p
        class="studio-quick-entry__plan"
        data-testid="insertion-plan"
        data-statement={view.insertionPlan.statement}
        role="status"
      >
        <strong>{view.insertionPlan.label}</strong>
        {view.insertionPlan.resolutions.length === 0 ? null : (
          <span class="studio-quick-entry__plan-resolutions">
            {view.insertionPlan.resolutions.join(" · ")}
          </span>
        )}
      </p>
      {view.issueCodes.length === 0 ? null : (
        <ul class="studio-quick-entry__issues" data-testid="quick-entry-issues">
          {view.issueCodes.map((code) => (
            <li key={code}>
              <span>{diagnosticProse(code)}</span>{" "}
              <code class="studio-quick-entry__token-code">{code}</code>
            </li>
          ))}
        </ul>
      )}
      <QuickEntryTokenList
        onInsertRecoveredChord={onInsertRecoveredChord}
        view={view}
        repair={repair}
      />
      {showRecovery ? (
        <section
          class="studio-quick-entry__recovery"
          data-testid="quick-entry-recovery"
          data-available={view.recovery.available ? "true" : "false"}
          aria-labelledby="studio-quick-entry-recovery-heading"
        >
          <h4 id="studio-quick-entry-recovery-heading">Recover one chord</h4>
          <p class="studio-quick-entry__recovery-target">
            {view.recovery.measureLabel === null
              ? "No destination measure"
              : `Into ${view.recovery.measureLabel}`}
            {view.recovery.remainderLabel === null
              ? ""
              : ` · ${view.recovery.remainderLabel} beats free`}
          </p>
          {/*
            Prose for the person, while the exact machine acknowledgement
            token still travels to A0 untouched when the box is ticked —
            the sentence states what accepting it costs in plain words.
          */}
          <Checkbox
            busy={false}
            checked={view.recovery.acknowledged}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-quick-entry-acknowledge"
            invalid={false}
            label="The original bar and section layout will be lost — chords are recovered one by one."
            onCheckedChange={(event) => {
              onRecoveryAcknowledgeChange(event.value);
            }}
          />
          {needsCallerDuration ? (
            <>
              <label
                class="studio-quick-entry__label"
                for="studio-quick-entry-recovery-duration"
              >
                Exact beats for a chord T0 could not measure
              </label>
              <input
                id="studio-quick-entry-recovery-duration"
                class="studio-quick-entry__field"
                data-testid="recovery-duration-field"
                type="text"
                inputMode="text"
                spellcheck={false}
                value={view.recovery.durationDraft}
                onInput={(event) => {
                  onRecoveryDurationDraftChange(event.currentTarget.value);
                }}
              />
            </>
          ) : null}
          {view.recovery.unavailableReason === null ? null : (
            <p
              class="studio-quick-entry__recovery-blocked"
              data-testid="recovery-unavailable"
              role="status"
            >
              {view.recovery.unavailableReason}
            </p>
          )}
        </section>
      ) : null}
      {view.refusalMessage === null ? null : (
        <p
          class="studio-quick-entry__refusal"
          data-testid="quick-entry-refusal"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {view.refusalMessage}
        </p>
      )}
      <div class="studio-quick-entry__actions">
        <Button
          busy={false}
          density="comfortable"
          describedBy={["studio-quick-entry-status"]}
          disabled={!view.canInsert || repair.composing}
          id="studio-quick-entry-insert"
          invalid={false}
          label="Insert chart text"
          onAction={insert}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={!view.canClear || repair.composing}
          id="studio-quick-entry-clear"
          invalid={false}
          label="Clear"
          onAction={clear}
          type="button"
          variant="secondary"
        />
      </div>
      {/*
        The palette is a faster way to type, not a second insertion channel:
        every chip only appends symbol text to the same draft the field owns,
        so a chip can never do anything typing the same characters could not.
      */}
      <div
        class="studio-quick-entry__palette"
        data-testid="chord-palette"
        role="group"
        aria-label={`Chord palette, root ${paletteRoot}`}
      >
        <span class="studio-quick-entry__demos-label">Palette:</span>
        <div
          class="studio-quick-entry__palette-roots"
          role="group"
          aria-label="Palette root"
        >
          {PALETTE_ROOTS.map((root) => (
            <Button
              busy={false}
              density="dense"
              describedBy={["studio-quick-entry-status"]}
              disabled={false}
              id={`studio-palette-root-${root.id}`}
              invalid={false}
              key={root.id}
              label={root.label}
              onAction={() => {
                setPaletteRoot(root.text);
              }}
              type="button"
              variant={paletteRoot === root.text ? "primary" : "ghost"}
            />
          ))}
        </div>
        <div
          class="studio-quick-entry__palette-qualities"
          role="group"
          aria-label={`Chord qualities on ${paletteRoot}`}
        >
          {PALETTE_QUALITIES.map((quality) => (
            <Button
              busy={false}
              density="dense"
              describedBy={["studio-quick-entry-status"]}
              disabled={paletteFull}
              id={`studio-palette-quality-${quality.id}`}
              invalid={false}
              key={quality.id}
              label={quality.label}
              onAction={() => {
                appendPaletteChord(quality.suffix);
              }}
              type="button"
              variant="outline"
            />
          ))}
        </div>
      </div>
      {/*
        One-click demos exist so the first minute can contain sound. Each goes
        through exactly the typed path — draft change, then insert — so a demo
        can never do anything typing the same text could not.
      */}
      <div
        class="studio-quick-entry__demos"
        role="group"
        aria-label="Demo progressions"
      >
        <span class="studio-quick-entry__demos-label">Try one:</span>
        {DEMO_PROGRESSIONS.map((demo) => (
          <Button
            busy={false}
            density="dense"
            describedBy={["studio-quick-entry-status"]}
            disabled={false}
            id={`studio-quick-entry-demo-${demo.id}`}
            invalid={false}
            key={demo.id}
            label={demo.label}
            onAction={() => {
              onDraftChange(demo.chartText);
              onInsert();
            }}
            type="button"
            variant="secondary"
          />
        ))}
      </div>
    </section>
  );
}

/** "132 bpm · Medium swing" from an entry's reviewed judgments. */
function standardMeta(
  entry: (typeof PROGRESSION_LIBRARY)[number],
  grooveLabels: ReadonlyMap<string, string>,
): string {
  const groove = grooveLabels.get(entry.grooveStyleId) ?? entry.grooveStyleId;
  return entry.tempoBpm === undefined
    ? groove
    : `${String(entry.tempoBpm)} bpm · ${groove}`;
}

/** The chart text as one engraved preview line: │ between bars, ellipsized. */
function standardPreview(chartText: string): string {
  return chartText.replaceAll("|", "│").replaceAll(/\s+/gu, " ").trim();
}

/**
 * The reviewed catalogue as the prototype's Standard-progressions rows
 * (jcpe-v2r-library-ulwb): whole-row buttons with the title, the reviewed
 * tempo·groove meta, an engraved one-line preview, and — in the roomy modal
 * variant — the provenance note, because a public-domain transcription, a
 * shared device, and an original study are three different claims and must
 * not read alike. Every row rides the same application-owned load: one
 * gesture replaces the chart, retitles it, and commits the entry's groove
 * and tempo (the earlier chained-callback wiring appended six bars of the
 * wrong song at the wrong speed).
 */
export function StandardProgressionList({
  variant,
  grooveOptions,
  onLoadLibraryEntry,
}: Readonly<{
  variant: "rail" | "modal";
  grooveOptions: readonly Readonly<{ id: string; label: string }>[];
  onLoadLibraryEntry: (entryId: string, focusOwnerId?: string) => void;
}>) {
  const grooveLabels = new Map(
    grooveOptions.map((option) => [option.id, option.label]),
  );
  return (
    <ul
      class="studio-standards"
      data-variant={variant}
      data-testid={`standards-list-${variant}`}
    >
      {PROGRESSION_LIBRARY.map((entry) => (
        <li class="studio-standards__row" key={entry.id}>
          <button
            aria-describedby={`studio-progression-note-${entry.id}-${variant}`}
            class="studio-standards__load"
            id={
              variant === "rail"
                ? `studio-progression-${entry.id}`
                : `studio-progression-${entry.id}-modal`
            }
            onClick={() => {
              onLoadLibraryEntry(entry.id, variant === "rail"
                ? `studio-progression-${entry.id}` : "studio-open-standards");
            }}
            type="button"
          >
            <span class="studio-standards__head">
              <span class="studio-standards__title">{entry.title}</span>
              <span class="studio-standards__meta">
                {standardMeta(entry, grooveLabels)}
              </span>
            </span>
            <span class="studio-standards__preview">
              {standardPreview(entry.chartText)}
            </span>
          </button>
          <p
            class="studio-standards__note"
            id={`studio-progression-note-${entry.id}-${variant}`}
            hidden={variant === "rail" ? true : undefined}
          >
            <span class="studio-standards__kicker">{entry.kicker}</span>
            {` ${entry.note}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function LibraryPanelContent({
  headingId,
  context,
  quickEntry,
  midiImport,
  playback,
  onMidiImportChooseFile,
  onMidiImportSelectCandidate,
  onMidiImportCommit,
  onMidiImportDiscard,
  onMidiImportAudition,
  onMidiImportOverridesChange,
  onQuickEntryDraftChange,
  onQuickEntryInsert,
  onQuickEntryClear,
  onTempoDraftChange,
  onTempoCommit,
  onGrooveStyleChange,
  onLoadLibraryEntry,
  onRecoveryAcknowledgeChange,
  onRecoveryDurationDraftChange,
  onInsertRecoveredChord,
  onOpenCommandLane,
}: LibraryPanelContentProps) {
  return (
    <section
      class="studio-panel-content studio-library-content"
      data-panel-context={context}
      aria-labelledby={headingId}
    >
      {context === "rail" ? (
        <header class="studio-panel-heading">
          <div>
            <p class="studio-kicker">Write and discover</p>
            <h2 id={headingId}>Library</h2>
          </div>
        </header>
      ) : (
        <p class="studio-kicker">Write and discover</p>
      )}

      {/*
        MIDI import renders BEFORE quick entry: the quick-entry section ends
        with the multi-thousand-pixel progression catalogue, and anything
        placed after it sits ~3.9k px deep in a ~750 px rail viewport —
        users reported the shipped feature as invisible (jcpe-osxq). The
        233 px panel keeps the quick-entry field above the fold. It remains
        the same act by another route: it writes chart text through the
        identical staged insert, never a second mutation channel.
      */}
      {midiImport.available ? (
        <MidiImportPanel
          context={context}
          onChooseFile={onMidiImportChooseFile}
          onSelectCandidate={onMidiImportSelectCandidate}
          onCommit={onMidiImportCommit}
          onDiscard={onMidiImportDiscard}
          onAudition={onMidiImportAudition}
          onOverridesChange={onMidiImportOverridesChange}
          onOpenCommandLane={onOpenCommandLane}
          view={midiImport}
        />
      ) : null}

      <QuickEntryPanel
        onClear={onQuickEntryClear}
        onDraftChange={onQuickEntryDraftChange}
        onInsert={onQuickEntryInsert}
        onInsertRecoveredChord={onInsertRecoveredChord}
        onRecoveryAcknowledgeChange={onRecoveryAcknowledgeChange}
        onRecoveryDurationDraftChange={onRecoveryDurationDraftChange}
        view={quickEntry}
      />

      {/*
        The prototype's Standard-progressions surface (jcpe-v2r-library-ulwb):
        the reviewed catalogue as engraved rows. Ids stay stable in the rail
        variant so the load path's pins survive.
      */}
      <section
        class="studio-standards-section"
        aria-labelledby={`studio-standards-heading-${context}`}
      >
        <p class="studio-kicker">Standard progressions</p>
        <h3 id={`studio-standards-heading-${context}`}>Load a set of changes</h3>
        <StandardProgressionList
          grooveOptions={playback.groove.options}
          onLoadLibraryEntry={onLoadLibraryEntry}
          variant="rail"
        />
      </section>

      {/*
        Playback settings live with the writing tools rather than in the
        fixed-height transport bar, which has no room to grow at phone
        widths. Ids are suffixed with the panel context because the mobile
        sheet renders a second copy of this panel while open (jcpe-ph6d).
      */}
      <section
        class="studio-playback-settings"
        aria-labelledby={`studio-playback-heading-${context}`}
      >
        <h3 id={`studio-playback-heading-${context}`}>Playback</h3>
        <form
          aria-label="Tempo"
          class="studio-playback-settings__tempo"
          onSubmit={(event) => {
            event.preventDefault();
            onTempoCommit();
          }}
        >
          <Label
            controlId={`studio-tempo-input-${context}`}
            id={`studio-tempo-label-${context}`}
            required={false}
            text="Tempo (BPM)"
          />
          <div class="studio-playback-settings__tempo-row">
            <Input
              accessibleName="Tempo in beats per minute"
              busy={false}
              density="dense"
              describedBy={[`studio-tempo-feedback-${context}`]}
              disabled={false}
              id={`studio-tempo-input-${context}`}
              inputType="text"
              invalid={playback.tempoInvalid}
              onValueChange={(event) => {
                onTempoDraftChange(event.value);
              }}
              placeholder={null}
              readOnly={false}
              value={playback.tempoDraft}
            />
            <Button
              busy={false}
              density="dense"
              describedBy={[`studio-tempo-feedback-${context}`]}
              disabled={false}
              id={`studio-apply-tempo-${context}`}
              invalid={false}
              label="Apply tempo"
              onAction={() => undefined}
              type="submit"
              variant="secondary"
            />
          </div>
          <p
            class="studio-playback-settings__feedback"
            id={`studio-tempo-feedback-${context}`}
            role={playback.tempoInvalid ? "alert" : "status"}
            aria-live={playback.tempoInvalid ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {playback.tempoFeedback ?? ""}
          </p>
        </form>

        {/*
          The groove picker. Session state, not a document edit: the choice
          shapes the NEXT Play and never touches the chart, and each library
          entry above applies its own reviewed groove when loaded. Ids carry
          the panel context because the mobile sheet renders a second copy of
          this panel while open (jcpe-ph6d).
        */}
        <div class="studio-playback-settings__groove">
          <Label
            controlId={`studio-groove-picker-${context}`}
            id={`studio-groove-label-${context}`}
            required={false}
            text="Groove"
          />
          <RadioGroup
            accessibleName="Playback groove"
            busy={false}
            density="dense"
            describedBy={[`studio-groove-note-${context}`]}
            disabled={false}
            id={`studio-groove-picker-${context}`}
            insideToolbar={false}
            invalid={false}
            onValueChange={(event) => {
              onGrooveStyleChange(event.value);
            }}
            options={playback.groove.options.map((option) => ({
              description: null,
              disabled: false,
              id: `studio-groove-${option.id}-${context}`,
              label: option.label,
              value: option.id,
            }))}
            value={playback.groove.activeStyleId}
          />
          <p
            class="studio-playback-settings__feedback"
            id={`studio-groove-note-${context}`}
          >
            Applies to the next Play. Library entries pick their own groove.
          </p>
        </div>
      </section>

    </section>
  );
}

export type LibraryPanelProps = Readonly<{
  collapsed: boolean;
  /**
   * True while the library sheet renders its own LibraryPanelContent copy.
   * The rail must not mount a second copy then: every static id inside the
   * content would be duplicated document-wide, breaking label/for and
   * aria references. The sheet is modal and every width that can open it
   * hides this rail, so nothing visible is lost.
   */
  sheetOpen: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  quickEntry: StudioQuickEntryView;
  midiImport: StudioMidiImportView;
  playback: StudioPlaybackSettingsView;
  onMidiImportChooseFile: (files: readonly File[]) => void;
  onMidiImportSelectCandidate: (ordinal: number) => void;
  onMidiImportCommit: () => void;
  onMidiImportDiscard: () => void;
  onMidiImportAudition: () => void;
  onMidiImportOverridesChange: Parameters<
    typeof MidiImportPanel
  >[0]["onOverridesChange"];
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
  onTempoDraftChange: (value: string) => void;
  onTempoCommit: () => void;
  onGrooveStyleChange: (styleId: string) => void;
  onLoadLibraryEntry: (entryId: string, focusOwnerId?: string) => void;
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  onRecoveryDurationDraftChange: (value: string) => void;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
  /** Opens the ⌘K command lane; the import panel's paste route points there. */
  onOpenCommandLane?: (() => void) | undefined;
}>;

export function LibraryPanel({
  collapsed,
  sheetOpen,
  onCollapsedChange,
  quickEntry,
  midiImport,
  playback,
  onMidiImportChooseFile,
  onMidiImportSelectCandidate,
  onMidiImportCommit,
  onMidiImportDiscard,
  onMidiImportAudition,
  onMidiImportOverridesChange,
  onQuickEntryDraftChange,
  onQuickEntryInsert,
  onQuickEntryClear,
  onTempoDraftChange,
  onTempoCommit,
  onGrooveStyleChange,
  onLoadLibraryEntry,
  onRecoveryAcknowledgeChange,
  onRecoveryDurationDraftChange,
  onInsertRecoveredChord,
  onOpenCommandLane,
}: LibraryPanelProps) {
  const headingId = "studio-library-heading";

  return (
    <aside
      class="studio-rail studio-rail--library"
      id="library-rail"
      data-collapsed={collapsed ? "true" : "false"}
      aria-labelledby={headingId}
    >
      <div
        class="studio-rail__contents"
        data-collapsed={collapsed ? "true" : "false"}
      >
        {collapsed || sheetOpen ? (
          <h2 id={headingId} class="studio-visually-hidden">
            Library
          </h2>
        ) : (
          <LibraryPanelContent
            context="rail"
            headingId={headingId}
            midiImport={midiImport}
            onMidiImportChooseFile={onMidiImportChooseFile}
            onMidiImportSelectCandidate={onMidiImportSelectCandidate}
            onMidiImportCommit={onMidiImportCommit}
            onMidiImportDiscard={onMidiImportDiscard}
            onMidiImportAudition={onMidiImportAudition}
            onMidiImportOverridesChange={onMidiImportOverridesChange}
            onInsertRecoveredChord={onInsertRecoveredChord}
            onOpenCommandLane={onOpenCommandLane}
            onQuickEntryClear={onQuickEntryClear}
            onQuickEntryDraftChange={onQuickEntryDraftChange}
            onQuickEntryInsert={onQuickEntryInsert}
            onTempoDraftChange={onTempoDraftChange}
            onTempoCommit={onTempoCommit}
            onGrooveStyleChange={onGrooveStyleChange}
            onLoadLibraryEntry={onLoadLibraryEntry}
            onRecoveryAcknowledgeChange={onRecoveryAcknowledgeChange}
            onRecoveryDurationDraftChange={onRecoveryDurationDraftChange}
            playback={playback}
            quickEntry={quickEntry}
          />
        )}
        <button
          aria-expanded={collapsed ? "false" : "true"}
          aria-label={collapsed ? "Expand Library" : "Collapse Library"}
          class="studio-icon-button studio-rail__collapse-button"
          id="studio-library-rail-toggle"
          key="studio-library-rail-toggle"
          onClick={() => {
            onCollapsedChange(!collapsed);
          }}
          type="button"
        >
          <UiIcon iconId={collapsed ? "chevron-right" : "chevron-left"} />
        </button>
        {collapsed ? (
          <span class="studio-rail__vertical-label" aria-hidden="true">
            Library
          </span>
        ) : null}
      </div>
    </aside>
  );
}

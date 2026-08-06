import {
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_REQUEST_SCHEMA,
  MIDI_IMPORT_SECTION_NAME,
  createMidiImportOperations,
  describeMidiImportSonorities,
  isSalvageableRefusalCode,
  planMidiImportChart,
  salvageMidiBytes,
  type MidiImportChartPlan,
  type MidiImportChartSonority,
  type MidiImportRefusal,
  type MidiImportValue,
  type MidiSalvageReport,
  type SmfDecodeFrame,
  planAutomationImport,
  completeImportTrace,
  traceRecord,
  type M1AutomationPlan,
  type M1ImportOverrides,
  type M1ImportTrace,
  type M1TraceRecord,
} from "../export";
import { DEFAULT_GROOVE_STYLE_ID } from "../domain";
import type {
  StudioController,
  StudioControllerActionResult,
} from "./studio-controller";

/**
 * The one MIDI-import gesture.
 *
 * The byte decoder is injected by the composition root — the same discipline
 * the audio platform follows — so this layer never reaches for `WebAssembly`,
 * `atob`, or a browser API, and stays compilable headless. The UI receives
 * this service and dispatches to it; it never sees the decoder.
 *
 * Reading a file and committing it are two deliberately separate steps. The
 * decode produces a PREVIEW: per-sonority candidates, their alternatives, the
 * literal pitch sets nothing could name, and the exact chart text an insert
 * would write. Nothing enters the document until the caller commits, and the
 * commit is ONE ordinary undoable edit: a single named section staged at the
 * document end, which is the one placement the atomic runner satisfies with a
 * single `apply-edit-plan` command whatever the destination chart already
 * holds.
 */

export const MAX_MIDI_IMPORT_DRAFT_CODE_POINTS = 4_096;

/* Re-exported so runtime consumers stay off the export-layer deep path. */
export type { M1ImportOverrides } from "../export";

export type MidiImportPreview = Readonly<{
  fileName: string;
  byteLength: number;
  /** The decoded value, or null when the file refused. */
  decoded: MidiImportValue | null;
  /** The structured refusal, or null when the file decoded. */
  refusal: MidiImportRefusal | null;
  /** The chart an insert would write, or null when nothing could be named. */
  plan: MidiImportChartPlan | null;
  /**
   * Every decoded sonority, described. Populated even when no chart could be
   * derived, so a file nothing could name still states its literal pitches.
   */
  sonorities: readonly MidiImportChartSonority[];
  /** Why this preview cannot be committed, stated plainly; null when it can. */
  blockedReason: string | null;
  /**
   * The salvage ledger when this preview came from repaired bytes: what was
   * repaired, how often, and the honest sentence the surface must show. Null
   * for a clean decode — the overwhelmingly common path is untouched.
   */
  salvage: MidiSalvageReport | null;
  /**
   * The salvage ledger when repair was ATTEMPTED but the repaired bytes
   * still refused. The refusal shown is the file's own first problem, and
   * this report proves repair was tried rather than silently skipped.
   */
  salvageFailed: MidiSalvageReport | null;
  /**
   * The M1 automatic plan: roles, spans, key, groove choice with evidence,
   * sections, chunked chart text, and settings-transfer facts. Null when the
   * file refused or the automation found nothing to write.
   */
  automation: M1AutomationPlan | null;
  /** The automation refusal code when automation could not plan; else null. */
  automationRefusal: string | null;
  /**
   * The M1-TRACE ledger: one record per frozen stage, decode and salvage
   * included, unreached stages stated explicitly. Every preview carries it.
   */
  trace: M1ImportTrace;
}>;

export type MidiImportCommitResult = Readonly<{
  committed: boolean;
  reason:
    | "committed"
    | "nothing-to-commit"
    | "no-destination"
    | "staging-refused"
    | "insert-refused";
  staged: StudioControllerActionResult | null;
  inserted: StudioControllerActionResult | null;
}>;

/** One issued envelope command, for the stated-count law and the ledger. */
export type MidiImportEnvelopeStep = Readonly<{
  step: "insert" | "tempo" | "meter" | "key" | "title" | "groove";
  outcome: "applied" | "unchanged" | "withheld" | "refused";
  /** Plain sentence when withheld or refused; null otherwise. */
  reason: string | null;
}>;

export type MidiImportAutoCommitResult = Readonly<{
  committed: boolean;
  reason:
    | "committed"
    | "nothing-to-commit"
    | "no-destination"
    | "rolled-back";
  /** Every step in issue order, including withheld ones, for the card. */
  steps: readonly MidiImportEnvelopeStep[];
  /** Exactly how many Undo presses return the chart. */
  undoCount: number;
  /** How many issued commands were undone after a mid-envelope refusal. */
  rolledBackCount: number;
}>;

export type StudioMidiImportService = Readonly<{
  /** Decodes local file bytes into a preview. Never throws on hostile bytes. */
  readFile: (fileName: string, bytes: Uint8Array) => Promise<MidiImportPreview>;
  /** Lands a preview as one undoable edit (the M0 manual path, retained). */
  commit: (
    controller: StudioController,
    preview: MidiImportPreview,
  ) => MidiImportCommitResult;
  /**
   * Lands the automatic plan: chunked insert, then settings transfer per the
   * M1-XFER truth table, then the groove — with the stated undo count, and
   * rollback of every issued command if any envelope command refuses.
   */
  commitAutomatic: (
    controller: StudioController,
    preview: MidiImportPreview,
  ) => MidiImportAutoCommitResult;
  /**
   * Re-plans the pending preview under M1-OVR overrides on the RETAINED
   * decoded model — no re-read, no document change. The returned preview
   * replaces the pending one atomically: automation, chart text, chunk
   * plan, and trace all restate the overridden world. A preview with no
   * decoded model returns unchanged.
   */
  replanWithOverrides: (
    preview: MidiImportPreview,
    overrides: M1ImportOverrides,
  ) => MidiImportPreview;
}>;

/**
 * Request ids travel to the reader and must match its frozen ASCII pattern, so
 * a file name never becomes one. The ordinal keeps successive imports distinct
 * inside one session without a clock.
 */
function requestIdFor(ordinal: number): string {
  return `studio-midi-import-${String(ordinal)}`;
}

function sectionNameFor(fileName: string): string {
  const trimmed = fileName.replace(/\.[Mm][Ii][Dd][Ii]?$/u, "").trim();
  return trimmed.length === 0 ? MIDI_IMPORT_SECTION_NAME : trimmed;
}

function blockedReasonFor(plan: MidiImportChartPlan | null): string | null {
  if (plan === null) {
    return "No sonority in this file matches a chord the grammar can name, so there is nothing to write.";
  }
  if (plan.codePointCount > MAX_MIDI_IMPORT_DRAFT_CODE_POINTS) {
    return `This import writes ${String(plan.codePointCount)} characters of chart text, past the ${String(MAX_MIDI_IMPORT_DRAFT_CODE_POINTS)}-character limit one edit may carry.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Audition (jcpe-qyyn): hear the imported bars BEFORE pressing Add     *
 * ------------------------------------------------------------------ */

export type MidiImportAuditionStep = Readonly<{
  /** Milliseconds after the audition starts, at the FILE's own tempo. */
  atMs: number;
  /** The file's own sounding pitches for this span, capped and sorted. */
  midiPitches: readonly number[];
}>;

export const MAX_MIDI_IMPORT_AUDITION_STEPS = 12;
const MAX_AUDITION_PITCHES_PER_STEP = 10;

/**
 * Derives the audition timeline from a preview: the first written spans'
 * OWN sounding pitches (straight from the decoded note stream — nothing is
 * invented and no voicing is synthesized), timed at the file's initial
 * tempo. The audition is deliberately a bounded series of click-previews:
 * it reuses the existing preview lane and adds no audio path, so it states
 * the imported harmony and rhythm skeleton, not the groove performance —
 * that plays after Add, through the real transport. Pure and total: a
 * preview with no automation plan auditions nothing.
 */
export function auditionMidiImportPreview(
  preview: MidiImportPreview,
): readonly MidiImportAuditionStep[] {
  const automation = preview.automation;
  const decoded = preview.decoded;
  if (automation === null || decoded === null) return Object.freeze([]);
  const ppq = decoded.model.header.division;
  if (ppq <= 0) return Object.freeze([]);
  const msPerTick = automation.initialTempoMicroseconds / (1_000 * ppq);
  const eligibleTracks = decoded.model.tracks.filter((_, index) => {
    const role = automation.classifications[index]?.role;
    return role !== "percussion" && role !== "silent";
  });
  const steps: MidiImportAuditionStep[] = [];
  let firstTick: number | null = null;
  for (const reading of automation.readings) {
    if (!reading.written) continue;
    const span = reading.span;
    const sounding = new Set<number>();
    for (const track of eligibleTracks) {
      for (const note of track.notes) {
        if (note.onTick < span.endTick && note.offTick > span.startTick) {
          sounding.add(note.key);
        }
      }
    }
    if (sounding.size === 0) continue;
    firstTick = firstTick ?? span.startTick;
    const midiPitches = [...sounding]
      .sort((left, right) => left - right)
      .slice(0, MAX_AUDITION_PITCHES_PER_STEP);
    steps.push(
      Object.freeze({
        atMs: Math.round((span.startTick - firstTick) * msPerTick),
        midiPitches: Object.freeze(midiPitches),
      }),
    );
    if (steps.length >= MAX_MIDI_IMPORT_AUDITION_STEPS) break;
  }
  return Object.freeze(steps);
}

/**
 * The preview a session without a decoder returns: nothing decoded, the
 * statement carried in blockedReason, and a trace whose decode stage says
 * exactly why nothing ran. UI composes this instead of hand-building the
 * preview shape (the trace type lives below the UI's import boundary).
 */
export function unavailableMidiImportPreview(
  fileName: string,
  byteLength: number,
): MidiImportPreview {
  return Object.freeze({
    fileName,
    byteLength,
    decoded: null,
    refusal: null,
    plan: null,
    sonorities: Object.freeze([]),
    salvage: null,
    salvageFailed: null,
    automation: null,
    automationRefusal: null,
    blockedReason: "MIDI import is not available in this session.",
    trace: completeImportTrace([
      traceRecord("decode", { fileName, byteLength }, {}, [
        {
          subject: "decode",
          outcome: "unavailable",
          reason: "no decoder is composed into this session",
        },
      ]),
    ]),
  });
}

export function createStudioMidiImport(
  loadDecodeFrame: () => Promise<SmfDecodeFrame>,
): StudioMidiImportService {
  let ordinal = 0;

  const readFile = async (
    fileName: string,
    bytes: Uint8Array,
  ): Promise<MidiImportPreview> => {
    ordinal += 1;
    const decodeFrame = await loadDecodeFrame();
    const operations = createMidiImportOperations(decodeFrame);
    const requestFor = (requestId: string, payload: Uint8Array) =>
      ({
        schema: MIDI_IMPORT_REQUEST_SCHEMA,
        requestId,
        readerId: MIDI_IMPORT_READER_ID,
        readerVersion: MIDI_IMPORT_READER_VERSION,
        bytes: payload,
      }) as const;
    const strict = operations.decodeSmf(requestFor(requestIdFor(ordinal), bytes));

    let result = strict;
    let salvage: MidiSalvageReport | null = null;
    let salvageFailed: MidiSalvageReport | null = null;
    if (!strict.ok && isSalvageableRefusalCode(strict.refusal.code)) {
      /*
       * A content-level refusal gets one salvage attempt: repair the note
       * stream at the byte level, then run the SAME strict decoder over the
       * repaired bytes so every structural guarantee still comes from the
       * one reviewed reader. If the repaired bytes still refuse — a second
       * defect beyond the note stream — the ORIGINAL refusal stands, so the
       * person sees the file's own first problem, not the repair's; the
       * attempt itself is still reported, never silently dropped.
       */
      const attempt = salvageMidiBytes(bytes);
      if (attempt.salvaged) {
        const reread = operations.decodeSmf(
          requestFor(`${requestIdFor(ordinal)}-salvaged`, attempt.bytes),
        );
        if (reread.ok) {
          result = reread;
          salvage = attempt.report;
        } else {
          salvageFailed = attempt.report;
        }
      }
    }

    /*
     * M1-TRACE, service-owned stages: the decode outcome and the salvage
     * account — present whenever salvage RAN, including when the repaired
     * bytes still refused (the jcpe-a5uq information-loss law).
     */
    const decodeRecord = (outcome: string, code: string | null): M1TraceRecord =>
      traceRecord(
        "decode",
        { fileName, byteLength: bytes.byteLength },
        result.ok
          ? {
              tracks: result.value.model.tracks.length,
              notesPaired: result.value.model.counters.notesPaired,
            }
          : {},
        [
          {
            subject: "decode",
            outcome,
            reason:
              code ??
              `${MIDI_IMPORT_READER_ID}@${String(MIDI_IMPORT_READER_VERSION)}`,
          },
        ],
        code,
      );
    const salvageRecord = (): M1TraceRecord => {
      const attempt = salvage ?? salvageFailed;
      if (attempt === null) {
        return traceRecord("salvage", { attempted: false }, { repairs: 0 }, [
          {
            subject: "salvage",
            outcome: strict.ok ? "not-attempted" : "not-salvageable",
            reason: strict.ok
              ? "the decode succeeded without content repairs"
              : "the refusal is structural, not a note-stream defect",
          },
        ]);
      }
      return traceRecord(
        "salvage",
        { attempted: true },
        { repairs: attempt.totalRepairs },
        [
          {
            subject: "salvage",
            outcome:
              salvage !== null ? "repaired-clean" : "repaired-still-refused",
            reason: attempt.note,
          },
        ],
      );
    };

    if (!result.ok) {
      return Object.freeze({
        fileName,
        byteLength: bytes.byteLength,
        decoded: null,
        refusal: result.refusal,
        plan: null,
        sonorities: Object.freeze([]),
        blockedReason: null,
        salvage: null,
        salvageFailed,
        automation: null,
        automationRefusal: null,
        trace: completeImportTrace([
          decodeRecord("refused", result.refusal.code),
          salvageRecord(),
        ]),
      });
    }
    const plan = planMidiImportChart(result.value, sectionNameFor(fileName));
    const automationResult = planAutomationImport(result.value, fileName);
    return Object.freeze({
      fileName,
      byteLength: bytes.byteLength,
      decoded: result.value,
      refusal: null,
      plan,
      sonorities:
        plan === null ? describeMidiImportSonorities(result.value) : plan.sonorities,
      blockedReason: blockedReasonFor(plan),
      salvage,
      salvageFailed: null,
      automation: automationResult.ok ? automationResult.plan : null,
      automationRefusal: automationResult.ok
        ? null
        : automationResult.refusal.code,
      trace: completeImportTrace([
        decodeRecord("decoded", null),
        salvageRecord(),
        ...(automationResult.ok
          ? automationResult.plan.trace
          : (automationResult.trace ?? [])),
      ]),
    });
  };

  const commit = (
    controller: StudioController,
    preview: MidiImportPreview,
  ): MidiImportCommitResult => {
    const plan = preview.plan;
    if (plan === null || preview.blockedReason !== null) {
      return Object.freeze({
        committed: false,
        reason: "nothing-to-commit" as const,
        staged: null,
        inserted: null,
      });
    }
    /*
     * The target comes from the LIVE snapshot: an id captured before an
     * earlier edit is stale and stages a refusal instead of an insert.
     * `document-end` with a named section is the placement that lands as one
     * `apply-edit-plan` command; a section-scoped target would split into a
     * fill-then-append pair whenever the destination holds a lone empty
     * measure, and the import would then cost two presses of Undo.
     */
    const snapshot = controller.getSnapshot();
    if (snapshot.sections.length === 0) {
      return Object.freeze({
        committed: false,
        reason: "no-destination" as const,
        staged: null,
        inserted: null,
      });
    }
    const previewStatus = controller.previewChartText(plan.chartText);
    const staged = controller.setQuickEntryDraft(
      plan.chartText,
      { kind: "document-end" },
      previewStatus.status,
      previewStatus.issueCodes,
    );
    if (!staged.ok) {
      return Object.freeze({
        committed: false,
        reason: "staging-refused" as const,
        staged,
        inserted: null,
      });
    }
    const inserted = controller.applyQuickEntryPreview();
    return Object.freeze({
      committed: inserted.ok,
      reason: inserted.ok ? ("committed" as const) : ("insert-refused" as const),
      staged,
      inserted,
    });
  };

  const commitAutomatic = (
    controller: StudioController,
    preview: MidiImportPreview,
  ): MidiImportAutoCommitResult => {
    const automation = preview.automation;
    if (automation === null || automation.chunkTexts.length === 0) {
      return Object.freeze({
        committed: false,
        reason: "nothing-to-commit" as const,
        steps: Object.freeze([]),
        undoCount: 0,
        rolledBackCount: 0,
      });
    }
    const before = controller.getSnapshot();
    if (before.sections.length === 0) {
      return Object.freeze({
        committed: false,
        reason: "no-destination" as const,
        steps: Object.freeze([]),
        undoCount: 0,
        rolledBackCount: 0,
      });
    }
    /*
     * Destination facts are read once, before any command: the M1-XFER
     * truth table keys off the destination as the user saw it, not off the
     * half-imported chart.
     */
    const starter = before.chordCount === 0;
    const documentGrooveIsDefault =
      before.performance.styleId === DEFAULT_GROOVE_STYLE_ID;

    const steps: MidiImportEnvelopeStep[] = [];
    let issuedCount = 0;

    const rollBack = (
      failed: MidiImportEnvelopeStep,
    ): MidiImportAutoCommitResult => {
      /*
       * Failure atomicity (law M1-ENV): a refusal mid-envelope undoes every
       * command this gesture issued, so a failed import never leaves a
       * half-landed chart. Undo runs newest-first, exactly the commands
       * counted in issuedCount.
       */
      let rolledBack = 0;
      for (let index = 0; index < issuedCount; index += 1) {
        const undone = controller.undo();
        if (!undone.ok) break;
        rolledBack += 1;
      }
      return Object.freeze({
        committed: false,
        reason: "rolled-back" as const,
        steps: Object.freeze([...steps, failed]),
        undoCount: 0,
        rolledBackCount: rolledBack,
      });
    };

    /*
     * The insert stage: every chunk in order. The first chunk carries the
     * section header, so `document-end` lands it as one command. Later
     * chunks are bare measures continuing that section: at `document-end`
     * they would need a synthesized section and split into two commands,
     * which the atomic runner rightly refuses, so each one aims at the
     * LIVE last section's end — the append boundary of the section the
     * previous chunk just extended (marker-derived sections included,
     * because the snapshot is re-read after every chunk).
     */
    const insertChunks = (): MidiImportAutoCommitResult | null => {
      for (const [chunkIndex, chunkText] of automation.chunkTexts.entries()) {
        const lastSection =
          controller.getSnapshot().sections[
            controller.getSnapshot().sections.length - 1
          ];
        const target =
          chunkIndex === 0 || lastSection === undefined
            ? ({ kind: "document-end" } as const)
            : ({ kind: "section-end", sectionId: lastSection.id } as const);
        const previewStatus = controller.previewChartText(chunkText);
        const staged = controller.setQuickEntryDraft(
          chunkText,
          target,
          previewStatus.status,
          previewStatus.issueCodes,
        );
        const inserted = staged.ok
          ? controller.applyQuickEntryPreview()
          : staged;
        if (!staged.ok || !inserted.ok) {
          return rollBack({
            step: "insert",
            outcome: "refused",
            reason: staged.ok
              ? "The chart refused this piece of the import."
              : "The import text could not be staged.",
          });
        }
        issuedCount += 1;
        steps.push({ step: "insert", outcome: "applied", reason: null });
      }
      return null;
    };

    /* Settings transfer per the frozen truth table. */
    const withheld = (
      step: MidiImportEnvelopeStep["step"],
      reason: string,
    ): void => {
      steps.push({ step, outcome: "withheld", reason });
    };
    const issue = (
      step: MidiImportEnvelopeStep["step"],
      run: () => StudioControllerActionResult,
    ): boolean => {
      const result = run();
      if (!result.ok) {
        return false;
      }
      if (result.outcome === "ephemeral-updated") {
        steps.push({ step, outcome: "unchanged", reason: null });
        return true;
      }
      issuedCount += 1;
      steps.push({ step, outcome: "applied", reason: null });
      return true;
    };

    const tempoBpm = Math.round(
      60_000_000 / automation.initialTempoMicroseconds,
    );
    const applyStarterSettings = (): MidiImportAutoCommitResult | null => {
      if (before.tempoBpm === tempoBpm) {
        steps.push({ step: "tempo", outcome: "unchanged", reason: null });
      } else if (!issue("tempo", () => controller.setTempo(tempoBpm))) {
        return rollBack({
          step: "tempo",
          outcome: "refused",
          reason: "The file's tempo could not be applied.",
        });
      }
      if (
        !issue("meter", () =>
          controller.setMeter(
            automation.initialMeter.numerator,
            automation.initialMeter.beatUnit,
          ),
        )
      ) {
        return rollBack({
          step: "meter",
          outcome: "refused",
          reason: "The file's meter could not be applied.",
        });
      }
      const keySpelled = automation.keySpelled;
      const key = automation.key;
      if (key !== null && keySpelled !== null) {
        if (
          !issue("key", () =>
            controller.setKey({
              step: keySpelled.step,
              alter: keySpelled.alter,
              /*
               * The M1 inference speaks in plain major/minor; the domain key
               * vocabulary spells minor as natural-minor, the mode the mass
               * profile actually measured.
               */
              mode: key.mode === "minor" ? "natural-minor" : "major",
            }),
          )
        ) {
          return rollBack({
            step: "key",
            outcome: "refused",
            reason: "The inferred key could not be applied.",
          });
        }
      } else {
        withheld("key", "No key could be inferred from this file.");
      }
      const title = sectionNameFor(preview.fileName);
      if (before.title === title) {
        steps.push({ step: "title", outcome: "unchanged", reason: null });
      } else if (!issue("title", () => controller.setTitle(title))) {
        return rollBack({
          step: "title",
          outcome: "refused",
          reason: "The file's name could not become the title.",
        });
      }
      return null;
    };

    /*
     * Destination-dependent order (M1-ENV amendment #1, jcpe-9m5q): a
     * STARTER destination applies the file's settings BEFORE the insert —
     * the meter law locks the meter the moment any chord exists, so the
     * old insert-first order made every non-4/4 file roll back at the
     * meter step, and the truth table's "starter: meter applied" promise
     * was unsatisfiable. Settings-first also means the fragment parses
     * under the file's own meter, which is what its bars measure. An
     * occupied destination keeps insert-first: every setting is withheld
     * there, so the order question does not arise.
     */
    if (starter) {
      const settingsFailure = applyStarterSettings();
      if (settingsFailure !== null) return settingsFailure;
      const insertFailure = insertChunks();
      if (insertFailure !== null) return insertFailure;
    } else {
      const insertFailure = insertChunks();
      if (insertFailure !== null) return insertFailure;
      withheld(
        "tempo",
        "This chart already has content, so its tempo was kept.",
      );
      withheld(
        "meter",
        "This chart already has content, so its meter was kept.",
      );
      withheld("key", "This chart already has content, so its key was kept.");
      withheld(
        "title",
        "This chart already has content, so its title was kept.",
      );
    }

    /* Groove last: never override an explicit choice on an occupied chart. */
    if (starter || documentGrooveIsDefault) {
      if (
        !issue("groove", () =>
          controller.setPerformanceStyle(automation.groove.grooveStyleId),
        )
      ) {
        return rollBack({
          step: "groove",
          outcome: "refused",
          reason: "The matched groove could not be applied.",
        });
      }
    } else {
      withheld(
        "groove",
        "You chose this chart's groove yourself, so it was kept.",
      );
    }

    return Object.freeze({
      committed: true,
      reason: "committed" as const,
      steps: Object.freeze(steps),
      undoCount: issuedCount,
      rolledBackCount: 0,
    });
  };

  const replanWithOverrides = (
    preview: MidiImportPreview,
    overrides: M1ImportOverrides,
  ): MidiImportPreview => {
    const decoded = preview.decoded;
    if (decoded === null) return preview;
    const automationResult = planAutomationImport(
      decoded,
      preview.fileName,
      overrides,
    );
    /*
     * The decode and salvage stages describe the retained bytes and are
     * carried forward verbatim; every later stage restates the overridden
     * pipeline run.
     */
    const serviceRecords = preview.trace.records.filter(
      (record) => record.stage === "decode" || record.stage === "salvage",
    );
    return Object.freeze({
      ...preview,
      automation: automationResult.ok ? automationResult.plan : null,
      automationRefusal: automationResult.ok
        ? null
        : automationResult.refusal.code,
      trace: completeImportTrace([
        ...serviceRecords,
        ...(automationResult.ok
          ? automationResult.plan.trace
          : (automationResult.trace ?? [])),
      ]),
    });
  };

  return Object.freeze({
    readFile,
    commit,
    commitAutomatic,
    replanWithOverrides,
  });
}

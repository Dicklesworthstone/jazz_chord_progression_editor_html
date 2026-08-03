import {
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_REQUEST_SCHEMA,
  MIDI_IMPORT_SECTION_NAME,
  createMidiImportOperations,
  describeMidiImportSonorities,
  planMidiImportChart,
  type MidiImportChartPlan,
  type MidiImportChartSonority,
  type MidiImportRefusal,
  type MidiImportValue,
  type SmfDecodeFrame,
} from "../export";
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

export type StudioMidiImportService = Readonly<{
  /** Decodes local file bytes into a preview. Never throws on hostile bytes. */
  readFile: (fileName: string, bytes: Uint8Array) => Promise<MidiImportPreview>;
  /** Lands a preview as one undoable edit. */
  commit: (
    controller: StudioController,
    preview: MidiImportPreview,
  ) => MidiImportCommitResult;
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
    const result = operations.decodeSmf({
      schema: MIDI_IMPORT_REQUEST_SCHEMA,
      requestId: requestIdFor(ordinal),
      readerId: MIDI_IMPORT_READER_ID,
      readerVersion: MIDI_IMPORT_READER_VERSION,
      bytes,
    });
    if (!result.ok) {
      return Object.freeze({
        fileName,
        byteLength: bytes.byteLength,
        decoded: null,
        refusal: result.refusal,
        plan: null,
        sonorities: Object.freeze([]),
        blockedReason: null,
      });
    }
    const plan = planMidiImportChart(result.value, sectionNameFor(fileName));
    return Object.freeze({
      fileName,
      byteLength: bytes.byteLength,
      decoded: result.value,
      refusal: null,
      plan,
      sonorities:
        plan === null ? describeMidiImportSonorities(result.value) : plan.sonorities,
      blockedReason: blockedReasonFor(plan),
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

  return Object.freeze({ readFile, commit });
}

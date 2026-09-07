import {
  decodeDocumentShape, makeAutoVoicing, makeChordEvent, makeFrozenVoicing,
  makeManualVoicing, makeSpelledPitch, makeChordSpec,
  type AutoVoicing, type AutoVoicingInput, type ChordEvent, type FrozenVoicing,
  type NonEmptySpelledPitches, type SpelledPitch, type SpelledPitchInput, type StoredBassPolicy,
  type ValidatedDocument, type Voicing,
  type ChordSpec, type ChordSpecInput,
} from "../domain";
import { formatChordSymbol, parseChordSymbol, VOICING_ENGINE_VERSION_TAG, type VoicingCandidate } from "../theory";
import type { AppState } from "./application-state-contract";
import { validateDocumentSemantics } from "./document-validation";
import { projectChordInspectorViewModel } from "./chord-inspector";
import type { ChordInspectorViewModel } from "./u2-chord-inspector-contract";
import { buildStudioRealizations } from "./studio-realization";

export type StudioInspectorSource = Readonly<{
  documentId: string;
  eventId: string;
  revision: number;
}>;

export type StudioInspectorResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: string; message: string }>;

export type StudioInspectorChoice = Readonly<{
  id: string;
  label: string;
  policy: AutoVoicing;
  pitches: NonEmptySpelledPitches;
  generatedBy: FrozenVoicing["generatedBy"];
  current: boolean;
}>;

export type StudioInspectorView = Readonly<{
  source: StudioInspectorSource;
  event: ChordEvent;
  detail: ChordInspectorViewModel;
  choices: readonly StudioInspectorChoice[];
  unavailableChoices: readonly Readonly<{ family: string; code: string; message: string }>[];
}>;

export type StudioInspectorChange =
  | Readonly<{ kind: "auto"; policy: AutoVoicingInput; confirmed: boolean }>
  | Readonly<{ kind: "freeze"; choice: StudioInspectorChoice; confirmed: boolean }>
  | Readonly<{ kind: "manual"; pitches: readonly SpelledPitchInput[]; bassPolicy: StoredBassPolicy }>
  | Readonly<{ kind: "symbol"; text: string; confirmed: boolean }>
  | Readonly<{ kind: "annotation"; text: string }>
  | Readonly<{ kind: "duration"; text: string; reason: string }>;

export type StudioInspectorPreview = Readonly<{ hold?: boolean }> & (
  | Readonly<{ kind: "current" }>
  | Readonly<{ kind: "symbol"; text: string }>
  | Readonly<{ kind: "choice"; choice: StudioInspectorChoice }>
  | Readonly<{ kind: "manual"; pitches: readonly SpelledPitchInput[]; bassPolicy: StoredBassPolicy }>);

export type StudioInspectorStructurePatch = Partial<Pick<ChordSpecInput,
  "root" | "bass" | "triad" | "seventh" | "sixth" | "additions" | "alterations" | "extensions" | "omissions" | "colorPolicy">>;
export type StudioInspectorSymbolDraft = Readonly<{ text: string; chord: ChordSpec | null; detail: ChordInspectorViewModel }>;
type PreparedInspectorSymbol = Readonly<{ event: ChordEvent; document: ValidatedDocument }>;

// One last draft per immutable chart. Reusing its F2/F3 document also reuses
// the existing document-identity V2 memo for display, Hear and Apply checks.
// Replacing this entry releases the previous draft; keys are weakly held.
const SYMBOL_DRAFT_MEMO = new WeakMap<ValidatedDocument,
  Readonly<{ eventId: string; text: string; value: PreparedInspectorSymbol }>>();

/** Structured controls edit the parsed AST, then T0 alone spells the new source. */
export function readInspectorSymbolDraft(state: AppState, source: StudioInspectorSource,
  text: string, patch?: StudioInspectorStructurePatch, realize = true): StudioInspectorResult<StudioInspectorSymbolDraft> {
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  if (Array.from(text).length > 256) return refused("u2.invalid_symbol_syntax", "Keep the symbol within 256 code points. Your draft is unchanged.");
  let parsed = parseChordSymbol(text, "ascii");
  if (patch !== undefined) {
    if (!parsed.ok || (selected.value.chord.kind === "custom" && text === selected.value.chord.sourceText))
      return refused("u2.custom_structure_unavailable", "Enter an explicit recognized symbol before using structured controls.");
    const changed = makeChordSpec({ ...parsed.chord, ...patch });
    if (!changed.ok) return refused(changed.refusal.code, "These explicit modifiers conflict. The symbol draft is unchanged.");
    const formatted = formatChordSymbol(changed.value, "ascii");
    if (!formatted.ok) return refused(formatted.diagnostics[0].code, "These modifiers cannot be represented by the chord grammar.");
    text = formatted.canonicalText;
    parsed = parseChordSymbol(text, "ascii");
  }
  const selectedState = { ...state, bookmarks: { ...state.bookmarks,
    selection: { kind: "events", anchorEventId: selected.value.id, focusEventId: selected.value.id, eventIds: [selected.value.id] },
  } } as const;
  let detail: ChordInspectorViewModel;
  if (text === selected.value.chord.sourceText) {
    detail = projectChordInspectorViewModel(selectedState);
  } else if (!realize) {
    detail = projectChordInspectorViewModel(selectedState, { draftSymbolText: text, draftRealizationFailure: {
      code: "u2.draft_not_realized", message: "Press Hear symbol draft to audition these changes.",
    } });
  } else {
    const provisional = prepareInspectorSymbolDocument(state, source, text, true);
    if (provisional.ok) {
      const projected = projectChordInspectorViewModel({ ...selectedState, document: provisional.value.document });
      detail = Object.freeze({ ...projected, symbol: Object.freeze({ ...projected.symbol,
        sourceText: selected.value.chord.sourceText, draftText: text, isDirty: true }) });
    } else {
      detail = projectChordInspectorViewModel(selectedState, { draftSymbolText: text,
        draftRealizationFailure: { code: provisional.code, message: provisional.message } });
    }
  }
  return Object.freeze({ ok: true, value: Object.freeze({ text,
    chord: parsed.ok && !(selected.value.chord.kind === "custom" && text === selected.value.chord.sourceText) ? parsed.chord : null, detail }) });
}

/** Exact note drafts use the same publication boundary as Apply, without writes. */
export function readInspectorManualDraft(state: AppState, source: StudioInspectorSource,
  pitches: readonly SpelledPitchInput[], bassPolicy: StoredBassPolicy): StudioInspectorResult<ChordInspectorViewModel> {
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  const manual = prepareInspectorManual(state, source, pitches, bassPolicy);
  if (!manual.ok) return manual;
  const provisional = replaceVoicing(state.document, selected.value, manual.value);
  if (!provisional.ok) return provisional;
  return Object.freeze({ ok: true, value: projectChordInspectorViewModel({ ...state, document: provisional.value,
    bookmarks: { ...state.bookmarks, selection: { kind: "events", anchorEventId: selected.value.id,
      focusEventId: selected.value.id, eventIds: [selected.value.id] } } }, { includeMotion: false }) });
}

function refused(code: string, message: string): StudioInspectorResult<never> {
  return Object.freeze({ ok: false, code, message });
}

export function inspectorSourceEvent(state: AppState, source: StudioInspectorSource): StudioInspectorResult<ChordEvent> {
  if (source.documentId !== state.document.id || source.revision !== state.revision)
    return refused("u2.stale_source", "The chart changed. Keep your draft, then reopen this chord before applying it.");
  for (const section of state.document.sections) for (const measure of section.measures)
    for (const event of measure.events) if (event.id === source.eventId) return Object.freeze({ ok: true, value: event });
  return refused("u2.no_selected_chord", "This chord is no longer in the chart.");
}

/** A provisional document crosses the same F2/F3 boundary as a real edit. */
function replaceVoicing(document: ValidatedDocument, event: ChordEvent, voicing: Voicing): StudioInspectorResult<ValidatedDocument> {
  const replacement = makeChordEvent({ ...event, voicing });
  if (!replacement.ok) return refused(replacement.refusal.code, "These settings conflict with the chord's exact bass or voicing policy.");
  return replaceInspectorEvent(document, replacement.value);
}

function replaceInspectorEvent(document: ValidatedDocument, event: ChordEvent): StudioInspectorResult<ValidatedDocument> {
  const decoded = decodeDocumentShape({
    ...document,
    sections: document.sections.map(section => ({ ...section,
      measures: section.measures.map(measure => ({ ...measure,
        events: measure.events.map(current => current.id === event.id ? event : current),
      })),
    })),
  });
  if (!decoded.ok) return refused(decoded.errors[0].code, "These settings do not form a valid voicing.");
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) return refused(published.errors[0].code, "These notes or settings do not realize the chord. Your chart is unchanged.");
  return Object.freeze({ ok: true, value: published.value });
}

function selectedCandidate(document: ValidatedDocument, event: ChordEvent): StudioInspectorResult<VoicingCandidate> {
  const realized = buildStudioRealizations(document);
  if (!realized.ok) return refused(realized.refusal.code, realized.refusal.message);
  const binding = realized.realizations.get(event.id);
  if (binding?.kind !== "generated") return refused("u2.no_generated_voicing", "There is no generated voicing for this chord.");
  if (!binding.outcome.ok) return refused(binding.outcome.refusal.code, "This family and range cannot realize the chord's degrees.");
  return Object.freeze({ ok: true, value: binding.outcome.candidate });
}

/** Stable policy identity; exact notes are obtained from the chart's real V2 selection. */
function choiceId(policy: AutoVoicing): string {
  return `${policy.family}:${String(policy.voiceCount)}:${String(policy.range.lowMidi)}:${String(policy.range.highMidi)}:${policy.bassPolicy}`;
}

function choice(policy: AutoVoicing, candidate: VoicingCandidate, current: boolean): StudioInspectorChoice {
  return Object.freeze({ id: choiceId(policy),
    label: `${policy.family} · ${String(policy.voiceCount)} notes`, policy,
    pitches: candidate.pitches,
    generatedBy: Object.freeze({ engineVersion: VOICING_ENGINE_VERSION_TAG, family: candidate.family }),
    current,
  });
}

export function prepareInspectorAuto(
  state: AppState, source: StudioInspectorSource, input: AutoVoicingInput, confirmed: boolean,
): StudioInspectorResult<AutoVoicing> {
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  if (selected.value.chord.kind === "custom") return refused("custom.auto_voicing_forbidden", "Custom chords keep exact notes. Explicitly change the symbol before choosing Auto.");
  if (selected.value.voicing.mode !== "auto" && !confirmed)
    return refused("u2.mode_switch_requires_confirmation", "Confirm replacing the stored notes with these Auto settings. Undo will restore them.");
  const made = makeAutoVoicing(input, selected.value.chord.bass);
  if (!made.ok) return refused(made.refusal.code, "Choose a valid family, note count, MIDI range and bass policy.");
  return Object.freeze({ ok: true, value: made.value });
}

/** At most three initial policies; an explicit advanced proposal adds one. */
export function readStudioInspector(
  state: AppState, eventId: string, advancedPolicy?: AutoVoicingInput,
): StudioInspectorResult<StudioInspectorView> {
  const source = Object.freeze({ documentId: state.document.id, eventId, revision: state.revision });
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  const event = selected.value;
  const detail = projectChordInspectorViewModel({ ...state, bookmarks: { ...state.bookmarks,
    selection: { kind: "events", anchorEventId: event.id, focusEventId: event.id, eventIds: [event.id] },
  } });
  const proposals = readInspectorChoices(state, source, event, advancedPolicy);
  return Object.freeze({ ok: true, value: Object.freeze({ source, event, detail, ...proposals }) });
}

/** Menu reads realize all proposals; Keep realizes only the requested identity.
 * Policy order, deduplication, exact V2 selection and refusal semantics are shared.
 * In particular, caller-supplied pitches/provenance never enter the result.
 */
function readInspectorChoices(state: AppState, source: StudioInspectorSource, event: ChordEvent,
  advancedPolicy?: AutoVoicingInput, onlyChoiceId?: string): Pick<StudioInspectorView, "choices" | "unavailableChoices"> {
  const choices: StudioInspectorChoice[] = [];
  const unavailableChoices: { family: string; code: string; message: string }[] = [];
  if (event.chord.kind === "parsed") {
    const current = event.voicing.mode === "auto" ? event.voicing : null;
    // These are explicit proposed settings, never recovered/discarded Auto metadata.
    const defaultPolicy: AutoVoicingInput = current ?? { mode: "auto", family: "balanced", voiceCount: 4,
      range: { lowMidi: 48, highMidi: 84 }, bassPolicy: "generated" };
    const proposals: AutoVoicingInput[] = [];
    if (current !== null) proposals.push(current);
    proposals.push({ ...defaultPolicy, family: "balanced" });
    proposals.push({ ...defaultPolicy, family: "shell", voiceCount: 3 });
    if (advancedPolicy !== undefined) proposals.push(advancedPolicy);
    const seen = new Set<string>();
    for (const proposal of proposals) {
      const prepared = prepareInspectorAuto(state, source, proposal, true);
      if (!prepared.ok) { unavailableChoices.push({ family: proposal.family, code: prepared.code, message: prepared.message }); continue; }
      const policy = prepared.value, id = choiceId(policy);
      if (seen.has(id) || (onlyChoiceId !== undefined && id !== onlyChoiceId)) continue;
      seen.add(id);
      const isCurrent = current !== null && id === choiceId(current);
      const provisional = isCurrent ? { ok: true as const, value: state.document } : replaceVoicing(state.document, event, policy);
      if (!provisional.ok) { unavailableChoices.push({ family: policy.family, code: provisional.code, message: provisional.message }); continue; }
      const candidate = selectedCandidate(provisional.value, event);
      if (!candidate.ok) { unavailableChoices.push({ family: policy.family, code: candidate.code, message: candidate.message }); continue; }
      choices.push(choice(policy, candidate.value, isCurrent));
    }
  }
  return Object.freeze({ choices: Object.freeze(choices), unavailableChoices: Object.freeze(unavailableChoices) });
}

/** Apply must be able to deliver the policy's actual notes at this exact revision. */
export function prepareInspectorAutoChange(
  state: AppState, source: StudioInspectorSource, input: AutoVoicingInput, confirmed: boolean,
): StudioInspectorResult<Voicing> {
  const prepared = prepareInspectorAuto(state, source, input, confirmed);
  if (!prepared.ok) return prepared;
  const event = inspectorSourceEvent(state, source);
  if (!event.ok) return event;
  const provisional = replaceVoicing(state.document, event.value, prepared.value);
  if (!provisional.ok) return provisional;
  const candidate = selectedCandidate(provisional.value, event.value);
  if (!candidate.ok) return candidate;
  return prepared;
}

export function prepareInspectorFrozen(
  state: AppState, source: StudioInspectorSource, selectedChoice: StudioInspectorChoice, confirmed = false,
): StudioInspectorResult<Voicing> {
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  if (selected.value.voicing.mode !== "auto" && !confirmed)
    return refused("u2.mode_switch_requires_confirmation", "Confirm replacing the stored notes with this generated voicing. Undo will restore them.");
  // Recreate the policy against the unchanged chart instead of trusting caller-supplied notes/provenance.
  const proposals = readInspectorChoices(state, source, selected.value, selectedChoice.policy, selectedChoice.id);
  const fresh = proposals.choices.find(candidate => candidate.id === selectedChoice.id);
  if (!fresh) return refused("u2.stale_choice", "This choice can no longer be realized. Your chart is unchanged.");
  const bassPolicy = fresh.policy.bassPolicy === "external" && selected.value.chord.bass !== null ? "external" : "included";
  const frozen = makeFrozenVoicing({ mode: "frozen", pitches: fresh.pitches, bassPolicy, generatedBy: fresh.generatedBy }, selected.value.chord.bass);
  if (!frozen.ok) return refused(frozen.refusal.code, "These exact notes cannot be kept under the chord's bass policy.");
  return Object.freeze({ ok: true, value: frozen.value });
}

export function prepareInspectorManual(
  state: AppState, source: StudioInspectorSource, inputs: readonly SpelledPitchInput[], bassPolicy: StoredBassPolicy,
): StudioInspectorResult<Voicing> {
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  if (inputs.length === 0 || inputs.length > 16)
    return refused("u2.manual_pitch_count", "Keep one to 16 exact notes. The draft has not been changed.");
  const pitches: SpelledPitch[] = [];
  for (const input of inputs) {
    const made = makeSpelledPitch(input);
    if (!made.ok) return refused(made.refusal.code, "Enter a valid spelled note and octave; the draft has not been changed.");
    pitches.push(made.value);
  }
  const manual = makeManualVoicing({ mode: "manual", pitches, bassPolicy }, selected.value.chord.bass);
  if (!manual.ok) return refused(manual.refusal.code, "Keep one to 16 exact notes and a bass policy consistent with the chord.");
  // F2/F3 additionally enforce playable MIDI and formula compatibility.
  const provisional = replaceVoicing(state.document, selected.value, manual.value);
  if (!provisional.ok) return provisional;
  return Object.freeze({ ok: true, value: manual.value });
}

export function prepareInspectorSymbol(
  state: AppState, source: StudioInspectorSource, text: string, confirmStoredNotes: boolean,
): StudioInspectorResult<ChordEvent> {
  const provisional = prepareInspectorSymbolDocument(state, source, text, confirmStoredNotes);
  if (!provisional.ok) return provisional;
  const { event, document } = provisional.value;
  if (event.voicing.mode === "auto") {
    const candidate = selectedCandidate(document, event);
    if (!candidate.ok) return candidate;
  }
  return Object.freeze({ ok: true, value: event });
}

/** Preserve one validated draft identity so projection and motion share its V2 realization. */
function prepareInspectorSymbolDocument(
  state: AppState, source: StudioInspectorSource, text: string, confirmStoredNotes: boolean,
): StudioInspectorResult<PreparedInspectorSymbol> {
  const selected = inspectorSourceEvent(state, source);
  if (!selected.ok) return selected;
  if (Array.from(text).length > 256) return refused("u2.invalid_symbol_syntax", "Keep the symbol within 256 code points. Your draft is unchanged.");
  if (selected.value.voicing.mode !== "auto" && !confirmStoredNotes)
    return refused("u2.mode_switch_requires_confirmation", "Confirm retaining the exact stored notes with the edited symbol.");
  const memoized = SYMBOL_DRAFT_MEMO.get(state.document);
  if (memoized?.eventId === selected.value.id && memoized.text === text)
    return Object.freeze({ ok: true, value: memoized.value });
  const parsed = parseChordSymbol(text, "ascii");
  if (!parsed.ok) return refused("u2.invalid_symbol_syntax", "Correct the symbol before applying it. The original chord is unchanged.");
  const made = makeChordEvent({ ...selected.value, chord: parsed.chord });
  if (!made.ok) return refused(made.refusal.code, "The edited symbol and current voicing are incompatible; choose explicit new settings.");
  const provisional = replaceInspectorEvent(state.document, made.value);
  if (!provisional.ok) return provisional;
  const value = Object.freeze({ event: made.value, document: provisional.value });
  SYMBOL_DRAFT_MEMO.set(state.document, Object.freeze({ eventId: selected.value.id, text, value }));
  return Object.freeze({ ok: true, value });
}

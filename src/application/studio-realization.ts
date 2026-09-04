/**
 * The document-to-realization bridge: the one genuinely missing production
 * component between a chart and a sound.
 *
 * P0's plan compiler needs a `PlaybackRealizationMap` — one binding per chord
 * event saying which concrete pitches that chord sounds. Manual and Frozen
 * voicings already carry their pitches and bypass generation entirely. Auto
 * voicings carry only a policy (family, voice count, range, bass policy), so
 * they must be resolved through T1, realized through V0, and — because a
 * progression is not a bag of isolated chords — selected across the chart by
 * the V2 progression optimizer before P0 can place a single tick.
 *
 * Every other link in the chain existed and was proved in isolation; nothing
 * assembled this one, which is why the studio could edit a chart it could never
 * play. This module makes no musical decision of its own beyond the ones it
 * states below, and it never invents a refusal that a downstream package
 * already owns.
 */
import type { ChordEventId, ValidatedDocument } from "../domain";
import {
  PLAYBACK_PLAN_REALIZATION_SCHEMA,
  type PlaybackRealizationBinding,
  type PlaybackRealizationMap,
} from "../playback";
import {
  PROGRESSION_COST_POLICY_ID,
  PROGRESSION_CONTINUITY_COST_POLICY_VERSION,
  PROGRESSION_EVENT_SCHEMA,
  PROGRESSION_OPTIMIZER_ENGINE_ID,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
  PROGRESSION_SEARCH_POLICY_ID,
  PROGRESSION_SEARCH_POLICY_VERSION,
  PROGRESSION_TIE_BREAK_POLICY_ID,
  PROGRESSION_TIE_BREAK_POLICY_VERSION,
  MAX_PROGRESSION_REQUEST_ID_ASCII_LENGTH,
  VOICING_REQUEST_SCHEMA,
  advanceProgressionOptimization,
  assignVoiceTransition,
  initializeProgressionOptimization,
  initializeVoiceFrame,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
  type GeneratedVoicingCandidates,
  type ProgressionEvent,
  type ProgressionEventConstraints,
  type ProgressionOptimizationRequest,
  type SemanticRealization,
  type VoiceAssignmentOperations,
  type VoicingCandidate,
  type VoicingCandidateId,
} from "../theory";
import { candidateVoiceFrame, storedVoiceFrame } from "./studio-voicing-frames";

export type StudioRealizationRefusal = Readonly<{
  /** The chord that could not be resolved, or null for a document-level failure. */
  eventId: ChordEventId | null;
  code: string;
  message: string;
}>;

export type StudioRealizationResult =
  | Readonly<{ ok: true; realizations: PlaybackRealizationMap }>
  | Readonly<{ ok: false; refusal: StudioRealizationRefusal }>;

/**
 * The fixed optimization work budget. A quantum is V2's own deterministic
 * work unit (one full worst-case beam layer), so this bounds ~2,000 chart
 * events — far beyond any playable chart — without ever consulting a clock.
 * A chart that exhausts it degrades to per-chord selection, never to silence.
 */
const STUDIO_PROGRESSION_MAX_WORK_QUANTA = 2_048;

/** V1 transition oracle for V2: the real production operations, injected. */
const VOICE_OPERATIONS: VoiceAssignmentOperations = Object.freeze({
  initializeVoiceFrame,
  assignVoiceTransition,
});

const NO_CONSTRAINTS: ProgressionEventConstraints = Object.freeze({
  families: null,
  range: null,
  bassRange: null,
  locks: Object.freeze([] as const),
});

/** One auto-voiced event awaiting its cross-chord candidate selection. */
type PendingAutoBinding = Readonly<{
  eventId: ChordEventId;
  request: AutoVoicingRequest;
  generated: GeneratedVoicingCandidates;
}>;

/**
 * The optimizer request id must be deterministic — same document, same
 * request — and fit V2's id alphabet, which is narrower than the stable-id
 * alphabet, so the document id is transliterated rather than trusted.
 */
function studioRequestId(document: ValidatedDocument): string {
  return `studio-realization-${document.id}`
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, MAX_PROGRESSION_REQUEST_ID_ASCII_LENGTH);
}

/**
 * Run the V2 progression optimizer over the chain and return the selected
 * candidate id per event, or null when no complete selection exists — an
 * initialization refusal, an unfinished/cancelled/no-realization outcome, or
 * a stepping refusal. Null means the caller falls back to each event's first
 * retained candidate; optimization may degrade playback voicing choices but
 * must never block playback, so no refusal escapes this function.
 */
function optimizeSelections(
  document: ValidatedDocument,
  events: readonly ProgressionEvent[],
): ReadonlyMap<ChordEventId, VoicingCandidateId> | null {
  const request: ProgressionOptimizationRequest = Object.freeze({
    schema: PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
    identity: Object.freeze({
      requestId: studioRequestId(document),
      documentId: document.id,
      /*
       * The published document carries no revision counter; selection depends
       * only on document content, so a constant revision keeps the identity
       * deterministic without inventing a lineage the document does not have.
       */
      sourceRevision: 0,
      engineId: PROGRESSION_OPTIMIZER_ENGINE_ID,
      engineVersion: PROGRESSION_OPTIMIZER_ENGINE_VERSION,
      costPolicyId: PROGRESSION_COST_POLICY_ID,
      costPolicyVersion: PROGRESSION_CONTINUITY_COST_POLICY_VERSION,
      searchPolicyId: PROGRESSION_SEARCH_POLICY_ID,
      searchPolicyVersion: PROGRESSION_SEARCH_POLICY_VERSION,
      tieBreakPolicyId: PROGRESSION_TIE_BREAK_POLICY_ID,
      tieBreakPolicyVersion: PROGRESSION_TIE_BREAK_POLICY_VERSION,
    }),
    loopClosure: false,
    maxWorkQuanta: STUDIO_PROGRESSION_MAX_WORK_QUANTA,
    events,
  });

  const initialized = initializeProgressionOptimization(
    request,
    VOICE_OPERATIONS,
  );
  if (!initialized.ok) return null;

  let state = initialized.value;
  let advances = 0;
  while (state.status === "running") {
    advances += 1;
    // Each advance consumes exactly one quantum, so this guard is
    // unreachable under V2's own termination law; it exists so a defect
    // there could still never trap playback in a loop.
    if (advances > STUDIO_PROGRESSION_MAX_WORK_QUANTA + 8) return null;
    const advanced = advanceProgressionOptimization(state, VOICE_OPERATIONS);
    if (!advanced.ok) return null;
    state = advanced.value;
  }

  const outcome = state.outcome;
  if (outcome === null || outcome.kind !== "optimized") return null;

  const selections = new Map<ChordEventId, VoicingCandidateId>();
  for (const segment of outcome.segments) {
    // Index 0 is the selected realization; the rest are ranked alternatives.
    const selected = segment.realizations[0];
    if (!selected) continue;
    selected.eventIds.forEach((eventId, index) => {
      const candidateId = selected.candidateIds[index];
      if (candidateId !== undefined) selections.set(eventId, candidateId);
    });
  }
  return selections;
}

/**
 * Build one realization binding per chord event, in document order.
 *
 * Three cases, and only the second involves a choice:
 *
 * 1. Manual or Frozen voicing — the stored pitches are authoritative and are
 *    never regenerated, which is the entire point of those two modes. V0's
 *    stored bypass is used so the binding records that no candidate generation
 *    happened. When the stored pitches form a legal V1 frame the event also
 *    anchors the optimizer's chain as an immutable fixed event, so its
 *    neighbors voice-lead toward the pitches that will actually sound.
 *
 * 2. Auto voicing over a parsed chord — resolved through T1, realized through
 *    V0, then selected by the V2 progression optimizer, which minimizes the
 *    explicit continuity voice-leading cost across the whole chain (chains
 *    reset at section boundaries marked "reset"). When optimization cannot
 *    produce a complete selection — a refused request, an unfinished or
 *    no-realization outcome — every auto event falls back to V0's first
 *    retained candidate, deterministically and silently: a worse voicing is
 *    a musical judgment, an unplayable chart is a defect, and optimization
 *    is never allowed to convert the former into the latter.
 *
 * 3. Auto voicing over a custom chord — deliberately left unbound. A custom
 *    chord has literal pitch names rather than a resolvable symbol, so V0
 *    cannot generate for it. P0 already owns that refusal
 *    (`playback.custom_voicing_missing`) and will raise it against the missing
 *    binding; duplicating the law here would let the two disagree.
 *
 * A chord that fails to resolve refuses the whole build rather than yielding a
 * partial map, because playing a progression with a chord silently missing
 * would be a musical lie.
 */
export function buildStudioRealizations(
  document: ValidatedDocument,
): StudioRealizationResult {
  const memoized = REALIZATION_MEMO.get(document);
  if (memoized !== undefined) return memoized;
  const built = realizeDocument(document);
  REALIZATION_MEMO.set(document, built);
  return built;
}

/**
 * Realization memo, keyed by the document object itself.
 *
 * Selecting candidates across a chart costs hundreds of milliseconds of main
 * thread — V2 expands one beam layer per chord over up to twenty-four V0
 * candidates, calling the real V1 transition oracle for each pair — and the
 * controller compiles a fresh plan on every Play AND every chord click. Held
 * literally, that made clicking a chord in the ten-chord starter chart block
 * the page for ~0.7 s before a note sounded.
 *
 * The key is the document object, not its id or a revision counter, and that
 * is the whole safety argument: a `ValidatedDocument` is deeply frozen and
 * every edit publishes a new one, so identical keys mean byte-identical
 * input to a pure function. An id-and-revision key would be weaker in both
 * directions — it could collide across two documents that share an id, and
 * it would make the determinism proof tautological by answering the second
 * build from the first build's cache. Entries are weakly held, so a
 * superseded document's realizations are collected with it.
 */
const REALIZATION_MEMO = new WeakMap<
  ValidatedDocument,
  StudioRealizationResult
>();

function realizeDocument(document: ValidatedDocument): StudioRealizationResult {
  const realizations = new Map<ChordEventId, PlaybackRealizationBinding>();
  const pending: PendingAutoBinding[] = [];
  const chain: ProgressionEvent[] = [];
  // True when the previous document event could not join the chain, so the
  // next chain event must start a fresh voice-leading run.
  let chainBroken = false;

  for (const section of document.sections) {
    let sectionStart = true;
    for (const measure of section.measures) {
      for (const event of measure.events) {
        const voicing = event.voicing;
        const resetHere =
          chain.length === 0 ||
          chainBroken ||
          (sectionStart && section.voiceLeadingBoundary === "reset");
        sectionStart = false;

        if (voicing.mode === "manual" || voicing.mode === "frozen") {
          const stored = realizeVoicing({
            schema: VOICING_REQUEST_SCHEMA,
            kind: "stored",
            voicing,
          });
          realizations.set(
            event.id,
            Object.freeze({
              schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
              eventId: event.id,
              kind: "stored",
              result: stored.value,
            }),
          );
          const frame = storedVoiceFrame(event.id, voicing);
          if (frame === null) {
            chainBroken = true;
          } else {
            chain.push(
              Object.freeze({
                schema: PROGRESSION_EVENT_SCHEMA,
                kind: "fixed",
                reason: voicing.mode,
                eventId: event.id,
                chainBoundary: resetHere ? "reset" : "continue",
                candidate: frame,
                constraints: NO_CONSTRAINTS,
              }),
            );
            chainBroken = false;
          }
          continue;
        }

        // Case 3: no resolvable symbol, so no generated binding. P0 refuses.
        if (event.chord.kind === "custom") {
          chainBroken = true;
          continue;
        }

        const resolved = resolveChord(event.chord);
        if (!resolved.ok) {
          return Object.freeze({
            ok: false,
            refusal: Object.freeze({
              eventId: event.id,
              code: resolved.refusal.code,
              message:
                "This chord could not be resolved to pitches, so the "
                + "progression cannot be played yet.",
            }),
          });
        }

        const realization: SemanticRealization = resolved.value.realizations[0];
        const request: AutoVoicingRequest = Object.freeze({
          schema: VOICING_REQUEST_SCHEMA,
          kind: "auto",
          resolved: resolved.value,
          realizationId: realization.id,
          policy: voicing,
          quartalContext: null,
        }) as AutoVoicingRequest;

        const generated = realizeVoicing(request);
        if (!generated.ok) {
          realizations.set(
            event.id,
            Object.freeze({
              schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
              eventId: event.id,
              kind: "generated",
              request,
              outcome: generated,
            }),
          );
          chainBroken = true;
          continue;
        }

        pending.push(
          Object.freeze({
            eventId: event.id,
            request,
            generated: generated.value,
          }),
        );
        chain.push(
          Object.freeze({
            schema: PROGRESSION_EVENT_SCHEMA,
            kind: "auto",
            eventId: event.id,
            chainBoundary: resetHere ? "reset" : "continue",
            candidates: generated.value.candidates.map((candidate) =>
              candidateVoiceFrame(event.id, candidate, realization),
            ),
            constraints: NO_CONSTRAINTS,
          }),
        );
        chainBroken = false;
      }
    }
  }

  const selections =
    pending.length > 0 ? optimizeSelections(document, chain) : null;

  for (const entry of pending) {
    const candidates = entry.generated.candidates;
    const selectedId = selections?.get(entry.eventId);
    const selected: VoicingCandidate =
      (selectedId === undefined
        ? undefined
        : candidates.find((candidate) => candidate.id === selectedId)) ??
      candidates[0];
    realizations.set(
      entry.eventId,
      Object.freeze({
        schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
        eventId: entry.eventId,
        kind: "generated",
        request: entry.request,
        outcome: Object.freeze({ ok: true as const, candidate: selected }),
      }),
    );
  }

  return Object.freeze({ ok: true, realizations });
}

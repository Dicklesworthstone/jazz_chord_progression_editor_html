/**
 * The document-to-realization bridge: the one genuinely missing production
 * component between a chart and a sound.
 *
 * P0's plan compiler needs a `PlaybackRealizationMap` — one binding per chord
 * event saying which concrete pitches that chord sounds. Manual and Frozen
 * voicings already carry their pitches and bypass generation entirely. Auto
 * voicings carry only a policy (family, voice count, range, bass policy), so
 * they must be resolved through T1 and realized through V0 before P0 can place
 * a single tick.
 *
 * Every other link in the chain existed and was proved in isolation; nothing
 * assembled this one, which is why the studio could edit a chart it could never
 * play. This module makes no musical decision of its own beyond the one it
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
  VOICING_REQUEST_SCHEMA,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
} from "../theory";

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
 * Build one realization binding per chord event, in document order.
 *
 * Three cases, and only the second involves a choice:
 *
 * 1. Manual or Frozen voicing — the stored pitches are authoritative and are
 *    never regenerated, which is the entire point of those two modes. V0's
 *    stored bypass is used so the binding records that no candidate generation
 *    happened.
 *
 * 2. Auto voicing over a parsed chord — resolved through T1, then realized
 *    through V0. V0 returns its retained candidates in a deterministic ranked
 *    order; without the V2 progression optimizer wired, the first retained
 *    candidate is the selection. That is a real musical decision and it is
 *    stated here rather than hidden: playback voices each chord independently
 *    and does not yet optimize voice leading across the progression.
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
  const realizations = new Map<ChordEventId, PlaybackRealizationBinding>();

  for (const section of document.sections) {
    for (const measure of section.measures) {
      for (const event of measure.events) {
        const voicing = event.voicing;

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
          continue;
        }

        // Case 3: no resolvable symbol, so no generated binding. P0 refuses.
        if (event.chord.kind === "custom") continue;

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

        const request: AutoVoicingRequest = Object.freeze({
          schema: VOICING_REQUEST_SCHEMA,
          kind: "auto",
          resolved: resolved.value,
          realizationId: resolved.value.realizations[0].id,
          policy: voicing,
          quartalContext: null,
        }) as AutoVoicingRequest;

        const generated = realizeVoicing(request);
        realizations.set(
          event.id,
          Object.freeze({
            schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
            eventId: event.id,
            kind: "generated",
            request,
            outcome: generated.ok
              ? Object.freeze({
                  ok: true as const,
                  candidate: generated.value.candidates[0],
                })
              : generated,
          }),
        );
      }
    }
  }

  return Object.freeze({ ok: true, realizations });
}

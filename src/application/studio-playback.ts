/**
 * Document to playback plan, in one call the controller can make.
 *
 * This is the second half of the join that never existed: `studio-realization`
 * turns each chord into concrete pitches, and this turns the realized document
 * into the immutable tick plan that audio and MIDI export both consume. The
 * plan is compiled fresh from the current document rather than cached, because
 * a stale plan is the one thing a transport must never be handed — every A0
 * revision that changes the timeline invalidates it.
 */
import {
  compilePlaybackPlan,
  PLAYBACK_ARTICULATION_POLICY_ID,
  PLAYBACK_ARTICULATION_POLICY_VERSION,
  PLAYBACK_LOOP_POLICY_ID,
  PLAYBACK_LOOP_POLICY_VERSION,
  PLAYBACK_PLAN_COMPILER_ID,
  PLAYBACK_PLAN_COMPILER_VERSION,
  PLAYBACK_PLAN_REQUEST_SCHEMA,
  PLAYBACK_REALIZATION_BINDING_POLICY_ID,
  PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
  PLAYBACK_VELOCITY_POLICY_ID,
  PLAYBACK_VELOCITY_POLICY_VERSION,
  type PlaybackPlan,
} from "../playback";
import type { BeatRange, ValidatedDocument } from "../domain";
import {
  buildStudioRealizations,
  type StudioRealizationRefusal,
} from "./studio-realization";

export type StudioPlaybackRefusal = Readonly<{
  /** The refusal code owned by whichever package refused: V0/T1 or P0. */
  code: string;
  /** One sentence a musician can act on. Never a contract sentence. */
  message: string;
}>;

export type StudioPlaybackCompileResult =
  | Readonly<{ ok: true; plan: PlaybackPlan }>
  | Readonly<{ ok: false; refusal: StudioPlaybackRefusal }>;

function realizationMessage(refusal: StudioRealizationRefusal): string {
  return refusal.message;
}

/**
 * Compile the current document into a playback plan.
 *
 * Refusals are surfaced verbatim from the package that owns them and are never
 * retried: a chord that cannot be voiced is a fact about the chart, not a
 * transient error, and silently dropping it would play a progression the user
 * did not write.
 */
export function compileStudioPlaybackPlan(
  document: ValidatedDocument,
  loop: BeatRange | null = null,
): StudioPlaybackCompileResult {
  const realized = buildStudioRealizations(document);
  if (!realized.ok) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: realized.refusal.code,
        message: realizationMessage(realized.refusal),
      }),
    });
  }

  const compiled = compilePlaybackPlan({
    schema: PLAYBACK_PLAN_REQUEST_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    articulationPolicyId: PLAYBACK_ARTICULATION_POLICY_ID,
    articulationPolicyVersion: PLAYBACK_ARTICULATION_POLICY_VERSION,
    loopPolicyId: PLAYBACK_LOOP_POLICY_ID,
    loopPolicyVersion: PLAYBACK_LOOP_POLICY_VERSION,
    velocityPolicyId: PLAYBACK_VELOCITY_POLICY_ID,
    velocityPolicyVersion: PLAYBACK_VELOCITY_POLICY_VERSION,
    realizationBindingPolicyId: PLAYBACK_REALIZATION_BINDING_POLICY_ID,
    realizationBindingPolicyVersion:
      PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
    document,
    realizedVoicings: realized.realizations,
    loop,
  });

  if (!compiled.ok) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: compiled.refusal.code,
        message:
          compiled.refusal.code === "playback.custom_voicing_missing"
            ? "A chord written as literal pitches needs its own voicing before "
              + "it can be played."
            : "This chart cannot be turned into playback yet.",
      }),
    });
  }

  return Object.freeze({ ok: true, plan: compiled.plan });
}

/** True when the chart has at least one sounding event to play. */
export function studioPlanIsPlayable(plan: PlaybackPlan): boolean {
  return plan.events.length > 0;
}

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
  compilePerformancePlan,
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
  type PerformanceStyleId,
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
 * Name the chord a playback refusal is about. The recovery copy tells the
 * user to fix "the chord the message names", so the message must actually
 * name it: the symbol as they wrote it and the bar it sits in.
 */
function refusedChordLabel(
  document: ValidatedDocument,
  eventId: unknown,
): string | null {
  if (typeof eventId !== "string") return null;
  let barNumber = 0;
  for (const section of document.sections) {
    for (const measure of section.measures) {
      barNumber += 1;
      for (const event of measure.events) {
        if (event.id === eventId) {
          return `“${event.chord.sourceText}” in bar ${String(barNumber)}`;
        }
      }
    }
  }
  return null;
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
    const refusalRecord = compiled.refusal as Readonly<Record<string, unknown>>;
    const chordLabel = refusedChordLabel(document, refusalRecord["eventId"]);
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: compiled.refusal.code,
        message:
          compiled.refusal.code === "playback.custom_voicing_missing"
            ? "A chord written as literal pitches needs its own voicing before "
              + "it can be played."
            : chordLabel === null
              ? "This chart cannot be turned into playback yet."
              : `${chordLabel} cannot be voiced for playback yet.`,
      }),
    });
  }

  return Object.freeze({ ok: true, plan: compiled.plan });
}

/** True when the chart has at least one sounding event to play. */
export function studioPlanIsPlayable(plan: PlaybackPlan): boolean {
  return plan.events.length > 0;
}

/**
 * The default performance style (jcpe-1gao, amended by jcpe-jnnu).
 *
 * The document now carries an optional `playback.grooveStyleId` whose
 * canonical default form is ABSENCE, so this constant is what absence means:
 * the controller derives the active style as the document's stored groove or
 * this default. It must stay equal to the domain's DEFAULT_GROOVE_STYLE_ID;
 * a static law pins the two vocabularies together.
 */
export const STUDIO_PERFORMANCE_STYLE: PerformanceStyleId = "ballad-comp@1";

/**
 * Render a literal P0 plan as the band sketch the transport actually plays.
 *
 * The literal plan remains the chart's source of truth — the chart view and
 * MIDI export keep consuming it — and only the audio path is routed through
 * here. A refusal from the performance layer returns the literal plan
 * unchanged, silently and deterministically: playback existed before this
 * layer did and must never start failing because of it.
 */
export function performStudioPlaybackPlan(
  plan: PlaybackPlan,
  styleId: PerformanceStyleId = STUDIO_PERFORMANCE_STYLE,
): PlaybackPlan {
  const performed = compilePerformancePlan({
    plan,
    styleId,
  });
  if (!performed.ok) return plan;
  /*
   * A playable chart must stay playable. `studioPlanIsPlayable` gates Play on
   * the literal plan, so a performance that emitted nothing — every slot
   * falling outside every event window — would bind an empty plan and end the
   * run the instant it started, with no refusal anyone could see. Falling back
   * keeps the chart audible and keeps that silent-success failure impossible.
   */
  if (!studioPlanIsPlayable(performed.plan) && studioPlanIsPlayable(plan)) {
    return plan;
  }
  return performed.plan;
}

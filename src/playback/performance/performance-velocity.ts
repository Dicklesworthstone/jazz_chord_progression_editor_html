import type { PLAYBACK_PLAN_FIXED_VELOCITY } from "../playback-plan-contract";

/**
 * A velocity that is not P0's single fixed value.
 *
 * P0 v1 declares `velocity: "fixed"` and types the field as the literal 96,
 * because the literal renderer has no dynamics to express. A performance does:
 * the whole point of a velocity contour is that the bass downbeat is not the
 * same weight as a comp stab. The values this layer emits stay inside the
 * 1..127 envelope P0's own velocity policy declares and inside the range the
 * audio engine validates, so the plan remains structurally indistinguishable
 * downstream. This is the one place the literal type is widened, and it is
 * widened deliberately rather than by leaking `unknown` through the module.
 */
export function performanceVelocity(
  value: number,
): typeof PLAYBACK_PLAN_FIXED_VELOCITY {
  const clamped = value < 1 ? 1 : value > 127 ? 127 : Math.trunc(value);
  return clamped as typeof PLAYBACK_PLAN_FIXED_VELOCITY;
}


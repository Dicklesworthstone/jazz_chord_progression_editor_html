import {
  AUTO_VOICE_COUNTS,
  type AutoVoiceCount,
  type AutoVoicing,
  type ChordDegree,
} from "../domain";
import type { SemanticRealization } from "./resolution-contract";

/**
 * The effective auto-voicing law.
 *
 * A stored auto policy names a note count, but a written chord can require
 * more distinct degrees than that count holds: C7alt's `alt-b9-b5`
 * realization needs 1, 3, ♭5, ♭7 and ♭9, and V0's adaptive selector (V0
 * contract §6.1) correctly refuses to drop any of them at four notes. The
 * product default is four notes for every chord, so without this law every
 * altered or multiply-coloured dominant — the core of jazz harmony — silenced
 * its whole chart.
 *
 * For the adaptive families (Balanced and Open), whose selector gives every
 * mandatory degree its own slot, the effective note count is the larger of
 * the stored count and the mandatory-degree count, up to the domain maximum.
 * Every other family, and any chord needing more than the maximum, keeps the
 * stored policy unchanged so V0 reports its own refusal. The law is pure and
 * deterministic: the application realizes the effective policy, and P0's
 * staleness guard derives the same effective policy from the stored one, so a
 * binding for any OTHER policy is still refused. The stored policy itself is
 * never rewritten.
 */

const WIDENING_FAMILIES: ReadonlySet<AutoVoicing["family"]> = new Set([
  "balanced",
  "open",
]);

const MAX_AUTO_VOICE_COUNT: AutoVoiceCount =
  AUTO_VOICE_COUNTS[AUTO_VOICE_COUNTS.length - 1] ?? 7;

function sameDegree(left: ChordDegree, right: ChordDegree): boolean {
  return left.number === right.number && left.alter === right.alter;
}

/** Distinct T1 required ∪ guide degrees: V0 §6.1 step 1's mandatory vector. */
export function mandatoryVoicingDegreeCount(
  realization: SemanticRealization,
): number {
  const mandatory: ChordDegree[] = [];
  for (const degree of [
    ...realization.requiredDegrees,
    ...realization.guideToneDegrees,
  ]) {
    if (!mandatory.some((kept) => sameDegree(kept, degree))) {
      mandatory.push(degree);
    }
  }
  return mandatory.length;
}

export function effectiveAutoVoicing(
  realization: SemanticRealization,
  policy: AutoVoicing,
): AutoVoicing {
  if (!WIDENING_FAMILIES.has(policy.family)) return policy;
  const needed = mandatoryVoicingDegreeCount(realization);
  if (needed <= policy.voiceCount || needed > MAX_AUTO_VOICE_COUNT) {
    return policy;
  }
  return Object.freeze({
    ...policy,
    voiceCount: needed as AutoVoiceCount,
  });
}

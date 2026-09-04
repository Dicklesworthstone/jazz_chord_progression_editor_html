/** Independent counterexamples for the September 2026 reality check.
 * Run: bun scripts/audit-discovery-reality.ts
 * A nonzero exit reports violated laws; this is not a release-gate replacement.
 * Keep expected values independent of the production algorithms under review.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { makeSpelledPitch, normalizeBeatValue, parseStableId } from "../src/domain";
import { sha256Sync, compileAtlasCorpus } from "../src/theory/atlas-compiler";
import type { AtlasSourceEntry } from "../src/theory/atlas-contract";
import { makeAtlasQueryAdapter } from "../src/theory/atlas-query";
import { makeSpelledInterval, transposeChordSymbolByInterval } from "../src/theory/spelled-transposition";
import { evaluateTransformCandidates } from "../src/theory/transform-laws";
import { harmonizeConstraints } from "../src/theory/harmonization-workbench";
import { applyRhythmTransform } from "../src/theory/rhythm-transforms";
import { applyNeoRiemannianTransform, generateHarmonicSequence } from "../src/theory/nonfunctional-transforms";
import { createPracticeSession } from "../src/theory/practice-laboratory";
import { detectCadence } from "../src/theory/phrase-cadence";
import { buildReharmonizationTree } from "../src/theory/reharmonization-tree";
import * as theory from "../src/theory";
import { inferAutomationKey } from "../src/export/midi-import-automation";

function beat(numerator: number, denominator = 1) {
  const result = normalizeBeatValue({ numerator, denominator });
  if (!result.ok) throw new Error("Invalid audit fixture beat");
  return result.value;
}
function id(value: string) {
  const result = parseStableId("event", value);
  if (!result.ok) throw new Error("Invalid audit fixture ID");
  return result.value;
}
function event(chordSymbol: string, duration = beat(4), offsetBeat = beat(0)) {
  return { eventId: id("audit_event"), chordSymbol, duration, offsetBeat };
}
function source(chords: readonly string[], overrides: Partial<AtlasSourceEntry> = {}): AtlasSourceEntry {
  return {
    entryId: "audit_original",
    title: "Independently authored audit fixture",
    chords,
    durationBeats: chords.map(() => 4),
    provenance: {
      rightsClass: "internal-original", commitAllowed: true, expressionBytePolicy: "embed-full",
      sourceEvidence: "Original synthetic counterexample; no third-party expression",
      payloadHash: createHash("sha256").update(chords.join("-")).digest("hex"),
    },
    practiceMetadata: { genre: "swing", suggestedTempoBpmRange: [100, 120], difficulty: "beginner", keyAreaTags: [] },
    ...overrides,
  };
}
const rows: { id: string; law: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
function check(id: string, law: string, expected: unknown, actual: unknown) {
  rows.push({ id, law, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual) });
}

check("m1-empty-key-control", "Zero eligible mass has no inferred key", null, inferAutomationKey(Array.from({ length: 12 }, () => 0)));
const symmetricMass = Array.from({ length: 12 }, () => 1);
const symmetricKey = inferAutomationKey(symmetricMass);
const shiftedSymmetricKey = inferAutomationKey(symmetricMass.map((_, pc) => symmetricMass[(pc + 11) % 12] ?? 0));
if (symmetricKey === null || shiftedSymmetricKey === null) throw new Error("Nonzero audit mass must have a ranked key under M1 v1");
check("m1-tied-equivariance-contract", "M1's unqualified winner-equivariance promise conflicts with absolute tonic tie-breaking on a rotation-invariant histogram", (symmetricKey.tonicPitchClass + 1) % 12, shiftedSymmetricKey.tonicPitchClass);

for (const operation of ["deriveLiteralFacts", "analyzeChordInContext", "enumerateChordScaleOptions"]) {
  check(`h0-${operation}`, "The reviewed H0 callable exists at the public theory boundary", "function", typeof Reflect.get(theory, operation));
}
const starterTail = ["Cmaj7", "Bm7#5", "Ebmaj7", "E7#9"].map((symbol) => {
  const parsed = theory.parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error("Invalid audit chord");
  return parsed.chord;
});
const liveSuggestions = theory.deriveContinuationSuggestions({ context: starterTail }, theory.resolutionOperations);
check("web-continuation-containment", "A maximum-overlap key vote must not claim complete C-major containment of Ebmaj7/E7#9", false, liveSuggestions.suggestions.some((candidate) => candidate.explanation.sentence.includes("sit inside C major")));

check("sha-empty-control", "SHA-256 empty-string known answer", createHash("sha256").update("").digest("hex"), sha256Sync(""));
check("sha-abc", "SHA-256 nonempty known answer", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256Sync("abc"));
const honest = source(["C", "B"]);
check("atlas-honest-control", "Accept independently hashed original data", 1, compileAtlasCorpus([honest]).compiled.entries.length);
const wrongHash = { ...honest, provenance: { ...honest.provenance, payloadHash: "f".repeat(64) } };
check("atlas-digest-refusal", "Reject every mismatched source digest", 0, compileAtlasCorpus([wrongHash]).compiled.entries.length);
const protectedSource = { ...honest, provenance: { ...honest.provenance, rightsClass: "protected-fingerprint-only" as const, expressionBytePolicy: "fingerprint-only" as const } };
check("atlas-fingerprint-policy", "Fingerprint-only policy never embeds chord-expression bytes", false, JSON.stringify(compileAtlasCorpus([protectedSource]).compiled).includes('"chords":["C","B"]'));
check("atlas-manifest-binding", "Changed payload must change compiled payload digest", false, compileAtlasCorpus([honest]).compiled.manifest.compiledPayloadHash === compileAtlasCorpus([source(["Dm7", "G7"])]).compiled.manifest.compiledPayloadHash);
const adapter = makeAtlasQueryAdapter(compileAtlasCorpus([honest]).compiled);
check("atlas-query-positive", "Eleven-semitone interval matches itself", 1, adapter.searchByRootIntervals([11]).length);
check("atlas-query-near-miss", "One-semitone query must not match eleven semitones", 0, adapter.searchByRootIntervals([1]).length);

const majorSecond = makeSpelledInterval(2, "major", "up");
check("transpose-basic-control", "Transpose a seventh with slash bass", "Dmaj7/F#", transposeChordSymbolByInterval("Cmaj7/E", majorSecond).transposedSymbol);
check("transpose-six-nine", "Preserve 6/9 and the independent slash bass", "D6/9/F#", transposeChordSymbolByInterval("C6/9/E", majorSecond).transposedSymbol);
check("transpose-unicode", "Unicode source root must actually transpose", false, transposeChordSymbolByInterval("D♭maj7", majorSecond, "unicode").transposedSymbol === "D♭maj7");
const insertion = evaluateTransformCandidates([event("G7", beat(3))], 0);
const split = insertion.ok ? insertion.candidates.find((c) => c.family === "secondary-ii-v") : undefined;
check("transform-exact-duration", "Three beats split into two events must still sum to three", 3, split?.editPlan.operations.reduce((sum, op) => sum + op.duration.numerator / op.duration.denominator, 0));

const melody = makeSpelledPitch({ step: "E", alter: 0, octave: 4 });
if (!melody.ok) throw new Error("Invalid audit melody");
const slot = { ...event("Cmaj7"), slotIndex: 0, pinnedChordSymbol: "Cmaj7", melodyPitch: melody.value, bassPitchClass: 0 };
check("harmonizer-positive", "Satisfiable chord/melody/bass conjunction succeeds", true, harmonizeConstraints([slot]).ok);
check("harmonizer-pin-conflict", "Pinned Cmaj7 cannot satisfy C-sharp bass without changing the pinned chord", false, harmonizeConstraints([{ ...slot, bassPitchClass: 1 }]).ok);
check("cadence-authentic-control", "G7 to C is an authentic-cadence candidate", "perfect-authentic", detectCadence("G7", "C", id("from"), id("to"))?.cadenceType);
check("cadence-deceptive", "G7 to Am is the standard V7-vi deceptive movement", "deceptive", detectCadence("G7", "Am", id("from"), id("to"))?.cadenceType ?? null);

const delayed = applyRhythmTransform([event("C", beat(4), beat(4))], "delay", { shiftDelta: beat(1) });
check("rhythm-delay", "Delay by one moves beat four to beat five", beat(5), delayed.ok ? delayed.result.transformedEvents[0]?.offsetBeat : delayed.refusal);
const diminished = applyRhythmTransform([event("C", beat(1, 960))], "diminution");
check("rhythm-grid-refusal", "Unrepresentable 1/1920 beat refuses instead of silently preserving 1/960", false, diminished.ok);
check("neo-p-control", "Parallel transformation of a pure major triad", "Cm", (() => { const r = applyNeoRiemannianTransform("C", "P"); return r.ok ? r.result.outputChord : r.refusal; })());
check("neo-ineligible-addition", "Pure-triad-only operation refuses Cadd9 rather than deleting its ninth", false, applyNeoRiemannianTransform("Cadd9", "P").ok);
const sequence = generateHarmonicSequence(["C"], 0, 1);
check("sequence-zero-interval", "A zero-semitone sequence preserves pitch", ["C", "C"], sequence.ok ? sequence.sequence.generatedProgression : sequence.refusal);
const practice = createPracticeSession([event("Cmaj7")], { seed: 42, maxPrompts: 1 });
const options = practice.ok ? practice.session.prompts[0]?.options ?? [] : [];
check("practice-distinct-options", "An identical answer cannot be both correct and incorrect", false, options.some((a) => options.some((b) => a.text === b.text && a.isCorrect !== b.isCorrect)));
const tree = buildReharmonizationTree([event("Cm7")], { maxDepth: 2 });
check("tree-depth-evidence", "A root-only tree reports reached depth zero", 0, tree.ok ? tree.tree.maxDepthReached : tree.refusal);

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const failed = rows.filter((row) => !row.pass).length;
console.log(JSON.stringify({ schema: "changes.reality-check.counterexamples.v1", head, bun: Bun.version, scope: "Source-level independent law checks; not browser, listening, or release acceptance", passed: rows.length - failed, failed, checks: rows }, null, 2));
process.exitCode = failed === 0 ? 0 : 1;

import { runA0RandomizedProtocol } from
  "../tests/support/a0-randomized-protocol";

function parseSequenceCount(argv: readonly string[]): number {
  if (argv.length !== 2 || argv[0] !== "--sequences") {
    throw new Error(
      "Usage: bun scripts/profile-a0-randomized.ts --sequences <1..1000>",
    );
  }
  const value = Number(argv[1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error("A0_RANDOM_PROFILE_SEQUENCE_COUNT");
  }
  return value;
}

const sequenceCount = parseSequenceCount(process.argv.slice(2));
const startedAt = performance.now();
await runA0RandomizedProtocol({ kind: "profile-prefix", sequenceCount });
const elapsedMs = performance.now() - startedAt;

console.log(`A0_RANDOM_PREFIX_PROFILE_TIMING ${JSON.stringify({
  schema: "changes.profile.a0-random-prefix-timing.v1",
  nonAuthoritative: true,
  sequenceCount,
  actionsPerSequence: 100,
  elapsedMs,
  wallTimeSemanticCutoff: false,
})}`);

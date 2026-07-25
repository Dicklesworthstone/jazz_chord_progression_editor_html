import { describe, expect, test } from "bun:test";

import {
  a0RandomizedProgressLineForProof,
  decodeA0RandomizedShardOutputForProof,
  reduceA0RandomizedShardPacketsForProof,
  runA0RandomizedSubprocessRangesForProof,
  type A0RandomizedActionName,
  type A0RandomizedSequenceFailureRow,
  type A0RandomizedSequenceRow,
  type A0RandomizedSequenceSuccessRow,
  type A0RandomizedShardPacket,
} from "../support/a0-randomized-protocol";

const ACTION_COUNTS = Object.freeze({
  "delete-event": 0,
  "duplicate-event": 0,
  "insert-event": 100,
  "move-event": 0,
  redo: 0,
  "set-duration-valid": 0,
  "set-section": 0,
  "set-text": 0,
  "set-voicing-valid": 0,
  undo: 0,
} satisfies Readonly<Record<A0RandomizedActionName, number>>);

function success(sequenceIndex: number): A0RandomizedSequenceSuccessRow {
  return Object.freeze({
    ok: true,
    sequenceIndex,
    sequenceHash: sequenceIndex.toString(16).padStart(64, "0"),
    actionCounts: ACTION_COUNTS,
  });
}

function failure(sequenceIndex: number): A0RandomizedSequenceFailureRow {
  return Object.freeze({
    ok: false,
    sequenceIndex,
    message: `failure-${String(sequenceIndex)}`,
  });
}

function packet(
  startInclusive: number,
  endExclusive: number,
  rows: readonly A0RandomizedSequenceRow[],
): A0RandomizedShardPacket {
  return Object.freeze({
    schema: "changes.evidence.a0-randomized-sequence-shard.v1",
    startInclusive,
    endExclusive,
    rows: Object.freeze(rows),
  });
}

describe("A0 randomized fixed-width shard execution", () => {
  test("one and four subprocesses return identical ordered sequence rows", async () => {
    const one = await runA0RandomizedSubprocessRangesForProof(4, 1);
    const four = await runA0RandomizedSubprocessRangesForProof(4, 4);

    expect(one.failure).toBeNull();
    expect(four.failure).toBeNull();
    expect(four.successes).toEqual(one.successes);
    expect(one.successes[0]?.sequenceHash).toBe(
      "baf09f7ef26c9e2b2ce1b08f39e13ea3312aa48ad402ca5d189ec050409a3d64",
    );
  }, 120_000);

  test("reduction ignores completion order and selects the lowest failure", () => {
    const higher = packet(2, 4, [failure(2)]);
    const lower = packet(0, 2, [success(0), failure(1)]);
    const outcome = reduceA0RandomizedShardPacketsForProof(
      [higher, lower],
      4,
    );

    expect(outcome.successes.map(({ sequenceIndex }) => sequenceIndex))
      .toEqual([0]);
    expect(outcome.failure).toEqual(failure(1));
  });

  for (const failureIndex of [0, 99, 100] as const) {
    test(`failure index ${String(failureIndex)} preserves its successful prefix`, () => {
      const rows: A0RandomizedSequenceRow[] = Array.from(
        { length: failureIndex },
        (_, sequenceIndex) => success(sequenceIndex),
      );
      rows.push(failure(failureIndex));
      const outcome = reduceA0RandomizedShardPacketsForProof(
        [packet(0, failureIndex + 1, rows)],
        failureIndex + 1,
      );

      expect(outcome.successes).toHaveLength(failureIndex);
      expect(outcome.failure?.sequenceIndex).toBe(failureIndex);
    });
  }

  test("authoritative progress bytes remain exact at the shard boundary", () => {
    expect(a0RandomizedProgressLineForProof(
      100,
      1_000,
      "authoritative",
    )).toBe(
      "A0_RANDOM_PROGRESS {\"completedSequences\":100,\"primaryActionsExecuted\":10000,\"replayActionsExecuted\":10000,\"schema\":\"changes.evidence.a0-random-progress.v1\",\"totalSequences\":1000,\"wallTimeSemanticCutoff\":false}",
    );
  });

  test("decoder rejects gaps, duplicates, extra keys, and bad counts", () => {
    const valid = {
      schema: "changes.evidence.a0-randomized-sequence-shard.v1",
      startInclusive: 0,
      endExclusive: 2,
      rows: [success(0), success(1)],
    };
    expect(() => decodeA0RandomizedShardOutputForProof(
      JSON.stringify({ ...valid, rows: [success(1), success(0)] }),
      0,
      2,
    )).toThrow("A0_RANDOM_SHARD_ROW_SEQUENCE");
    expect(() => decodeA0RandomizedShardOutputForProof(
      JSON.stringify({ ...valid, rows: [success(0), success(0)] }),
      0,
      2,
    )).toThrow("A0_RANDOM_SHARD_ROW_SEQUENCE");
    expect(() => decodeA0RandomizedShardOutputForProof(
      JSON.stringify({ ...valid, unexpected: true }),
      0,
      2,
    )).toThrow("A0_RANDOM_SHARD_OUTPUT_KEYS");
    expect(() => decodeA0RandomizedShardOutputForProof(
      JSON.stringify({
        ...valid,
        endExclusive: 1,
        rows: [{
          ...success(0),
          actionCounts: { ...ACTION_COUNTS, "insert-event": 99 },
        }],
      }),
      0,
      1,
    )).toThrow("A0_RANDOM_SHARD_ACTION_COUNT_TOTAL");
  });
});

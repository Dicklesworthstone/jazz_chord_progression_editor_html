import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  makeBeatPosition,
  makeMidiPitch,
  type BeatPosition,
  type MidiPitch,
} from "../../src/domain";
import type {
  TransportCommandPayload,
  TransportState,
} from "../../src/audio";
import {
  compiledPlan,
  createTransportHarness,
  initializePayload,
  planBinding,
  trustedGesture,
  type TransportHarness,
} from "../support/transport-test-kit";

setDefaultTimeout(120_000);

const root = resolve(import.meta.dirname, "../..");

type MatrixCell = Readonly<{
  caseId: string;
  state: TransportState;
  command: string;
  outcome: "receipt" | "refusal";
  stateAfter?: string;
  generationBoundary?: boolean;
  refusalCode?: string;
}>;

async function loadMatrix(): Promise<readonly MatrixCell[]> {
  const raw = await readFile(
    resolve(root, "tests/fixtures/transport/state-machine-cases.json"),
    "utf8",
  );
  const fixture = JSON.parse(raw) as { cases: readonly MatrixCell[] };
  return fixture.cases;
}

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

const middleC: MidiPitch = (() => {
  const made = makeMidiPitch(60);
  if (!made.ok) throw new Error("midi 60");
  return made.value;
})();

/** Drive a fresh harness into the named matrix state. */
async function driveTo(
  harness: TransportHarness,
  state: TransportState,
): Promise<void> {
  const plan = compiledPlan();
  const init = async () => {
    const outcome = await harness.submit(initializePayload(plan));
    if (outcome.termination !== "receipt") {
      throw new Error(`driver init failed: ${outcome.code}`);
    }
  };
  const bindReady = async () => {
    const outcome = await harness.submit({
      kind: "replace-plan",
      binding: planBinding(plan, 1),
    });
    if (outcome.termination !== "receipt") {
      throw new Error(`driver bind failed: ${outcome.code}`);
    }
  };
  const play = async () => {
    const outcome = await harness.submit({
      kind: "play",
      binding: planBinding(plan, 1),
      startBeat: zeroBeat,
      countIn: false,
    });
    if (outcome.termination !== "receipt") {
      throw new Error(`driver play failed: ${outcome.code}`);
    }
    if (harness.service.inspectTransport().state !== "playing") {
      throw new Error("driver play did not reach playing");
    }
  };
  switch (state) {
    case "locked":
      return;
    case "ready":
      await init();
      await bindReady();
      return;
    case "playing":
      await init();
      await play();
      return;
    case "paused": {
      await init();
      await play();
      const outcome = await harness.submit({ kind: "pause" });
      if (outcome.termination !== "receipt") {
        throw new Error(`driver pause failed: ${outcome.code}`);
      }
      return;
    }
    case "interrupted": {
      await init();
      await play();
      harness.controller().setState("suspended");
      harness.timer.fire();
      if (harness.service.inspectTransport().state !== "interrupted") {
        throw new Error("driver interruption did not latch");
      }
      return;
    }
    case "fault": {
      await init();
      await play();
      harness.controller().setState("closed");
      harness.timer.fire();
      if (harness.service.inspectTransport().state !== "fault") {
        throw new Error("driver fault did not latch");
      }
      return;
    }
    case "disposed": {
      await init();
      const outcome = await harness.submit({
        kind: "dispose-transport",
        reason: "page-teardown",
      });
      if (outcome.termination !== "receipt") {
        throw new Error(`driver dispose failed: ${outcome.code}`);
      }
      return;
    }
  }
}

function payloadFor(command: string): TransportCommandPayload {
  const plan = compiledPlan();
  switch (command) {
    case "initialize-transport":
      return initializePayload(plan);
    case "play":
      return {
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      };
    case "pause":
      return { kind: "pause" };
    case "resume":
      return { kind: "resume", gesture: trustedGesture() };
    case "seek":
      return { kind: "seek", targetBeat: zeroBeat };
    case "stop":
      return { kind: "stop" };
    case "set-tempo":
      return { kind: "set-tempo", binding: planBinding(plan, 2) };
    case "set-loop":
      return {
        kind: "set-loop",
        binding: planBinding(plan, 1),
        loop: plan.loop,
      };
    case "set-instrument":
      return { kind: "set-instrument", instrumentId: "vibraphone" };
    case "set-count-in":
      return { kind: "set-count-in", enabled: true };
    case "set-metronome":
      return { kind: "set-metronome", enabled: true };
    case "start-preview":
      return {
        kind: "start-preview",
        previewId: "x1:preview:matrix",
        instrumentId: "mellow-keys",
        midiPitches: [middleC],
        gateSeconds: 0.5,
      };
    case "release-preview":
      return { kind: "release-preview", previewId: "x1:preview:matrix" };
    case "set-mix":
      /* jcpe-v2r-live-mix-btb4 */
      return { kind: "set-mix", mix: { masterVolume: 0.5, reverbAmount: 0 } };
    case "replace-plan":
      return { kind: "replace-plan", binding: planBinding(plan, 5) };
    case "dispose-transport":
      return { kind: "dispose-transport", reason: "page-teardown" };
    default:
      throw new Error(`unknown command ${command}`);
  }
}

describe("TR-X1-STATE-MACHINE production transport state matrix", () => {
  test("X1-SM-001..X1-SM-112 every cell matches the reviewed matrix", async () => {
    const cells = await loadMatrix();
    expect(cells).toHaveLength(112);
    const mismatches: string[] = [];
    for (const cell of cells) {
      const harness = createTransportHarness();
      await driveTo(harness, cell.state);
      const stableStates: readonly string[] = ["ready", "playing", "paused"];
      if (
        cell.command === "release-preview" &&
        stableStates.includes(cell.state)
      ) {
        const started = await harness.submit(payloadFor("start-preview"));
        if (started.termination !== "receipt") {
          mismatches.push(`${cell.caseId}: preview setup ${started.code}`);
          continue;
        }
      }
      const generationBefore =
        harness.service.inspectTransport().generation;
      const outcome = await harness.submit(payloadFor(cell.command));
      if (cell.outcome === "receipt") {
        if (outcome.termination !== "receipt") {
          mismatches.push(
            `${cell.caseId}: expected receipt, refused ${outcome.code}`,
          );
          continue;
        }
        const expectedAfter =
          cell.stateAfter === "prior-stable" ? "playing" : cell.stateAfter;
        if (outcome.stateAfter !== expectedAfter) {
          mismatches.push(
            `${cell.caseId}: stateAfter ${outcome.stateAfter} != ${String(expectedAfter)}`,
          );
        }
        const crossed = outcome.generation > generationBefore;
        if (crossed !== cell.generationBoundary) {
          mismatches.push(
            `${cell.caseId}: generationBoundary ${String(crossed)} != ${String(cell.generationBoundary)}`,
          );
        }
      } else {
        if (outcome.termination !== "refusal") {
          mismatches.push(`${cell.caseId}: expected refusal, got receipt`);
          continue;
        }
        if (outcome.code !== cell.refusalCode) {
          mismatches.push(
            `${cell.caseId}: refusal ${outcome.code} != ${String(cell.refusalCode)}`,
          );
        }
        const generationAfter =
          harness.service.inspectTransport().generation;
        if (generationAfter !== generationBefore) {
          mismatches.push(`${cell.caseId}: refusal moved the generation`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("transitions are serialized: a synchronous burst runs strictly FIFO", async () => {
    const harness = createTransportHarness();
    const plan = compiledPlan();
    await harness.submit(initializePayload(plan));
    const burst = await Promise.all([
      harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
      harness.submit({ kind: "pause" }),
      harness.submit({ kind: "stop" }),
    ]);
    expect(burst.map((outcome) => outcome.termination)).toEqual([
      "receipt",
      "receipt",
      "receipt",
    ]);
    expect(harness.service.inspectTransport().state).toBe("ready");
  });
});

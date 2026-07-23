import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  applyMutation,
  validateX1Contract,
  X1_FIXTURE_FILES,
} from "../../scripts/validate-x1-contract";

setDefaultTimeout(120_000);

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "tests/fixtures/transport");

async function loadFixtures(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    X1_FIXTURE_FILES.map(async (name) => {
      const raw = await readFile(resolve(fixtureDir, name), "utf8");
      return [name, JSON.parse(raw)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

describe("X1 transport contract authority", () => {
  test("the reviewed fixture authority validates with zero findings", async () => {
    const report = await validateX1Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
    expect(report.stateMatrixCases).toBe(105);
    expect(report.timingGoldens).toBe(14);
    expect(report.schedulerCases).toBe(14);
    expect(report.stopCases).toBe(12);
    expect(report.commandCases).toBe(20);
    expect(report.notificationCases).toBe(8);
    expect(report.traces).toBe(22);
    expect(report.authorities).toBe(8);
    expect(report.mutationControls).toBe(30);
  });

  test("every named semantic mutation is caught with its expected finding", async () => {
    const fixtures = await loadFixtures();
    const mutations = fixtures["mutation-controls.json"] as {
      controls: readonly {
        id: string;
        file: string;
        pointer: string;
        value: unknown;
        expectedFindingCode: string;
      }[];
    };
    expect(mutations.controls).toHaveLength(30);
    for (const control of mutations.controls) {
      const overlay: Record<string, unknown> = { ...fixtures };
      overlay[control.file] = applyMutation(
        fixtures[control.file],
        control.pointer,
        control.value,
      );
      const report = await validateX1Contract(overlay);
      expect(
        report.outcome,
        `${control.id} must fail validation`,
      ).toBe("fail");
      expect(
        report.findings.map((finding) => finding.code),
        `${control.id} must produce ${control.expectedFindingCode}`,
      ).toContain(control.expectedFindingCode);
    }
  });

  test("the validator imports no production source", async () => {
    const source = await readFile(
      resolve(root, "scripts/validate-x1-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+"\.\.\/src\//u);
    expect(source).not.toMatch(/import\s*\(\s*"\.\.\/src\//u);
  });

  test("the public transport contract module stays aligned with the manifest", async () => {
    const contract = await import("../../src/audio/transport-contract");
    const manifest = JSON.parse(
      await readFile(resolve(fixtureDir, "x1-transport-contract.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest["states"]).toEqual([...contract.TRANSPORT_STATES]);
    expect(manifest["commandKinds"]).toEqual([
      ...contract.TRANSPORT_COMMAND_KINDS,
    ]);
    expect(manifest["notificationStatuses"]).toEqual([
      ...contract.TRANSPORT_NOTIFICATION_STATUSES,
    ]);
    expect(manifest["stateStatusProjection"]).toEqual({
      ...contract.TRANSPORT_STATE_STATUS_PROJECTION,
    });
    expect(manifest["refusalCodes"]).toEqual([
      ...contract.TRANSPORT_REFUSAL_CODES,
    ]);
    expect(manifest["refusalPrecedence"]).toEqual([
      ...contract.TRANSPORT_REFUSAL_PRECEDENCE,
    ]);
    expect(manifest["workCounterNames"]).toEqual([
      ...contract.TRANSPORT_WORK_COUNTER_NAMES,
    ]);
    expect(manifest["generationBoundaries"]).toEqual([
      ...contract.TRANSPORT_GENERATION_BOUNDARIES,
    ]);
    const limits = manifest["limits"] as Record<string, unknown>;
    expect(contract.TRANSPORT_TICK_INTERVAL_MS_DEFAULT).toBe(
      limits["tickIntervalMsDefault"] as number,
    );
    expect(contract.MIN_TRANSPORT_TICK_INTERVAL_MS).toBe(
      limits["tickIntervalMsMin"] as number,
    );
    expect(contract.MAX_TRANSPORT_TICK_INTERVAL_MS).toBe(
      limits["tickIntervalMsMax"] as number,
    );
    expect(contract.TRANSPORT_LOOKAHEAD_SECONDS_DEFAULT).toBe(
      limits["lookaheadSecondsDefault"] as number,
    );
    expect(contract.MIN_TRANSPORT_LOOKAHEAD_SECONDS).toBe(
      limits["lookaheadSecondsMin"] as number,
    );
    expect(contract.MAX_TRANSPORT_LOOKAHEAD_SECONDS).toBe(
      limits["lookaheadSecondsMax"] as number,
    );
    expect(contract.TRANSPORT_X0_ATTACK_WINDOW_MARGIN_SECONDS).toBe(
      limits["x0WindowMarginSeconds"] as number,
    );
    expect(contract.MAX_TRANSPORT_QUEUED_COMMANDS).toBe(
      limits["maxQueuedCommands"] as number,
    );
    expect(contract.TRANSPORT_NATURAL_END_TAIL_DEADLINE_SECONDS).toBe(
      limits["naturalEndTailDeadlineSeconds"] as number,
    );
    expect(contract.TRANSPORT_STOP_RELEASE_SECONDS).toBe(
      limits["stopReleaseSeconds"] as number,
    );
    expect(contract.TRANSPORT_MIN_AUDIO_GATE_SECONDS).toBe(
      limits["minAudioGateSeconds"] as number,
    );
    expect(contract.MAX_TRANSPORT_PREVIEW_PITCHES).toBe(
      limits["maxPreviewPitches"] as number,
    );
    expect(contract.TRANSPORT_COUNT_IN_BARS).toBe(
      limits["countInBars"] as number,
    );
    const click = manifest["clickPolicy"] as Record<string, unknown>;
    expect(click["instrumentId"]).toBe(contract.TRANSPORT_CLICK_INSTRUMENT_ID);
    expect(contract.TRANSPORT_CLICK_ACCENT_MIDI_PITCH).toBe(
      click["accentMidiPitch"] as number,
    );
    expect(contract.TRANSPORT_CLICK_BEAT_MIDI_PITCH).toBe(
      click["beatMidiPitch"] as number,
    );
    expect(contract.TRANSPORT_CLICK_ACCENT_VELOCITY).toBe(
      click["accentVelocity"] as number,
    );
    expect(contract.TRANSPORT_CLICK_BEAT_VELOCITY).toBe(
      click["beatVelocity"] as number,
    );
    expect(contract.TRANSPORT_CLICK_GATE_SECONDS).toBe(
      click["gateSeconds"] as number,
    );
    expect(contract.TRANSPORT_CLICK_EVENT_ID_PREFIX).toBe(
      click["eventIdPrefix"] as string,
    );
    expect(contract.TRANSPORT_PREVIEW_ID_PREFIX).toBe(
      manifest["previewIdPrefix"] as string,
    );
    expect(contract.TRANSPORT_INTERRUPTED_FAILURE_CODE).toBe(
      manifest["interruptedFailureCode"] as string,
    );
    expect(contract.TRANSPORT_CONTRACT_SCHEMA).toBe(
      manifest["contractSchema"] as string,
    );
    expect(contract.TRANSPORT_SNAPSHOT_SCHEMA).toBe(
      manifest["snapshotSchema"] as string,
    );
    expect(contract.TRANSPORT_NOTIFICATION_SCHEMA).toBe(
      manifest["notificationSchema"] as string,
    );
  });
});

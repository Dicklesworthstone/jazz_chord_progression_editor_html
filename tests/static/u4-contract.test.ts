import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { EphemeralIntent } from "../../src/application/application-state-contract";
import { APPLICATION_TRANSPORT_STATUSES } from "../../src/application/application-state-contract";
import {
  TRANSPORT_COMMAND_KINDS,
  TRANSPORT_STATES,
} from "../../src/audio/transport-contract";
import {
  U4_A0_TRANSPORT_STATUSES,
  U4_AUTHORIZED_EPHEMERAL_INTENT_KINDS,
  U4_BOUNDARY_STATEMENTS,
  U4_COMPONENT_COUNT,
  U4_COMPONENT_INVENTORY,
  U4_CONTROL_DISABLED_REASONS,
  U4_ENABLEMENT_LAWS,
  U4_FORBIDDEN_EPHEMERAL_INTENT_KINDS,
  U4_GLOBAL_KEY_GUARD_CONDITIONS,
  U4_GLOBAL_TRANSPORT_KEYS,
  U4_OPERATION_COUNT,
  U4_SLIDER_KEY_LAW,
  U4_STATUS_PRESENTATION,
  U4_TRANSPORT_CONTROLS_BEAD_ID,
  U4_TRANSPORT_CONTROLS_IMPLEMENTATION_STATUS,
  U4_TRANSPORT_CONTROLS_POLICY_ID,
  U4_TRANSPORT_CONTROLS_POLICY_VERSION,
  U4_TRANSPORT_LIMITS,
  U4_TRANSPORT_OPERATIONS,
  U4_TRANSPORT_SURFACES,
  U4_TRUSTED_GESTURE_SOURCES,
  U4_X1_COMMAND_KINDS_CONSUMED,
  U4_X1_TRANSPORT_STATES,
} from "../../src/ui/studio/u4-transport-controls-contract";

type JsonObject = Record<string, unknown>;

const fixtureRoot = resolve(
  import.meta.dirname,
  "../fixtures/transport-controls",
);

async function readFixture(name: string): Promise<JsonObject> {
  const value: unknown = JSON.parse(
    await readFile(resolve(fixtureRoot, name), "utf8"),
  );
  expect(typeof value).toBe("object");
  return value as JsonObject;
}

describe("u4 transport-controls contract authority", () => {
  test("module literals equal the live X1 tuples exactly", () => {
    expect([...U4_X1_TRANSPORT_STATES]).toEqual([...TRANSPORT_STATES]);
    expect([...U4_A0_TRANSPORT_STATUSES]).toEqual([
      ...APPLICATION_TRANSPORT_STATUSES,
    ]);
    for (const kind of U4_X1_COMMAND_KINDS_CONSUMED) {
      expect([...TRANSPORT_COMMAND_KINDS]).toContain(kind);
    }
    expect([...U4_X1_COMMAND_KINDS_CONSUMED]).toEqual([
      "initialize-transport",
      "play",
      "pause",
      "resume",
      "seek",
      "stop",
      "set-tempo",
      "set-loop",
      "set-performance",
      "set-instrument",
      "set-mix",
      "set-count-in",
      "set-metronome",
      "dispose-transport",
    ]);
  });

  test("the ephemeral-intent partition is compile-time exact and U4 adds none", () => {
    type LiveIntentKind = EphemeralIntent["kind"];
    type ForbiddenKind =
      (typeof U4_FORBIDDEN_EPHEMERAL_INTENT_KINDS)[number];
    const partition: [LiveIntentKind] extends [ForbiddenKind]
      ? [ForbiddenKind] extends [LiveIntentKind]
        ? true
        : false
      : false = true;
    expect(partition).toBe(true);
    expect([...U4_AUTHORIZED_EPHEMERAL_INTENT_KINDS]).toEqual([]);
    expect(U4_FORBIDDEN_EPHEMERAL_INTENT_KINDS).toHaveLength(13);
    expect(new Set(U4_FORBIDDEN_EPHEMERAL_INTENT_KINDS).size).toBe(13);
  });

  test("component inventory is closed, unique, and surfaced", () => {
    expect(U4_COMPONENT_INVENTORY).toHaveLength(U4_COMPONENT_COUNT);
    expect(new Set(U4_COMPONENT_INVENTORY.map((entry) => entry.id)).size).toBe(
      U4_COMPONENT_COUNT,
    );
    expect(
      new Set(U4_COMPONENT_INVENTORY.map((entry) => entry.name)).size,
    ).toBe(U4_COMPONENT_COUNT);
    for (const entry of U4_COMPONENT_INVENTORY) {
      expect([...U4_TRANSPORT_SURFACES]).toContain(entry.surface);
    }
  });

  test("operation inventory obeys the channel laws", () => {
    expect(U4_TRANSPORT_OPERATIONS).toHaveLength(U4_OPERATION_COUNT);
    const componentIds = new Set(
      U4_COMPONENT_INVENTORY.map((entry) => entry.id),
    );
    for (const operation of U4_TRANSPORT_OPERATIONS) {
      expect(componentIds).toContain(operation.component);
      expect(operation.keyboardAccess).not.toBe("none");
      expect(operation.pointerAlternative).not.toBe("none");
      if (operation.channel === "controller-intent") {
        expect(typeof operation.controllerIntent).toBe("string");
      }
      for (const kind of operation.x1CommandKinds) {
        expect([...TRANSPORT_COMMAND_KINDS]).toContain(
          kind as (typeof TRANSPORT_COMMAND_KINDS)[number],
        );
      }
    }
    const gestureGated = U4_TRANSPORT_OPERATIONS.filter(
      (operation) => operation.requiresTrustedGesture,
    ).map((operation) => operation.id);
    expect(gestureGated).toEqual([
      "play-run",
      "restart-run",
      "resume-from-interruption",
      "reinitialize-audio",
      "section-play",
    ]);
  });

  test("enablement laws stay inside the frozen vocabularies", () => {
    const operationIds = new Set(
      U4_TRANSPORT_OPERATIONS.map((operation) => operation.id),
    );
    const lawIds = Object.keys(U4_ENABLEMENT_LAWS);
    expect(new Set(lawIds)).toEqual(operationIds);
    for (const law of Object.values(U4_ENABLEMENT_LAWS)) {
      for (const status of law.enabledStatuses) {
        expect([...U4_A0_TRANSPORT_STATUSES]).toContain(
          status,
        );
      }
      for (const reason of Object.values(law.disabledReasonByStatus)) {
        expect([...U4_CONTROL_DISABLED_REASONS]).toContain(
          reason as (typeof U4_CONTROL_DISABLED_REASONS)[number],
        );
      }
    }
  });

  test("fixture manifest mirrors the module inventory exactly", async () => {
    const manifest = await readFixture("u4-transport-controls-contract.json");
    expect(manifest["schema"]).toBe(
      "changes.fixtures.u4-transport-controls-contract.v1",
    );
    expect(manifest["beadId"]).toBe(U4_TRANSPORT_CONTROLS_BEAD_ID);
    expect(manifest["policyId"]).toBe(U4_TRANSPORT_CONTROLS_POLICY_ID);
    expect(manifest["policyVersion"]).toBe(
      U4_TRANSPORT_CONTROLS_POLICY_VERSION,
    );
    expect(manifest["implementationStatus"]).toBe(
      U4_TRANSPORT_CONTROLS_IMPLEMENTATION_STATUS,
    );
    expect(manifest["productionImplementationClaim"]).toBe(false);
    expect(manifest["uiCompletionClaim"]).toBe(false);
    expect(manifest["humanAcceptanceClaim"]).toBe(false);
    expect(manifest["expertReviewClaim"]).toBe(false);
    expect(manifest["surfaces"]).toEqual([...U4_TRANSPORT_SURFACES]);
    expect(manifest["components"]).toEqual(
      U4_COMPONENT_INVENTORY.map((entry) => ({
        id: entry.id,
        name: entry.name,
        surface: entry.surface,
      })),
    );
    expect(manifest["limits"]).toEqual(U4_TRANSPORT_LIMITS);
    expect(manifest["x1TransportStates"]).toEqual([...U4_X1_TRANSPORT_STATES]);
    expect(manifest["a0TransportStatuses"]).toEqual([
      ...U4_A0_TRANSPORT_STATUSES,
    ]);
    expect(manifest["x1CommandKindsConsumed"]).toEqual([
      ...U4_X1_COMMAND_KINDS_CONSUMED,
    ]);
    expect(manifest["forbiddenEphemeralIntentKinds"]).toEqual([
      ...U4_FORBIDDEN_EPHEMERAL_INTENT_KINDS,
    ]);
    expect(manifest["statusPresentation"]).toEqual(
      U4_STATUS_PRESENTATION.map((row) => ({
        status: row.status,
        failureCode: row.failureCode,
        badgeLabel: row.badgeLabel,
        detailKind: row.detailKind,
      })),
    );
    expect(manifest["boundaryStatements"]).toEqual(U4_BOUNDARY_STATEMENTS);
    expect(manifest["disabledReasons"]).toEqual([...U4_CONTROL_DISABLED_REASONS]);
    expect(manifest["globalTransportKeys"]).toEqual(
      U4_GLOBAL_TRANSPORT_KEYS.map((key) => ({
        key: key.key,
        shift: key.shift,
        resolvesTo: [...key.resolvesTo],
        guard: key.guard,
      })),
    );
    expect(manifest["globalKeyGuardConditions"]).toEqual([
      ...U4_GLOBAL_KEY_GUARD_CONDITIONS,
    ]);
    expect(manifest["sliderKeyLaw"]).toEqual(U4_SLIDER_KEY_LAW);
    expect(manifest["trustedGestureSources"]).toEqual([
      ...U4_TRUSTED_GESTURE_SOURCES,
    ]);
  });

  test("operation matrix rows mirror the module operations exactly", async () => {
    const matrix = await readFixture("control-operation-matrix.json");
    const rows = matrix["operations"] as readonly JsonObject[];
    expect(rows).toHaveLength(U4_OPERATION_COUNT);
    expect(rows.map((row) => row["id"])).toEqual(
      U4_TRANSPORT_OPERATIONS.map((operation) => operation.id),
    );
    for (const [index, row] of rows.entries()) {
      const operation = U4_TRANSPORT_OPERATIONS[index];
      expect(row["channel"]).toBe(operation?.channel);
      expect(row["controllerIntent"]).toBe(operation?.controllerIntent ?? null);
      expect(row["x1CommandKinds"]).toEqual(operation?.x1CommandKinds);
      expect(row["requiresTrustedGesture"]).toBe(
        operation?.requiresTrustedGesture,
      );
      expect(row["keyboardAccess"]).toBe(operation?.keyboardAccess);
      expect(row["pointerAlternative"]).toBe(operation?.pointerAlternative);
      const enablement = row["enablement"] as JsonObject;
      const law =
        U4_ENABLEMENT_LAWS[operation?.id as keyof typeof U4_ENABLEMENT_LAWS];
      expect(enablement["enabledStatuses"]).toEqual(law.enabledStatuses);
      expect(enablement["needsCanPlay"]).toBe(law.needsCanPlay);
      expect(enablement["disabledReasonByStatus"]).toEqual(
        law.disabledReasonByStatus,
      );
    }
    expect(matrix["statuses"]).toEqual([...U4_A0_TRANSPORT_STATUSES]);
    expect(matrix["disabledReasons"]).toEqual([...U4_CONTROL_DISABLED_REASONS]);
  });

  test("every operation's enablement law disables with a named reason", () => {
    for (const operation of U4_TRANSPORT_OPERATIONS) {
      const law =
        U4_ENABLEMENT_LAWS[operation.id as keyof typeof U4_ENABLEMENT_LAWS];
      for (const status of U4_A0_TRANSPORT_STATUSES) {
        const enabled = (law.enabledStatuses as readonly string[]).includes(
          status,
        );
        if (!enabled) {
          expect(
            Object.keys(law.disabledReasonByStatus),
            `${operation.id} must name a disabled reason for ${status}`,
          ).toContain(status);
        }
      }
    }
  });
});

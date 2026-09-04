import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  DialogDescriptor,
  DocumentTransitionState,
  EphemeralIntent,
  ImportDraft,
  RecoveryStatus,
} from "../../src/application/application-state-contract";
import {
  APPLICATION_DIALOG_KINDS,
  APPLICATION_REFUSAL_CODES,
  APPLICATION_REPLACEMENT_ORIGINS,
} from "../../src/application/application-state-contract";
import type { BeginReplacementWorkflowResult } from "../../src/application/studio-replacement-workflow";
import { IMPORT_FORMAT_HINTS } from "../../src/application/e0-interchange-contract";
import {
  IMPORT_SOURCE_CHANNELS,
  IMPORT_SOURCE_FORMATS,
} from "../../src/application/e0-interchange-contract";
import { LEGACY_REPORT_GROUPS } from "../../src/compatibility/legacy-migration-contract";
import {
  RECOVERY_REFUSAL_CODES,
  RECOVERY_STARTUP_DISPOSITIONS,
} from "../../src/persistence/recovery-contract";
import { UI_LIMITS } from "../../src/ui/ui-contract";
import {
  U5_A0_DIALOG_KINDS,
  U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS,
  U5_COMPONENT_COUNT,
  U5_COMPONENT_INVENTORY,
  U5_CONFIRMATION_REQUIREMENT_LAW,
  U5_DIALOG_KINDS_WITH_LIFECYCLE,
  U5_DIALOG_PHASES,
  U5_DOCUMENT_TRANSITION_STATES,
  U5_FORBIDDEN_EPHEMERAL_INTENT_KINDS,
  U5_IMPORT_DRAFT_STATUSES,
  U5_IMPORT_FORMAT_HINTS,
  U5_IMPORT_REPORT_RETENTION_POLICY,
  U5_IMPORT_SOURCE_CHANNELS,
  U5_IMPORT_SOURCE_FORMATS,
  U5_LEGACY_REPORT_GROUPS,
  U5_LIFECYCLE_BEAD_ID,
  U5_LIFECYCLE_IMPLEMENTATION_STATUS,
  U5_LIFECYCLE_LIMITS,
  U5_LIFECYCLE_OPERATIONS,
  U5_LIFECYCLE_POLICY_ID,
  U5_LIFECYCLE_POLICY_VERSION,
  U5_LIFECYCLE_SURFACES,
  U5_LIFECYCLE_WORKFLOW_CODES,
  U5_OPERATION_COUNT,
  U5_OVERLAY_LIMITS,
  U5_PROPOSED_DIALOG_KINDS,
  U5_RECOVERY_STATUS_KINDS,
  U5_RECOVERY_VOCABULARY_KEYS,
  U5_RECOVERY_REFUSAL_CODES,
  U5_REPLACEMENT_ORIGINS,
  U5_RUN_ACTIVE_STATUSES,
  U5_STARTUP_DISPOSITIONS,
  U5_STARTUP_PRESENTATION,
} from "../../src/ui/studio/u5-lifecycle-contract";

type JsonObject = Record<string, unknown>;

const fixtureRoot = resolve(
  import.meta.dirname,
  "../fixtures/lifecycle-dialogs",
);

async function readFixture(name: string): Promise<JsonObject> {
  const value: unknown = JSON.parse(
    await readFile(resolve(fixtureRoot, name), "utf8"),
  );
  expect(typeof value).toBe("object");
  return value as JsonObject;
}

describe("u5 lifecycle contract authority", () => {
  test("module literals equal the live upstream tuples exactly", () => {
    expect([...U5_A0_DIALOG_KINDS]).toEqual([...APPLICATION_DIALOG_KINDS]);
    expect([...U5_PROPOSED_DIALOG_KINDS]).toEqual([
      "import-preview",
      "lifecycle-export",
    ]);
    expect([...U5_DIALOG_KINDS_WITH_LIFECYCLE]).toEqual([
      ...APPLICATION_DIALOG_KINDS,
      "import-preview",
      "lifecycle-export",
    ]);
    expect([...U5_REPLACEMENT_ORIGINS]).toEqual([
      ...APPLICATION_REPLACEMENT_ORIGINS,
    ]);
    expect([...U5_STARTUP_DISPOSITIONS]).toEqual([
      ...RECOVERY_STARTUP_DISPOSITIONS,
    ]);
    expect([...U5_RECOVERY_REFUSAL_CODES]).toEqual([
      ...RECOVERY_REFUSAL_CODES,
    ]);
    expect([...U5_IMPORT_SOURCE_CHANNELS]).toEqual([...IMPORT_SOURCE_CHANNELS]);
    expect([...U5_IMPORT_FORMAT_HINTS]).toEqual([...IMPORT_FORMAT_HINTS]);
    expect([...U5_IMPORT_SOURCE_FORMATS]).toEqual([...IMPORT_SOURCE_FORMATS]);
    expect([...U5_LEGACY_REPORT_GROUPS]).toEqual([...LEGACY_REPORT_GROUPS]);
    expect(U5_OVERLAY_LIMITS.maxModalScopes).toBe(UI_LIMITS.maxModalScopes);
    expect(U5_OVERLAY_LIMITS.maxNonmodalSurfaces).toBe(
      UI_LIMITS.maxNonmodalSurfaces,
    );
    expect(U5_OVERLAY_LIMITS.maxDismissAncestors).toBe(
      UI_LIMITS.maxDismissAncestors,
    );
    expect(U5_LIFECYCLE_LIMITS.maxDialogStackDepth).toBe(8);
    expect(U5_LIFECYCLE_LIMITS.maxNotices).toBe(32);
    expect(U5_LIFECYCLE_LIMITS.maxPendingRequests).toBe(8);
  });

  test("phase, transition, recovery, and draft vocabularies are compile-time exact", () => {
    type DialogPhase = DialogDescriptor["phase"];
    type DeclaredPhase = (typeof U5_DIALOG_PHASES)[number];
    const phasesExact: [DialogPhase] extends [DeclaredPhase]
      ? [DeclaredPhase] extends [DialogPhase]
        ? true
        : false
      : false = true;
    expect(phasesExact).toBe(true);

    type TransitionKind = DocumentTransitionState["kind"];
    type DeclaredTransition =
      (typeof U5_DOCUMENT_TRANSITION_STATES)[number];
    const transitionsExact: [TransitionKind] extends [DeclaredTransition]
      ? [DeclaredTransition] extends [TransitionKind]
        ? true
        : false
      : false = true;
    expect(transitionsExact).toBe(true);

    type RecoveryKind = RecoveryStatus["kind"];
    type DeclaredRecovery = (typeof U5_RECOVERY_STATUS_KINDS)[number];
    const recoveryExact: [RecoveryKind] extends [DeclaredRecovery]
      ? [DeclaredRecovery] extends [RecoveryKind]
        ? true
        : false
      : false = true;
    expect(recoveryExact).toBe(true);

    type DraftStatus = ImportDraft["status"];
    type DeclaredDraft = (typeof U5_IMPORT_DRAFT_STATUSES)[number];
    const draftsExact: [DraftStatus] extends [DeclaredDraft]
      ? [DeclaredDraft] extends [DraftStatus]
        ? true
        : false
      : false = true;
    expect(draftsExact).toBe(true);

    type WorkflowCode = Extract<
      BeginReplacementWorkflowResult,
      { ok: false }
    >["code"];
    const workflowCodesCovered: [
      "import.replacement_workflow_busy",
      "import.replacement_workflow_begin_failed",
    ] extends [WorkflowCode, WorkflowCode] ? true : false = true;
    expect(workflowCodesCovered).toBe(true);
    for (const code of [
      "dialog.stack_limit",
      "history.nonundoable_confirmation_required",
    ] as const) {
      expect([...APPLICATION_REFUSAL_CODES]).toContain(code);
      expect([...U5_LIFECYCLE_WORKFLOW_CODES]).toContain(code);
    }
    expect(U5_LIFECYCLE_WORKFLOW_CODES).toContain(
      "history.replacement_not_undoable",
    );
    expect(U5_IMPORT_REPORT_RETENTION_POLICY).toBe(
      "group-source-path-code-target-path-first-256",
    );
  });

  test("the ephemeral-intent partition is compile-time exact", () => {
    type LiveIntentKind = EphemeralIntent["kind"];
    type Authorized = (typeof U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS)[number];
    type Forbidden = (typeof U5_FORBIDDEN_EPHEMERAL_INTENT_KINDS)[number];
    type AuthorizedOrForbidden = Authorized | Forbidden;
    const partition: [LiveIntentKind] extends [AuthorizedOrForbidden]
      ? [AuthorizedOrForbidden] extends [LiveIntentKind]
        ? true
        : false
      : false = true;
    expect(partition).toBe(true);
    expect([...U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS]).toEqual([
      "push-dialog",
      "pop-dialog",
      "set-import-draft",
      "dismiss-notice",
    ]);
    expect(
      U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS.length +
        U5_FORBIDDEN_EPHEMERAL_INTENT_KINDS.length,
    ).toBe(13);
  });

  test("component inventory is closed, unique, and surfaced", () => {
    expect(U5_COMPONENT_INVENTORY).toHaveLength(U5_COMPONENT_COUNT);
    expect(new Set(U5_COMPONENT_INVENTORY.map((entry) => entry.id)).size).toBe(
      U5_COMPONENT_COUNT,
    );
    expect(
      new Set(U5_COMPONENT_INVENTORY.map((entry) => entry.name)).size,
    ).toBe(U5_COMPONENT_COUNT);
    for (const entry of U5_COMPONENT_INVENTORY) {
      expect([...U5_LIFECYCLE_SURFACES]).toContain(entry.surface);
    }
  });

  test("operation inventory obeys the channel laws", () => {
    expect(U5_LIFECYCLE_OPERATIONS).toHaveLength(U5_OPERATION_COUNT);
    const componentIds = new Set(
      U5_COMPONENT_INVENTORY.map((entry) => entry.id),
    );
    for (const operation of U5_LIFECYCLE_OPERATIONS) {
      expect(componentIds).toContain(operation.component);
      expect(operation.keyboardAccess).not.toBe("none");
      expect(operation.pointerAlternative).not.toBe("none");
      if (operation.channel === "composition-method") {
        expect(typeof operation.compositionMethod).toBe("string");
        expect(operation.intentKind).toBeNull();
      }
      if (operation.channel === "ephemeral-intent") {
        expect(operation.compositionMethod).toBeNull();
        expect([...U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS]).toContain(
          operation.intentKind as (typeof U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS)[number],
        );
      }
      if (operation.channel === "presentation-only") {
        expect(operation.compositionMethod).toBeNull();
        expect(operation.intentKind).toBeNull();
      }
    }
  });

  test("startup presentation covers every A1 disposition exactly once", () => {
    expect(U5_STARTUP_PRESENTATION).toHaveLength(5);
    expect(
      U5_STARTUP_PRESENTATION.map((row) => row.disposition),
    ).toEqual([...U5_STARTUP_DISPOSITIONS]);
    for (const row of U5_STARTUP_PRESENTATION) {
      if (row.disposition === "none-available") {
        expect(row.component).toBeNull();
        expect(row.offers).toEqual([]);
      } else {
        expect(typeof row.component).toBe("string");
        expect(row.offers.length).toBeGreaterThan(0);
      }
    }
    expect(U5_RUN_ACTIVE_STATUSES).toEqual([
      "starting",
      "playing",
      "paused",
      "stopping",
    ]);
    expect(U5_CONFIRMATION_REQUIREMENT_LAW.requiresWhen).toBe(
      "document-nonempty-and-(dirty-or-run-active)",
    );
    expect(U5_RECOVERY_VOCABULARY_KEYS).toHaveLength(5);
  });

  test("fixture manifest mirrors the module inventory exactly", async () => {
    const manifest = await readFixture("u5-lifecycle-contract.json");
    expect(manifest["schema"]).toBe(
      "changes.fixtures.u5-lifecycle-contract.v1",
    );
    expect(manifest["beadId"]).toBe(U5_LIFECYCLE_BEAD_ID);
    expect(manifest["policyId"]).toBe(U5_LIFECYCLE_POLICY_ID);
    expect(manifest["policyVersion"]).toBe(U5_LIFECYCLE_POLICY_VERSION);
    expect(manifest["implementationStatus"]).toBe(
      U5_LIFECYCLE_IMPLEMENTATION_STATUS,
    );
    expect(manifest["productionImplementationClaim"]).toBe(false);
    expect(manifest["uiCompletionClaim"]).toBe(false);
    expect(manifest["humanAcceptanceClaim"]).toBe(false);
    expect(manifest["expertReviewClaim"]).toBe(false);
    expect(manifest["surfaces"]).toEqual([...U5_LIFECYCLE_SURFACES]);
    expect(manifest["components"]).toEqual(
      U5_COMPONENT_INVENTORY.map((entry) => ({
        id: entry.id,
        name: entry.name,
        surface: entry.surface,
      })),
    );
    expect(manifest["limits"]).toEqual(U5_LIFECYCLE_LIMITS);
    expect(manifest["a0DialogKinds"]).toEqual([...U5_A0_DIALOG_KINDS]);
    expect(manifest["proposedDialogKinds"]).toEqual([
      ...U5_PROPOSED_DIALOG_KINDS,
    ]);
    expect(manifest["startupDispositions"]).toEqual([
      ...U5_STARTUP_DISPOSITIONS,
    ]);
    expect(manifest["recoveryRefusalCodes"]).toEqual([
      ...U5_RECOVERY_REFUSAL_CODES,
    ]);
    expect(manifest["importSourceChannels"]).toEqual([
      ...U5_IMPORT_SOURCE_CHANNELS,
    ]);
    expect(manifest["importFormatHints"]).toEqual([...U5_IMPORT_FORMAT_HINTS]);
    expect(manifest["importSourceFormats"]).toEqual([
      ...U5_IMPORT_SOURCE_FORMATS,
    ]);
    expect(manifest["legacyReportGroups"]).toEqual([...U5_LEGACY_REPORT_GROUPS]);
    expect(manifest["authorizedEphemeralIntentKinds"]).toEqual([
      ...U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS,
    ]);
    expect(manifest["forbiddenEphemeralIntentKinds"]).toEqual([
      ...U5_FORBIDDEN_EPHEMERAL_INTENT_KINDS,
    ]);
    expect(manifest["runActiveStatuses"]).toEqual([...U5_RUN_ACTIVE_STATUSES]);
    const operations = manifest["operations"] as readonly JsonObject[];
    expect(operations).toHaveLength(U5_OPERATION_COUNT);
    expect(operations.map((row) => row["id"])).toEqual(
      U5_LIFECYCLE_OPERATIONS.map((operation) => operation.id),
    );
    for (const [index, row] of operations.entries()) {
      const operation = U5_LIFECYCLE_OPERATIONS[index];
      expect(row["channel"]).toBe(operation?.channel);
      expect(row["compositionMethod"]).toBe(
        operation?.compositionMethod ?? null,
      );
      expect(row["intentKind"]).toBe(operation?.intentKind ?? null);
    }
  });
});

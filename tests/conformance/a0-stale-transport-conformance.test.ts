import { createHash } from "node:crypto";

import { afterAll, describe, expect, test } from "bun:test";

import {
  APPLICATION_REQUEST_KINDS,
  acceptTransportNotification,
  beginApplicationRequest,
  reduceEphemeralIntent,
  runDocumentCommand,
  settleApplicationRequest,
  type AppState,
  type ApplicationRequestKind,
  type ApplicationTransitionResult,
  type DerivedDocumentPatch,
  type TransportNotification,
} from "../../src/application";
import type { ValidatedDocument } from "../../src/domain";
import staleFixture from
  "../fixtures/application-state/stale-and-transport-cases.json";
import {
  a0Dependencies,
  a0Envelope,
  a0InitialState,
  a0TemplateDocument,
} from "../support/a0-application-fixture";

const observations = new Map<string, string>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function record(id: string, value: unknown): void {
  if (observations.has(id)) throw new Error(`A0_CASE_DUPLICATE:${id}`);
  observations.set(id, digest({ id, value }));
}

function success(
  result: ApplicationTransitionResult,
  label: string,
): Extract<ApplicationTransitionResult, { ok: true }> {
  expect(result.ok, label).toBe(true);
  if (!result.ok) throw new Error(`${label}:${result.refusal.code}`);
  return result;
}

function stateAtRevision(
  revision: number,
  document: ValidatedDocument = a0TemplateDocument(),
): AppState {
  const initial = a0InitialState(document);
  return Object.freeze({
    ...initial,
    revision,
    quickEntry: Object.freeze({
      ...initial.quickEntry,
      baseRevision: revision,
    }),
    transport: Object.freeze({
      ...initial.transport,
      documentId: document.id,
      planRevision: revision,
    }),
  });
}

function start(
  state: AppState,
  kind: ApplicationRequestKind,
  id: number,
): AppState {
  return success(beginApplicationRequest({
    state,
    request: {
      kind,
      id,
      documentId: state.document.id,
      baseRevision: state.revision,
      status: "running",
    },
  }), `start:${kind}:${String(id)}`).state;
}

function withTransport(
  state: AppState,
  values: Partial<AppState["transport"]>,
): AppState {
  return Object.freeze({
    ...state,
    transport: Object.freeze({ ...state.transport, ...values }),
  });
}

function notification(
  state: AppState,
  values: Partial<TransportNotification> = {},
): TransportNotification {
  return Object.freeze({
    status: "ready",
    generation: state.transport.generation + 1,
    commandRequestId: state.transport.commandRequestId,
    notificationSequence: state.transport.notificationSequence + 1,
    documentId: state.document.id,
    planRevision: state.revision,
    startBeat: state.transport.startBeat,
    playhead: state.transport.playhead,
    failureCode: null,
    ...values,
  });
}

function currentPatch(state: AppState, title: string): DerivedDocumentPatch {
  const event = state.document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("A0_STALE_PATCH_EVENT");
  return Object.freeze({
    baseRevision: state.revision,
    sourceEventIds: Object.freeze([event.id]),
    declaredChangedIds: Object.freeze([state.document.id]),
    candidate: Object.freeze({ ...state.document, title }),
    exactTimingPreserved: true,
    stableIdentityPolicy: "preserve-unmodified-allocate-new-inserts",
  });
}

describe("A0 reviewed stale-result cases", () => {
  test("A0-STALE-001 begins one current suggestion request", () => {
    const state = stateAtRevision(5);
    const result = beginApplicationRequest({
      state,
      request: {
        kind: "suggestion-search",
        id: 10,
        documentId: state.document.id,
        baseRevision: 5,
        status: "running",
      },
    });
    const accepted = success(result, "A0-STALE-001");
    expect(accepted.outcome).toBe("request-started");
    expect(accepted.state.pendingRequests.map(({ kind }) => kind)).toEqual([
      "suggestion-search",
    ]);
    expect(accepted.state.revision).toBe(5);
    record("A0-STALE-001", {
      outcome: accepted.outcome,
      pending: accepted.state.pendingRequests,
    });
  });

  test("A0-STALE-002 refuses a busy request slot", () => {
    const state = start(stateAtRevision(5), "suggestion-search", 10);
    const result = beginApplicationRequest({
      state,
      request: {
        kind: "suggestion-search",
        id: 11,
        documentId: state.document.id,
        baseRevision: state.revision,
        status: "running",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("A0-STALE-002 accepted");
    expect(result.refusal.code).toBe("request.slot_busy");
    expect(result.state.pendingRequests).toBe(state.pendingRequests);
    record("A0-STALE-002", result.refusal);
  });

  test("A0-STALE-003 refuses a ninth distinct request", () => {
    let state = stateAtRevision(5);
    for (const [index, kind] of APPLICATION_REQUEST_KINDS.slice(1, 9).entries()) {
      state = start(state, kind, index + 1);
    }
    const result = beginApplicationRequest({
      state,
      request: {
        kind: "analysis",
        id: 99,
        documentId: state.document.id,
        baseRevision: state.revision,
        status: "running",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("A0-STALE-003 accepted");
    expect(result.refusal.code).toBe("request.limit");
    expect(result.state.pendingRequests).toHaveLength(8);
    record("A0-STALE-003", {
      refusal: result.refusal.code,
      count: result.state.pendingRequests.length,
    });
  });

  test("A0-STALE-004 settles the exact current token", () => {
    const state = start(stateAtRevision(5), "analysis", 7);
    const result = success(settleApplicationRequest({
      state,
      kind: "analysis",
      id: 7,
      documentId: state.document.id,
      baseRevision: 5,
      disposition: "complete",
    }), "A0-STALE-004");
    expect(result.outcome).toBe("request-settled");
    expect(result.state.pendingRequests).toEqual([]);
    record("A0-STALE-004", result.outcome);
  });

  test("A0-STALE-005 ignores an old request ID by identity", () => {
    const state = start(stateAtRevision(5), "analysis", 8);
    const result = success(settleApplicationRequest({
      state,
      kind: "analysis",
      id: 7,
      documentId: state.document.id,
      baseRevision: 5,
      disposition: "complete",
    }), "A0-STALE-005");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-STALE-005", result.outcome);
  });

  test("A0-STALE-006 ignores an old request revision", () => {
    const state = start(stateAtRevision(6), "voicing-search", 8);
    const result = success(settleApplicationRequest({
      state,
      kind: "voicing-search",
      id: 8,
      documentId: state.document.id,
      baseRevision: 5,
      disposition: "complete",
    }), "A0-STALE-006");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-STALE-006", result.outcome);
  });

  test("A0-STALE-007 ignores an old document token", () => {
    const state = start(
      stateAtRevision(6, a0TemplateDocument("representativeCustomManual")),
      "import-read",
      8,
    );
    const oldDocument = a0TemplateDocument();
    const result = success(settleApplicationRequest({
      state,
      kind: "import-read",
      id: 8,
      documentId: oldDocument.id,
      baseRevision: 6,
      disposition: "complete",
    }), "A0-STALE-007");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-STALE-007", result.outcome);
  });

  test("A0-STALE-008 cancels exactly one current slot", () => {
    let state = start(stateAtRevision(5), "analysis", 1);
    state = start(state, "suggestion-search", 2);
    const result = success(settleApplicationRequest({
      state,
      kind: "analysis",
      id: 1,
      documentId: state.document.id,
      baseRevision: 5,
      disposition: "cancel",
    }), "A0-STALE-008");
    expect(result.outcome).toBe("request-cancelled");
    expect(result.state.pendingRequests.map(({ kind }) => kind)).toEqual([
      "suggestion-search",
    ]);
    record("A0-STALE-008", result.state.pendingRequests);
  });

  test("A0-STALE-009 cannot cancel a newer slot", () => {
    const state = start(stateAtRevision(8), "suggestion-search", 3);
    const result = success(settleApplicationRequest({
      state,
      kind: "suggestion-search",
      id: 2,
      documentId: state.document.id,
      baseRevision: 8,
      disposition: "cancel",
    }), "A0-STALE-009");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-STALE-009", result.outcome);
  });

  test("A0-STALE-010 applies an independent command revision gate", () => {
    const initial = start(stateAtRevision(8), "suggestion-search", 44);
    const stalePatch = currentPatch(initial, "Never publish");
    const edit = success(runDocumentCommand({
      state: initial,
      command: {
        ...a0Envelope(initial, "intervening-edit", 0),
        kind: "set-text",
        coalescing: {
          kind: "text-field",
          key: "title",
          focusSessionId: "stale-gate",
        },
        target: { kind: "document-title" },
        value: "Current title",
      },
      dependencies: a0Dependencies(),
    }), "A0-STALE-010 edit").state;
    const result = runDocumentCommand({
      state: edit,
      command: {
        ...a0Envelope(edit, "stale-apply", 1),
        kind: "apply-suggestion",
        suggestionId: "old",
        providerId: "fixture",
        requestId: 44,
        patch: stalePatch,
      },
      dependencies: a0Dependencies(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("A0-STALE-010 accepted");
    expect(result.refusal.code).toBe("command.derived_patch_stale");
    expect(result.state.document).toBe(edit.document);
    record("A0-STALE-010", result.refusal);
  });
});

describe("A0 reviewed transport projection cases", () => {
  test("A0-TRANSPORT-001 accepts a current first ready notification", () => {
    let state = stateAtRevision(5);
    state = success(reduceEphemeralIntent({
      state,
      intent: {
        kind: "expect-transport",
        commandRequestId: 4,
        documentId: state.document.id,
        planRevision: 5,
        status: "starting",
        startBeat: state.transport.startBeat,
        playhead: state.transport.playhead,
      },
    }), "A0-TRANSPORT-001 expect").state;
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        status: "ready",
        generation: 1,
        notificationSequence: 1,
      }),
    }), "A0-TRANSPORT-001");
    expect(result.outcome).toBe("transport-accepted");
    expect(result.state.transport.status).toBe("ready");
    expect(result.state.revision).toBe(5);
    record("A0-TRANSPORT-001", result.state.transport);
  });

  test("A0-TRANSPORT-002 accepts a higher generation and reset sequence", () => {
    const state = withTransport(stateAtRevision(5), {
      generation: 4,
      notificationSequence: 99,
      commandRequestId: 8,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        generation: 5,
        notificationSequence: 1,
      }),
    }), "A0-TRANSPORT-002");
    expect(result.state.transport.generation).toBe(5);
    expect(result.state.transport.notificationSequence).toBe(1);
    record("A0-TRANSPORT-002", result.state.transport);
  });

  test("A0-TRANSPORT-003 accepts a higher sequence in one generation", () => {
    const state = withTransport(stateAtRevision(5), {
      generation: 5,
      notificationSequence: 4,
      commandRequestId: 8,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        generation: 5,
        notificationSequence: 5,
      }),
    }), "A0-TRANSPORT-003");
    expect(result.outcome).toBe("transport-accepted");
    expect(result.state.transport.notificationSequence).toBe(5);
    record("A0-TRANSPORT-003", result.state.transport);
  });

  test("A0-TRANSPORT-004 ignores an equal sequence", () => {
    const state = withTransport(stateAtRevision(5), {
      generation: 5,
      notificationSequence: 5,
      commandRequestId: 8,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        generation: 5,
        notificationSequence: 5,
      }),
    }), "A0-TRANSPORT-004");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-TRANSPORT-004", result.outcome);
  });

  test("A0-TRANSPORT-005 ignores a lower generation", () => {
    const state = withTransport(stateAtRevision(5), {
      generation: 5,
      notificationSequence: 5,
      commandRequestId: 8,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        generation: 4,
        notificationSequence: 999,
      }),
    }), "A0-TRANSPORT-005");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-TRANSPORT-005", result.outcome);
  });

  test("A0-TRANSPORT-006 ignores an old command request", () => {
    const state = withTransport(stateAtRevision(5), {
      status: "ready",
      generation: 6,
      notificationSequence: 7,
      commandRequestId: 10,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        status: "playing",
        generation: 6,
        commandRequestId: 9,
        notificationSequence: 50,
      }),
    }), "A0-TRANSPORT-006");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-TRANSPORT-006", result.outcome);
  });

  test("A0-TRANSPORT-007 ignores an old document", () => {
    const state = withTransport(
      stateAtRevision(20, a0TemplateDocument("representativeCustomManual")),
      { generation: 8, commandRequestId: 12 },
    );
    const oldDocument = a0TemplateDocument();
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        generation: 9,
        documentId: oldDocument.id,
        planRevision: 19,
      }),
    }), "A0-TRANSPORT-007");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-TRANSPORT-007", result.outcome);
  });

  test("A0-TRANSPORT-008 ignores an old plan revision", () => {
    const state = withTransport(stateAtRevision(20), {
      generation: 8,
      commandRequestId: 12,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        generation: 9,
        planRevision: 19,
      }),
    }), "A0-TRANSPORT-008");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-TRANSPORT-008", result.outcome);
  });

  test("A0-TRANSPORT-009 refuses an unsafe notification sequence", () => {
    const state = withTransport(stateAtRevision(20), {
      generation: 8,
      commandRequestId: 12,
    });
    const result = acceptTransportNotification({
      state,
      notification: notification(state, {
        notificationSequence: Number.MAX_SAFE_INTEGER + 1,
      }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("A0-TRANSPORT-009 accepted");
    expect(result.refusal.code).toBe("transport.notification_invalid");
    expect(result.state.transport).toBe(state.transport);
    record("A0-TRANSPORT-009", result.refusal);
  });

  test("A0-TRANSPORT-010 blocks delayed playing after Stop-ready", () => {
    const state = withTransport(stateAtRevision(20), {
      status: "ready",
      generation: 11,
      commandRequestId: 21,
      notificationSequence: 7,
    });
    const result = success(acceptTransportNotification({
      state,
      notification: notification(state, {
        status: "playing",
        generation: 10,
        commandRequestId: 20,
        notificationSequence: 999,
        playhead: state.transport.startBeat,
      }),
    }), "A0-TRANSPORT-010");
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
    record("A0-TRANSPORT-010", result.outcome);
  });
});

afterAll(() => {
  const expectedIds = staleFixture.cases.map(({ id }) => id);
  expect([...observations.keys()]).toEqual(expectedIds);
  const observation = {
    schema: "changes.evidence.a0-stale-transport-observation.v1",
    caseIds: expectedIds,
    caseHashes: Object.fromEntries(observations),
    casesObserved: observations.size,
    ignoredStaleCases: 10,
    refusalCases: 4,
    positiveOrCancellationCases: 6,
    exactStateIdentityChecks: 10,
    status: "pass",
  };
  console.log(
    `A0_STALE_TRANSPORT_OBSERVATION ${JSON.stringify(canonical(observation))}`,
  );
});

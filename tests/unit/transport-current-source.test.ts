import { expect, test } from "bun:test";
import { acceptTransportNotification, type AcceptTransportNotificationRequest, type AppState, type TransportNotification } from "../../src/application";
import { a0InitialState } from "../support/a0-application-fixture";
import { parseStableId } from "../../src/domain";

function specimen(): AcceptTransportNotificationRequest {
  const initial = a0InitialState();
  const state: AppState = { ...initial, revision: 6, transport: { ...initial.transport,
    documentId: initial.document.id, planRevision: 5, commandRequestId: 10,
    generation: 3, notificationSequence: 7, status: "playing" } };
  const notification: TransportNotification = { ...state.transport, status: "paused",
    commandRequestId: 11, generation: 4, notificationSequence: 8,
    failureCode: "transport.interrupted" };
  return { state, notification, currentSource: {
    documentId: initial.document.id, planRevision: 5, viewRevision: 6,
    commandRequestId: 11, generation: 4, notificationSequence: 8, status: "paused",
  } };
}

test("current source accepts the actual older bound revision without rewriting the notification", () => {
  const request = specimen();
  const result = acceptTransportNotification(request);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.code);
  expect(result.outcome).toBe("transport-accepted");
  expect(result.state.transport).toEqual(request.notification);
  expect(result.state.transport.planRevision).toBe(5);
  expect(result.state.revision).toBe(6);
  expect(result.state.document).toBe(request.state.document);
  expect(result.state.history).toBe(request.state.history);
  expect(result.effects).toEqual([]);
  expect(result.counters.transportNotificationsCompared).toBe(1);
});

test("omitting current source preserves the original exact-revision/request law", () => {
  const { state, notification } = specimen();
  const result = acceptTransportNotification({ state, notification });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.code);
  expect(result.outcome).toBe("ignored-stale");
  expect(result.state).toBe(state);
});

const mismatches = [
  { viewRevision: 5 }, { planRevision: 6 }, { commandRequestId: 12 },
  { generation: 5 }, { notificationSequence: 9 }, { status: "playing" as const },
];
for (const mismatch of mismatches) {
  test(`current-source near miss preserves exact state: ${JSON.stringify(mismatch)}`, () => {
    const request = specimen();
    if (request.currentSource === undefined) throw new Error("Missing literal source");
    const result = acceptTransportNotification({ ...request,
      currentSource: { ...request.currentSource, ...mismatch } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(request.state);
  });
}

for (const patch of [{ commandRequestId: 12 }, { generation: 5 }, { generation: 4, notificationSequence: 8 }]) {
  test(`a live source cannot overtake an existing fence: ${JSON.stringify(patch)}`, () => {
    const request = specimen();
    const state: AppState = { ...request.state, transport: { ...request.state.transport, ...patch } };
    const result = acceptTransportNotification({ ...request, state });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.outcome).toBe("ignored-stale");
    expect(result.state).toBe(state);
  });
}

for (const patch of [{ viewRevision: -1 }, { commandRequestId: 0 }, { planRevision: Number.NaN }, { generation: Number.MAX_SAFE_INTEGER + 1 }]) {
  test(`malformed live source refuses before projection: ${JSON.stringify(patch)}`, () => {
    const request = specimen();
    if (request.currentSource === undefined) throw new Error("Missing literal source");
    const result = acceptTransportNotification({ ...request, currentSource: { ...request.currentSource, ...patch } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Malformed source was accepted");
    expect(result.refusal.code).toBe("transport.notification_invalid");
    expect(result.state.document).toBe(request.state.document);
    expect(result.state.transport).toBe(request.state.transport);
    expect(result.state.history).toBe(request.state.history);
    expect(result.state.notices.at(-1)?.code).toBe("transport.notification_invalid");
  });
}

test("foreign document identity cannot be authorized by an otherwise current service", () => {
  const request = specimen();
  if (request.currentSource === undefined) throw new Error("Missing literal source");
  const foreign = parseStableId("document", "doc-other-current-service");
  if (!foreign.ok) throw new Error("Invalid independent document ID");
  const result = acceptTransportNotification({ ...request,
    notification: { ...request.notification, documentId: foreign.value },
    currentSource: { ...request.currentSource, documentId: foreign.value } });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.code);
  expect(result.outcome).toBe("ignored-stale");
  expect(result.state).toBe(request.state);
});

test("runtime source shape and unsettled statuses cannot pose as service evidence", () => {
  const request = specimen();
  for (const malformed of [null, [], { ...request.currentSource, status: "starting" },
    { ...request.currentSource, status: "stopping" }, { ...request.currentSource, status: "unavailable" }]) {
    // Deliberately cross the typed boundary to exercise runtime refusals.
    const currentSource = malformed as unknown as NonNullable<AcceptTransportNotificationRequest["currentSource"]>;
    const result = acceptTransportNotification({ ...request, currentSource });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Malformed source was accepted");
    expect(result.refusal.code).toBe("transport.notification_invalid");
    expect(result.state.transport).toBe(request.state.transport);
  }
});

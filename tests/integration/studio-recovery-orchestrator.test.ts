/**
 * A1 recovery orchestrator over the REAL service and the REAL
 * replacement channel (jcpe-milestone-reliable-studio-l3a.2 wiring
 * steps 2-4): the mutation feed notes controller advances into the real
 * recovery service (fake adapters, fake clock — the service's own
 * scheduler laws run for real); startup reads a seeded envelope through
 * the reviewed matrix; and Keep re-enters the candidate through F2/F3
 * and commits through the workflow + v2 driver + sealed owner ports +
 * REAL serialized-transport X1 retirement — flipping the controller to
 * the recovered document. A corrupt candidate refuses and cancels the
 * workflow so a later Keep still works; a failed Keep changes nothing.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioBootstrap,
  createStudioCompositionOverState,
  createStudioRecoveryOrchestrator,
  createX1SerializedTransportRetirementAdapter,
  validateDocumentSemantics,
} from "../../src/application";
import type { ApplicationCommandDependencies } from "../../src/application/application-state-contract";
import { decodeDocumentShape } from "../../src/domain";
import {
  computeEnvelopeChecksum,
  recoveryStorageKey,
} from "../../src/persistence";
import {
  createRecoveryHarness,
} from "../support/recovery-test-kit";
import {
  compiledPlan,
  createTransportHarness,
  initializePayload,
} from "../support/transport-test-kit";

const ESTIMATE = 4_000;

const RECOVERED_RAW = Object.freeze({
  schema: "changes.progression.v2",
  id: "recovered-document-1",
  title: "Recovered Chart",
  description: "",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  tempoBpm: 132,
  key: null,
  sections: Object.freeze([]),
  playback: Object.freeze({
    instrumentId: "mellow-keys",
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 0,
  }),
});

async function checksummedEnvelope(fields: Readonly<{
  revision: number;
  document: unknown;
  savedAt: string;
}>): Promise<string> {
  const body = {
    schema: "changes.recovery.v1",
    savedAt: fields.savedAt,
    revision: fields.revision,
    document: fields.document,
  };
  const checksum = await computeEnvelopeChecksum(body);
  return JSON.stringify({ ...body, checksum });
}

async function createHarness() {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("RECOVERY_TEST_BOOTSTRAP");
  const dependencies: ApplicationCommandDependencies = Object.freeze({
    ...bootstrap.value.dependencies,
    estimateHistoryRetainedBytes: () => ESTIMATE,
  });
  const transport = createTransportHarness();
  const init = await transport.submit(initializePayload(compiledPlan()));
  if (init.termination !== "receipt") throw new Error("RECOVERY_TEST_TRANSPORT");
  const liveGeneration = transport.service.inspectTransport().generation;
  const syncedState = Object.freeze({
    ...bootstrap.value.state,
    transport: Object.freeze({
      ...bootstrap.value.state.transport,
      generation: liveGeneration as never,
    }),
  });
  const composition = createStudioCompositionOverState(
    syncedState,
    dependencies,
    {},
  );
  const recoveryHarness = createRecoveryHarness([{ kind: "indexeddb" }]);
  let seedOrdinal = 0;
  const orchestrator = createStudioRecoveryOrchestrator({
    composition,
    recovery: recoveryHarness.service,
    retirement: createX1SerializedTransportRetirementAdapter(
      transport.service,
      transport.nextRequestId,
    ),
    decodeDocumentShape,
    validateDocumentSemantics,
    readState: composition.readApplicationState,
    estimateHistoryRetainedBytes: () => ESTIMATE,
    nowMs: () => 9_000,
    allocateCommandSeedId: () => {
      seedOrdinal += 1;
      return `recovery-keep-${String(seedOrdinal)}`;
    },
  });
  return { composition, transport, recoveryHarness, orchestrator };
}

describe("A1 recovery orchestrator (real service, real replacement channel)", () => {
  test("the mutation feed notes the current state and a scheduled write persists it", async () => {
    const h = await createHarness();
    const detach = h.orchestrator.attachMutationFeed();
    /* the service's own 400ms idle scheduler runs on the fake clock */
    await h.recoveryHarness.clock.advance(2_500);
    const state = h.composition.readApplicationState();
    const currentKey = recoveryStorageKey(state.document.id, "current");
    const stored = h.recoveryHarness.adapters[0]?.store.get(currentKey);
    expect(typeof stored).toBe("string");
    const parsed = JSON.parse(stored ?? "{}") as Readonly<{
      revision: number;
      document: unknown;
    }>;
    expect(parsed.revision).toBe(state.revision);
    detach();
  });

  test("startup surfaces a seeded valid envelope through the reviewed matrix", async () => {
    const h = await createHarness();
    const state = h.composition.readApplicationState();
    const envelopeText = await checksummedEnvelope({
      revision: 7,
      document: RECOVERED_RAW,
      savedAt: "2026-09-01T12:00:00.000Z",
    });
    h.recoveryHarness.adapters[0]?.store.set(
      recoveryStorageKey(state.document.id, "current"),
      envelopeText,
    );
    const view = await h.orchestrator.startup({ sessionEdited: true });
    expect(view.kind).toBe("offer");
    if (view.kind !== "offer") return;
    expect(view.disposition).toBe("offer-keep-discard");
    expect(view.revision).toBe(7);
    expect(view.savedAt).toBe("2026-09-01T12:00:00.000Z");
  });

  test("Keep commits the recovered candidate through the full production channel", async () => {
    const h = await createHarness();
    const state = h.composition.readApplicationState();
    const before = String(state.document.id);
    const envelopeText = await checksummedEnvelope({
      revision: 7,
      document: RECOVERED_RAW,
      savedAt: "2026-09-01T12:00:00.000Z",
    });
    h.recoveryHarness.adapters[0]?.store.set(
      recoveryStorageKey(state.document.id, "current"),
      envelopeText,
    );
    const view = await h.orchestrator.startup({ sessionEdited: true });
    if (view.kind !== "offer") throw new Error("EXPECTED_OFFER");
    const generation = h.transport.service.inspectTransport().generation;

    const kept = await h.orchestrator.keep(view.envelope);
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.documentId).toBe("recovered-document-1");

    const after = h.composition.readApplicationState();
    expect(String(after.document.id)).toBe("recovered-document-1");
    expect(String(after.document.id)).not.toBe(before);
    expect(after.documentTransition.kind).toBe("idle");
    expect(after.pendingRequests.length).toBe(0);
    /* the real transport retired its plan for the replacement */
    expect(h.transport.service.inspectTransport().generation).toBe(
      generation + 1,
    );
  });

  test("a corrupt candidate refuses, cancels the workflow, and a later Keep still works", async () => {
    const h = await createHarness();
    const corrupt = Object.freeze({
      schema: "changes.recovery.v1",
      savedAt: "2026-09-01T12:00:00.000Z",
      revision: 7,
      document: Object.freeze({ schema: "changes.progression.v2" }),
      checksum: "0".repeat(64),
    });
    const refused = await h.orchestrator.keep(corrupt);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("import.candidate_structural_invalid");
    /* nothing changed and the workflow is idle: a valid Keep succeeds */
    const envelope = JSON.parse(
      await checksummedEnvelope({
        revision: 7,
        document: RECOVERED_RAW,
        savedAt: "2026-09-01T12:00:00.000Z",
      }),
    ) as never;
    const kept = await h.orchestrator.keep(envelope);
    expect(kept.ok).toBe(true);
  });

  test("discard clears the stored envelope for the current document", async () => {
    const h = await createHarness();
    const state = h.composition.readApplicationState();
    const currentKey = recoveryStorageKey(state.document.id, "current");
    h.recoveryHarness.adapters[0]?.store.set(
      currentKey,
      await checksummedEnvelope({
        revision: 7,
        document: RECOVERED_RAW,
        savedAt: "2026-09-01T12:00:00.000Z",
      }),
    );
    await h.orchestrator.startup({ sessionEdited: true });
    await h.orchestrator.discard();
    expect(h.recoveryHarness.adapters[0]?.store.get(currentKey)).toBeUndefined();
  });
});

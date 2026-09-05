import type { CommitImportReplacementRequestV2, CommitImportReplacementResultV2 } from "./e0-interchange-v2-contract";
import type { RetireImportReplacementRequest, X1ReplacementRetirementAdapter } from "./e0-interchange-contract";
import { createE0V2TransactionDriver } from "./e0-transaction-driver";
import type { StudioComposition } from "./studio-controller";
import { provesSafeReconciliation } from "./studio-replacement-reconciliation";
import type { StudioReplacementRetirementAdapter } from "./x1-retirement-adapter";

export type StudioImportRetirementAdapter = X1ReplacementRetirementAdapter &
  Partial<Pick<StudioReplacementRetirementAdapter, "reconcileImportReplacement">>;

/** Consume E0's terminal evidence without mistaking a discarded candidate for
 * a safely stopped transport. Import and recovery use this same private path. */
export async function runStudioImportReplacement(
  composition: StudioComposition,
  retirement: StudioImportRetirementAdapter,
  request: CommitImportReplacementRequestV2,
): Promise<Readonly<{ ok: true; result: Extract<CommitImportReplacementResultV2, { ok: true }> }> |
  Readonly<{ ok: false; code: string; reconciliationRequired: boolean; safelyStopped: boolean }>> {
  // Captured from the actual prepared echo sent by E0, never reconstructed
  // from a stale preview or from the current transport generation.
  const attempted: { request: RetireImportReplacementRequest | null } = { request: null };
  const driver = createE0V2TransactionDriver(composition.interchangeOwner, {
    retireImportReplacement: (sent) => {
      attempted.request = sent;
      return retirement.retireImportReplacement(sent);
    },
  });
  let code = "import.replacement_request_invalid";
  let needsReconciliation = false;
  try {
    const result = await driver(request);
    if (result.ok) return Object.freeze({ ok: true, result });
    code = result.outcome === "refused" ? result.code : "import.replacement_port_protocol_invalid";
    needsReconciliation = result.outcome === "refused"
      ? result.code === "transport.replacement_retirement_evidence_invalid"
      : result.reconciliation === "application-transport-reconciliation-required";
  } catch {
    // Includes hostile/throwing evidence readers outside E0's adapter await.
    // Its request-keyed discard is idempotent and must precede another stop.
    composition.interchangeOwner.discardImportReplacementPublication({
      identity: request.ownerRequest.identity,
      reason: attempted.request === null ? "preparation-protocol-invalid" : "retirement-protocol-invalid",
    });
    needsReconciliation = attempted.request !== null;
    if (needsReconciliation) code = "transport.replacement_retirement_evidence_invalid";
  }
  let safelyStopped = false;
  if (needsReconciliation && attempted.request !== null) {
    try {
      const evidence = await retirement.reconcileImportReplacement?.(attempted.request);
      safelyStopped = provesSafeReconciliation(evidence, attempted.request);
    } catch {
      // Uncertain reconciliation keeps the original transition locked.
    }
  }
  const reconciliationRequired = needsReconciliation && !safelyStopped;
  if (!reconciliationRequired) composition.replacementWorkflow.cancel(request.ownerRequest.identity);
  return Object.freeze({ ok: false, code, reconciliationRequired, safelyStopped });
}

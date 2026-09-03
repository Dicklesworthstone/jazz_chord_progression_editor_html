/**
 * E0 v2 state-free replacement transaction driver
 * (docs/E0_INTERCHANGE_CONTRACT.md section 9 as amended by the accepted
 * docs/E0_V2_INTERCHANGE_CONTRACT.md; production build
 * jcpe-milestone-reliable-studio-l3a.8.2 stage 3).
 *
 * The driver is the sole commit orchestration. Its order is load-bearing:
 * confirmation provenance is proved BEFORE the owner is called; the owner
 * preparation runs BEFORE any X1 call so no user-input/stale/impact
 * refusal can remain after transport retirement; X1 evidence is validated
 * field-for-field (exact request echo + all three postconditions) before
 * the narrowed A0 receipt is constructed; and the publication port's
 * return is normalized before any claim is made. Every failure after a
 * live preparation synchronously discards it with one of the four closed
 * reasons, and every path returns with `liveForRequest: 0`.
 *
 * X1 law: until the serialized-transport retirement adapter is
 * implemented and production-bound, the composition must bind
 * `createUnavailableReplacementRetirementAdapter()` — apply then refuses
 * honestly with `retirementEffect: "none"`. Installing a fake success
 * adapter is forbidden by the contract.
 */
import type {
  A0E0InterchangeOwnerPorts,
  ApplicationDocumentIdentity,
  ImportRequestIdentity,
  PreparedImportReplacementPublication,
} from "./application-interchange-owner-contract";
import type { ReplacementRetirementReceipt } from "./application-state-contract";
import {
  X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA,
  type RetireImportReplacementRequest,
  type X1ReplacementRetirementAdapter,
} from "./e0-interchange-contract";
import {
  E0_V2_COMMIT_REQUEST_SCHEMA,
  type CommitImportReplacementRequestV2,
  type CommitImportReplacementResultV2,
} from "./e0-interchange-v2-contract";
import {
  normalizeIdentityResult,
  normalizePreparationResult,
  normalizePublicationResult,
  threwOrRejected,
} from "./e0-v2-port-normalization";

export type E0V2TransactionDriver = (
  request: CommitImportReplacementRequestV2,
) => Promise<CommitImportReplacementResultV2>;

/**
 * The honest stand-in demanded by the contract while X1's serialized
 * retirement leg is unbound: an explicit no-effect refusal, never a fake
 * success.
 */
export function createUnavailableReplacementRetirementAdapter(): X1ReplacementRetirementAdapter {
  return Object.freeze({
    retireImportReplacement: () =>
      Promise.resolve(
        Object.freeze({
          ok: false as const,
          code: "transport.replacement_retirement_unavailable" as const,
          retirementEffect: "none" as const,
        }),
      ),
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const present = Object.keys(record);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.hasOwn(record, key));
}

const OWNER_REQUEST_KEYS = Object.freeze([
  "identity",
  "sourceFormat",
  "replacementOrigin",
  "candidate",
  "replacementCommandSeed",
  "disclosedImpact",
  "currentTransition",
  "nonUndoableConfirmation",
] as const);

/**
 * E0V2-RES-01: the commit request is state-free evidence with the exact
 * key set schema/ownerRequest/confirmationBinding. A smuggled v1
 * `currentState` (or any other extra key, at the request or owner-request
 * level), a wrong schema, or a malformed confirmation binding refuses
 * `import.replacement_request_invalid` before ANY owner call — including
 * the identity read, so the observed identity is request-derived.
 */
function requestShapeValid(request: unknown): boolean {
  if (!isRecord(request)) return false;
  if (!hasExactKeys(request, ["schema", "ownerRequest", "confirmationBinding"])) {
    return false;
  }
  if (request["schema"] !== E0_V2_COMMIT_REQUEST_SCHEMA) return false;
  const ownerRequest = request["ownerRequest"];
  if (!isRecord(ownerRequest) || !hasExactKeys(ownerRequest, OWNER_REQUEST_KEYS)) {
    return false;
  }
  const binding = request["confirmationBinding"];
  return (
    isRecord(binding) &&
    hasExactKeys(binding, [
      "displayedRequirement",
      "acknowledgement",
      "byteMatchProvedBeforeOwnerCall",
    ]) &&
    binding["byteMatchProvedBeforeOwnerCall"] === true
  );
}

function requestDerivedIdentity(request: unknown): ImportRequestIdentity {
  if (isRecord(request)) {
    const ownerRequest = request["ownerRequest"];
    if (isRecord(ownerRequest)) {
      const identity = ownerRequest["identity"];
      if (
        isRecord(identity) &&
        typeof identity["requestId"] === "number" &&
        typeof identity["documentId"] === "string" &&
        typeof identity["baseRevision"] === "number"
      ) {
        return identity as unknown as ImportRequestIdentity;
      }
    }
  }
  /* The request is untyped garbage; an honest zero identity beats a throw. */
  return Object.freeze({
    requestId: 0,
    documentId: "",
    baseRevision: 0,
  }) as unknown as ImportRequestIdentity;
}

function identitiesEqual(
  left: ImportRequestIdentity,
  right: unknown,
): boolean {
  return (
    isRecord(right) &&
    right["requestId"] === left.requestId &&
    right["documentId"] === left.documentId &&
    right["baseRevision"] === left.baseRevision
  );
}

/**
 * Validate the raw asynchronous X1 return: either the exact no-effect
 * refusal envelope, or complete evidence whose request echo is
 * field-identical to what the driver sent and whose receipt reports the
 * observed request ID, retired generation, and all three retirement
 * postconditions true. Anything else is an evidence breach.
 */
type RetirementJudgement =
  | Readonly<{ kind: "retired"; retiredTransportGeneration: number }>
  | Readonly<{ kind: "refused" }>
  | Readonly<{ kind: "evidence-invalid" }>;

function judgeRetirement(
  raw: unknown,
  sent: RetireImportReplacementRequest,
): RetirementJudgement {
  if (!isRecord(raw)) return Object.freeze({ kind: "evidence-invalid" as const });
  if (raw["ok"] === false) {
    const code = raw["code"];
    if (
      (code === "transport.replacement_retirement_unavailable" ||
        code === "transport.replacement_retirement_failed" ||
        code === "transport.replacement_retirement_stale") &&
      raw["retirementEffect"] === "none" &&
      Object.keys(raw).length === 3
    ) {
      return Object.freeze({ kind: "refused" as const });
    }
    return Object.freeze({ kind: "evidence-invalid" as const });
  }
  if (raw["ok"] !== true) {
    return Object.freeze({ kind: "evidence-invalid" as const });
  }
  const value = raw["value"];
  if (
    Object.keys(raw).length !== 2 ||
    !isRecord(value) ||
    value["schema"] !== X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA ||
    value["authority"] !== "x1-serialized-transport"
  ) {
    return Object.freeze({ kind: "evidence-invalid" as const });
  }
  const echo = value["request"];
  if (
    !isRecord(echo) ||
    !identitiesEqual(sent.identity, echo["identity"]) ||
    echo["sourceFormat"] !== sent.sourceFormat ||
    echo["candidateDocumentId"] !== sent.candidateDocumentId ||
    echo["expectedTransportGeneration"] !== sent.expectedTransportGeneration ||
    echo["scope"] !== sent.scope ||
    echo["requiredPostcondition"] !== sent.requiredPostcondition
  ) {
    return Object.freeze({ kind: "evidence-invalid" as const });
  }
  const receipt = value["receipt"];
  if (
    !isRecord(receipt) ||
    receipt["requestId"] !== sent.identity.requestId ||
    receipt["retiredTransportGeneration"] !==
      sent.expectedTransportGeneration ||
    receipt["progressionRetired"] !== true ||
    receipt["previewRetired"] !== true ||
    receipt["noFutureAttack"] !== true
  ) {
    return Object.freeze({ kind: "evidence-invalid" as const });
  }
  return Object.freeze({
    kind: "retired" as const,
    retiredTransportGeneration:
      receipt["retiredTransportGeneration"],
  });
}

export function createE0V2TransactionDriver(
  ports: A0E0InterchangeOwnerPorts,
  retirement: X1ReplacementRetirementAdapter,
): E0V2TransactionDriver {

  const observeIdentity = (
    fallback: ImportRequestIdentity,
  ): ApplicationDocumentIdentity => {
    /*
     * Best-effort observation for refusal envelopes. A malformed or
     * throwing identity read here must not mask the refusal being
     * reported, so it degrades to the request's own document identity;
     * the identity-read port's own protocol handling is exercised where
     * the read IS the operation (the marker path).
     */
    try {
      const normalized = normalizeIdentityResult(
        ports.readCurrentApplicationDocumentIdentity(),
      );
      if (normalized.outcome === "normalized") return normalized.value;
    } catch {
      /* fall through to the request-derived fallback */
    }
    return Object.freeze({
      documentId: fallback.documentId,
      revision: fallback.baseRevision,
    });
  };

  const commitImportReplacement = async (
    request: CommitImportReplacementRequestV2,
  ): Promise<CommitImportReplacementResultV2> => {
    if (!requestShapeValid(request)) {
      const fallback = requestDerivedIdentity(request);
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "pre-owner-provenance" as const,
        code: "import.replacement_request_invalid" as const,
        identity: fallback,
        /* No owner call may precede this refusal (E0V2-RESCASE-002's
         * ownerCalls: 0), so the observation is request-derived. */
        observedIdentity: Object.freeze({
          documentId: fallback.documentId,
          revision: fallback.baseRevision,
        }),
        liveForRequest: 0 as const,
      });
    }
    const ownerRequest = request.ownerRequest;
    const identity = ownerRequest.identity;

    /* E0V2-RES-04: acknowledgement provenance BEFORE any owner call. */
    const binding = request.confirmationBinding;
    if (ownerRequest.nonUndoableConfirmation !== null) {
      const displayed = binding.displayedRequirement;
      const acknowledged = binding.acknowledgement;
      if (displayed === null || acknowledged === null) {
        return Object.freeze({
          ok: false as const,
          outcome: "refused" as const,
          stage: "pre-owner-provenance" as const,
          code: "history.nonundoable_confirmation_required" as const,
          identity,
          observedIdentity: observeIdentity(identity),
          liveForRequest: 0 as const,
        });
      }
      const matches =
        JSON.stringify(displayed) ===
        JSON.stringify(acknowledged.requirement);
      if (!matches) {
        return Object.freeze({
          ok: false as const,
          outcome: "refused" as const,
          stage: "pre-owner-provenance" as const,
          code: "import.confirmation_identity_mismatch" as const,
          identity,
          observedIdentity: observeIdentity(identity),
          liveForRequest: 0 as const,
        });
      }
    } else if (binding.acknowledgement !== null) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "pre-owner-provenance" as const,
        code: "import.confirmation_identity_mismatch" as const,
        identity,
        observedIdentity: observeIdentity(identity),
        liveForRequest: 0 as const,
      });
    }

    /* Owner preparation: no X1 call may precede it. */
    let rawPreparation: unknown;
    try {
      rawPreparation = ports.prepareImportReplacementPublication(ownerRequest);
    } catch {
      /* A prepare throw allocates nothing, but the closed law still runs
       * the idempotent request-keyed invalidation before returning. */
      ports.discardImportReplacementPublication({
        identity,
        reason: "preparation-protocol-invalid",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "protocol-invalid" as const,
        stage: "port-protocol" as const,
        diagnostic: threwOrRejected("prepareImportReplacementPublication"),
        identity,
        observedIdentity: observeIdentity(identity),
        reconciliation: "none" as const,
        liveForRequest: 0 as const,
      });
    }
    const preparation = normalizePreparationResult(rawPreparation);
    if (preparation.outcome === "protocol-invalid") {
      ports.discardImportReplacementPublication({
        identity,
        reason: "preparation-protocol-invalid",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "protocol-invalid" as const,
        stage: "port-protocol" as const,
        diagnostic: preparation.diagnostic,
        identity,
        observedIdentity: observeIdentity(identity),
        reconciliation: "none" as const,
        liveForRequest: 0 as const,
      });
    }
    if (!preparation.value.ok) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "owner-preparation" as const,
        code: preparation.value.code,
        identity,
        observedIdentity: observeIdentity(identity),
        liveForRequest: 0 as const,
      });
    }
    const prepared: PreparedImportReplacementPublication =
      preparation.value.value;

    /* X1 retirement, derived exactly from the prepared echo. */
    const retirementRequest: RetireImportReplacementRequest = Object.freeze({
      identity,
      sourceFormat: prepared.sourceFormat,
      candidateDocumentId: prepared.candidateDocumentId,
      expectedTransportGeneration: prepared.expectedTransportGeneration,
      scope: "progression-and-preview" as const,
      requiredPostcondition: "zero-future-attack" as const,
    });
    let rawRetirement: unknown;
    try {
      rawRetirement = await retirement.retireImportReplacement(
        retirementRequest,
      );
    } catch {
      ports.discardImportReplacementPublication({
        identity,
        reason: "retirement-protocol-invalid",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "transport-retirement" as const,
        code: "transport.replacement_retirement_evidence_invalid" as const,
        identity,
        observedIdentity: observeIdentity(identity),
        liveForRequest: 0 as const,
      });
    }
    const judged = judgeRetirement(rawRetirement, retirementRequest);
    if (judged.kind === "refused") {
      ports.discardImportReplacementPublication({
        identity,
        reason: "retirement-refused",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "transport-retirement" as const,
        code: "transport.replacement_retirement_refused" as const,
        identity,
        observedIdentity: observeIdentity(identity),
        liveForRequest: 0 as const,
      });
    }
    if (judged.kind === "evidence-invalid") {
      ports.discardImportReplacementPublication({
        identity,
        reason: "retirement-protocol-invalid",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "transport-retirement" as const,
        code: "transport.replacement_retirement_evidence_invalid" as const,
        identity,
        observedIdentity: observeIdentity(identity),
        liveForRequest: 0 as const,
      });
    }

    /* Fresh narrowed A0 receipt from validated evidence only. */
    const receipt: ReplacementRetirementReceipt = Object.freeze({
      requestId: identity.requestId,
      retiredTransportGeneration: judged.retiredTransportGeneration,
      progressionRetired: true as const,
      previewRetired: true as const,
      noFutureAttack: true as const,
    });

    let rawPublication: unknown;
    try {
      rawPublication = ports.publishImportReplacement({
        prepared,
        retirement: receipt,
      });
    } catch {
      ports.discardImportReplacementPublication({
        identity,
        reason: "publication-protocol-invalid",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "protocol-invalid" as const,
        stage: "port-protocol" as const,
        diagnostic: threwOrRejected("publishImportReplacement"),
        identity,
        observedIdentity: observeIdentity(identity),
        reconciliation:
          "application-transport-reconciliation-required" as const,
        liveForRequest: 0 as const,
      });
    }
    const publication = normalizePublicationResult(rawPublication);
    if (publication.outcome === "protocol-invalid") {
      ports.discardImportReplacementPublication({
        identity,
        reason: "publication-protocol-invalid",
      });
      return Object.freeze({
        ok: false as const,
        outcome: "protocol-invalid" as const,
        stage: "port-protocol" as const,
        diagnostic: publication.diagnostic,
        identity,
        observedIdentity: observeIdentity(identity),
        reconciliation:
          "application-transport-reconciliation-required" as const,
        liveForRequest: 0 as const,
      });
    }
    if (!publication.value.ok) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        stage: "owner-publication" as const,
        code: publication.value.code,
        identity,
        observedIdentity: Object.freeze({
          documentId: publication.value.observedDocumentId,
          revision: publication.value.observedRevision,
        }),
        liveForRequest: 0 as const,
      });
    }

    return Object.freeze({
      ok: true as const,
      outcome: "committed" as const,
      identity: publication.value.identity,
      documentId: publication.value.documentId,
      revision: publication.value.revision,
      effects: publication.value.effects,
      counters: publication.value.counters,
      liveForRequest: 0 as const,
    });
  };

  return commitImportReplacement;
}

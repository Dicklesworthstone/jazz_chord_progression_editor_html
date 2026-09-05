import { deepStructuralEqual, runtimeField } from "./application-state-helpers";
import type { RetireImportReplacementRequest } from "./e0-interchange-contract";
import type { LocalReplacementRetirementRequest } from "./x1-retirement-adapter";

/** A separate stop proves the current epoch safe, never the abandoned publication. */
export function provesSafeReconciliation(raw: unknown, request: LocalReplacementRetirementRequest | RetireImportReplacementRequest): boolean {
  try {
    const observed = runtimeField(raw, "observedGeneration");
    const resulting = runtimeField(raw, "resultingGeneration");
    const commandId = runtimeField(raw, "commandRequestId");
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) && Object.keys(raw).length === 8 &&
      runtimeField(raw, "ok") === true && runtimeField(raw, "authority") === "x1-serialized-transport" &&
      deepStructuralEqual(runtimeField(raw, "request"), request) && typeof commandId === "number" &&
      Number.isSafeInteger(commandId) && commandId > 0 && typeof observed === "number" && Number.isSafeInteger(observed) && observed >= 0 &&
      typeof resulting === "number" && Number.isSafeInteger(resulting) && resulting === observed + 1 &&
      runtimeField(raw, "state") === "ready" && runtimeField(raw, "noFutureAttack") === true;
  } catch {
    return false;
  }
}


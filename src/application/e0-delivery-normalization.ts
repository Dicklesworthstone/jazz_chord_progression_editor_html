import type {
  ExportDeliveryArtifactBinding,
  ExportDeliveryCleanupFailures,
  ExportDeliveryResult,
} from "../export";

// Snapshot only own data fields. Neither getters nor retained adapter objects
// may acquire authority after the completion promise has settled.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return null;
    const field: unknown = descriptor.value;
    snapshot[key] = field;
  }
  return snapshot;
}

const COMMON = ["ok", "outcome", "channel", "artifact", "cleanup", "objectUrlsCreated", "objectUrlsRevoked", "outstandingOwnedResources"] as const;
const ARTIFACT = ["kind", "sourceDocumentId", "filename", "byteLength", "semanticDocumentHash"] as const;

const CLEANUP: readonly ExportDeliveryCleanupFailures[] = Object.freeze([
  { channel: "file-system-access", cleanupFailureKinds: Object.freeze(["writer-abort"] as const), objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 1 },
  { channel: "file-system-access", cleanupFailureKinds: Object.freeze(["handle-release"] as const), objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 1 },
  { channel: "file-system-access", cleanupFailureKinds: Object.freeze(["writer-abort", "handle-release"] as const), objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 2 },
  { channel: "file-system-access", cleanupFailureKinds: Object.freeze(["writer-close", "writer-abort"] as const), objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 1 },
  { channel: "file-system-access", cleanupFailureKinds: Object.freeze(["writer-close", "writer-abort", "handle-release"] as const), objectUrlsCreated: 0, objectUrlsRevoked: 0, outstandingOwnedResources: 2 },
  { channel: "object-url-download", cleanupFailureKinds: Object.freeze(["anchor-remove"] as const), objectUrlsCreated: 1, objectUrlsRevoked: 1, outstandingOwnedResources: 1 },
  { channel: "object-url-download", cleanupFailureKinds: Object.freeze(["object-url-revoke"] as const), objectUrlsCreated: 1, objectUrlsRevoked: 0, outstandingOwnedResources: 1 },
  { channel: "object-url-download", cleanupFailureKinds: Object.freeze(["anchor-remove", "object-url-revoke"] as const), objectUrlsCreated: 1, objectUrlsRevoked: 0, outstandingOwnedResources: 2 },
]);

function sameFailures(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (length === undefined || length.value !== expected.length || Reflect.ownKeys(value).length !== expected.length + 1) return false;
  return expected.every((item, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor !== undefined && "value" in descriptor && descriptor.value === item;
  });
}

/** Exact, total adapter boundary; null means cleanup knowledge is unknown. */
export function normalizeExportDelivery(
  value: unknown,
  binding: ExportDeliveryArtifactBinding,
): ExportDeliveryResult | null {
  try {
    // Inspect the discriminator without invoking it, then admit its exact keys.
    if (typeof value !== "object" || value === null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, "outcome");
    if (descriptor === undefined || !("value" in descriptor)) return null;
    const outcome: unknown = descriptor.value;
    const extra = outcome === "completed" || outcome === "handed-off" ? ["bytesOffered"]
      : outcome === "failed" ? ["code"] : outcome === "cleanup-failed" ? ["code", "cleanupFailureKinds"] : [];
    const raw = record(value, [...COMMON, ...extra]);
    if (raw === null || raw["outcome"] !== outcome) return null;
    if (outcome === "cleanup-failed") {
      if (raw["ok"] !== false || raw["artifact"] !== null || raw["cleanup"] !== "reconciliation-required" ||
          raw["code"] !== "export.delivery_cleanup_failed") return null;
      const match = CLEANUP.find(row => row.channel === raw["channel"] &&
        row.objectUrlsCreated === raw["objectUrlsCreated"] && row.objectUrlsRevoked === raw["objectUrlsRevoked"] &&
        row.outstandingOwnedResources === raw["outstandingOwnedResources"] && sameFailures(raw["cleanupFailureKinds"], row.cleanupFailureKinds));
      return match === undefined ? null : Object.freeze({ ...match, ok: false, outcome, artifact: null,
        cleanup: "reconciliation-required", code: "export.delivery_cleanup_failed" });
    }
    const artifact = record(raw["artifact"], ARTIFACT);
    if (artifact === null || ARTIFACT.some(key => artifact[key] !== binding[key]) ||
        raw["cleanup"] !== "complete" || raw["outstandingOwnedResources"] !== 0) return null;
    const bound = Object.freeze({ ...binding });
    const zero = { artifact: bound, cleanup: "complete" as const, outstandingOwnedResources: 0 as const,
      objectUrlsCreated: 0 as const, objectUrlsRevoked: 0 as const };
    const one = { ...zero, objectUrlsCreated: 1 as const, objectUrlsRevoked: 1 as const };
    const zeroUrls = raw["objectUrlsCreated"] === 0 && raw["objectUrlsRevoked"] === 0;
    const oneUrl = raw["objectUrlsCreated"] === 1 && raw["objectUrlsRevoked"] === 1;
    const channel = raw["channel"];
    if (outcome === "failed") {
      const code = raw["code"];
      if (raw["ok"] !== false || (code !== "export.delivery_user_gesture_required" &&
          code !== "export.delivery_capability_failed" && code !== "export.delivery_write_failed" &&
          code !== "export.delivery_activation_failed")) return null;
      if ((channel === null || channel === "file-system-access") && zeroUrls) {
        return Object.freeze({ ...zero, ok: false, outcome, channel, code });
      }
      if (channel === "object-url-download" && (zeroUrls || oneUrl)) {
        return Object.freeze({ ...(oneUrl ? one : zero), ok: false, outcome, channel, code });
      }
      return null;
    }
    if (raw["ok"] !== true) return null;
    if (outcome === "cancelled" && channel === "file-system-access" && zeroUrls) {
      return Object.freeze({ ...zero, ok: true, outcome, channel });
    }
    if (raw["bytesOffered"] !== binding.byteLength) return null;
    if (outcome === "completed" && channel === "file-system-access" && zeroUrls) {
      return Object.freeze({ ...zero, ok: true, outcome, channel, bytesOffered: binding.byteLength });
    }
    if (outcome === "handed-off" && channel === "object-url-download" && oneUrl) {
      return Object.freeze({ ...one, ok: true, outcome, channel, bytesOffered: binding.byteLength });
    }
    return null;
  } catch {
    return null;
  }
}

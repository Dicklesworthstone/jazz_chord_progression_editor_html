import { parseStableId, type DocumentId } from "../domain";
import { RECOVERY_KEY_PREFIX, type RecoveryAdapterKind, type RecoveryAdapterPort } from "./recovery-contract";

const SCHEMA = "changes.studio-recovery-location.v1";
const CURRENT = `${SCHEMA}:current`;
const PREVIOUS = `${SCHEMA}:previous`;

function decodeLocation(text: string | null): DocumentId | null {
  if (text === null || text.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || !("schema" in parsed) || !("documentId" in parsed) ||
        Object.keys(parsed).length !== 2 || parsed.schema !== SCHEMA || typeof parsed.documentId !== "string") return null;
    const id = parseStableId("document", parsed.documentId);
    return id.ok ? id.value : null;
  } catch { return null; }
}

/** One studio workspace can open many stable document IDs. Keep a bounded
 * durable location beside A1's per-document envelopes; never rewrite their IDs.
 * A failed location write is a failed recovery write, even if its envelope
 * reached storage. A1 must not report that revision clean in that case. */
export function createStudioRecoveryStorage(adapters: readonly RecoveryAdapterPort[]) {
  return Object.freeze({
    adapters: Object.freeze(adapters.map((adapter): RecoveryAdapterPort => Object.freeze({
      ...adapter,
      writeCurrentWithRotation: async (currentKey, previousKey, payload) => {
        const written = await adapter.writeCurrentWithRotation(currentKey, previousKey, payload);
        if (written !== "written" || !currentKey.startsWith(RECOVERY_KEY_PREFIX) || !currentKey.endsWith(":current")) return written;
        const id = parseStableId("document", currentKey.slice(RECOVERY_KEY_PREFIX.length, -":current".length));
        if (!id.ok) return "denied";
        return await adapter.writeCurrentWithRotation(CURRENT, PREVIOUS, JSON.stringify({ schema: SCHEMA, documentId: id.value }));
      },
    }))),
    resolveStartupDocumentId: async (kind: RecoveryAdapterKind, fallback: DocumentId): Promise<DocumentId> => {
      const adapter = adapters.find((candidate) => candidate.kind === kind);
      if (adapter === undefined) return fallback;
      try {
        return decodeLocation(await adapter.read(CURRENT)) ?? fallback;
      } catch {
        return fallback;
      }
    },
  });
}

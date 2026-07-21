import {
  HISTORY_RETAINED_BYTE_ESTIMATE_POLICY,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_RETAINED_BYTES,
  type HistoryEntry,
  type HistoryRetainedByteEstimator,
  type HistoryState,
} from "./application-state-contract";
import { runtimeField } from "./application-state-helpers";

type EntryWithoutEstimate = Omit<HistoryEntry, "retainedBytesEstimate">;

function estimateValue(
  value: unknown,
  visited: WeakSet<object>,
  encoder: TextEncoder,
): number {
  if (value === null) return HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.nullBytes;
  switch (typeof value) {
    case "string":
      return (
        HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.stringBytes +
        encoder.encode(value).byteLength
      );
    case "number":
      return HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.numberBytes;
    case "boolean":
      return HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.booleanBytes;
    case "object":
      break;
    case "bigint":
    case "symbol":
    case "undefined":
    case "function":
      return Number.NaN;
  }

  if (visited.has(value)) {
    return HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.referenceBytes;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    let bytes =
      HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.arrayBytes +
      value.length * HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.arraySlotBytes;
    for (const entry of value) {
      const child = estimateValue(entry, visited, encoder);
      if (!Number.isSafeInteger(child)) return Number.NaN;
      bytes += child;
      if (!Number.isSafeInteger(bytes)) return Number.NaN;
    }
    return bytes;
  }

  let bytes = HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.objectBytes;
  for (const key of Object.keys(value).sort()) {
    const keyBytes =
      HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.stringBytes +
      encoder.encode(key).byteLength;
    const childBytes = estimateValue(runtimeField(value, key), visited, encoder);
    if (!Number.isSafeInteger(childBytes)) return Number.NaN;
    bytes += keyBytes + childBytes;
    if (!Number.isSafeInteger(bytes)) return Number.NaN;
  }
  return bytes;
}

export const estimateHistoryRetainedBytes: HistoryRetainedByteEstimator = (
  entry: EntryWithoutEstimate,
): number => estimateValue(entry, new WeakSet(), new TextEncoder());

export function historyEntryCount(history: HistoryState): number {
  return history.undo.length + history.redo.length;
}

export function historyRetainedBytes(history: HistoryState): number {
  let bytes = 0;
  for (const entry of history.undo) bytes += entry.retainedBytesEstimate;
  for (const entry of history.redo) bytes += entry.retainedBytesEstimate;
  return bytes;
}

export function isValidHistoryEstimate(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function withRecomputedHistoryBytes(
  undo: readonly HistoryEntry[],
  redo: readonly HistoryEntry[],
): HistoryState | null {
  let retainedBytesEstimate = 0;
  for (const entry of [...undo, ...redo]) {
    if (!isValidHistoryEstimate(entry.retainedBytesEstimate)) return null;
    retainedBytesEstimate += entry.retainedBytesEstimate;
    if (!Number.isSafeInteger(retainedBytesEstimate)) return null;
  }
  return Object.freeze({
    undo: Object.freeze([...undo]),
    redo: Object.freeze([...redo]),
    retainedBytesEstimate,
  });
}

export function enforceHistoryCaps(
  undoEntries: readonly HistoryEntry[],
): HistoryState | null {
  const undo = [...undoEntries];
  let retainedBytesEstimate = undo.reduce(
    (sum, entry) => sum + entry.retainedBytesEstimate,
    0,
  );
  if (!Number.isSafeInteger(retainedBytesEstimate)) return null;
  while (
    undo.length > MAX_HISTORY_ENTRIES ||
    retainedBytesEstimate > MAX_HISTORY_RETAINED_BYTES
  ) {
    const removed = undo.shift();
    if (removed === undefined) return null;
    retainedBytesEstimate -= removed.retainedBytesEstimate;
  }
  return Object.freeze({
    undo: Object.freeze(undo),
    redo: Object.freeze([]),
    retainedBytesEstimate,
  });
}

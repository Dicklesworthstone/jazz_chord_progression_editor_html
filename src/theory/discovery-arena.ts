import { DISCOVERY_EXECUTION_LIMITS, type DiscoveryAllocation, type DiscoveryArena } from "./discovery-execution-contract";

/** Handle, registry entry and their bounded reference/header bookkeeping. */
export const DISCOVERY_RESERVATION_OVERHEAD = 4 * 32;
const capacities = new WeakMap<DiscoveryArena, number>();

export function discoveryArenaCapacity(arena: DiscoveryArena): number | null {
  return capacities.get(arena) ?? null;
}

/** A fresh ledger belongs to exactly one job; handle identity grants release. */
export function createDiscoveryArena(maximumBytes: number): DiscoveryArena | null {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 ||
    maximumBytes > DISCOVERY_EXECUTION_LIMITS.trackedBytes) return null;
  const live = new Map<DiscoveryAllocation, number>();
  let retainedBytes = 0, peakTrackedBytes = 0, allocations = 0, releases = 0;
  const reserve = (payloadBytes: number): DiscoveryAllocation | null => {
    if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0 ||
      allocations >= Number.MAX_SAFE_INTEGER) return null;
    // Subtraction avoids overflow before either the handle or data allocates.
    const remaining = maximumBytes - retainedBytes;
    if (remaining < DISCOVERY_RESERVATION_OVERHEAD ||
      payloadBytes > remaining - DISCOVERY_RESERVATION_OVERHEAD) return null;
    const bytes = payloadBytes + DISCOVERY_RESERVATION_OVERHEAD;
    const handle = Object.freeze({ id: allocations + 1, bytes });
    live.set(handle, bytes);
    retainedBytes += bytes;
    peakTrackedBytes = Math.max(peakTrackedBytes, retainedBytes);
    allocations += 1;
    return handle;
  };
  const release = (allocation: DiscoveryAllocation): boolean => {
    const bytes = live.get(allocation);
    if (bytes === undefined) return false;
    live.delete(allocation);
    retainedBytes -= bytes;
    releases += 1;
    return true;
  };
  const arena: DiscoveryArena = Object.freeze({ reserve, release, inspect: () => Object.freeze({
    retainedBytes, peakTrackedBytes, allocations, releases,
  }) });
  capacities.set(arena, maximumBytes);
  return arena;
}

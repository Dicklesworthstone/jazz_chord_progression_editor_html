import {
  type AtlasCompiledEntry,
  type AtlasQueryAdapter,
  type AtlasQueryFilter,
  type CompiledAtlasPayload,
} from "./atlas-contract";

export function makeAtlasQueryAdapter(
  compiledPayload: CompiledAtlasPayload,
): AtlasQueryAdapter {
  const entriesById = new Map<string, AtlasCompiledEntry>();
  for (const entry of compiledPayload.entries) {
    entriesById.set(entry.entryId, entry);
  }

  function getEntryById(entryId: string): AtlasCompiledEntry | undefined {
    return entriesById.get(entryId);
  }

  function searchByRootIntervals(deltas: readonly number[]): readonly AtlasCompiledEntry[] {
    const deltaStr = deltas.join(",");
    return compiledPayload.entries.filter((e) => {
      const entryDeltaStr = e.fingerprints.rootIntervalDeltas.join(",");
      return entryDeltaStr.includes(deltaStr);
    });
  }

  function filterEntries(filter: AtlasQueryFilter): readonly AtlasCompiledEntry[] {
    return compiledPayload.entries.filter((e) => {
      if (filter.genre && e.practiceMetadata.genre !== filter.genre) {
        return false;
      }
      if (filter.difficulty && e.practiceMetadata.difficulty !== filter.difficulty) {
        return false;
      }
      if (filter.cadenceType && e.fingerprints.cadenceProfile !== filter.cadenceType) {
        return false;
      }
      if (filter.minBeats !== undefined && e.totalBeats < filter.minBeats) {
        return false;
      }
      if (filter.maxBeats !== undefined && e.totalBeats > filter.maxBeats) {
        return false;
      }
      return true;
    });
  }

  function listAllEntries(): readonly AtlasCompiledEntry[] {
    return compiledPayload.entries;
  }

  return {
    getEntryById,
    searchByRootIntervals,
    filterEntries,
    listAllEntries,
  };
}

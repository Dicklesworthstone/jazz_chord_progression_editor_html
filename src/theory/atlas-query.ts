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
    /* Contiguous, element-exact match: interval 1 must not match inside 11
       as a text substring would. */
    return compiledPayload.entries.filter((e) => {
      const entryDeltas = e.fingerprints.rootIntervalDeltas;
      for (let start = 0; start + deltas.length <= entryDeltas.length; start++) {
        if (deltas.every((delta, offset) => entryDeltas[start + offset] === delta)) return true;
      }
      return false;
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

import type { AccidentalStyle } from "./syntax-contract";
import {
  type AtlasCompilerRejections,
  type AtlasFingerprints,
  type AtlasQueryAdapter,
  type AtlasSourceEntry,
  type CompiledAtlasPayload,
} from "./g1-contract";
import {
  compileAtlasCorpus,
  computeFingerprints,
  sha256Sync,
} from "./atlas-compiler";
import { makeAtlasQueryAdapter } from "./atlas-query";

export interface G1Operations {
  readonly sha256Sync: (data: string) => string;
  readonly computeFingerprints: (
    chords: readonly string[],
    durationBeats?: readonly number[],
    accidentalStyle?: AccidentalStyle,
  ) => AtlasFingerprints;
  readonly compileAtlasCorpus: (
    sourceEntries: readonly AtlasSourceEntry[],
    accidentalStyle?: AccidentalStyle,
  ) => {
    readonly compiled: CompiledAtlasPayload;
    readonly rejections: AtlasCompilerRejections;
  };
  readonly makeAtlasQueryAdapter: (
    compiledPayload: CompiledAtlasPayload,
  ) => AtlasQueryAdapter;
}

export const g1Operations: G1Operations = Object.freeze({
  sha256Sync,
  computeFingerprints,
  compileAtlasCorpus,
  makeAtlasQueryAdapter,
});

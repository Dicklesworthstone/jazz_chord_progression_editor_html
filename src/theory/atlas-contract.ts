import {
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G1_SOURCE_ATLAS_SCHEMA = "changes.atlas-source.v1" as const;
export const G1_COMPILED_ATLAS_SCHEMA = "changes.atlas-compiled.v1" as const;
export const G1_ATLAS_MANIFEST_SCHEMA = "changes.atlas-manifest.v1" as const;
export const G1_ATLAS_REJECTIONS_SCHEMA = "changes.atlas-rejections.v1" as const;

export const MAX_G1_FIXTURE_ENTRIES = 128 as const;
export const MAX_G1_PROGRESSION_LENGTH = 64 as const;
export const MAX_G1_FINGERPRINT_LAYERS = 8 as const;

export type RightsClass =
  | "public-domain"
  | "permissive-license"
  | "internal-original"
  | "protected-fingerprint-only"
  | "quarantined";

export type ExpressionBytePolicy =
  | "embed-full"
  | "fingerprint-only"
  | "reject";

export interface AtlasProvenance {
  readonly rightsClass: RightsClass;
  readonly commitAllowed: boolean;
  readonly expressionBytePolicy: ExpressionBytePolicy;
  readonly sourceEvidence: string;
  readonly authorOrSource?: string;
  readonly payloadHash: string; // SHA-256
}

export interface AtlasPracticeMetadata {
  readonly genre: "bebop" | "hard-bop" | "modal" | "bossa-nova" | "ballad" | "swing" | "latin" | "modern";
  readonly suggestedTempoBpmRange: readonly [min: number, max: number];
  readonly difficulty: "beginner" | "intermediate" | "advanced" | "virtuoso";
  readonly historicalPeriod?: string;
  readonly keyAreaTags: readonly string[];
}

export interface AtlasFingerprints {
  readonly exactSpellingHash: string;
  readonly rootIntervalDeltas: readonly number[]; // semitone steps from previous chord root
  readonly diatonicDegreesProfile: readonly string[]; // e.g. ["ii", "V", "I"]
  readonly rhythmPatternProfile: readonly string[]; // exact duration signature
  readonly cadenceProfile?: string; // e.g. "PAC", "IAC", "Backdoor"
}

export interface AtlasSourceEntry {
  readonly entryId: string;
  readonly title: string;
  readonly chords: readonly string[];
  readonly durationBeats?: readonly number[];
  readonly defaultKeyContext?: KeyContext;
  readonly provenance: AtlasProvenance;
  readonly practiceMetadata: AtlasPracticeMetadata;
}

export interface AtlasCompiledEntry {
  readonly entryId: string;
  readonly title: string;
  readonly chords: readonly string[];
  readonly totalBeats: number;
  readonly defaultKeyContext?: KeyContext;
  readonly fingerprints: AtlasFingerprints;
  readonly provenance: AtlasProvenance;
  readonly practiceMetadata: AtlasPracticeMetadata;
}

export interface AtlasCompilerManifest {
  readonly schema: typeof G1_ATLAS_MANIFEST_SCHEMA;
  readonly compiledAt: string;
  readonly version: string;
  readonly totalEntries: number;
  readonly totalPublicDomain: number;
  readonly totalPermissive: number;
  readonly totalOriginal: number;
  readonly compiledPayloadHash: string;
}

export interface AtlasRejectionRecord {
  readonly entryId: string;
  readonly reasonCode:
    | "g1.quarantined_source"
    | "g1.hash_mismatch"
    | "g1.rights_violation"
    | "g1.invalid_chords"
    | "g1.duplicate_exact_entry"
    | "g1.corrupted_syntax";
  readonly message: string;
}

export interface AtlasCompilerRejections {
  readonly schema: typeof G1_ATLAS_REJECTIONS_SCHEMA;
  readonly rejectedCount: number;
  readonly records: readonly AtlasRejectionRecord[];
}

export interface CompiledAtlasPayload {
  readonly schema: typeof G1_COMPILED_ATLAS_SCHEMA;
  readonly manifest: AtlasCompilerManifest;
  readonly entries: readonly AtlasCompiledEntry[];
}

export interface AtlasQueryFilter {
  readonly genre?: AtlasPracticeMetadata["genre"];
  readonly difficulty?: AtlasPracticeMetadata["difficulty"];
  readonly cadenceType?: string;
  readonly minBeats?: number;
  readonly maxBeats?: number;
  readonly accidentalStyle?: AccidentalStyle;
}

export interface AtlasQueryAdapter {
  readonly getEntryById: (entryId: string) => AtlasCompiledEntry | undefined;
  readonly searchByRootIntervals: (deltas: readonly number[]) => readonly AtlasCompiledEntry[];
  readonly filterEntries: (filter: AtlasQueryFilter) => readonly AtlasCompiledEntry[];
  readonly listAllEntries: () => readonly AtlasCompiledEntry[];
}

/** Stable IDs are globally wire-unique across every entity kind. */
export const STABLE_ID_KINDS = ["document", "section", "measure", "event"] as const;

export const STABLE_ID_MAX_ASCII_LENGTH = 128;
export const STABLE_ID_PATTERN_SOURCE = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";

export type StableIdKind = (typeof STABLE_ID_KINDS)[number];

declare const stableIdBrand: unique symbol;

type BrandedStableId<K extends StableIdKind> = string & {
  readonly [stableIdBrand]: K;
};

export type DocumentId = BrandedStableId<"document">;
export type SectionId = BrandedStableId<"section">;
export type MeasureId = BrandedStableId<"measure">;
export type ChordEventId = BrandedStableId<"event">;

export type AnyStableId = DocumentId | SectionId | MeasureId | ChordEventId;

export type StableIdWireRefusal =
  | Readonly<{
      code: "id.length_exceeded";
      receivedLength: number;
      maximum: typeof STABLE_ID_MAX_ASCII_LENGTH;
    }>
  | Readonly<{ code: "id.syntax_invalid"; received: string }>;

export type StableIdWireResult<K extends StableIdKind> =
  | Readonly<{ ok: true; value: StableIdFor<K> }>
  | Readonly<{ ok: false; refusal: StableIdWireRefusal }>;

export type StableIdFor<K extends StableIdKind> = K extends "document"
  ? DocumentId
  : K extends "section"
    ? SectionId
    : K extends "measure"
      ? MeasureId
      : ChordEventId;

export type IdEntropySource =
  | "crypto.randomUUID"
  | "crypto.getRandomValues"
  | "deterministic-test";

export type IdFactoryRefusal =
  | Readonly<{
      code: "id.entropy_unavailable";
      kind: StableIdKind;
    }>
  | Readonly<{
      code: "id.factory_exhausted";
      kind: StableIdKind;
    }>;

export type IdFactoryResult<K extends StableIdKind> =
  | Readonly<{
      ok: true;
      value: StableIdFor<K>;
      source: IdEntropySource;
    }>
  | Readonly<{
      ok: false;
      refusal: IdFactoryRefusal;
    }>;

/** Production implementations use Web Crypto only; Math.random is not a source. */
export interface StableIdFactory {
  readonly next: <K extends StableIdKind>(kind: K) => IdFactoryResult<K>;
}

export type StableIdRemapEntry =
  | Readonly<{ kind: "document"; from: DocumentId; to: DocumentId }>
  | Readonly<{ kind: "section"; from: SectionId; to: SectionId }>
  | Readonly<{ kind: "measure"; from: MeasureId; to: MeasureId }>
  | Readonly<{ kind: "event"; from: ChordEventId; to: ChordEventId }>;

/**
 * Entries are ordered document, section, measure, event in structural preorder.
 * The v2 document currently stores no cross-node ID references; this table
 * remaps the copied node identities themselves.
 */
export type StableIdRemapTable = Readonly<{
  entries: readonly StableIdRemapEntry[];
}>;

export type StableIdPath = readonly (string | number)[];
export type StableIdPathRoot = "copy-root" | "occupied-document";

export type StableIdLocation = Readonly<{
  kind: StableIdKind;
  path: StableIdPath;
  pathRoot: StableIdPathRoot;
}>;

export type IdRemapRefusal =
  | Readonly<{
      code: "id.collision_existing";
      requested: StableIdLocation;
      occupied: StableIdLocation;
      collidingId: string;
    }>
  | Readonly<{
      code: "id.collision_allocated";
      requested: StableIdLocation;
      firstAllocated: StableIdLocation;
      collidingId: string;
    }>
  | Readonly<{
      code: "id.factory_exhausted" | "id.entropy_unavailable";
      kind: StableIdKind;
      path: StableIdPath;
    }>
  | Readonly<{
      code: "id.remap_incomplete";
      kind: StableIdKind;
      source: AnyStableId;
      path: StableIdPath;
    }>;

/** A failure has no partial remap: copy commands commit the whole table atomically. */
export type IdRemapResult =
  | Readonly<{ ok: true; value: StableIdRemapTable }>
  | Readonly<{ ok: false; refusal: IdRemapRefusal }>;

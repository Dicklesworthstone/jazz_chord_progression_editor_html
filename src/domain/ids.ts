import type { DomainPath, PathRefusal } from "./result";

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
  | PathRefusal<{
      code: "id.length_exceeded";
      receivedLength: number;
      maximum: typeof STABLE_ID_MAX_ASCII_LENGTH;
    }>
  | PathRefusal<{ code: "id.syntax_invalid"; received: string }>;

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

export type IdFactoryRefusal<K extends StableIdKind = StableIdKind> =
  | PathRefusal<{
      code: "id.entropy_unavailable";
      kind: K;
    }>
  | PathRefusal<{
      code: "id.factory_exhausted";
      kind: K;
    }>;

export type IdFactoryResult<K extends StableIdKind> =
  | Readonly<{
      ok: true;
      value: StableIdFor<K>;
      source: IdEntropySource;
    }>
  | Readonly<{
      ok: false;
      refusal: IdFactoryRefusal<K>;
    }>;

/** Production implementations use Web Crypto only; Math.random is not a source. */
export interface StableIdFactory {
  readonly next: <K extends StableIdKind>(kind: K) => IdFactoryResult<K>;
}

export type StableIdRemapEntry<K extends StableIdKind = StableIdKind> =
  K extends StableIdKind
    ? Readonly<{
        kind: K;
        from: StableIdFor<K>;
        to: StableIdFor<K>;
        sourcePath: DomainPath;
      }>
    : never;

/**
 * Entries are ordered document, section, measure, event in structural preorder.
 * The v2 document currently stores no cross-node ID references; this table
 * remaps the copied node identities themselves.
 */
export type StableIdRemapTable = Readonly<{
  entries: readonly StableIdRemapEntry[];
}>;

export type StableIdPath = DomainPath;
export type StableIdPathRoot = "copy-root" | "occupied-document";

export type StableIdLocation<
  K extends StableIdKind = StableIdKind,
  R extends StableIdPathRoot = StableIdPathRoot,
> = K extends StableIdKind
  ? Readonly<{ kind: K; path: StableIdPath; pathRoot: R }>
  : never;

export type CopyStableIdLocation<K extends StableIdKind = StableIdKind> =
  StableIdLocation<K, "copy-root">;
export type OccupiedStableIdLocation<K extends StableIdKind = StableIdKind> =
  StableIdLocation<K, "occupied-document">;
/** Existing IDs may originate in the copy source or in a destination document. */
export type ExistingStableIdLocation<K extends StableIdKind = StableIdKind> =
  | CopyStableIdLocation<K>
  | OccupiedStableIdLocation<K>;

type IncompleteRemapRefusal = {
  [K in StableIdKind]: PathRefusal<{
    code: "id.remap_incomplete";
    kind: K;
    source: StableIdFor<K>;
  }>;
}[StableIdKind];

export type IdRemapRefusal =
  | Readonly<{
      code: "id.collision_existing";
      path: StableIdPath;
      requested: CopyStableIdLocation;
      occupied: ExistingStableIdLocation;
      collidingId: string;
    }>
  | Readonly<{
      code: "id.collision_allocated";
      path: StableIdPath;
      requested: CopyStableIdLocation;
      firstAllocated: CopyStableIdLocation;
      collidingId: string;
    }>
  | PathRefusal<{
      code: "id.factory_exhausted" | "id.entropy_unavailable";
      kind: StableIdKind;
    }>
  | IncompleteRemapRefusal;

/** A failure has no partial remap: copy commands commit the whole table atomically. */
export type IdRemapResult =
  | Readonly<{ ok: true; value: StableIdRemapTable }>
  | Readonly<{ ok: false; refusal: IdRemapRefusal }>;

const stableIdPattern = new RegExp(STABLE_ID_PATTERN_SOURCE);

/** Validate an ID at the wire boundary without trimming or normalization. */
export function parseStableId<K extends StableIdKind>(
  kind: K,
  wire: string,
): StableIdWireResult<K> {
  if (wire.length > STABLE_ID_MAX_ASCII_LENGTH) {
    return {
      ok: false,
      refusal: {
        code: "id.length_exceeded",
        path: ["id"],
        receivedLength: wire.length,
        maximum: STABLE_ID_MAX_ASCII_LENGTH,
      },
    };
  }
  if (!stableIdPattern.test(wire)) {
    return {
      ok: false,
      refusal: {
        code: "id.syntax_invalid",
        path: ["id"],
        received: wire,
      },
    };
  }
  // The successful wire check is the sole constructor for this nominal ID.
  return { ok: true, value: wire as StableIdFor<K> };
}

function formatUuidV4(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function factoryFailure<K extends StableIdKind>(
  code: "id.entropy_unavailable" | "id.factory_exhausted",
  kind: K,
): IdFactoryResult<K> {
  return { ok: false, refusal: { code, kind, path: ["id"] } };
}

function currentCrypto(): Crypto | undefined {
  return globalThis.crypto;
}

/**
 * Construct a stateless production factory backed only by Web Crypto. Each
 * call performs at most one randomUUID attempt and one 16-byte fallback.
 */
export function createProductionStableIdFactory(): StableIdFactory {
  return {
    next: <K extends StableIdKind>(kind: K): IdFactoryResult<K> => {
      const cryptoValue = currentCrypto();
      const hasRandomUuid = typeof cryptoValue?.randomUUID === "function";
      const hasRandomValues = typeof cryptoValue?.getRandomValues === "function";
      if (!hasRandomUuid && !hasRandomValues) {
        return factoryFailure("id.entropy_unavailable", kind);
      }

      if (hasRandomUuid) {
        try {
          const wire = cryptoValue.randomUUID();
          const parsed = parseStableId(kind, wire);
          if (parsed.ok) {
            return {
              ok: true,
              value: parsed.value,
              source: "crypto.randomUUID",
            };
          }
        } catch {
          // A present but failed source may still fall back to getRandomValues.
        }
      }

      if (hasRandomValues) {
        try {
          const bytes = new Uint8Array(16);
          cryptoValue.getRandomValues(bytes);
          const parsed = parseStableId(kind, formatUuidV4(bytes));
          if (parsed.ok) {
            return {
              ok: true,
              value: parsed.value,
              source: "crypto.getRandomValues",
            };
          }
        } catch {
          // Report a bounded factory failure; never fall back to Math.random.
        }
      }

      return factoryFailure("id.factory_exhausted", kind);
    },
  };
}

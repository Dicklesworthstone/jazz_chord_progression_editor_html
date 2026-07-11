import type { Measure, ProgressionDocumentV2, Section } from "./document";
import type {
  AnyStableId,
  IdRemapRefusal,
  StableIdFactory,
  StableIdLocation,
  StableIdRemapTable,
} from "./ids";

export type StableIdOccupancy = Readonly<{
  id: AnyStableId;
  location: StableIdLocation & Readonly<{ pathRoot: "occupied-document" }>;
}>;

type CopyRequestFields = Readonly<{
  /** Includes source identities and every identity already used by the destination. */
  occupiedIds: readonly StableIdOccupancy[];
  idFactory: StableIdFactory;
}>;

export type DomainCopyRequest =
  | (CopyRequestFields &
      Readonly<{
        rootKind: "document";
        purpose: "duplicate" | "lesson-instantiation";
        source: ProgressionDocumentV2;
      }>)
  | (CopyRequestFields &
      Readonly<{
        rootKind: "section";
        purpose: "duplicate";
        source: Section;
      }>)
  | (CopyRequestFields &
      Readonly<{
        rootKind: "measure";
        purpose: "duplicate";
        source: Measure;
      }>);

export type DomainCopySuccess =
  | Readonly<{
      ok: true;
      rootKind: "document";
      value: ProgressionDocumentV2;
      remap: StableIdRemapTable;
    }>
  | Readonly<{
      ok: true;
      rootKind: "section";
      value: Section;
      remap: StableIdRemapTable;
    }>
  | Readonly<{
      ok: true;
      rootKind: "measure";
      value: Measure;
      remap: StableIdRemapTable;
    }>;

/** Failure contains no copied value or partial remap. */
export type DomainCopyResult =
  | DomainCopySuccess
  | Readonly<{ ok: false; refusal: IdRemapRefusal }>;

export type DomainCopyOperation = (
  request: DomainCopyRequest,
) => DomainCopyResult;

import type { ChordEventId, ProgressionDocumentV2 } from "../domain";
import type {
  DiscoveryOption, DiscoveryRequest, DiscoveryResult, DiscoveryRefusal, DiscoveryEngine,
} from "../theory";
import type {
  AppState, ApplicationCommandDependencies, DerivedDocumentPatch,
} from "./application-state-contract";

/** These ports belong to composition; no UI calls an adapter directly. */
export type DiscoveryPublicationValidation =
  | Readonly<{ ok: true; patch: DerivedDocumentPatch }>
  | Readonly<{ ok: false; refusal: DiscoveryRefusal }>;
export type DiscoveryPublicationAdapter = Readonly<{
  /** Decode and independently revalidate every law, premise and exact edit. */
  validate: (request: DiscoveryRequest, option: DiscoveryOption,
    current: ProgressionDocumentV2) => DiscoveryPublicationValidation;
}>;
export type DiscoveryApplicationPorts = Readonly<{
  readState: () => AppState;
  /** Synchronous A0 result publication by the owning composition. */
  writeState: (state: AppState) => void;
  dependencies: ApplicationCommandDependencies;
  engine: DiscoveryEngine;
  /** Selection is a derived application choice, not an invented source fact. */
  readSelectedRealization: (eventId: ChordEventId) => string | null;
  /** The existing real Stop/retirement path; resolves only after both lanes. */
  retireTransport: () => Promise<boolean>;
  publication: DiscoveryPublicationAdapter;
}>;
export type DiscoveryJobView = Readonly<{
  status: "idle" | "running" | "ready" | "applying" | "finished";
  result: DiscoveryResult | null;
  /** Local performance diagnostics; excluded from semantic result bytes. */
  yields: number;
  scheduledCallbacks: number;
  /** Actual owned containers/handles; pending retirement remains charged. */
  retainedBytes: number;
  openMessagePorts: number;
  listeners: number;
  publicationAttempts: number;
}>;
export type DiscoveryApplyResult =
  | Readonly<{ kind: "committed"; revision: number }>
  | Readonly<{ kind: "refused"; refusal: DiscoveryRefusal }>
  | Readonly<{ kind: "stale" | "cancelled" }>;

export type DiscoveryStartResult =
  | Readonly<{ ok: true; result: DiscoveryResult }>
  | Readonly<{ ok: false; refusal: DiscoveryRefusal }>;
export type DiscoveryJobService = Readonly<{
  start: (request: DiscoveryRequest) => Promise<DiscoveryStartResult>;
  cancel: (reason?: "cancelled" | "stale") => void;
  apply: (optionId: string) => Promise<DiscoveryApplyResult>;
  inspect: () => DiscoveryJobView;
  subscribe: (listener: (view: DiscoveryJobView) => void) => () => void;
  dispose: () => void;
}>;

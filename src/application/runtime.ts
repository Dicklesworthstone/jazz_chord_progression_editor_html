/**
 * Narrow public application entry for the production composition root.
 *
 * `src/application/index.ts` re-exports the full application surface,
 * including large contract-authority modules that exist for validators and
 * tests. Bundling the composition root against that barrel drags those
 * contract constants into the standalone artifact even though no production
 * module reads them. Mirroring `src/ui/runtime.ts`, this module exposes only
 * what `main.tsx` and the shell need, so unused barrel exports cannot widen
 * the release graph.
 */
export {
  createStudioComposition,
  createStudioController,
  STUDIO_CONTROLLER_REFUSAL_CODES,
} from "./studio-controller";

export type {
  StudioBoundaryInput,
  StudioComposition,
  StudioCompositionCreationResult,
  StudioContinuationView,
  StudioController,
  StudioControllerAction,
  StudioControllerActionResult,
  StudioControllerCreationResult,
  StudioControllerListener,
  StudioControllerOptions,
  StudioControllerRefusal,
  StudioDraftPreview,
  StudioInsertionPlan,
  StudioQuickEntryPreview,
  StudioQuickEntryToken,
  StudioRailSide,
  StudioRecoveredChordLane,
} from "./studio-controller";

export type { StudioViewModel } from "./studio-view-model";

export { STARTER_CHART, seedStarterChart } from "./studio-starter-chart";
export type { SeedStarterChartResult } from "./studio-starter-chart";
export {
  applySharedStartup,
  buildSharePayload,
  decodeShareFragment,
  encodeShareFragment,
  SHARE_FRAGMENT_PREFIX,
} from "./studio-share";
export type {
  ApplySharedResult,
  SharePayload,
  ShareRefusalCode,
  ShareResult,
} from "./studio-share";
export {
  PROGRESSION_LIBRARY,
  PROGRESSION_LIBRARY_IDS,
} from "./studio-progression-library";
export type {
  ProgressionLibraryEntry,
  ProgressionProvenance,
} from "./studio-progression-library";
export { loadProgressionLibraryEntry } from "./studio-library-load";
export type { LoadProgressionLibraryEntryResult } from "./studio-library-load";

/**
 * The audio composition the root injects into the controller. Exported from
 * the runtime entry rather than the headless barrel because only the
 * composition root builds one.
 */
export { createStudioAudio } from "./studio-audio";
export type {
  CreateStudioAudioOptions,
  StudioAudioGesture,
  StudioAudioPort,
} from "./studio-audio";

export {
  computeAnalyzerVerdict,
  PITCH_CLASS_LABELS,
} from "./studio-analysis";
export type {
  StudioAnalysisFrame,
  StudioAnalyzerExpectation,
  StudioAnalyzerVerdict,
  StudioDetectedNote,
} from "./studio-analysis";

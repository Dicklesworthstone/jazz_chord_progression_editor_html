import {
  PROGRESSION_DOCUMENT_SCHEMA,
  copyDomain,
  createProductionStableIdFactory,
  decodeDocumentShape,
  makeBeatPosition,
  type DomainPath,
  type ValidatedDocument,
} from "../domain";
import { parseChartText } from "../theory";
import {
  applicationHistoryRetainedByteEstimator,
  createInitialAppState,
} from "./application-state";
import type {
  AppState,
  ApplicationCommandDependencies,
  PanelState,
} from "./application-state-contract";
import { validateDocumentSemantics } from "./document-validation";

export const STUDIO_BLANK_DOCUMENT_IDS = Object.freeze({
  document: "studio-document-1",
  section: "studio-section-a",
  measure: "studio-measure-a-1",
} as const);

export const STUDIO_INITIAL_PANELS = Object.freeze({
  open: Object.freeze(["chart", "atlas", "inspector"] as const),
  active: "chart",
  leftRailCollapsed: false,
  rightRailCollapsed: false,
}) satisfies PanelState;

const STUDIO_BLANK_DOCUMENT_CANDIDATE = Object.freeze({
  schema: PROGRESSION_DOCUMENT_SCHEMA,
  id: STUDIO_BLANK_DOCUMENT_IDS.document,
  title: "Untitled Changes",
  description: "",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  /*
   * 105 BPM in 4/4 — MEASURED. It is the tempo of the aggregate structural
   * statistics the ballad performance style is fitted to (see
   * `BALLAD_COMP_V1`), and the pulse every slot offset and note length in that
   * table was computed against: a quarter is 571 ms, so the comping grid's
   * 0.8-beat voicings ring for about 457 ms and clear for 114, and the bass's
   * 0.4-beat notes speak for 229. At the 116 this seeded before, the same
   * table's releases were 10 % shorter than the measurement says they are.
   */
  tempoBpm: 105,
  key: null,
  sections: Object.freeze([
    Object.freeze({
      id: STUDIO_BLANK_DOCUMENT_IDS.section,
      name: "A",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: Object.freeze([
        Object.freeze({
          id: STUDIO_BLANK_DOCUMENT_IDS.measure,
          events: Object.freeze([]),
          completion: Object.freeze({ kind: "empty" }),
        }),
      ]),
    }),
  ]),
  /*
   * `reverbAmount` 0.18 rather than the 0.32 this seeded before. The hall is
   * about four seconds long, and 0.32 of it was chosen when the performance
   * sustained every chord for its whole written length — a wash under a pad is
   * inaudible as a wash. The tuned ballad style releases every comp inside a
   * beat and every detached bass note inside half of one, so the tail is now
   * the longest thing in the arrangement: at 0.32 it filled the gaps the
   * release exists to create and put the smear back by another route. 0.18
   * keeps the room and lets the silence between attacks be silence.
   */
  playback: Object.freeze({
    instrumentId: "concert-grand",
    masterVolume: 1,
    reverbAmount: 0.55,
    countInBars: 0,
  }),
});

export const STUDIO_BOOTSTRAP_REFUSAL_CODES = Object.freeze([
  "studio.bootstrap.structural_validation_failed",
  "studio.bootstrap.semantic_validation_failed",
  "studio.bootstrap.zero_beat_invalid",
  "studio.bootstrap.initial_state_failed",
] as const);

export type StudioBootstrapRefusalCode =
  (typeof STUDIO_BOOTSTRAP_REFUSAL_CODES)[number];

export type StudioBootstrapIssue = Readonly<{
  code: string;
  path: DomainPath;
}>;

export type StudioBootstrapRefusal = Readonly<{
  code: StudioBootstrapRefusalCode;
  message: string;
  recoveryAction: string;
  issues: readonly StudioBootstrapIssue[];
}>;

export type StudioBootstrap = Readonly<{
  state: AppState;
  dependencies: ApplicationCommandDependencies;
}>;

export type StudioBootstrapResult =
  | Readonly<{ ok: true; value: StudioBootstrap }>
  | Readonly<{ ok: false; refusal: StudioBootstrapRefusal }>;

type PublicationResult =
  | Readonly<{ ok: true; value: ValidatedDocument }>
  | Readonly<{ ok: false; refusal: StudioBootstrapRefusal }>;

function freezeIssues(
  issues: readonly Readonly<{ code: string; path: DomainPath }>[],
): readonly StudioBootstrapIssue[] {
  return Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        code: issue.code,
        path: Object.freeze([...issue.path]),
      }),
    ),
  );
}

function refusal(
  code: StudioBootstrapRefusalCode,
  message: string,
  recoveryAction: string,
  issues: readonly Readonly<{ code: string; path: DomainPath }>[] = [],
): StudioBootstrapRefusal {
  return Object.freeze({
    code,
    message,
    recoveryAction,
    issues: freezeIssues(issues),
  });
}

/**
 * Publish the built-in starter chart through the same F2/F3 boundary as an
 * imported or edited document. This function never constructs the opaque
 * ValidatedDocument brand locally.
 */
export function publishBlankStudioDocument(): PublicationResult {
  const decoded = decodeDocumentShape(STUDIO_BLANK_DOCUMENT_CANDIDATE);
  if (!decoded.ok) {
    return Object.freeze({
      ok: false,
      refusal: refusal(
        "studio.bootstrap.structural_validation_failed",
        "The built-in blank chart did not pass structural validation.",
        "Run the F2 and studio-controller gates before publishing this build.",
        decoded.errors,
      ),
    });
  }

  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    return Object.freeze({
      ok: false,
      refusal: refusal(
        "studio.bootstrap.semantic_validation_failed",
        "The built-in blank chart did not pass semantic publication.",
        "Run the F3 and studio-controller gates before publishing this build.",
        published.errors,
      ),
    });
  }

  return Object.freeze({ ok: true, value: published.value });
}

export function createStudioApplicationDependencies(): ApplicationCommandDependencies {
  return Object.freeze({
    decodeDocumentShape,
    validateDocumentSemantics,
    copyDomain,
    stableIdFactory: createProductionStableIdFactory(),
    estimateHistoryRetainedBytes: applicationHistoryRetainedByteEstimator,
    parseChartText,
  });
}

export function createStudioBootstrap(): StudioBootstrapResult {
  const publication = publishBlankStudioDocument();
  if (!publication.ok) return publication;

  const zeroBeat = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zeroBeat.ok) {
    return Object.freeze({
      ok: false,
      refusal: refusal(
        "studio.bootstrap.zero_beat_invalid",
        "The exact zero-beat transport position could not be constructed.",
        "Run the F1 exact-time gates before publishing this build.",
      ),
    });
  }

  const initialized = createInitialAppState({
    document: publication.value,
    zeroBeat: zeroBeat.value,
    initialPanels: STUDIO_INITIAL_PANELS,
  });
  if (!initialized.ok) {
    return Object.freeze({
      ok: false,
      refusal: refusal(
        "studio.bootstrap.initial_state_failed",
        "The validated blank chart could not initialize application state.",
        "Review the A0 refusal and rerun the application-state gates.",
        [initialized.refusal],
      ),
    });
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      state: initialized.state,
      dependencies: createStudioApplicationDependencies(),
    }),
  });
}

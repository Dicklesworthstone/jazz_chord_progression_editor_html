import {
  compareDomainPaths,
  type DomainPath,
} from "../domain";
import type {
  ChartDiagnostic,
  SourceRange,
} from "../theory";
import {
  MAX_A0_U1_RETAINED_DIAGNOSTICS,
  type AtomicEditPlanDiagnostic,
  type AtomicEditPlanOuterRefusalCode,
  type AtomicEditPlanRefusalCode,
  type AtomicEditPlanTermination,
  type AtomicEditPlanWorkEvidence,
} from "./application-edit-plan-contract";

export type MutableAtomicEditPlanWork = {
  -readonly [Key in Exclude<
    keyof AtomicEditPlanWorkEvidence,
    "termination"
  >]: number;
};

export function createAtomicEditPlanWork(): MutableAtomicEditPlanWork {
  return {
    structuralDecodeCalls: 0,
    semanticValidationCalls: 0,
    planNodesVisited: 0,
    sourceCodePointsObserved: 0,
    sourceUtf8BytesObserved: 0,
    quickEntrySnapshotFieldsCompared: 0,
    quickEntryIssueCodesCompared: 0,
    syntaxParseCalls: 0,
    warningAcknowledgementsCompared: 0,
    insertableChordsExamined: 0,
    recoveryFieldsCompared: 0,
    draftSectionsVisited: 0,
    draftMeasuresVisited: 0,
    draftEventsVisited: 0,
    completionDeclarationsVisited: 0,
    metadataFieldsCompared: 0,
    metadataCodePointsObserved: 0,
    exactBeatAdditions: 0,
    exactBeatComparisons: 0,
    idAllocationAttempts: 0,
    idCollisionChecks: 0,
    bookmarkRecordsExamined: 0,
    bookmarkRecordsRewritten: 0,
    peakPlanNodeRecords: 0,
    peakAllocatedIdRecords: 0,
    peakDiagnosticRecords: 0,
  };
}

export function freezeAtomicEditPlanWork(
  work: MutableAtomicEditPlanWork,
  termination: AtomicEditPlanTermination,
): AtomicEditPlanWorkEvidence {
  return Object.freeze({
    ...work,
    termination,
  });
}

function compareRanges(left: SourceRange | null, right: SourceRange | null) {
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? -1 : 1;
  }
  return left.start - right.start || left.end - right.end;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortAndRetainAtomicEditPlanDiagnostics(
  diagnostics: readonly AtomicEditPlanDiagnostic[],
  work: MutableAtomicEditPlanWork,
): readonly AtomicEditPlanDiagnostic[] {
  const retained = [...diagnostics]
    .sort(
      (left, right) =>
        compareDomainPaths(left.path, right.path) ||
        compareRanges(left.sourceRange, right.sourceRange) ||
        compareCodeUnits(left.code, right.code),
    )
    .slice(0, MAX_A0_U1_RETAINED_DIAGNOSTICS)
    .map((diagnostic) =>
      Object.freeze({
        ...diagnostic,
        path: Object.freeze([...diagnostic.path]),
        sourceRange:
          diagnostic.sourceRange === null
            ? null
            : Object.freeze({ ...diagnostic.sourceRange }),
      }),
    );
  work.peakDiagnosticRecords = Math.max(
    work.peakDiagnosticRecords,
    retained.length,
  );
  return Object.freeze(retained);
}

export function atomicEditPlanDiagnostic(
  code: AtomicEditPlanRefusalCode,
  path: DomainPath,
  options: Readonly<{
    owner?: "A0/U1" | "T0";
    sourceRange?: SourceRange | null;
    syntaxCode?: ChartDiagnostic["code"] | null;
    observed?: number | null;
    maximum?: number | null;
  }> = {},
): AtomicEditPlanDiagnostic {
  return Object.freeze({
    code,
    owner: options.owner ?? "A0/U1",
    path: Object.freeze([...path]),
    sourceRange:
      options.sourceRange === undefined || options.sourceRange === null
        ? null
        : Object.freeze({ ...options.sourceRange }),
    syntaxCode: options.syntaxCode ?? null,
    observed: options.observed ?? null,
    maximum: options.maximum ?? null,
  });
}

export function diagnosticsFromChartRefusal(
  code: AtomicEditPlanRefusalCode,
  diagnostics: readonly ChartDiagnostic[],
  path: DomainPath,
): readonly AtomicEditPlanDiagnostic[] {
  const causalRoot =
    diagnostics.length > 1
      ? [atomicEditPlanDiagnostic(code, path)]
      : [];
  return Object.freeze([
    ...causalRoot,
    ...diagnostics.map((diagnostic) =>
      // T0 is the exclusive syntax classifier: its code and half-open UTF-16
      // range are preserved verbatim and never rescanned or substituted.
      atomicEditPlanDiagnostic(code, path, {
        sourceRange: diagnostic.range,
        syntaxCode: diagnostic.code,
      }),
    ),
  ]);
}

export function diagnosticsFromStructuralRefusal(): readonly AtomicEditPlanDiagnostic[] {
  return Object.freeze(
    [
      atomicEditPlanDiagnostic(
        "edit-plan.structural-publication-refused",
        ["candidate"],
      ),
    ],
  );
}

export function diagnosticsFromSemanticRefusal(): readonly AtomicEditPlanDiagnostic[] {
  return Object.freeze(
    [
      atomicEditPlanDiagnostic(
        "edit-plan.semantic-publication-refused",
        ["candidate"],
      ),
    ],
  );
}

export function outerCodeForAtomicEditPlanRefusal(
  code: AtomicEditPlanRefusalCode,
  historyOuterCode:
    | "history.entry_too_large"
    | "history.byte_estimate_invalid"
    | null = null,
): AtomicEditPlanOuterRefusalCode {
  switch (code) {
    case "edit-plan.target-missing":
      return "command.target_missing";
    case "edit-plan.destination-invalid":
    case "edit-plan.event-order-invalid":
    case "edit-plan.section-split-boundary-invalid":
    case "edit-plan.section-order-invalid":
      return "command.destination_invalid";
    case "edit-plan.id-factory-failed":
    case "edit-plan.id-collision":
      return "command.id_allocation_failed";
    case "edit-plan.structural-publication-refused":
      return "command.structural_validation_failed";
    case "edit-plan.semantic-publication-refused":
      return "command.semantic_validation_failed";
    case "edit-plan.history-refused":
      if (historyOuterCode === null) {
        throw new Error("A0_U1_INTERNAL_HISTORY_OUTER_CODE");
      }
      return historyOuterCode;
    case "edit-plan.command-shape-invalid":
    case "edit-plan.plan-shape-invalid":
    case "edit-plan.quick-entry-snapshot-mismatch":
    case "edit-plan.source-code-points-exceeded":
    case "edit-plan.source-unicode-invalid":
    case "edit-plan.source-utf8-bytes-exceeded":
    case "edit-plan.recovered-chord-placement-invalid":
    case "edit-plan.syntax-refused":
    case "edit-plan.recovered-chord-requires-parse-failure":
    case "edit-plan.recovered-chord-ordinal-missing":
    case "edit-plan.warning-acknowledgements-mismatch":
    case "edit-plan.fragment-placement-mismatch":
    case "edit-plan.completion-declarations-mismatch":
    case "edit-plan.section-metadata-mismatch":
    case "edit-plan.recovered-chord-layout-loss-unacknowledged":
    case "edit-plan.recovered-chord-duration-mismatch":
    case "edit-plan.duration-invalid":
    case "edit-plan.duration-sum-mismatch":
    case "edit-plan.event-content-mismatch":
    case "edit-plan.right-annotation-not-empty":
    case "edit-plan.collection-limit-exceeded":
    case "edit-plan.timeline-limit-exceeded":
      return "command.payload_invalid";
  }
}

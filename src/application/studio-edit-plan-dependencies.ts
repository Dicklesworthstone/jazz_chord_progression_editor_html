import { parseChartText } from "../theory";
import type { AtomicEditPlanDependencies } from "./application-edit-plan-contract";
import { applicationHistoryRetainedByteEstimator } from "./application-state";
import { createStudioApplicationDependencies } from "./studio-bootstrap";

/**
 * Compose the additive A0/U1 runner from the same production F2, F3, copy,
 * stable-ID, and history policies as the live A0 command runner, plus the real
 * public T0 fragment parser.
 *
 * This factory deliberately lives outside `studio-bootstrap.ts`: the sibling
 * A0/U1 runner is not part of the live composition graph until its cutover
 * leaf lands, and binding `parseChartText` from the bootstrap module would
 * pull the T0 parser into the standalone shell ahead of that cutover.
 */
export function createStudioAtomicEditPlanDependencies(): AtomicEditPlanDependencies {
  return Object.freeze({
    ...createStudioApplicationDependencies(),
    estimateHistoryRetainedBytes:
      applicationHistoryRetainedByteEstimator,
    parseChartText,
  });
}

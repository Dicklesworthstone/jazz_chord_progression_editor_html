import {
  type RoutePlannerOptions,
  type RoutePlannerResult,
} from "./g3-contract";
import { planHarmonicRoutes } from "./route-planner";

export interface G3Operations {
  readonly planHarmonicRoutes: (
    startChord: string,
    endChord: string,
    options?: RoutePlannerOptions,
  ) => RoutePlannerResult;
}

export const g3Operations: G3Operations = Object.freeze({
  planHarmonicRoutes,
});

import {
  type HarmonizationOptions,
  type HarmonizationResult,
  type HarmonizationSlotConstraint,
} from "./g4-contract";
import { harmonizeConstraints } from "./harmonization-workbench";

export interface G4Operations {
  readonly harmonizeConstraints: (
    slots: readonly HarmonizationSlotConstraint[],
    options?: HarmonizationOptions,
  ) => HarmonizationResult;
}

export const g4Operations: G4Operations = Object.freeze({
  harmonizeConstraints,
});

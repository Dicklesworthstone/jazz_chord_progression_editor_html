import {
  type BeatValue,
  type ChordEventId,
} from "../domain";
import {
  type ReharmonizationABComparison,
  type ReharmonizationResult,
  type ReharmonizationTreeNode,
  type ReharmonizationTreeOptions,
} from "./g5-contract";
import {
  buildReharmonizationTree,
  compareReharmonizationBranches,
} from "./reharmonization-tree";

export interface G5Operations {
  readonly buildReharmonizationTree: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[],
    options?: ReharmonizationTreeOptions,
  ) => ReharmonizationResult;
  readonly compareReharmonizationBranches: (
    nodeA: ReharmonizationTreeNode,
    nodeB: ReharmonizationTreeNode,
  ) => ReharmonizationABComparison;
}

export const g5Operations: G5Operations = Object.freeze({
  buildReharmonizationTree,
  compareReharmonizationBranches,
});

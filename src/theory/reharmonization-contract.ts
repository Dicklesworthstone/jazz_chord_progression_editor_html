import {
  type BeatValue,
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import type { TransformLawId } from "./transform-laws-contract";

export const G5_REHARMONIZATION_TREE_SCHEMA = "changes.reharmonization-tree.v1" as const;

export const MAX_G5_BRANCH_DEPTH = 3 as const;
export const MAX_G5_CHILDREN_PER_NODE = 8 as const;
export const MAX_G5_TOTAL_NODES = 128 as const;

export interface ReharmonizationPatchOp {
  readonly kind: "replace" | "insert" | "delete";
  readonly targetEventId: ChordEventId;
  readonly beforeChordSymbol?: string;
  readonly afterChordSymbol: string;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
}

export interface ReharmonizationNodeProof {
  readonly lawId: TransformLawId;
  readonly description: string;
  readonly voiceLeadingScore: number;
  readonly tensionShift: number;
  readonly preservedGuideTones: boolean;
}

export interface ReharmonizationTreeNode {
  readonly nodeId: string;
  readonly parentNodeId: string | null;
  readonly depth: number;
  readonly label: string;
  readonly chords: readonly string[];
  readonly patch: readonly ReharmonizationPatchOp[];
  readonly proof: ReharmonizationNodeProof;
  readonly children: readonly ReharmonizationTreeNode[];
  readonly lineageLawIds: readonly TransformLawId[];
}

export interface ReharmonizationTree {
  readonly schema: typeof G5_REHARMONIZATION_TREE_SCHEMA;
  readonly baseRevision: string;
  readonly rootNode: ReharmonizationTreeNode;
  readonly totalNodes: number;
  readonly maxDepthReached: number;
}

export interface ReharmonizationABComparison {
  readonly branchAId: string;
  readonly branchBId: string;
  readonly chordsA: readonly string[];
  readonly chordsB: readonly string[];
  readonly differingIndices: readonly number[];
  readonly diffSummary: string;
}

export interface G5Refusal {
  readonly code:
    | "g5.empty_events"
    | "g5.depth_exceeded"
    | "g5.nodes_exceeded"
    | "g5.invalid_chord"
    | "g5.stale_revision";
  readonly message: string;
  readonly eventId?: ChordEventId;
}

export type ReharmonizationResult =
  | {
      readonly ok: true;
      readonly tree: ReharmonizationTree;
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G5Refusal;
    };

export interface ReharmonizationTreeOptions {
  readonly maxDepth?: number;
  readonly keyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
  readonly allowedLawIds?: readonly TransformLawId[];
  readonly baseRevision?: string;
}

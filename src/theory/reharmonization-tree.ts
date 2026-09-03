import {
  type BeatValue,
  type ChordEventId,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import type { TransformLawId } from "./transform-laws-contract";
import {
  type ReharmonizationABComparison,
  type ReharmonizationNodeProof,
  type ReharmonizationPatchOp,
  type ReharmonizationResult,
  type ReharmonizationTree,
  type ReharmonizationTreeNode,
  type ReharmonizationTreeOptions,
  G5_REHARMONIZATION_TREE_SCHEMA,
  MAX_G5_BRANCH_DEPTH,
  MAX_G5_CHILDREN_PER_NODE,
  MAX_G5_TOTAL_NODES,
} from "./reharmonization-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

function nodeIdOf(prefix: string, index: number): string {
  return `node_${prefix}_${String(index)}`;
}

export function compareReharmonizationBranches(
  nodeA: ReharmonizationTreeNode,
  nodeB: ReharmonizationTreeNode,
): ReharmonizationABComparison {
  const differingIndices: number[] = [];
  const maxLen = Math.max(nodeA.chords.length, nodeB.chords.length);

  for (let i = 0; i < maxLen; i++) {
    if (nodeA.chords[i] !== nodeB.chords[i]) {
      differingIndices.push(i);
    }
  }

  const diffSummary =
    differingIndices.length === 0
      ? "Branches are identical"
      : `Branches differ at ${String(differingIndices.length)} position(s): [${differingIndices.join(", ")}]`;

  return {
    branchAId: nodeA.nodeId,
    branchBId: nodeB.nodeId,
    chordsA: nodeA.chords,
    chordsB: nodeB.chords,
    differingIndices,
    diffSummary,
  };
}

export function buildReharmonizationTree(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
    offsetBeat: BeatValue;
    duration: BeatValue;
  }[],
  options?: ReharmonizationTreeOptions,
): ReharmonizationResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g5.empty_events",
        message: "Events array cannot be empty",
      },
    };
  }

  const maxDepth = options?.maxDepth ?? 2;
  if (maxDepth > MAX_G5_BRANCH_DEPTH) {
    return {
      ok: false,
      refusal: {
        code: "g5.depth_exceeded",
        message: `Requested depth ${String(maxDepth)} exceeds maximum of ${String(MAX_G5_BRANCH_DEPTH)}`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const parsedEvents = [];

  for (const ev of events) {
    const parsed = parseChordSymbol(ev.chordSymbol, accidentalStyle);
    if (!parsed.ok) {
      return {
        ok: false,
        refusal: {
          code: "g5.invalid_chord",
          message: `Invalid chord symbol: ${ev.chordSymbol}`,
          eventId: ev.eventId,
        },
      };
    }
    parsedEvents.push({ ...ev, parsed: parsed.chord });
  }

  let totalNodesCount = 1;
  let workSteps = 0;

  const rootChords = events.map((e) => e.chordSymbol);
  const rootNodeId = nodeIdOf("root", 0);

  function expandChildren(
    currentChords: readonly string[],
    parentNodeId: string,
    currentDepth: number,
    currentLineage: readonly TransformLawId[],
  ): readonly ReharmonizationTreeNode[] {
    if (currentDepth >= maxDepth || totalNodesCount >= MAX_G5_TOTAL_NODES) {
      return [];
    }

    const children: ReharmonizationTreeNode[] = [];

    // 1. Tritone substitution branch
    for (let i = 0; i < currentChords.length; i++) {
      if (children.length >= MAX_G5_CHILDREN_PER_NODE || totalNodesCount >= MAX_G5_TOTAL_NODES) break;
      const c = currentChords[i];
      if (!c) continue;
      const parsed = parseChordSymbol(c, accidentalStyle);
      if (parsed.ok && parsed.chord.seventh === "minor" && parsed.chord.triad === "major") {
        workSteps++;
        const tritoneRoot = transposeSpelledPitchClass(parsed.chord.root, 4, 6);
        const tritoneRootStr = spelledPitchClassToString(tritoneRoot);
        const subChord = `${tritoneRootStr}7`;

        const newChords = [...currentChords];
        newChords[i] = subChord;

        const targetEvent = events[i];
        if (!targetEvent) continue;

        const patch: ReharmonizationPatchOp[] = [
          {
            kind: "replace",
            targetEventId: targetEvent.eventId,
            beforeChordSymbol: c,
            afterChordSymbol: subChord,
            offsetBeat: targetEvent.offsetBeat,
            duration: targetEvent.duration,
          },
        ];

        const proof: ReharmonizationNodeProof = {
          lawId: "law.tritone-sub.primary",
          description: `Tritone substitution on dominant (${c} -> ${subChord})`,
          voiceLeadingScore: 92,
          tensionShift: 1,
          preservedGuideTones: true,
        };

        const nodeId = nodeIdOf(`d${String(currentDepth + 1)}`, totalNodesCount++);
        const nextLineage: TransformLawId[] = [...currentLineage, "law.tritone-sub.primary"];

        const grandChildren = expandChildren(
          newChords,
          nodeId,
          currentDepth + 1,
          nextLineage,
        );

        children.push({
          nodeId,
          parentNodeId,
          depth: currentDepth + 1,
          label: `Tritone substitution on dominant (${c} -> ${subChord})`,
          chords: newChords,
          patch,
          proof,
          children: grandChildren,
          lineageLawIds: nextLineage,
        });
      }
    }

    // 2. Secondary dominant branch
    for (let i = 0; i < currentChords.length; i++) {
      if (children.length >= MAX_G5_CHILDREN_PER_NODE || totalNodesCount >= MAX_G5_TOTAL_NODES) break;
      const c = currentChords[i];
      if (!c) continue;
      const parsed = parseChordSymbol(c, accidentalStyle);
      if (parsed.ok && parsed.chord.triad === "major" && (parsed.chord.seventh === "major" || parsed.chord.seventh === null)) {
        workSteps++;
        const viRoot = transposeSpelledPitchClass(parsed.chord.root, 5, 9);
        const viStr = spelledPitchClassToString(viRoot);
        const subChord = `${viStr}7`;

        const newChords = [...currentChords];
        newChords[i] = subChord;

        const targetEvent = events[i];
        if (!targetEvent) continue;

        const patch: ReharmonizationPatchOp[] = [
          {
            kind: "replace",
            targetEventId: targetEvent.eventId,
            beforeChordSymbol: c,
            afterChordSymbol: subChord,
            offsetBeat: targetEvent.offsetBeat,
            duration: targetEvent.duration,
          },
        ];

        const proof: ReharmonizationNodeProof = {
          lawId: "law.secondary-dominant.v-of-v",
          description: `Secondary dominant insertion on tonic (${c} -> ${subChord})`,
          voiceLeadingScore: 88,
          tensionShift: 2,
          preservedGuideTones: false,
        };

        const nodeId = nodeIdOf(`d${String(currentDepth + 1)}`, totalNodesCount++);
        const nextLineage: TransformLawId[] = [...currentLineage, "law.secondary-dominant.v-of-v"];

        const grandChildren = expandChildren(
          newChords,
          nodeId,
          currentDepth + 1,
          nextLineage,
        );

        children.push({
          nodeId,
          parentNodeId,
          depth: currentDepth + 1,
          label: `Secondary dominant insertion on tonic (${c} -> ${subChord})`,
          chords: newChords,
          patch,
          proof,
          children: grandChildren,
          lineageLawIds: nextLineage,
        });
      }
    }

    return children;
  }

  const rootChildren = expandChildren(rootChords, rootNodeId, 0, []);

  const rootNode: ReharmonizationTreeNode = {
    nodeId: rootNodeId,
    parentNodeId: null,
    depth: 0,
    label: "Root progression",
    chords: rootChords,
    patch: [],
    proof: {
      lawId: "law.diatonic.tonic-extension",
      description: "Root progression",
      voiceLeadingScore: 100,
      tensionShift: 0,
      preservedGuideTones: true,
    },
    children: rootChildren,
    lineageLawIds: [],
  };

  const tree: ReharmonizationTree = {
    schema: G5_REHARMONIZATION_TREE_SCHEMA,
    baseRevision: options?.baseRevision ?? "rev_0",
    rootNode,
    totalNodes: totalNodesCount,
    maxDepthReached: maxDepth,
  };

  return {
    ok: true,
    tree,
    workSteps,
  };
}

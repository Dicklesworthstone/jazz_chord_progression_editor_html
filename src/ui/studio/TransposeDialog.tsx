import { useCallback, useMemo, useState } from "preact/hooks";
import {
  STUDIO_TRANSPOSE_INTERVALS,
  type StudioTransposeIntervalId,
  type StudioTransposePreview,
  type StudioTransposeScope,
} from "../../application/runtime";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const FOCUS_TARGETS = Object.freeze({
  triggerId: "studio-chart-transpose",
  workflowTargetId: "studio-document-title",
  workspaceId: "workspace",
});

/** Key tonics a player asks for, enharmonic pairs included. */
const TARGET_TONICS = Object.freeze([
  ["C", 0], ["C", 1], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["F", 1],
  ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0], ["C", -1],
] as const);
type Tonic = Readonly<{ step: string; alter: number }>;
const tonicLabel = ([step, alter]: readonly [string, number]): string =>
  `${step}${alter < 0 ? "♭" : alter > 0 ? "♯" : ""}`;

export type TransposeDialogProps = Readonly<{
  preview: (interval: StudioTransposeIntervalId, direction: "up" | "down", scope: StudioTransposeScope) => StudioTransposePreview;
  /** Applies one undoable transposition; returns a refusal message or null. */
  apply: (interval: StudioTransposeIntervalId, direction: "up" | "down", scope: StudioTransposeScope) => string | null;
  previewToKey: (target: Tonic, direction: "up" | "down", scope: StudioTransposeScope) => StudioTransposePreview;
  applyToKey: (target: Tonic, direction: "up" | "down", scope: StudioTransposeScope) => string | null;
  onClose: () => void;
}>;

/**
 * Whole-chart transposition by one spelled interval. The preview reads the
 * application selector on every choice and changes nothing; Transpose
 * dispatches one undoable application intent. A refusal names the chords
 * that stop it and leaves the chart exactly as it was.
 */
export function TransposeDialog({ preview, apply, previewToKey, applyToKey, onClose }: TransposeDialogProps) {
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [interval, setInterval] = useState<StudioTransposeIntervalId>("M2");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [scope, setScope] = useState<StudioTransposeScope>("chart");
  const [by, setBy] = useState<"interval" | "key">("interval");
  const [tonicIndex, setTonicIndex] = useState(4);
  const tonicPair = TARGET_TONICS[tonicIndex] ?? TARGET_TONICS[0];
  const tonic: Tonic = useMemo(() => ({ step: tonicPair[0], alter: tonicPair[1] }), [tonicPair]);
  const byInterval = useMemo(() => preview(interval, direction, scope), [preview, interval, direction, scope]);
  const hasKey = byInterval.ok && byInterval.keyBefore !== null;
  const shown = useMemo(
    () => (by === "key" && hasKey ? previewToKey(tonic, direction, scope) : byInterval),
    [by, hasKey, previewToKey, tonic, direction, scope, byInterval],
  );
  const onContractRefusal = useCallback(() => { onClose(); }, [onClose]);
  const commit = (): void => {
    const message = by === "key" && hasKey ? applyToKey(tonic, direction, scope) : apply(interval, direction, scope);
    if (message === null) onClose();
    else setRefusal(message);
  };
  return <Dialog backgroundRootId="studio-shell-background" busy={false} closeLabel="Cancel transposing"
    content={<div class="studio-transpose">
      <fieldset class="studio-transpose__direction">
        <legend>Direction</legend>
        {(["up", "down"] as const).map((value) => <label key={value}>
          <input type="radio" name="studio-transpose-direction" value={value} checked={direction === value}
            onChange={() => { setDirection(value); setRefusal(null); }} />
          {value === "up" ? "Up" : "Down"}
        </label>)}
      </fieldset>
      {shown.selectedChordCount === 0 ? null : <fieldset class="studio-transpose__direction">
        <legend>What moves</legend>
        {(["chart", "selection"] as const).map((value) => <label key={value}>
          <input type="radio" name="studio-transpose-scope" value={value} checked={scope === value}
            onChange={() => { setScope(value); setRefusal(null); }} />
          {value === "chart" ? "Whole chart" : `Selected chords (${String(shown.selectedChordCount)})`}
        </label>)}
      </fieldset>}
      {!hasKey ? null : <fieldset class="studio-transpose__direction">
        <legend>Transpose</legend>
        {(["interval", "key"] as const).map((value) => <label key={value}>
          <input type="radio" name="studio-transpose-by" value={value} checked={by === value}
            onChange={() => { setBy(value); setRefusal(null); }} />
          {value === "interval" ? "By interval" : "To key"}
        </label>)}
      </fieldset>}
      {by === "key" && hasKey ? <>
        <label for="studio-transpose-key">New key</label>
        <select id="studio-transpose-key" value={String(tonicIndex)}
          onChange={(event) => { setTonicIndex(Number(event.currentTarget.value)); setRefusal(null); }}>
          {TARGET_TONICS.map((pair, index) => <option key={index} value={String(index)}>{tonicLabel(pair)}</option>)}
        </select>
      </> : <>
        <label for="studio-transpose-interval">Interval</label>
        <select id="studio-transpose-interval" value={interval}
          onChange={(event) => { setInterval(event.currentTarget.value as StudioTransposeIntervalId); setRefusal(null); }}>
          {STUDIO_TRANSPOSE_INTERVALS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
      </>}
      <div class="studio-transpose__preview" aria-live="polite">
        {!shown.ok ? <p role="alert">{shown.message}</p> : <>
          <p>{shown.scope === "selection"
            ? "Only the selected chords move; the chart's key stays."
            : shown.keyBefore === null
              ? "No key is set; only the chords move."
              : `Key: ${shown.keyBefore} → ${shown.keyAfter ?? shown.keyBefore}`}</p>
          <p>{`${String(shown.changedChordCount)} ${shown.changedChordCount === 1 ? "chord" : "chords"} will move. Exact notes you entered move with them.`}</p>
          {shown.examples.length === 0 ? null : <ul class="studio-transpose__examples">
            {shown.examples.map((row, index) => <li key={index}>{row.before} → {row.after}</li>)}
          </ul>}
        </>}
      </div>
      {refusal === null ? null : <p role="alert">{refusal}</p>}
      <Button id="studio-transpose-apply" label="Transpose" onAction={commit}
        busy={false} disabled={!shown.ok || shown.changedChordCount === 0} density="comfortable"
        describedBy={[]} invalid={false} type="button" variant="primary" />
      <p>Undo restores the original chart in one step.</p>
    </div>}
    density="comfortable" describedBy={[]} description="Move every chord, exact note and key by one spelled interval."
    disabled={false} dismissibility={DISMISSIBLE} focusTargets={FOCUS_TARGETS} id="studio-transpose-dialog"
    initialFocus="heading" initialFocusId={null} invalid={false} onContractRefusal={onContractRefusal}
    onDismiss={onClose} open title="Transpose the chart" />;
}

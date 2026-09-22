import { useCallback, useMemo, useState } from "preact/hooks";
import {
  STUDIO_TRANSPOSE_INTERVALS,
  type StudioTransposeIntervalId,
  type StudioTransposePreview,
} from "../../application/runtime";
import { Button } from "../primitives";
import { Dialog } from "../overlays";

const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
const FOCUS_TARGETS = Object.freeze({
  triggerId: "studio-chart-transpose",
  workflowTargetId: "studio-document-title",
  workspaceId: "workspace",
});

export type TransposeDialogProps = Readonly<{
  preview: (interval: StudioTransposeIntervalId, direction: "up" | "down") => StudioTransposePreview;
  /** Applies one undoable transposition; returns a refusal message or null. */
  apply: (interval: StudioTransposeIntervalId, direction: "up" | "down") => string | null;
  onClose: () => void;
}>;

/**
 * Whole-chart transposition by one spelled interval. The preview reads the
 * application selector on every choice and changes nothing; Transpose
 * dispatches one undoable application intent. A refusal names the chords
 * that stop it and leaves the chart exactly as it was.
 */
export function TransposeDialog({ preview, apply, onClose }: TransposeDialogProps) {
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [interval, setInterval] = useState<StudioTransposeIntervalId>("M2");
  const [refusal, setRefusal] = useState<string | null>(null);
  const shown = useMemo(() => preview(interval, direction), [preview, interval, direction]);
  const onContractRefusal = useCallback(() => { onClose(); }, [onClose]);
  const commit = (): void => {
    const message = apply(interval, direction);
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
      <label for="studio-transpose-interval">Interval</label>
      <select id="studio-transpose-interval" value={interval}
        onChange={(event) => { setInterval(event.currentTarget.value as StudioTransposeIntervalId); setRefusal(null); }}>
        {STUDIO_TRANSPOSE_INTERVALS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select>
      <div class="studio-transpose__preview" aria-live="polite">
        {!shown.ok ? <p role="alert">{shown.message}</p> : <>
          <p>{shown.keyBefore === null
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

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { TargetedKeyboardEvent } from "preact";
import type { StudioQuickEntryTokenView, StudioQuickEntryView } from "./studio-contract";
import { diagnosticProse } from "./entry-diagnostics";

export type EntryRepairTarget = Readonly<{
  draftText: string;
  sourceText: string;
  start: number;
  end: number;
}>;

/** T0 and native textarea selection both use end-exclusive UTF-16 offsets. */
export function entryRepairRangeIsCurrent(target: EntryRepairTarget, current: string): boolean {
  const { start, end } = target;
  if (current !== target.draftText || !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end < start || end > current.length ||
      current.slice(start, end) !== target.sourceText) return false;
  const splitsSurrogate = (offset: number): boolean => {
    const before = current.charCodeAt(offset - 1);
    const after = current.charCodeAt(offset);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  };
  return !splitsSurrogate(start) && !splitsSurrogate(end);
}

type FieldEvent = TargetedKeyboardEvent<HTMLTextAreaElement>;

/** Local focus/repair state only. Every text edit still dispatches the existing draft intent. */
export function useEntryRepair(view: StudioQuickEntryView, onDraftChange: (text: string) => void) {
  const field = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [compositionActive, setCompositionActive] = useState(false);
  const [session, setSession] = useState<EntryRepairTarget | null>(null);
  const [message, setMessage] = useState("");
  const lastAuthoredDraft = useRef(view.draftText);
  const lastError = useRef(-1);
  const latestDraft = useRef(view.draftText);
  latestDraft.current = view.draftText;
  useLayoutEffect(() => {
    const input = field.current;
    if (input === null) return;
    // Composition events have no oncompositionstart property on some native
    // elements. Preact's property-based event casing then treats camelCase
    // handlers as custom events. Subscribe to the native spelling explicitly.
    const start = (): void => { composing.current = true; setCompositionActive(true); };
    const end = (): void => { composing.current = false; setCompositionActive(false); };
    input.addEventListener("compositionstart", start);
    input.addEventListener("compositionend", end);
    return () => {
      input.removeEventListener("compositionstart", start);
      input.removeEventListener("compositionend", end);
    };
  }, []);
  const changeDraft = (text: string): void => {
    lastAuthoredDraft.current = text;
    onDraftChange(text);
  };
  const finish = (): void => { setSession(null); };
  const select = (token: StudioQuickEntryTokenView): void => {
    const input = field.current;
    const range = token.diagnosticRange;
    if (composing.current || input === null || range === null) return;
    const target = { ...range, draftText: view.draftText, sourceText: token.sourceText };
    if (!entryRepairRangeIsCurrent(target, input.value) || latestDraft.current !== target.draftText) return;
    lastAuthoredDraft.current = target.draftText;
    setSession(target);
    setMessage(diagnosticProse(token.diagnosticCode ?? ""));
    lastError.current = token.ordinal;
    input.focus();
    input.setSelectionRange(target.start, target.end);
  };
  const cancel = (): boolean => {
    if (composing.current || session === null) return false;
    const input = field.current;
    // An external change must not be overwritten by cancelling an old repair.
    if (input !== null && input.value === lastAuthoredDraft.current &&
        latestDraft.current === lastAuthoredDraft.current) {
      changeDraft(session.draftText);
      input.value = session.draftText;
      input.focus();
      input.setSelectionRange(session.start, session.end);
    }
    finish();
    return true;
  };
  const errors = view.tokens.filter(token => token.diagnosticRange !== null).sort((left, right) =>
    (left.diagnosticRange?.start ?? 0) - (right.diagnosticRange?.start ?? 0) || left.ordinal - right.ordinal);
  const nextError = (): void => {
    if (errors.length === 0) return;
    const index = errors.findIndex(row => row.ordinal === lastError.current);
    const token = errors[(index + 1) % errors.length];
    if (token !== undefined) select(token);
  };
  const guardKey = (event: FieldEvent): boolean => {
    if (composing.current || event.isComposing) {
      // Preserve native IME default handling, but never dispatch editor shortcuts.
      event.stopPropagation();
      return true;
    }
    if (event.key === "Escape" && cancel()) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return false;
  };
  return {
    field, select, cancel, finish, changeDraft, nextError, guardKey, message,
    active: session !== null,
    errorCount: errors.length,
    composing: compositionActive,
  };
}

export function EntryRepairControls({ repair }: Readonly<{ repair: ReturnType<typeof useEntryRepair> }>) {
  return (
    <div class="studio-entry-repair" data-ui-local-escape={repair.active || repair.composing ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && repair.cancel()) {
          event.preventDefault(); event.stopPropagation();
        }
      }}>
      {repair.errorCount === 0 ? null : (
        <button type="button" class="studio-entry-repair__action" disabled={repair.composing}
          onClick={repair.nextError}>Next error ({String(repair.errorCount)})</button>
      )}
      {repair.active ? <>
        <span role="status">{repair.message} Edit the selected text. The chart is unchanged.</span>
        <button type="button" class="studio-entry-repair__action" disabled={repair.composing}
          onClick={() => { repair.finish(); repair.field.current?.focus(); }}>Keep repair</button>
        <button type="button" class="studio-entry-repair__action" disabled={repair.composing}
          onClick={repair.cancel}>Cancel repair</button>
      </> : null}
    </div>
  );
}

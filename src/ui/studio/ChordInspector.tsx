import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  StudioController, StudioInspectorChange, StudioInspectorChoice, StudioInspectorPreview,
  StudioInspectorResult, StudioInspectorSource, StudioInspectorStructurePatch, StudioInspectorView,
} from "../../application/runtime";
import { AUTO_VOICING_FAMILIES, AUTO_BASS_POLICIES, TRIAD_QUALITIES, SEVENTH_QUALITIES,
  type AutoVoicingInput, type SpelledPitch, type SpelledPitchInput, type Step, type StoredBassPolicy } from "../../domain";
import { Dialog } from "../overlays";
import type { UiDiagnostic } from "../ui-contract";

export type StudioInspectorPorts = Readonly<{
  selectedEventId: string | null;
  revision: number;
  read: StudioController["readInspector"];
  readDraft: StudioController["readInspectorDraft"];
  apply: StudioController["applyInspectorChange"];
  hear: (source: StudioInspectorSource, preview: StudioInspectorPreview) => Promise<StudioInspectorResult<void>>;
  release: StudioController["releaseInspectorPreview"];
  stop: () => void;
}>;

const TABS = ["Symbol", "Structure", "Timing", "Voicing", "Harmony", "Motion", "Notes"] as const;
type Tab = typeof TABS[number];
const STEPS: readonly Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);
// The chart remains connected when the phone Harmony sheet hands off to this
// dialog. It is the restore target; no second workflow fallback is needed.
const FOCUS = Object.freeze({ triggerId: "chart-workspace", workflowTargetId: null, workspaceId: "workspace" });
type NoteRow = Readonly<{ step: Step; alter: string; octave: string }>;
const number = (text: string): number => text.trim() === "" ? Number.NaN : Number(text);
const label = (note: Readonly<{ step: string; alter: number; octave?: number }>): string =>
  `${note.step}${note.alter < 0 ? "b".repeat(-note.alter) : "#".repeat(note.alter)}${note.octave === undefined ? "" : String(note.octave)}`;
const rowsFor = (pitches: readonly SpelledPitch[]): NoteRow[] => pitches.map(pitch => ({
  step: pitch.step, alter: String(pitch.alter), octave: String(pitch.octave),
}));
const pitchesFor = (rows: readonly NoteRow[]): SpelledPitchInput[] => rows.map(row => ({
  step: row.step, alter: number(row.alter), octave: number(row.octave),
}));
const durationText = (view: StudioInspectorView): string =>
  `${String(view.event.duration.numerator)}/${String(view.event.duration.denominator)}`;

export function ChordInspector({ eventId, ports, onClose, onContractRefusal }: Readonly<{
  eventId: string; ports: StudioInspectorPorts; onClose: () => void; onContractRefusal: (diagnostic: UiDiagnostic) => void;
}>) {
  const [loaded, setLoaded] = useState(() => ports.read(eventId));
  const base = loaded.ok ? loaded.value : null;
  const [tab, setTab] = useState<Tab>("Voicing");
  const [advanced, setAdvanced] = useState(false);
  const [symbol, setSymbol] = useState(base?.event.chord.sourceText ?? "");
  const [annotation, setAnnotation] = useState(base?.event.annotation ?? "");
  const [duration, setDuration] = useState(base === null ? "" : durationText(base));
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<NoteRow[]>(() => rowsFor(base?.detail.voicing.activePitches ?? []));
  const [manualEditing, setManualEditing] = useState(false);
  const [bass, setBass] = useState<StoredBassPolicy>(base?.event.voicing.mode !== "auto" ? base?.event.voicing.bassPolicy ?? "included" : "included");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [confirmChange, setConfirmChange] = useState<StudioInspectorChange | null>(null);
  const [leavePrompt, setLeavePrompt] = useState(false);
  const [keyboardStart, setKeyboardStart] = useState(48);
  const [pianoFocus, setPianoFocus] = useState(48);
  const initialPolicy: AutoVoicingInput = base?.event.voicing.mode === "auto" ? base.event.voicing :
    { mode: "auto", family: "balanced", voiceCount: 4, bassPolicy: "generated", range: { lowMidi: 48, highMidi: 84 } };
  const [family, setFamily] = useState(initialPolicy.family);
  const [voiceCount, setVoiceCount] = useState(String(initialPolicy.voiceCount));
  const [autoBass, setAutoBass] = useState(initialPolicy.bassPolicy);
  const [low, setLow] = useState(String(initialPolicy.range.lowMidi));
  const [high, setHigh] = useState(String(initialPolicy.range.highMidi));
  const currentPorts = useRef(ports), currentSource = useRef(base?.source ?? null);
  currentPorts.current = ports;
  currentSource.current = base?.source ?? null;
  const pendingLeave = useRef<(() => void) | null>(null);
  const previewRequest = useRef(0);
  useEffect(() => () => {
    previewRequest.current++;
    const source = currentSource.current;
    if (source !== null) void currentPorts.current.release(source);
  }, []);
  const stale = base !== null && (ports.revision !== base.source.revision || ports.selectedEventId !== eventId);
  const dirty = base !== null && (symbol !== base.event.chord.sourceText || annotation !== base.event.annotation ||
    duration !== durationText(base) || manualEditing);
  const draft = useMemo(() => base === null || stale ? null : ports.readDraft(base.source, symbol), [base, stale, symbol, ports.readDraft]);
  const detail = draft?.ok ? draft.value.detail : base?.detail;
  const structured = draft?.ok ? draft.value.chord : null;
  let whiteKeys = 0;
  const pianoKeys = (base?.detail.piano.keys ?? []).filter(key => key.midi >= keyboardStart && key.midi <= Math.min(127, keyboardStart + 24)).map(key => {
    const left = key.isBlack ? whiteKeys * 64 - 22 : whiteKeys++ * 64;
    return { key, left };
  });
  const show = (text: string, error = false): void => { setFeedback(text); setFailed(error); };
  const cancelPreview = (): void => {
    previewRequest.current++; setHearing(false);
    if (base !== null) void ports.release(base.source).then(result => { if (!result.ok) show(result.message, true); });
  };
  const reset = (view: StudioInspectorView): void => {
    setSymbol(view.event.chord.sourceText); setAnnotation(view.event.annotation); setDuration(durationText(view));
    setRows(rowsFor(view.detail.voicing.activePitches)); setManualEditing(false); setReason(""); setConfirmChange(null);
    setBass(view.event.voicing.mode === "auto" ? "included" : view.event.voicing.bassPolicy);
  };
  const refresh = (): void => {
    const next = ports.read(eventId);
    setLoaded(next);
    if (next.ok) reset(next.value);
  };
  const leave = (next: () => void): void => {
    cancelPreview();
    if (dirty) { pendingLeave.current = next; setLeavePrompt(true); }
    else next();
  };
  const apply = (change: StudioInspectorChange): boolean => {
    if (base === null) return false;
    cancelPreview();
    const result = ports.apply(base.source, change);
    if (!result.ok) {
      if (result.refusal.code === "u2.mode_switch_requires_confirmation") setConfirmChange(change);
      else show(result.refusal.message, true);
      return false;
    }
    refresh(); show("Applied. Undo restores the previous chord."); return true;
  };
  const activeChange = (): StudioInspectorChange | null => {
    if (tab === "Symbol" || tab === "Structure") return { kind: "symbol", text: symbol, confirmed: false };
    if (tab === "Notes") return { kind: "annotation", text: annotation };
    if (tab === "Timing") return { kind: "duration", text: duration, reason };
    if (tab === "Voicing" && manualEditing) return { kind: "manual", pitches: pitchesFor(rows), bassPolicy: bass };
    return null;
  };
  const hear = (preview: StudioInspectorPreview): void => {
    if (base === null) return;
    const request = ++previewRequest.current;
    setHearing(true); show("Preparing exact notes…");
    void ports.hear(base.source, preview).then(result => {
      if (request !== previewRequest.current) return;
      setHearing(false);
      show(result.ok ? "Preview started. The chart and playhead are unchanged." : result.message, !result.ok);
    });
  };
  const editStructure = (patch: StudioInspectorStructurePatch): void => {
    if (base === null) return;
    const next = ports.readDraft(base.source, symbol, patch);
    if (next.ok) setSymbol(next.value.text); else show(next.message, true);
  };
  const editRows = (next: NoteRow[]): void => { cancelPreview(); setRows(next); setManualEditing(true); };
  const choose = (choice: StudioInspectorChoice, kind: "auto" | "freeze"): void => {
    if (dirty) { show("Apply or discard the current draft before choosing another voicing.", true); return; }
    apply(kind === "auto" ? { kind, policy: choice.policy, confirmed: false } : { kind, choice, confirmed: false });
  };
  const actionButton = (text: string, action: () => void, disabled = false) =>
    <button class="studio-inspector-button" type="button" disabled={disabled} onClick={action}>{text}</button>;

  return <Dialog id="studio-chord-inspector" backgroundRootId="studio-shell-background" title="Edit chord"
    description="Choose and hear a voicing, or edit the chord's exact stored data." closeLabel="Close chord inspector"
    open busy={false} disabled={false} invalid={false} density="comfortable" describedBy={[]}
    dismissibility={DISMISSIBLE} focusTargets={FOCUS} initialFocus="heading" initialFocusId={null}
    onDismiss={() => { leave(onClose); }} onContractRefusal={onContractRefusal}
    content={<div class="studio-inspector" data-testid="chord-inspector">
      {base === null ? <p role="alert">{loaded.ok ? "No chord selected." : loaded.message}</p> : <>
        <header class="studio-inspector-summary"><strong>{base.event.chord.sourceText}</strong>
          <span>{base.event.voicing.mode} · Bar {base.detail.timing.measureOrdinal} · {base.detail.timing.durationLabel}</span>
          <p>{base.detail.voicing.activePitches.map(label).join(" · ") || "No playable voicing for these settings."}</p>
        </header>
        <div class="studio-inspector-actions">
          {actionButton("Hear current chord", () => { hear({ kind: "current" }); }, stale || dirty || base.detail.voicing.activePitches.length === 0)}
          {actionButton("Release preview", cancelPreview)}
          {actionButton("Stop all audio", () => { cancelPreview(); ports.stop(); show("Stop requested."); })}
        </div>
        {stale ? <div role="alert">The chart or selection changed. Your draft is preserved; Apply is disabled.
          {actionButton("Reload this chord", () => { leave(refresh); })}</div> : null}
        {!advanced || tab === "Voicing" ? <section aria-label="Voicing choices">
          <h3>Choose a voicing</h3>
          <p>Auto follows these settings as the chart changes. Keep stores these exact notes.</p>
          <ul class="studio-inspector-choices">{base.choices.map(candidate => <li key={candidate.id}>
            <strong>{candidate.label}{candidate.current ? " · Current" : ""}</strong>
            <p>{candidate.pitches.map(label).join(" · ")}</p>
            <div class="studio-inspector-actions">
              {actionButton(`Hear ${candidate.policy.family}`, () => { hear({ kind: "choice", choice: candidate }); }, stale || dirty)}
              {actionButton(`Use ${candidate.policy.family} Auto`, () => { choose(candidate, "auto"); }, stale || dirty || candidate.current)}
              {actionButton(`Keep ${candidate.policy.family} notes`, () => { choose(candidate, "freeze"); }, stale || dirty)}
            </div>
          </li>)}</ul>
          {base.unavailableChoices.map((item, index) => <p class="studio-inspector-unavailable" key={index}>{item.family}: {item.message}</p>)}
          {actionButton("Edit exact notes", () => { setAdvanced(true); setTab("Voicing"); setManualEditing(true); }, stale || base.detail.voicing.activePitches.length === 0 || dirty)}
        </section> : null}
        <button type="button" class="studio-inspector-button" aria-expanded={advanced} onClick={() => { leave(() => { setAdvanced(!advanced); }); }}>
          {advanced ? "Hide advanced controls" : "Advanced chord controls"}
        </button>
        {advanced ? <>
          <div class="studio-inspector-tabs" role="tablist" aria-label="Chord details">{TABS.map((name, index) =>
            <button type="button" role="tab" id={`inspector-tab-${name}`} aria-controls="inspector-panel" aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1} key={name} onClick={() => { if (tab !== name) leave(() => { setTab(name); }); }}
              onKeyDown={event => {
                const next = event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length] : event.key === "ArrowLeft" ? TABS[(index + TABS.length - 1) % TABS.length]
                  : event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : undefined;
                if (next !== undefined) { event.preventDefault(); leave(() => { setTab(next); document.getElementById(`inspector-tab-${next}`)?.focus(); }); }
              }}>{name}</button>)}</div>
          <section role="tabpanel" tabIndex={0} id="inspector-panel" aria-labelledby={`inspector-tab-${tab}`}>
            {tab === "Symbol" || tab === "Structure" ? <>
              <label>Chord symbol<input value={symbol} onInput={event => { cancelPreview(); setSymbol(event.currentTarget.value); }} aria-invalid={detail?.symbol.isValidSyntax === false} /></label>
              <p>Canonical: {detail?.symbol.canonicalText ?? "Unavailable"}</p>
              {detail?.symbol.diagnostics.map((diagnostic, index) => <p role="alert" key={index}>{diagnostic.message} (position {diagnostic.offset + 1})</p>)}
              {tab === "Structure" && structured !== null ? <>
                <div class="studio-inspector-fields">
                  <label>Root letter<select value={structured.root.step} onChange={event => { const step = STEPS.find(value => value === event.currentTarget.value); if (step) editStructure({ root: { ...structured.root, step } }); }}>{STEPS.map(step => <option key={step}>{step}</option>)}</select></label>
                  <label>Root accidental<select value={structured.root.alter} onChange={event => { const alter = ([-2, -1, 0, 1, 2] as const).find(value => value === number(event.currentTarget.value)); if (alter !== undefined) editStructure({ root: { ...structured.root, alter } }); }}>{[-2, -1, 0, 1, 2].map(alter => <option value={alter} key={alter}>{["bb", "b", "natural", "#", "##"][alter + 2]}</option>)}</select></label>
                  <label>Triad<select value={structured.triad} onChange={event => { const triad = TRIAD_QUALITIES.find(value => value === event.currentTarget.value); if (triad) editStructure({ triad }); }}>{TRIAD_QUALITIES.map(value => <option key={value}>{value}</option>)}</select></label>
                  <label>Seventh<select value={structured.seventh ?? "none"} onChange={event => { editStructure({ seventh: SEVENTH_QUALITIES.find(value => value === event.currentTarget.value) ?? null }); }}><option value="none">none</option>{SEVENTH_QUALITIES.map(value => <option key={value}>{value}</option>)}</select></label>
                </div>
                <p>{detail?.structure.qualityName}; bass {detail?.structure.bassSpelling ? label(detail.structure.bassSpelling) : "unspecified"}</p>
                <ul>{detail?.structure.degrees.map((degree, index) => <li key={index}>{degree.degree}: {label(degree.spelling)} · {degree.role}</li>)}</ul>
                <p>Alterations: {detail?.structure.alterations.join(", ") || "none"}. Additions: {detail?.structure.additions.join(", ") || "none"}. Omissions: {detail?.structure.omissions.join(", ") || "none"}.</p>
              </> : null}
            </> : null}
            {tab === "Timing" ? <>
              <p>Bar {base.detail.timing.measureOrdinal}; offset {base.detail.timing.beatInMeasure.numerator}/{base.detail.timing.beatInMeasure.denominator} beats.</p>
              <label>Exact duration in quarter-note beats<input value={duration} inputMode="text" onInput={event => { setDuration(event.currentTarget.value); }} /></label>
              <label>Reason if the bar becomes incomplete<input value={reason} onInput={event => { setReason(event.currentTarget.value); }} /></label>
              <p>Other chord durations stay exact. An overfilled bar is refused.</p>
            </> : null}
            {tab === "Voicing" ? <>
              <details><summary>Advanced Auto settings</summary><div class="studio-inspector-fields">
                <label>Family<select value={family} onChange={event => { const value = AUTO_VOICING_FAMILIES.find(item => item === event.currentTarget.value); if (value) setFamily(value); }}>{AUTO_VOICING_FAMILIES.map(value => <option key={value}>{value}</option>)}</select></label>
                <label>Note count<input type="number" min={3} max={7} value={voiceCount} onInput={event => { setVoiceCount(event.currentTarget.value); }} /></label>
                <label>Bass policy<select value={autoBass} onChange={event => { const value = AUTO_BASS_POLICIES.find(item => item === event.currentTarget.value); if (value) setAutoBass(value); }}>{AUTO_BASS_POLICIES.map(value => <option key={value}>{value}</option>)}</select></label>
                <label>Lowest MIDI<input type="number" min={0} max={127} value={low} onInput={event => { setLow(event.currentTarget.value); }} /></label>
                <label>Highest MIDI<input type="number" min={0} max={127} value={high} onInput={event => { setHigh(event.currentTarget.value); }} /></label>
              </div>{actionButton("Find this Auto voicing", () => {
                const proposal = ports.read(eventId, { mode: "auto", family, voiceCount: number(voiceCount), bassPolicy: autoBass, range: { lowMidi: number(low), highMidi: number(high) } });
                if (proposal.ok) setLoaded(proposal); else show(proposal.message, true);
              }, stale || dirty)}</details>
              <h3>Exact notes, in stored order</h3><p>Unisons remain separate occurrences. Removing a row removes only that occurrence.</p>
              <ol class="studio-inspector-notes">{rows.map((row, index) => <li key={index}>
                <label>Note {index + 1} letter<select value={row.step} onChange={event => { const step = STEPS.find(value => value === event.currentTarget.value); if (step) editRows(rows.map((current, i) => i === index ? { ...current, step } : current)); }}>{STEPS.map(step => <option key={step}>{step}</option>)}</select></label>
                <label>Accidental<select value={row.alter} onChange={event => { editRows(rows.map((current, i) => i === index ? { ...current, alter: event.currentTarget.value } : current)); }}>{[-2, -1, 0, 1, 2].map(value => <option key={value} value={value}>{["bb", "b", "natural", "#", "##"][value + 2]}</option>)}</select></label>
                <label>Octave<input type="number" value={row.octave} onInput={event => { const octave = event.currentTarget.value; editRows(rows.map((current, i) => i === index ? { ...current, octave } : current)); }} /></label>
                {actionButton(`Remove note ${String(index + 1)}`, () => { editRows(rows.filter((_, i) => i !== index)); })}
              </li>)}</ol>
              {actionButton("Add note", () => { editRows([...rows, { step: "C", alter: "0", octave: "4" }]); }, rows.length >= 16 || stale)}
              <label>Stored bass policy<select value={bass} onChange={event => { setBass(event.currentTarget.value === "external" ? "external" : "included"); setManualEditing(true); }}><option value="included">included</option><option value="external">external</option></select></label>
              {actionButton("Hear exact draft notes", () => { hear({ kind: "manual", pitches: pitchesFor(rows), bassPolicy: bass }); }, stale || rows.length === 0)}
              <p>The list reaches MIDI 0–127. Notes outside the chord formula or MIDI range are refused, with the draft retained.</p>
              <label>Piano register<select value={keyboardStart} onChange={event => { const start = number(event.currentTarget.value); setKeyboardStart(start); setPianoFocus(start); }}>{Array.from({ length: 11 }, (_, octave) => <option key={octave} value={octave * 12}>MIDI {octave * 12}–{Math.min(127, octave * 12 + 24)}</option>)}</select></label>
              <p>Arrow keys move across the piano. Enter adds one occurrence. The note list above also supports direct editing.</p>
              <div class="studio-inspector-piano-scroll"><div class="studio-inspector-piano" role="group" aria-label="Add an exact note from the piano" style={{ width: `${String(whiteKeys * 64)}px` }}>
                {pianoKeys.map(({ key }, index) =>
                  <button key={key.midi} id={`inspector-piano-${String(key.midi)}`} type="button" class={key.isBlack ? "is-black" : "is-white"} style={{ left: `${String(pianoKeys[index]?.left ?? 0)}px` }}
                    tabIndex={key.midi === pianoFocus ? 0 : -1} aria-label={`Add ${key.accessibleLabel}, MIDI ${String(key.midi)}`}
                    onKeyDown={event => {
                      const nextIndex = event.key === "ArrowRight" ? Math.min(pianoKeys.length - 1, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1)
                        : event.key === "Home" ? 0 : event.key === "End" ? pianoKeys.length - 1 : null;
                      const next = nextIndex === null ? undefined : pianoKeys[nextIndex]?.key;
                      if (next !== undefined) { event.preventDefault(); setPianoFocus(next.midi); document.getElementById(`inspector-piano-${String(next.midi)}`)?.focus(); }
                    }} disabled={rows.length >= 16 || stale} onClick={() => { if (key.spelling !== null) editRows([...rows, { step: key.spelling.step, alter: String(key.spelling.alter), octave: String(key.octave) }]); }}>{key.spelling === null ? key.midi : label({ ...key.spelling, octave: key.octave })}</button>)}
              </div></div>
            </> : null}
            {tab === "Harmony" ? <>
              <p>{base.detail.harmony.qualityCategory}</p><p>Guide tones: {base.detail.harmony.guideTones.map(label).join(", ") || "none"}.</p>
              <p>{base.detail.harmony.romanNumeral ?? "No tonal reading for this context."} {base.detail.harmony.tonalFunction}</p>
              {base.detail.harmony.scaleSuggestions.map((suggestion, index) => <p key={index}>{suggestion}</p>)}
            </> : null}
            {tab === "Motion" ? <>
              <p>Next chord: {base.detail.motion.nextChordSymbol ?? "none"}.</p>
              {base.detail.motion.unavailableReason === null ? null : <p>{base.detail.motion.unavailableReason}</p>}
              <ul>{base.detail.motion.voicePaths.map((path, index) => <li key={index}>{path.fromPitch === null ? "Enter" : label(path.fromPitch)} → {path.toPitch === null ? "Leave" : label(path.toPitch)}{path.intervalSemis === null ? "" : ` · ${String(path.intervalSemis)} semitones`}</li>)}</ul>
            </> : null}
            {tab === "Notes" ? <><label>Chord annotation<textarea rows={5} value={annotation} onInput={event => { setAnnotation(event.currentTarget.value); }} aria-invalid={Array.from(annotation).length > 2000} /></label>
              <p>{Array.from(annotation).length}/2000 characters. Markup is stored as literal text.</p></> : null}
            {activeChange() !== null ? <div class="studio-inspector-actions">
              {actionButton("Apply draft", () => { const change = activeChange(); if (change !== null) apply(change); }, stale || !dirty)}
              {actionButton("Discard draft", () => { cancelPreview(); reset(base); show("Draft discarded. The chart is unchanged."); }, !dirty)}
            </div> : null}
          </section>
        </> : null}
        {confirmChange !== null ? <section aria-label="Confirm stored note replacement">
          <p role="alert">{confirmChange.kind === "symbol" ? "Keep the exact stored pitches under the new symbol? Incompatible notes will be refused." : "Replace the exact stored notes with this generated voicing? Undo restores the original notes."}</p>
          {actionButton("Confirm change", () => { if ("confirmed" in confirmChange && apply({ ...confirmChange, confirmed: true }) && leavePrompt) { setLeavePrompt(false); pendingLeave.current?.(); pendingLeave.current = null; } })}
          {actionButton("Cancel change", () => { setConfirmChange(null); })}
        </section> : null}
        {leavePrompt ? <section aria-label="Unsaved inspector draft"><p role="alert">Apply or discard your draft before leaving it.</p>
          {actionButton("Apply and continue", () => { const change = activeChange(); if (change !== null && apply(change)) { setLeavePrompt(false); pendingLeave.current?.(); pendingLeave.current = null; } }, stale || activeChange() === null)}
          {actionButton("Discard and continue", () => { reset(base); setLeavePrompt(false); pendingLeave.current?.(); pendingLeave.current = null; })}
          {actionButton("Continue editing", () => { setLeavePrompt(false); pendingLeave.current = null; })}
        </section> : null}
      </>}
      {feedback === null ? null : <p role={failed ? "alert" : "status"} aria-busy={hearing}>{feedback}</p>}
    </div>} />;
}

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  StudioController, StudioInspectorChange, StudioInspectorChoice, StudioInspectorPreview,
  StudioInspectorResult, StudioInspectorSource, StudioInspectorStructurePatch, StudioInspectorView,
} from "../../application/runtime";
import { AUTO_VOICING_FAMILIES, AUTO_BASS_POLICIES,
  type AutoVoicingInput, type SpelledPitch, type SpelledPitchInput, type Step, type StoredBassPolicy } from "../../domain";
import { InspectorStructureFields } from "./InspectorStructureFields";
import { Dialog } from "../overlays";
import type { UiDiagnostic } from "../ui-contract";

export type StudioInspectorPorts = Readonly<{
  selectedEventId: string | null;
  revision: number;
  read: StudioController["readInspector"];
  readDraft: StudioController["readInspectorDraft"];
  readManualDraft: StudioController["readInspectorManualDraft"];
  apply: StudioController["applyInspectorChange"];
  hear: (source: StudioInspectorSource, preview: StudioInspectorPreview, input: "pointer" | "keyboard") => Promise<StudioInspectorResult<void>>;
  release: StudioController["releaseInspectorPreview"];
  stop: () => void;
}>;

const TABS = ["Symbol", "Structure", "Timing", "Voicing", "Harmony", "Motion", "Notes"] as const;
type Tab = typeof TABS[number];
const STEPS: readonly Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const PIANO_ROLES = { root: "Root", "guide-third": "3rd", "guide-seventh": "7th", tension: "T", bass: "Bass", color: "Tone", omitted: "omit" } as const;
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
  const [keyboardStart, setKeyboardStart] = useState(36);
  const [pianoFocus, setPianoFocus] = useState(36);
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
  const heldInput = useRef<"pointer" | "keyboard" | null>(null);
  const [holding, setHolding] = useState(false);
  useEffect(() => () => {
    previewRequest.current++;
    const source = currentSource.current;
    if (source !== null) void currentPorts.current.release(source);
  }, []);
  const stale = base !== null && (ports.revision !== base.source.revision || ports.selectedEventId !== eventId);
  const dirty = base !== null && (symbol !== base.event.chord.sourceText || annotation !== base.event.annotation ||
    duration !== durationText(base) || manualEditing);
  const draft = useMemo(() => {
    if (base === null || stale) return null;
    if (symbol === base.event.chord.sourceText) return { ok: true as const, value: {
      text: symbol, chord: base.event.chord.kind === "parsed" ? base.event.chord : null, detail: base.detail,
    } };
    return ports.readDraft(base.source, symbol);
  }, [base, stale, symbol, ports.readDraft]);
  const manualDraft = useMemo(() => base === null || stale || !manualEditing ? null
    : ports.readManualDraft(base.source, pitchesFor(rows), bass), [base, stale, manualEditing, rows, bass, ports.readManualDraft]);
  // A refused symbol draft has no canonical text or playable notes. Only an
  // absent draft read (for example, a stale editor) may show the saved view.
  const detail = manualDraft?.ok ? manualDraft.value : draft?.ok ? draft.value.detail
    : draft === null ? base?.detail : undefined;
  const hasCurrentPiano = manualDraft === null || manualDraft.ok;
  const structured = draft?.ok ? draft.value.chord : null;
  let whiteKeys = 0;
  const pianoKeys = (detail?.piano.keys ?? []).filter(key => key.midi >= keyboardStart && key.midi <= Math.min(127, keyboardStart + 48)).map(key => {
    const left = key.isBlack ? whiteKeys * 64 - 22 : whiteKeys++ * 64;
    return { key, left };
  });
  const show = (text: string, error = false): void => { setFeedback(text); setFailed(error); };
  const cancelPreview = (): void => {
    heldInput.current = null; setHolding(false);
    previewRequest.current++; setHearing(false);
    if (base !== null) void ports.release(base.source).then(result => { if (!result.ok) show(result.message, true); });
  };
  const cancelCurrentPreview = useRef(cancelPreview);
  cancelCurrentPreview.current = cancelPreview;
  useEffect(() => {
    const blur = (): void => { cancelCurrentPreview.current(); };
    const visibility = (): void => { if (document.hidden) blur(); };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const reset = (view: StudioInspectorView): void => {
    setSymbol(view.event.chord.sourceText); setAnnotation(view.event.annotation); setDuration(durationText(view));
    setRows(rowsFor(view.detail.voicing.activePitches)); setManualEditing(false); setReason(""); setConfirmChange(null);
    setBass(view.event.voicing.mode === "auto" ? "included" : view.event.voicing.bassPolicy);
    if (view.event.voicing.mode === "auto") {
      const policy = view.event.voicing;
      setFamily(policy.family); setVoiceCount(String(policy.voiceCount)); setAutoBass(policy.bassPolicy);
      setLow(String(policy.range.lowMidi)); setHigh(String(policy.range.highMidi));
    }
  };
  const refresh = (): void => {
    const next = ports.read(eventId);
    setLoaded(next);
    if (next.ok) reset(next.value);
  };
  const leave = (next: () => void): boolean => {
    cancelPreview();
    if (dirty) { pendingLeave.current = next; setLeavePrompt(true); return false; }
    next(); return true;
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
  const hear = (preview: StudioInspectorPreview, input: "pointer" | "keyboard"): void => {
    if (base === null) return;
    const request = ++previewRequest.current;
    setHearing(true); show("Preparing exact notes…");
    void ports.hear(base.source, preview, input).then(result => {
      if (request !== previewRequest.current) return;
      setHearing(false);
      show(result.ok ? "Preview started. The chart and playhead are unchanged." : result.message, !result.ok);
    });
  };
  const editStructure = (patch: StudioInspectorStructurePatch): void => {
    if (base === null) return;
    cancelPreview();
    const next = ports.readDraft(base.source, symbol, patch, false);
    if (next.ok) setSymbol(next.value.text); else show(next.message, true);
  };
  const switchTab = (next: Tab): void => {
    // Both controls edit one symbol draft, so crossing this seam never discards it.
    if ((tab === "Symbol" || tab === "Structure") && (next === "Symbol" || next === "Structure")) {
      cancelPreview(); setTab(next);
    } else leave(() => { setTab(next); });
  };
  const editRows = (next: NoteRow[]): void => { cancelPreview(); setRows(next); setManualEditing(true); };
  const choose = (choice: StudioInspectorChoice, kind: "auto" | "freeze"): void => {
    if (dirty) { show("Apply or discard the current draft before choosing another voicing.", true); return; }
    apply(kind === "auto" ? { kind, policy: choice.policy, confirmed: false } : { kind, choice, confirmed: false });
  };
  const actionButton = (text: string, action: () => void, disabled = false) =>
    <button class="studio-inspector-button" type="button" disabled={disabled} onClick={action}>{text}</button>;
  const hearButton = (text: string, preview: StudioInspectorPreview, disabled: boolean) =>
    <button class="studio-inspector-button" type="button" disabled={disabled}
      onClick={event => { hear(preview, event.detail === 0 ? "keyboard" : "pointer"); }}>{text}</button>;
  const heldPreview: StudioInspectorPreview = manualEditing ? { kind: "manual", pitches: pitchesFor(rows), bassPolicy: bass, hold: true }
    : symbol !== base?.event.chord.sourceText ? { kind: "symbol", text: symbol, hold: true } : { kind: "current", hold: true };
  const startHold = (input: "pointer" | "keyboard"): void => {
    if (heldInput.current !== null) return;
    heldInput.current = input; setHolding(true); hear(heldPreview, input);
  };
  const canHearDraft = detail?.symbol.isValidSyntax === true &&
    (detail.preview.kind !== "unavailable" || detail.preview.failureCode === "u2.draft_not_realized");

  return <Dialog id="studio-chord-inspector" backgroundRootId="studio-shell-background" title="Edit chord"
    description="Choose and hear a voicing, or edit the chord's exact stored data." closeLabel="Close chord inspector"
    open busy={false} disabled={false} invalid={false} density="comfortable" describedBy={[]}
    dismissibility={DISMISSIBLE} focusTargets={FOCUS} initialFocus="heading" initialFocusId={null}
    onDismiss={() => leave(onClose) ? undefined : false} onContractRefusal={onContractRefusal}
    content={<div class="studio-inspector" data-testid="chord-inspector">
      {base === null ? <p role="alert">{loaded.ok ? "No chord selected." : loaded.message}</p> : <>
        <div class="studio-inspector-summary"><strong>{base.event.chord.sourceText}</strong>
          <span>{base.event.voicing.mode} · Bar {base.detail.timing.measureOrdinal} · {base.detail.timing.durationLabel}</span>
          <p>{base.detail.voicing.activePitches.map(label).join(" · ") || "No playable voicing for these settings."}</p>
        </div>
        <div class="studio-inspector-actions">
          {hearButton("Hear current chord", { kind: "current" }, stale || dirty || base.detail.voicing.activePitches.length === 0)}
          <button type="button" class="studio-inspector-button" aria-pressed={holding}
            disabled={stale || draft?.ok === false || (!canHearDraft && detail?.preview.kind === "unavailable") || (manualDraft !== null && !manualDraft.ok)}
            onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); startHold("pointer"); }}
            onPointerUp={() => { if (heldInput.current === "pointer") cancelPreview(); }}
            onPointerCancel={cancelPreview} onLostPointerCapture={() => { if (heldInput.current === "pointer") cancelPreview(); }}
            onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (!event.repeat) startHold("keyboard"); } }}
            onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (heldInput.current === "keyboard") cancelPreview(); } }}
            onBlur={() => { if (heldInput.current !== null) cancelPreview(); }}>Hold to hear</button>
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
              {hearButton(`Hear ${candidate.policy.family}`, { kind: "choice", choice: candidate }, stale || dirty)}
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
              tabIndex={tab === name ? 0 : -1} key={name} onClick={() => { if (tab !== name) switchTab(name); }}
              onKeyDown={event => {
                const next = event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length] : event.key === "ArrowLeft" ? TABS[(index + TABS.length - 1) % TABS.length]
                  : event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : undefined;
                if (next !== undefined) { event.preventDefault(); switchTab(next); document.getElementById(`inspector-tab-${next}`)?.focus(); }
              }}>{name}</button>)}</div>
          <section role="tabpanel" tabIndex={0} id="inspector-panel" aria-labelledby={`inspector-tab-${tab}`}>
            {tab === "Symbol" || tab === "Structure" ? <>
              <label>Chord symbol<input value={symbol} onInput={event => { cancelPreview(); setSymbol(event.currentTarget.value); }} aria-invalid={draft?.ok === false || detail?.symbol.isValidSyntax === false} /></label>
              <p>Canonical: {detail?.symbol.canonicalText ?? "Unavailable"}</p>
              <p>Draft notes: {detail?.voicing.activePitches.map(label).join(" · ") || "Unavailable"}</p>
              {draft?.ok === false ? <p role="alert">{draft.message}</p> : null}
              {detail?.voicing.realizationFailure ? <p role={detail.voicing.realizationFailure.code === "u2.draft_not_realized" ? undefined : "alert"}>{detail.voicing.realizationFailure.message}</p> : null}
              {hearButton("Hear symbol draft", { kind: "symbol", text: symbol }, stale || !canHearDraft)}
              {detail?.symbol.diagnostics.map((diagnostic, index) => <p role="alert" key={index}>{diagnostic.message} (position {diagnostic.offset + 1})</p>)}
              {tab === "Structure" && structured !== null ? <>
                <InspectorStructureFields chord={structured} onChange={editStructure} />
                <p>{detail?.structure.qualityName}; bass {detail?.structure.bassSpelling ? label(detail.structure.bassSpelling) : "unspecified"}</p>
                <ul>{detail?.structure.degrees.map((degree, index) => <li key={index}>{degree.degree}: {label(degree.spelling)} · pitch class {degree.pitchClass} · {degree.role}</li>)}</ul>
                <p>Alterations: {detail?.structure.alterations.join(", ") || "none"}. Additions: {detail?.structure.additions.join(", ") || "none"}. Omissions: {detail?.structure.omissions.join(", ") || "none"}.</p>
              </> : null}
            </> : null}
            {tab === "Timing" ? <>
              <p>Bar {base.detail.timing.measureOrdinal}; offset {base.detail.timing.beatInMeasure.numerator}/{base.detail.timing.beatInMeasure.denominator} beats.</p>
              <p>Bar starts at {base.detail.timing.measureStartBeat.numerator}/{base.detail.timing.measureStartBeat.denominator} beats. {base.detail.timing.isMeasureComplete ? "This bar is complete." : "This bar is incomplete."}</p>
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
              <p>Exact MIDI order: {hasCurrentPiano ? detail?.voicing.midiNoteNumbers.join(" · ") || "unavailable" : "correct the note draft to see its MIDI coordinates"}.</p>
              <ol class="studio-inspector-notes">{rows.map((row, index) => <li key={index}>
                <label>Note {index + 1} letter<select value={row.step} onChange={event => { const step = STEPS.find(value => value === event.currentTarget.value); if (step) editRows(rows.map((current, i) => i === index ? { ...current, step } : current)); }}>{STEPS.map(step => <option key={step}>{step}</option>)}</select></label>
                <label>Accidental<select value={row.alter} onChange={event => { editRows(rows.map((current, i) => i === index ? { ...current, alter: event.currentTarget.value } : current)); }}>{[-2, -1, 0, 1, 2].map(value => <option key={value} value={value}>{["bb", "b", "natural", "#", "##"][value + 2]}</option>)}</select></label>
                <label>Octave<input type="number" value={row.octave} onInput={event => { const octave = event.currentTarget.value; editRows(rows.map((current, i) => i === index ? { ...current, octave } : current)); }} /></label>
                {actionButton(`Remove note ${String(index + 1)}`, () => { editRows(rows.filter((_, i) => i !== index)); })}
              </li>)}</ol>
              {actionButton("Add note", () => { editRows([...rows, { step: "C", alter: "0", octave: "4" }]); }, rows.length >= 16 || stale)}
              <label>Stored bass policy<select value={bass} onChange={event => { setBass(event.currentTarget.value === "external" ? "external" : "included"); setManualEditing(true); }}><option value="included">included</option><option value="external">external</option></select></label>
              {hearButton("Hear exact draft notes", { kind: "manual", pitches: pitchesFor(rows), bassPolicy: bass }, stale || rows.length === 0)}
              {manualDraft !== null && !manualDraft.ok ? <p role="alert">{manualDraft.message}</p> : null}
              <p>The list reaches MIDI 0–127. Notes outside the chord formula or MIDI range are refused, with the draft retained.</p>
              <label>Piano register<select value={keyboardStart} onChange={event => { const start = number(event.currentTarget.value); setKeyboardStart(start); setPianoFocus(start); }}>{Array.from({ length: 11 }, (_, octave) => <option key={octave} value={octave * 12}>MIDI {octave * 12}–{Math.min(127, octave * 12 + 48)}</option>)}</select></label>
              <p>Arrow keys move across the piano. Enter adds one occurrence. The note list above also supports direct editing.</p>
              <p>Key badges: Root, 3rd and 7th guide tones, T for tensions, Bass, and other chord tones. The bottom stripe marks a voiced note.</p>
              <div class="studio-inspector-piano-scroll"><div class="studio-inspector-piano" role="group" aria-label="Add an exact note from the piano" style={{ width: `${String(whiteKeys * 64)}px` }}>
                {pianoKeys.map(({ key }, index) =>
                  <button key={key.midi} id={`inspector-piano-${String(key.midi)}`} type="button" class={key.isBlack ? "is-black" : "is-white"} style={{ left: `${String(pianoKeys[index]?.left ?? 0)}px` }}
                    data-active={key.isActiveVoiced && hasCurrentPiano ? "true" : "false"} data-role={hasCurrentPiano ? key.role ?? "none" : "none"}
                    tabIndex={key.midi === pianoFocus ? 0 : -1} aria-label={`Add ${hasCurrentPiano ? key.accessibleLabel : key.spelling === null ? String(key.midi) : label({ ...key.spelling, octave: key.octave })}, MIDI ${String(key.midi)}`}
                    onKeyDown={event => {
                      const nextIndex = event.key === "ArrowRight" ? Math.min(pianoKeys.length - 1, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1)
                        : event.key === "Home" ? 0 : event.key === "End" ? pianoKeys.length - 1 : null;
                      const next = nextIndex === null ? undefined : pianoKeys[nextIndex]?.key;
                      if (next !== undefined) { event.preventDefault(); setPianoFocus(next.midi); document.getElementById(`inspector-piano-${String(next.midi)}`)?.focus(); }
                    }} disabled={rows.length >= 16 || stale} onClick={() => { if (key.spelling !== null) editRows([...rows, { step: key.spelling.step, alter: String(key.spelling.alter), octave: String(key.octave) }]); }}>
                    <span>{key.spelling === null ? key.midi : label({ ...key.spelling, octave: key.octave })}</span>
                    {!hasCurrentPiano || key.role === null ? null : <span class="studio-inspector-piano-role" aria-hidden="true">{PIANO_ROLES[key.role]}</span>}
                  </button>)}
              </div></div>
            </> : null}
            {tab === "Harmony" ? <>
              <p>{detail?.harmony.qualityCategory}</p><p>Guide tones: {detail?.harmony.guideTones.map(label).join(", ") || "none"}.</p>
              <p>Tensions: {detail?.harmony.tensions.join(", ") || "none"}. Color notes: {detail?.harmony.characteristicTones.join(", ") || "none"}.</p>
              <p>{detail?.harmony.romanNumeral ?? "No tonal reading for this context."} {detail?.harmony.tonalFunction}</p>
              {detail?.harmony.scaleSuggestions.map((suggestion, index) => <p key={index}>{suggestion}</p>)}
              {detail !== undefined && detail.harmony.scaleSuggestions.length === 0 ? <p>No compatible scale suggestion for these exact chord tones.</p> : null}
            </> : null}
            {tab === "Motion" ? <>
              {detail === undefined ? null : [
                { title: `From previous chord: ${detail.motion.previousChordSymbol ?? "none"}`, segment: detail.motion.incoming },
                { title: `To next chord: ${detail.motion.nextChordSymbol ?? "none"}`, segment: detail.motion },
              ].map(({ title, segment }) => <section key={title} aria-label={title}>
                <h3>{title}</h3>
                {segment.unavailableReason === null ? <p>{segment.commonToneCount} common tones; {segment.stepwiseMotionCount} stepwise connections.</p> : <p>{segment.unavailableReason}</p>}
                <ul>{segment.voicePaths.map((path, index) => <li key={index}>{path.fromPitch === null ? "Enter" : label(path.fromPitch)} → {path.toPitch === null ? "Leave" : label(path.toPitch)}{path.intervalSemis === null ? "" : ` · ${String(path.intervalSemis)} semitones`}</li>)}</ul>
              </section>)}
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

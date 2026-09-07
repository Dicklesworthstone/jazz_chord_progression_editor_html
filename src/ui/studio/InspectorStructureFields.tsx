import { TRIAD_QUALITIES, SEVENTH_QUALITIES, type ChordDegree, type ChordSpec, type Step } from "../../domain";
import type { StudioInspectorStructurePatch } from "../../application/runtime";

const STEPS: readonly Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const ACCIDENTALS = [-2, -1, 0, 1, 2] as const;
const ALTERATIONS = [{ number: 5, alter: -1 }, { number: 5, alter: 1 }, { number: 9, alter: -1 },
  { number: 9, alter: 1 }, { number: 11, alter: 1 }, { number: 13, alter: -1 }] as const;
const nameOf = (degree: ChordDegree): string => `${degree.alter < 0 ? "b".repeat(-degree.alter) : "#".repeat(degree.alter)}${String(degree.number)}`;

/** Controls emit explicit AST changes. Parsing, conflict checks and formatting stay in the application. */
export function InspectorStructureFields({ chord, onChange }: Readonly<{
  chord: ChordSpec; onChange: (patch: StudioInspectorStructurePatch) => void;
}>) {
  const degrees = (field: "extensions" | "additions" | "alterations", degree: ChordDegree, checked: boolean): void => {
    const retained = chord[field].filter(item => item.number !== degree.number || item.alter !== degree.alter);
    onChange({ [field]: checked ? [...retained, degree].sort((a, b) => a.number - b.number || a.alter - b.alter) : retained });
  };
  const pitchControls = (field: "root" | "bass", title: string) => {
    const pitch = chord[field];
    if (pitch === null) return null;
    return <>
      <label>{title} letter<select value={pitch.step} onChange={event => {
        const step = STEPS.find(value => value === event.currentTarget.value);
        if (step !== undefined) onChange({ [field]: { ...pitch, step } });
      }}>{STEPS.map(step => <option key={step}>{step}</option>)}</select></label>
      <label>{title} accidental<select value={pitch.alter} onChange={event => {
        const alter = ACCIDENTALS.find(value => String(value) === event.currentTarget.value);
        if (alter !== undefined) onChange({ [field]: { ...pitch, alter } });
      }}>{ACCIDENTALS.map(alter => <option key={alter} value={alter}>{["bb", "b", "natural", "#", "##"][alter + 2]}</option>)}</select></label>
    </>;
  };
  return <>
    <div class="studio-inspector-fields">
      {pitchControls("root", "Root")}
      <label>Triad<select value={chord.triad} onChange={event => {
        const triad = TRIAD_QUALITIES.find(value => value === event.currentTarget.value);
        if (triad !== undefined) onChange({ triad });
      }}>{TRIAD_QUALITIES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Seventh<select value={chord.seventh ?? "none"} onChange={event => {
        onChange({ seventh: SEVENTH_QUALITIES.find(value => value === event.currentTarget.value) ?? null });
      }}><option value="none">none</option>{SEVENTH_QUALITIES.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <label class="studio-inspector-check"><input type="checkbox" checked={chord.bass !== null}
      onChange={event => { onChange({ bass: event.currentTarget.checked ? chord.root : null }); }} />Slash bass</label>
    <div class="studio-inspector-fields">{pitchControls("bass", "Bass")}</div>
    <fieldset><legend>Extensions and additions</legend>
      <label class="studio-inspector-check"><input type="checkbox" checked={chord.sixth !== null}
        onChange={event => { onChange({ sixth: event.currentTarget.checked ? { number: 6, alter: 0 } : null }); }} />Sixth</label>
      {([9, 11, 13] as const).map(number => <label class="studio-inspector-check" key={number}><input type="checkbox"
        checked={chord.extensions.some(degree => degree.number === number && degree.alter === 0)}
        onChange={event => { degrees("extensions", { number, alter: 0 }, event.currentTarget.checked); }} />Extension {number}</label>)}
      {([9, 11, 13] as const).map(number => <label class="studio-inspector-check" key={number}><input type="checkbox"
        checked={chord.additions.some(degree => degree.number === number && degree.alter === 0)}
        onChange={event => { degrees("additions", { number, alter: 0 }, event.currentTarget.checked); }} />Add {number}</label>)}
    </fieldset>
    <fieldset><legend>Alterations and omissions</legend>
      {ALTERATIONS.map(degree => <label class="studio-inspector-check" key={nameOf(degree)}><input type="checkbox"
        checked={chord.alterations.some(item => item.number === degree.number && item.alter === degree.alter)}
        onChange={event => { degrees("alterations", degree, event.currentTarget.checked); }} />{nameOf(degree)}</label>)}
      {([3, 5] as const).map(number => <label class="studio-inspector-check" key={number}><input type="checkbox" checked={chord.omissions.includes(number)}
        onChange={event => { onChange({ omissions: event.currentTarget.checked ? [...chord.omissions, number].sort((a, b) => a - b)
          : chord.omissions.filter(value => value !== number) }); }} />Omit {number}</label>)}
      <label class="studio-inspector-check"><input type="checkbox" checked={chord.colorPolicy === "altered-dominant"}
        onChange={event => { onChange({ colorPolicy: event.currentTarget.checked ? "altered-dominant" : "none" }); }} />Altered dominant color</label>
    </fieldset>
  </>;
}

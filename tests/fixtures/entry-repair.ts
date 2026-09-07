/** Hand-authored UTF-16 selections. Expectations are not parser output. */
export const ENTRY_SELECTION_CASES = [
  { id: "flat", draft: "D♭maj7 H7", start: 7, end: 8, selected: "H" },
  { id: "astral", draft: "; 🎷\nH7", start: 5, end: 6, selected: "H" },
  { id: "combining", draft: "; é\nH7", start: 5, end: 6, selected: "H" },
  { id: "crlf", draft: "; x\r\nH7", start: 5, end: 6, selected: "H" },
  { id: "empty-at-end", draft: "C7(", start: 3, end: 3, selected: "" },
  { id: "entire-astral", draft: "🎷", start: 0, end: 2, selected: "🎷" },
] as const;

export const ENTRY_INVALID_RANGES = [
  { draft: "C7", start: -1, end: 1 },
  { draft: "C7", start: 1, end: 3 },
  { draft: "C7", start: 2, end: 1 },
  { draft: "C7", start: 0.5, end: 1 },
  { draft: "🎷", start: 0, end: 1 },
  { draft: "🎷", start: 1, end: 2 },
] as const;

/** Each row names an observable exercised through the real browser. */
export const ENTRY_INTERACTIONS = [
  ["select", "Activate diagnostic by pointer or Enter", "Exact span focused; document/history unchanged"],
  ["edit", "Type over selected span", "Only draft changes; surrounding text stays byte exact"],
  ["cancel", "Escape during repair", "Original draft and selection restored; dialog stays open"],
  ["keep", "Keep repair then Escape", "Edited draft retained; ordinary surface Escape resumes"],
  ["insert", "Insert repaired draft then Undo", "One publication; exact prior document restored"],
  ["stale", "Activate diagnostic against a different draft", "No selection or replacement"],
  ["ime", "Enter/Escape during composition", "No insertion, cancellation or dismissal"],
  ["multiline", "Paste comments/newlines/astral text", "Newlines retained; UTF-16 span selected without scalar conversion"],
  ["limit", "4096 scalar draft and boundary+1", "Existing preflight bound retained; no truncation to fit"],
  ["truncated", "2048 recovered tokens plus diagnostic", "Existing truncation notice; diagnostic reachable through Next error"],
  ["fill", "Explicit fractional beats", "Existing exact duration and insertion-plan labels; no rounded sum"],
  ["unknown", "Unrecognised diagnostic code", "Generic prose plus unchanged code and source range"],
] as const;

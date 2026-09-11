/** Session-only draft edits. They never publish a chart or infer missing notes. */
export type NoteFirstDraftEdit =
  | Readonly<{kind:"append";note:string}>
  | Readonly<{kind:"remove";index:number}>
  | Readonly<{kind:"clear"}>;
export type NoteFirstKeyboardSpelling="sharps"|"flats";
export type NoteFirstKeyboardKey=Readonly<{
  note:string;black:boolean;column:number;midi:number|null;
}>;
export type NoteFirstKeyboard=Readonly<{
  octave:number;spelling:NoteFirstKeyboardSpelling;keys:readonly NoteFirstKeyboardKey[];
}>;

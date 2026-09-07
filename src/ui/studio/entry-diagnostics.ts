/**
 * One plain sentence per stable T0 diagnostic code. The codes themselves are
 * the frozen grammar authority and still render verbatim as small secondary
 * text; this map only translates them for people who did not write the
 * parser. It covers the entire closed T0 vocabulary (`SYMBOL_ERROR_CODES`,
 * `CHART_ERROR_CODES`, the warning, and `chart.layout_invalid`), and any
 * future code falls back to a generic sentence with the raw code beside it.
 */
const DIAGNOSTIC_PROSE: Readonly<Record<string, string>> = Object.freeze({
  "symbol.root_missing":
    "The chord needs a root note first — try C, F, Bb…",
  "symbol.root_invalid":
    "That chord's root note isn't valid — try C, Db, F#…",
  "symbol.accidental_out_of_range":
    "Too many sharps or flats on one note — double sharp or double flat is the limit.",
  "symbol.quality_unknown":
    "That chord quality isn't recognised — try maj7, m7, 7, dim7, sus4…",
  "symbol.extension_conflict":
    "Those chord extensions contradict each other.",
  "symbol.modifier_duplicate":
    "The same alteration appears twice in one chord.",
  "symbol.modifier_conflict":
    "Those alterations contradict each other.",
  "symbol.modifier_malformed":
    "An alteration couldn't be read — try forms like b5, #9, or add9.",
  "symbol.modifier_unclosed":
    "An opening parenthesis in this chord is never closed.",
  "symbol.modifier_unknown":
    "That alteration isn't recognised — try b5, #9, add9, no3…",
  "symbol.bass_invalid":
    "The note after the slash isn't a valid bass note — try /G or /Bb.",
  "symbol.trailing_input":
    "There are extra characters after the chord symbol.",
  "symbol.ambiguous_slash":
    "The slash is ambiguous here — write the bass note right after it, like C/G.",
  "symbol.whitespace_invalid":
    "There's an unexpected space inside the chord symbol.",
  "symbol.invalid_unicode_scalar":
    "This text contains a character the editor can't read.",
  "symbol.ast_unformattable":
    "This chord can't be written back as text.",
  "limit.symbol_code_points_exceeded": "That chord symbol is too long.",
  "limit.symbol_tokens_exceeded": "That chord symbol has too many parts.",
  "limit.symbol_modifiers_exceeded":
    "That chord symbol has too many alterations.",
  "chart.empty": "The draft is empty — write at least one chord.",
  "chart.document_section_required":
    "The chart needs at least one section of bars.",
  "chart.header_invalid": "A header line couldn't be read.",
  "chart.header_duplicate": "The same header appears twice.",
  "chart.header_after_content":
    "Headers must come before the first bar.",
  "chart.header_forbidden_in_fragment":
    "Headers aren't allowed when inserting into an existing chart.",
  "chart.meter_required": "The chart needs a meter before its bars.",
  "chart.section_name_unclosed":
    "A section name's bracket is never closed.",
  "chart.section_name_escape_invalid":
    "A section name contains an invalid escape.",
  "chart.section_name_blank": "A section name can't be blank.",
  "chart.annotation_unclosed": "An annotation's brace is never closed.",
  "chart.annotation_invalid_json": "An annotation couldn't be read.",
  "chart.invalid_unicode_scalar":
    "This text contains a character the editor can't read.",
  "chart.measure_unclosed": "A bar is missing its closing | mark.",
  "chart.repeat_without_previous":
    "A repeat mark needs a chord before it.",
  "chart.duration_invalid":
    "A duration couldn't be read — try :2 or :1/2.",
  "chart.duration_not_representable":
    "That duration is too fine to represent exactly.",
  "chart.bar_underfilled": "Not enough beats in this bar.",
  "chart.bar_overfilled": "Too many beats for this bar.",
  "chart.bar_division_not_representable":
    "The bar can't split evenly across these chords — give them explicit durations.",
  "chart.unsupported_notation": "That notation isn't supported here.",
  "chart.unexpected_token": "There's unexpected text in the draft.",
  "chart.draft_unformattable":
    "The draft can't be written back as text.",
  "chart.layout_invalid":
    "The bar layout couldn't be measured, so this chord needs its own duration.",
  "chart.comments_not_round_tripped":
    "Comments aren't kept when the chart is saved.",
  "limit.chart_utf8_bytes_exceeded": "The draft is too large.",
  "limit.chart_tokens_exceeded": "The draft has too many symbols.",
  "limit.chart_sections_exceeded": "The draft has too many sections.",
  "limit.chart_measures_per_section_exceeded":
    "A section has too many measures.",
  "limit.chart_events_exceeded": "The draft has too many chords.",
  "limit.chart_text_code_points_exceeded": "The draft is too long.",
});

export function diagnosticProse(code: string): string {
  return DIAGNOSTIC_PROSE[code] ?? "This part of the draft couldn't be read.";
}


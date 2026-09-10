# Printable chord charts

AGY3 / jcpe-6ujg.11. The September 10 owner request reopens chord-only
printing from REBUILD_PLAN section 22.1. This is not notation engraving,
a canonical backup, a guarantee of physical printer margins, or a change to
musical data. Native JSON remains the lossless export.

## Frozen layout and source rules

Pure export consumes a validated document. Print the title, tempo, meter,
section names, numbered measures, original chord source text and every exact
rational duration in quarter-note beats (`n/d q`). Empty measures are explicit
rests. Pickup/incomplete status is explicit. Do not print or claim to preserve
voicing octaves, annotations, descriptions, instrument/effect settings, alternate
analyses or recovery metadata; disclose these omissions before preparing.
Never mutate, respell, truncate, optimize or mark the chart as saved.

A4 is exactly 210 x 297 mm; Letter is 215.9 x 279.4 mm. Margins 12 mm;
page content starts at y=30 mm and ends at height-12 mm. Four equal-width bars
per row; 3 mm inner padding. Body font 4 mm, baseline spacing 5.2 mm, minimum
bar-row height 20 mm. Section headings consume 10 mm, remain with their first
row and repeat on a continued page. Do not split a bar over pages. A bar too
tall for a fresh page is refused by source ID rather than clipped. Titles are
limited to one fitted line; unsupported or overfull headers refuse with their
exact field identified. No hidden font-size reduction or ellipsis.

Each event starts a fresh line with original symbol plus exact duration.
Overfull lines wrap by supported code point with every character retained.
Use the checked-in Archivo Regular font, no kerning, ligatures or variable-weight
change. Freeze advances and supported characters from that exact font; reserve
1 mm of additional line slack against rasterizer rounding. Retain Latin printable
characters supported by the font, plus its explicitly reviewed punctuation. Refuse
missing/control/combining glyphs with the code point and source field; never
substitute an invisible box or a remote fallback font. Font coverage is an honest
v1 boundary, not a promise to print arbitrary Unicode. Independent browser glyph
measurements must fit the declared positions. Downloaded SVG embeds the same
WOFF2 plus its complete OFL notice; the in-app preview uses the already bundled
font. No external resource or popup is required.

## Work, bytes and authority

Admit 1-64 sections, 1-256 measures, at most 1024 events, 512 code points per
source string and 16,384 total source code points. Empty audible charts can
print explicit rests; empty sections/documents are refused explicitly. Preflight these
limits before layout. Retain at most 4096 lines and 32 pages. Record inspected
sections/bars/events/code points, wrapped lines, rows, pages and termination.
Deterministic operation limits govern refusal; wall time is only an observation.
Maximum standalone SVG is 1 MiB per page. SVG output is closed vocabulary of
svg/title/metadata/style/rect/line/text with escaped user text and attributes;
no script, imported markup, foreignObject, external URL or event handler.

Application service binds prepared layout and download bytes to the immutable
document/revision and chosen page size. Chart edits invalidate both immediately.
Selecting a page does not mutate source. Prepare, preview selected page, Print
all pages, Download selected SVG and Close are explicit. Download one Blob under
the native click with balanced URL/anchor cleanup; no canonical-export marker.
Print invokes the injected native browser adapter synchronously. In-document
print-only page copies are outside the command-lane overlay; print CSS hides
studio controls and uses named A4/Letter pages with zero CSS page margins.
Explicit Close print preview, folding its tool, or switching paper clears preparation. Dismissing/remounting the command-lane overlay preserves the source-bound preparation: native print-media changes can dismiss that overlay. Reopening the tool recovers its current preview; any chart edit still invalidates it immediately.

## Required proof

Independent literals pin paper geometry, column widths, fit/wrap boundaries,
section orphans, partial bars, empty rests, long labels, escape hostility,
missing glyphs, bounds and source-revision transitions. Positive and near-miss
cases include exact rational durations and unchanged spellings. At least four
semantic mutations must be killed. RCH owns focused tests, types, lint/boundaries
and guarded artifact/size. Real browsers verify fonts, bounds, accessibility,
stale/close/download, source immutability and no errors/network at 320 and 1280
pixels; independent XML parsing checks downloaded symbols and font bytes.
Chromium native PDF output is inspected independently for page count, physical
geometry and exact text. Firefox/WebKit print-media layout is additional evidence,
not a native PDF/physical-print claim. Physical A4/Letter output and phone print
experience remain the independent .11.3 acceptance gate.

The native PDF E2E requires installed Poppler pdfinfo, pdftotext and pdffonts through tests/support/print-pdf-proof.ts; missing readers fail explicitly. Paper dimensions must be within 1 PDF point of nominal CSS geometry for browser quantization. Page counts, all 49 fixture chord/duration strings, first-page 48/44 split and embedded Unicode-mapped Archivo are exact. Named @page rules live in src/index.html because pinned Bun 1.3.14 drops the required keyword/name space in linked CSS; generated-token and native-PDF checks guard this workaround.

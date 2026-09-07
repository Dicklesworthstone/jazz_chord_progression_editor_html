# Exact chart sharing

Consumer: the existing Share action and startup composition. Authority:
`jcpe-exact-share-1ric.1`, Foundation F2/F3, and REBUILD_PLAN sections14.4,
15.3–15.6 and16.1. This packet specifies idea6; it does not certify its build.

## What travels

Share opens a small dialog before copying anything. State plainly: the link
includes the title, description, section names/keys/annotations, chord notes,
and playback settings. Anyone receiving it can read them. Copy exact link and
Download exact JSON are explicit actions; Cancel changes nothing.

Version2 carries the entire validated `changes.progression.v2` document, using
the existing E0 canonical field projection with insignificant JSON whitespace
removed. Do not use a view model or quick-entry text as the source. Preserve all
document/section/measure/event IDs, source spellings, Custom labels/pitch names,
exact rational durations and completion declarations, key/meter, section voice
leading boundaries, every Auto policy, ordered Manual/Frozen pitch occurrence
(including duplicate unisons), Frozen provenance, and optional stored groove.
Do not add recovery envelopes, checksums, export markers, browser storage,
selection, raw editing drafts, transport state, history or derived analysis.

Identical published documents produce identical fragments. Same-build chart
voicing plans retain exact pitches and timing after opening either the link or
the exact JSON fallback. This is not a sample-identity, cross-build sound,
accompaniment/MIDI-parity or provenance-authenticity claim. Say that sound can
change between app versions; preserve existing Frozen provenance as data.

## Wire format and bounds

- The literal prefix is `#zdoc=2.` followed by unpadded canonical base64url of
  UTF-8 compact canonical document JSON. There is no second envelope/schema,
  compression dependency, shortener, fetch or upload.
- Retain the existing8192-character fragment cap, including the eight-character
  prefix. Maximum decoded payload is6138bytes:8184 base64 characters encode
  exactly6138bytes.6139bytes require8186 characters plus prefix and refuse.
- Check total encoded length before slicing, decoding or JSON parsing. Check
  calculated decoded length before allocating byte storage. The encoder checks
  UTF-8 byte size before base64 allocation; character count alone is insufficient.
  The trusted source document remains subject to existing Foundation limits.
- Accept only `[A-Za-z0-9_-]`, a nonempty payload, lengths modulo4 of0/2/3, and
  zero unused bits in its final sextet. Refuse padding, whitespace, percent
  escapes, `+`, `/`, extra fragments/query suffixes, and malformed UTF-8. There
  is no URI-unescaping or double-decoding step. Reject a leading UTF-8 BOM.
- Parse JSON without revivers. Refuse duplicate keys at every nesting level,
  including escaped aliases, and nesting beyond the existing32-level limit.
  Invalid syntax, unknown fields, future schema versions, invalid stable IDs,
  note spellings, semantic conflicts and durations refuse through F2/F3.
  Do not strip, normalize, repair, reorder or silently migrate any field.
- Version routing remains total. No `#zdoc=` means normal startup; an unknown
  fragment version is an explicit compatibility refusal. Existingv1 links keep
  their five-field format and exact grammar reader. Disclose on successfulv1
  open that notes, annotations, section details and other settings were not
  included by that format. New Share actions never emitv1.

## Application and startup ownership

The composition creates a sharing service over its private current-document
read. UI receives a view and intents, never the interchange owner or exporter.
Browser URL/clipboard adapters are bound in the composition root. Copy is
revision-bound: if the chart changed after opening Share, refresh its preview
and require another explicit click. A pending clipboard completion cannot
reopen a cancelled dialog or claim a newer chart was copied. Share never marks
the chart exported or changes musical history, recovery or audio ownership.

Clipboard failure leaves a selectable exact URL with a visible explanation.
For a downloaded `file://` studio, the copied URL uses `https://jazzchords.org/`
without exposing local file paths; it makes no request. HTTP(S) uses the current
origin/path, dropping query and old fragment. Opening a link requires access to
that app URL; a downloaded studio can use the JSON file entirely offline.

Oversized charts remain fully editable. Offer the existing exact JSON export
dialog, with its real activation, delivery, stale-marker and cleanup rules;
never truncate annotations/notes or fall back to a lossy link. Do not initiate
download just because Share was opened. A valid empty chart is shareable.

An explicitv2 startup is validated before replacement. Use the existing E0
document-import preparation/publication and serialized retirement path on the
pristine workspace, with one undoable replacement. Do not apply it as multiple
edits. A stale, cancelled or refused startup cannot publish a partial document,
overwrite new edits, clear recovery, or seed a demo over the refused source.
Defer the recovery probe until startup settles; explicit links retain priority
and conflicting recovery stays an explicit Keep/Discard choice. No `hashchange`
handler silently replaces an active chart. Startup never initializes audio.

## Independent proof

`tests/fixtures/exact-share/document.changes.json` is manually specified data,
not a production export. Its Manual notes are E4,Db3,Db3,C#3 (MIDI64,49,49,49);
its Frozen Cmaj7 notes are B3,E4,G4,C5 (59,64,67,72). Durations5/3 and7/3 sum
exactly to4; an additional empty section/measure must survive. Literal markup,
astral characters, a section key override and nondefault groove are witnesses.

`tests/fixtures/exact-share.ts` pins independent wire vectors and negative
cases. Unit/integration proof must cover valid codec/real F2/F3 publication,
every refused boundary, nested duplicate/unknown keys, changed IDs/spellings,
Manual order/unisons, Frozen provenance, deterministic bytes, stale/cancelled
copy/startup, recovery preservation, exact JSON fallback, and actual same-build
chart-voicing pitches/timing. Existingv1 tests stay meaningful. Since this
workflow performs no musical transform, transposed independently authored
specimens establish spelling/register preservation; inverse-transform laws
remain the transposition engine's obligation.

Native proof uses file/HTTP in Chromium/Firefox/WebKit with workers1,retries0,
desktop,320x568 and390x844 touch. Open a real imported voiced chart, Share,
copy or manually select the actual URL, open it in another page, and inspect
the real downloaded JSON and native note attacks. Exercise refusal twins,
legacy startup, recovery conflict, large fallback, keyboard/focus,200% layout
and reduced motion. Preserve request/error, source/artifact/fixture hashes,
document/history and native graph/source/object-URL diagnostics. Kill actual
source faults (dropped annotation, deduped/reordered pitches, lost provenance,
permissive limits/duplicate keys, stale copy/publication and lossy fallback),
each paired with an honest baseline. Existing release gates remain unchanged.

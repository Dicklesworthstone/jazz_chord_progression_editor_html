# My Charts

Authority: owner-requested September idea4, `jcpe-my-charts-zt9z.1`, Foundation
F1/F2/F3, A0, E0 and U5. This is the specification and independent fixture
packet. It does not certify implementation, browser durability or acceptance.

## Interaction and identity

My Charts opens one application-owned `my-charts` dialog under the existing
A0/U0 host. Its initial explanation is **Kept in this browser. Download a
backup to keep a portable copy.** No account, network, telemetry, sample, font,
package or music-engine change is involved. Recovery remains a separate
best-effort draft mechanism; it never updates collection records implicitly.

Show title, exact spelled document key (or No key), and last-kept time. Search
is a bounded case-insensitive substring of title/key; it neither changes order
nor searches a remote service. Sort last-kept time descending, then record ID
by ASCII code units. Duplicate titles are legal and individually selectable.
Selection uses record ID, never array index, title or musical document ID.

- **Keep current chart** adds one explicit snapshot of the published document.
  Existing records, even those with the same musical document ID, are untouched.
  State that unapplied edits are excluded. A repeated explicit Keep may create
  another snapshot; no hidden association makes subsequent edits overwrite it.
- **Replace with current chart** requires a selected record and a preview naming
  both titles. Confirmation is bound to the selected record, collection
  generation, live document reference and revision. A changed chart/collection
  invalidates confirmation; refresh and ask for a new explicit decision.
- **Rename** edits the selected kept document's title through A0's `set-text`
  document-title command over a detached state. Its existing nonblank/256-code-
  point rule applies. This is not a separate misleading record label. The chart
  being edited stays unchanged; disclose “Renames the kept copy.” Opening the
  renamed copy later uses the normal replacement workflow.
- **Duplicate** copies a kept chart through F1 `copyDomain`, root `document`,
  purpose `duplicate`, then F2/F3. Every document/section/measure/event ID is
  remapped. Everything else, including title, spelling, ordered Manual/Frozen
  unisons, exact fractions and provenance, is preserved. Do not append text
  automatically or optimize notes. A new storage record ID is also allocated.
- **Open** closes My Charts and prepares its exact JSON in the existing E0/U5
  import preview. Opening the panel or choosing a row never replaces anything.
  The existing explicit confirmation, revision guard, serialized audio/preview
  retirement, one-command Undo and disclosed history boundary apply unchanged.
- **Remove** requires an explicit in-dialog confirmation naming the kept copy.
  It removes only that record. The current chart, recovery, selection, playback
  and musical Undo/Redo are untouched, even if their document IDs match it.
- **Download chart JSON** delivers the selected kept document as ordinary E0
  canonical JSON. **Download current chart JSON** closes this host and opens
  the existing lifecycle export. Both remain discoverable when storage fails;
  only the existing current-document export authority may advance its marker.

Storage record IDs are opaque ASCII `chart_` plus 1..122 characters matching
`[A-Za-z0-9][A-Za-z0-9._:-]*`, at most128 total. Allocate from the existing
production entropy source and refuse failure/collision without partial writes.
These IDs are not musical IDs. Ordinary Keep/Open/backup/restore never remap
musical IDs; two snapshots of one document are valid independent records.

## Storage, transactions and bounded work

Use a separate IndexedDB database `changes-my-charts`, version1, with stores
`index` and `documents`. Recovery databases/keys stay outside its transactions.
The index key `current` contains a serialized exact manifest:

```json
{"schema":"changes.my-charts.index.v1","generation":1,"records":[{"recordId":"chart_example","updatedAt":"2026-09-07T00:00:00.000Z","payloadKey":"chart_example:1"}]}
```

Each payload is an immutable E0 canonical JSON string under the manifest's
recordId/generation key. Manifest rows are ordered by record ID; titles and keys
are derived from validated documents, not separately trusted metadata. Retain
unchanged payloads; a changed record gets a fresh key for the next generation.
Generation is a nonnegative safe integer. An absent index and empty documents
store means the initial generation0. Never reset generation on Remove-all.
Refuse exhausted generation rather than wrap (including the ABA empty case).

Read index and referenced records in one readonly transaction. Register terminal
handlers before requests. Bound index size before parsing (128KiB), row count
before fetching, each payload before parsing (2MiB), and actual accumulated
UTF-8 payload bytes (32MiB). Missing/malformed index, dangling/malformed/invalid
documents, unknown fields/schema, duplicate IDs or inconsistent payload keys
make the collection unavailable for mutation. Do not silently drop records,
rebuild an empty index or fall back to stale recovery. An orphaned payload with
no index is corruption. Report the refusal while current editing/export works.

Prepare and validate a complete proposed collection outside the write
transaction. One readwrite transaction covers BOTH stores, compares the current
manifest against the exact previously read manifest, writes new immutable
payloads, publishes the next manifest, and removes only superseded payloads.
Request success is not commit success: acknowledge only transaction `complete`.
Abort/error/quota/denial leaves every previously committed row and payload
unchanged. No opportunistic eviction, partial restore, localStorage write
fallback, unload-dependent correctness or retry of a stale write is allowed.
Two independently opened tabs with generation7 cannot both publish generation8.
The loser gets “My Charts changed in another tab. Refresh and try again.”

At most128 records, each at most2,097,152 canonical UTF-8 bytes and all at most
33,554,432 bytes. Check actual values, not declared file metadata or timestamps.
Expose observed record/byte counts and named refusals. No wall-time music cutoff.
An operation does at most128 record decodes plus the existing per-document
bounded F2/F3 work; restore compares at most256 IDs before checking union count.
The manifest scan, backup scan and writes are linear in these bounded inputs.
Memory retains at most current, incoming and proposed bounded collections plus
their serialized backup; release source files/preview references on retirement.

Storage unavailable on a file origin or denied/quota-limited browser is an
honest supported refusal, never a success label. Close connections on all paths
and on version change; if opening is blocked, refuse and close a late success.
No permanent collection polling, listeners, background auto-save or audio graph
is created. Wall-clock ISO timestamps are injected display metadata only; they
never decide conflict precedence or musical behavior.

## Portable backup and restore

One UTF-8 `.changes-library.json` file, with no ZIP or File System Access API:

```json
{"schema":"changes.my-charts.backup.v1","records":[{"recordId":"chart_example","updatedAt":"2026-09-07T00:00:00.000Z","documentText":"<complete E0 canonical JSON string>"}]}
```

Exact fields only, unique valid record IDs, canonical UTC ISO timestamps, records
ordered by ID on export. Decode may accept other row ordering and canonicalize
only the collection order. `documentText` preserves canonical lexical `-0` and
JSON escapes; never round-trip it through JSON.stringify of an ordinary parsed
document. Re-export it through E0 after F2/F3. Unknown fields/schema, duplicate
JSON keys (including escaped aliases), invalid/future documents, nesting beyond
32, BOM, malformed UTF-8, duplicate record IDs, or a single invalid record
refuse the entire backup. No automatic legacy migration inside a collection.

Bound file read to67,239,937 bytes (maximum+1), maximum accepted67,239,936
(64MiB+128KiB). This covers at most twice the32MiB canonical text budget plus
bounded envelope/metadata overhead. Check actual UTF-8 byte length and nesting
before host JSON parse. Check decoded count and per-document/aggregate bytes
again: outer escaping and claimed file size cannot bypass inner limits.
Backup creation checks its actual final byte size too. Refusal offers per-chart
JSON; it never truncates the collection or evicts charts to produce a backup.

Selecting a file only prepares a bounded preview. List additions, identical
records and each same-record-ID/different-canonical-document conflict, with
both titles. Equal document bytes mean an identical record even if timestamps
differ; preserve the local metadata. Different IDs with identical document IDs
or duplicate names are additions, not conflicts. For every real conflict the
user explicitly chooses **Keep local copy** or **Use backup copy**. Timestamps
never choose winners. Cancel preserves all bytes. No implicit “Save as copy”
remap: restore preserves the chosen source's record and musical IDs, title,
metadata, every supported musical field and exact canonical text.

Confirmation merges the chosen records with all unaffected local records in
ONE CAS transaction; it does not replace the collection wholesale or import
sections into the current chart. Check the whole resulting union before any
write. A stale preview requires refresh/reselection, never automatic rebase.
An interrupted restore leaves either the complete previous collection or the
complete confirmed collection, never a prefix. Fresh contexts restore all
supported fields without recovery/export markers, drafts, history or transport.

Download artifacts are prepared before the trusted click, bound to the displayed
snapshot, delivered synchronously through an injected native download adapter,
and single-use with object-URL cleanup. A known-stale collection must refresh
first. Downloads explicitly contain the displayed collection version; they do
not claim to include a concurrent tab's edits after the last refresh. Native
activation is synchronous, so do not pretend an asynchronous IndexedDB read at
click time can both certify latest bytes and preserve that activation.
Delivery errors stay visible; saying “Downloaded” requires an actual issued
download, not mere serialization. Collection/kept-chart downloads never change
the current document's export or recovery marker.

## Ownership, cancellation and proof

UI receives selectors/intents only. Application owns document validation,
detached A0 title edits, F1 duplication, prepared preview identity and native
download ports. Persistence imports only domain and implements bounded atomic
storage, never application validation or chart publication. Composition injects
browser adapters. Musical document/history/recovery/transport are unaffected by
collection edits. Explicit Open alone invokes the existing replacement owner.

Only one collection operation may be pending. Reads/file previews cancel when
their exact dialog owner retires. During a write, show a busy non-dismissible
state; source/owner changes abort the transaction before commit where possible.
Already committed bytes cannot be undone by hiding the panel. A late completion
must not reopen a cancelled/replaced host or claim a newer chart was kept.
Stale revision confirmation refuses before starting delivery/storage. Native
download cancellation after issuance is not observable and is not called a
durable file save. Refresh always reads committed storage afresh.

`tests/fixtures/my-charts/cases.json` supplies manually calculated storage,
restore, identity, limit and interaction expectations. The independently authored
`tests/fixtures/exact-share/document.changes.json` is reused as the complete
Manual/Frozen/duplicate-unison/fraction/annotation witness; its source provenance
and literal expected pitches remain in `EXACT_SHARE.md`. No production output
generates this packet. Static packet checks certify only internal specification
consistency. Build compares actual production results with these cases; verify
independently mutates real source and exercises native adapters.

Named gates: `bun test tests/static/my-charts-contract.test.ts`, then
`bun test tests/unit/my-charts.test.ts tests/integration/my-charts-integration.test.ts`
and `bun scripts/run-playwright.ts test tests/e2e/my-charts.spec.ts --workers=1`.
Add isolated production-source fault tests for CAS omission, partial restore,
quota deletion, conflict auto-winner, cap+1, duplicate ID/remap, lost annotations
or unisons, title alias, stale completion and false download-marker publication.
Each source fault requires an unchanged-assertion passing baseline.

Native proof covers Chromium/Firefox/WebKit, file/HTTP,1280 desktop,390x844 and
320x568 touch, keyboard focus restoration,200% layout and actual reduced motion.
Use real IndexedDB in two pages, fresh contexts, native files/downloads and
audio for Open while playing. Fault controls can interpose on the real adapter
at transaction checkpoints; a fake storage success is never browser proof.
Inspect all exact documents/history, record counts/keys/bytes, CAS generations,
request/error/axe logs, connection/listener/object-URL/voice counts, artifact/
source/fixture hashes and retained failures. No skips/retries/relaxed deadlines.
Existing release, human and committed-byte deployment gates remain unchanged.

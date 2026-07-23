# A1 Recovery Persistence Contract

Status: reviewed specification and independent fixture authority  
Contract schema: `changes.persistence.recovery-contract.v1`  
Envelope schema: `changes.recovery.v1`  
Export binding schema: `changes.recovery-export-binding.v1`  
Recovery policy: `changes.recovery-persistence@1`

This document, the public contract in `src/persistence/recovery-contract.ts`,
and the reviewed files under `tests/fixtures/recovery/` are the complete
code-facing A1 authority. An implementer does not need the legacy file or
`docs/REBUILD_PLAN.md` to build A1. Production output may be checked against
these records; it may not create, rewrite, bless, or weaken them.

## 1. Ownership and layer boundary

A1 owns the recovery envelope format and checksum, the IndexedDB primary and
bounded localStorage fallback adapters, the capability probe and adapter
selection, the write scheduler, the current/previous rotation, the startup
candidate report, the separately stored export binding, and the exact
user-facing recovery status vocabulary.

The persistence layer imports only `domain`. Envelopes persist the plain
document candidate shape — the F2 decoder input — never a `ValidatedDocument`;
every startup candidate is re-decoded through the real F2/F3 gates by the
application before it can become a document. A1 never initializes audio,
never mutates application state directly, and never renders UI: the
application consumes its reports and reduces its own `RecoveryStatus`.

Browser persistence is **Recovery**, never Save. Canonical JSON export is the
explicit portable save action. No A1 surface, status string, log line, or
identifier may describe recovery as saving.

## 2. Envelope and checksum law

A `RecoveryEnvelope` carries exactly: the pinned schema string, `savedAt`
(ISO-8601 wall clock), the triggering `revision` (nonnegative safe integer),
an optional `lastExport` display subset (`revision`, `exportedAt`,
`semanticDocumentHash`), the plain `document` candidate, and `checksum`.

The checksum algorithm is frozen as
`sha256-of-sorted-key-json-without-checksum-v1`: SHA-256 hex over the UTF-8
bytes of the canonical JSON serialization — object keys sorted lexicographic
ascending at every depth, arrays in order, no insignificant whitespace — of
the envelope with its `checksum` field removed. It detects truncation and
accidental corruption; it is not described as a security signature. An
envelope whose checksum, schema, revision, or shape fails validation is a
`corrupt` candidate with a stable reason code; it is never silently repaired
or partially used.

## 3. Adapters, keys, and bounds

The primary adapter is IndexedDB with a versioned object store. The bounded
localStorage adapter engages only after the IndexedDB capability probe fails.
If neither adapter is usable, or quota is exceeded, editing continues and the
status vocabulary points to Export — storage denial is an ordinary actionable
state, never data loss and never a modal failure.

Storage keys are `changes.recovery.v1:<documentId>:<slot>` with slots
`current` and `previous`; keys embed the envelope schema and the exact stable
document ID and never contain user text. Envelope payloads are bounded at
8,000,000 bytes on IndexedDB and 1,000,000 bytes on localStorage; an
oversized envelope refuses with `recovery.envelope_too_large` and never
truncates.

Adapters are dumb bounded byte stores behind `RecoveryAdapterPort`: writing
`current` atomically demotes the prior current envelope to `previous` in the
same adapter, and a failed or refused write leaves both slots byte-for-byte
unchanged. The service owns every recovery decision; an adapter decides
nothing.

## 4. Write scheduling and revision safety

A mutation marks recovery pending immediately. A write is queued after 400 ms
of input inactivity (`RECOVERY_IDLE_DELAY_MS`), with a hard two-second
maximum delay during continuous editing (`RECOVERY_MAX_DELAY_MS`). A
visibility change requests one final best-effort write; correctness never
depends on asynchronous work completing during unload, and unload completion
is best-effort only.

Every write serializes its snapshot for the triggering revision at queue
time. A completion may mark recovery clean only while that revision is still
current; a completion for an older revision reports `superseded` and can
never mark or overwrite newer state (`recovery.stale_completion` names the
refused path). At most one write is in flight; a newer trigger replaces a
queued-but-unstarted snapshot rather than queueing behind it.

## 5. Startup recovery choice

Startup renders the blank workspace immediately, probes recovery, and then
follows exactly one row of the reviewed startup matrix
(`startup-cases.json`):

- a valid current envelope with no conflicting session state and no export
  disagreement opens automatically, with a visible explanation and
  Discard/New actions;
- a valid current envelope that is stale against, or disagrees with, the
  stored export binding offers Keep/Discard;
- a corrupt current envelope with a valid previous envelope offers the
  previous copy;
- neither copy decoding reports one nonblocking diagnostic;
- absent envelopes report `none-available` and the blank workspace stands.

Recovery never initializes audio and never silently overwrites an already
edited in-memory document: if editing began before the probe settled, the
report downgrades automatic opening to Keep/Discard.

## 6. Export binding and marker durability

On exact export success — bound delivery plus A0 publication — A1 stores the
complete `RecoveryExportBinding` (document ID, export revision, timestamp,
semantic document hash, artifact byte length and SHA-256) separately from the
envelopes. `RecoveryEnvelope.lastExport` is only the derived display subset
of that record. Only exact A1 success establishes cross-reload marker
durability and permits the subset in a later envelope; unavailable, failed,
or malformed persistence remains visibly pending without a reload claim.
Export download cancellation or failure never advances the in-session
marker, and a stale marker for a superseded revision refuses with
`recovery.export_marker_stale` without touching the newer state.

## 7. Status vocabulary

The exact user-facing strings are frozen in `RECOVERY_STATUS_VOCABULARY`:

- `Recovered locally at {time}`
- `Changes pending recovery`
- `Recovery unavailable — export recommended`
- `Exported at revision {revision}`
- `Changed since export`

`{time}` is a locale-rendered wall-clock time and `{revision}` a decimal
revision; no other substitution exists. No string may call recovery a save.

## 8. Work, memory, and termination bounds

| Resource | Hard maximum |
|---|---:|
| envelope bytes (IndexedDB) | 8,000,000 |
| envelope bytes (localStorage) | 1,000,000 |
| storage key length | 256 |
| reason-code length | 64 |
| in-flight writes | 1 |
| retained slots per document | 2 (current, previous) |
| idle delay | 400 ms |
| maximum delay under continuous editing | 2000 ms |

The ten work counters in `RECOVERY_WORK_COUNTER_NAMES` are monotonic safe
integers. Elapsed wall time is performance evidence only; the idle and
maximum delays are scheduling policy read from the injected clock port,
never correctness cutoffs. Logs record revisions, hashes, reason codes, and
adapter transitions and never chart text.

## 9. Independent proof contract

The main manifest under `tests/fixtures/recovery/` byte-binds the companion
fixture files. The validator imports no production persistence code and
checks exact schemas, closed unions, numeric bounds, the checksum algorithm
by independent recomputation, the startup matrix, scheduler and export
witnesses, provenance, reciprocal trace links, and the named semantic
mutation controls.

The future A1 implementation must pass:

- fake adapter/clock integration tests for every scheduler, rotation,
  revision-safety, corruption, quota, fallback, and export-binding witness;
- the full reviewed startup matrix from a cold service against seeded
  adapter contents;
- browser reload E2E under real IndexedDB, forced IndexedDB failure with
  localStorage fallback, quota exhaustion, corrupt current with valid
  previous, and visibility-change flush, with machine-readable logs of
  revisions, hashes, and adapter transitions and no chart text;
- evidence that editing continues under denied storage and that no
  recovery path initializes audio or overwrites an edited document.

## 10. Implementation handoff and forbidden shortcuts

Production implementation provides `createRecoveryService(platform)` over
the injected `RecoveryPlatformPort` and the seven public operations without
broadening the ports. Before claiming A1 complete, an implementer must prove
every trace in `tests/fixtures/recovery/trace-ledger.json`.

The following are contract violations even if a demo appears to work:

- calling browser recovery a save anywhere a user or log can see;
- persisting or reviving a `ValidatedDocument` brand, or skipping the
  F2/F3 re-decode of a startup candidate;
- a completion for an older revision marking or overwriting newer state;
- an adapter write that can leave the slots partially rotated;
- silently repairing, truncating, or partially using a corrupt envelope;
- advancing the export marker on cancellation, failure, or a stale
  revision;
- blocking editing, or losing the in-memory document, when storage is
  denied, quota-limited, or corrupt;
- initializing audio from any recovery path;
- user text in storage keys, or chart text in logs;
- wall-time correctness cutoffs, skipped named gates, or goldens generated
  by the production code they test.

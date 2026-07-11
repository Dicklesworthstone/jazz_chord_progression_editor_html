# Changes Architecture

Status: foundation contract

This document is the code-facing architecture contract for the rebuilt
**Changes — Jazz Progression Studio**. It complements the product and theory
decisions in `REBUILD_PLAN.md`, but it is deliberately sufficient for an
implementation agent to decide where code belongs, which imports are legal,
what the release artifact is, and how those claims are proved.

## Source of truth

- `src/index.html` and modules under `src/` are authoritative.
- `dist/index.html` is an inspectable build output.
- `jazz_chord_progression_editor.html` is the canonical generated release
  artifact. It must be byte-identical to `dist/index.html` and is never
  hand-edited.
- `tests/fixtures/foundation/foundation-contract.json` is the machine-readable
  F0 contract. Static/build tests consume it; build code must not generate its
  own expected values.
- The legacy HTML remains evidence until the replacement has passed the release
  gate. New production code must not import or evaluate it.

## Toolchain contract

The supported build environment is Bun 1.3.14, pinned as
`packageManager: bun@1.3.14`. All package versions are exact in
`package.json` and `bun.lock`.

| Role | Package | Version | Placement |
|---|---|---:|---|
| UI runtime | `preact` | 10.29.7 | production |
| compiler | `typescript` | 6.0.3 | development |
| browser tests | `@playwright/test` | 1.61.1 | development |
| accessibility tests | `@axe-core/playwright` | 4.12.1 | development |
| lint engine | `eslint` | 10.7.0 | development |
| lint core rules | `@eslint/js` | 10.0.1 | development |
| typed lint rules | `typescript-eslint` | 8.63.0 | development |
| Bun types | `@types/bun` | 1.3.14 | development |
| Node tool types | `@types/node` | 26.1.1 | development |

TypeScript 6.0.3 is intentional: the current typed-lint package declares
`typescript >=4.8.4 <6.1.0`, so pinning TypeScript 7 would create an invalid
peer contract and would remove the stable compiler API needed by the AST
checkers. Preact is the only production dependency. Browser APIs, Pointer
Events, Web Audio, IndexedDB, Blob/download, and CSS are used directly.

Playwright is run with a real supported Node.js runtime, not Bun's `node`
compatibility shim. `doctor:toolchain` locates a Node 22, 24, or 26 executable,
proves `process.versions.bun` is absent, records the exact runtime, and then
launches `node node_modules/@playwright/test/cli.js`. CI must put a supported
Node ahead of any shim; local verification may use an explicit `NODE_BINARY`.
`.node-version` pins the preferred CI/LTS runtime to Node 24.18.0.

The manifest exposes these stable commands:

| Command | Contract |
|---|---|
| `bun install --frozen-lockfile` | reproduce the exact dependency graph |
| `bun run dev` | serve the source entry for local development |
| `bun run doctor:toolchain` | verify exact Bun/package pins and a real supported Node for Playwright |
| `bun run validate:f0-contract` | validate the machine-readable standalone-foundation contract |
| `bun run validate:f1-contract` | validate the independent spelling, identity, exact-time, voicing, and boundary authority corpus |
| `bun run typecheck` | strict `tsc --noEmit` |
| `bun run lint` | ESLint plus source-integrity and dependency-boundary checks |
| `bun test` | Bun unit, property, golden, conformance, integration, and static tests |
| `bun run test:e2e` | Playwright browser suite |
| `bun run build` | generate both standalone HTML outputs and reports |
| `bun run verify:standalone` | static and browser no-network artifact proof |
| `bun run verify:reproducible` | build in two isolated absolute paths and compare bytes/manifests |
| `bun run verify:licenses` | verify production dependency and embedded-asset provenance |
| `bun run verify` | aggregate type, lint, tests, build, artifact, and E2E gates |

## Module ownership

```text
domain
  ↑
theory          compatibility
  ↑                  ↑
playback       persistence / export / content adapter
       ↑            ↑
       application commands and services
                    ↑
                    ui

audio <- immutable playback plans + serialized transport commands
```

| Layer | Owns | May import |
|---|---|---|
| `domain` | spelling-first values, exact time, stable IDs, document shapes | no project layer |
| `theory` | pure resolution, analysis, laws, bounded search, voicing | `domain` |
| `playback` | exact immutable beat/tick playback plans | `domain`, `theory` types |
| `audio` | persistent Web Audio graph, voices, scheduler, transport | `domain`, `playback` |
| `compatibility` | bounded legacy candidates and migration reports | `domain`, `theory` |
| `persistence` | recovery adapters and envelopes | `domain` |
| `export` | canonical JSON/text/MIDI encoders | `domain`, `theory`, `playback` |
| `content` | compiled immutable records and injected query adapters | `domain`, `theory` interfaces |
| `application` | publication gate, commands, history, services, selectors | all non-UI layers |
| `ui` | Preact rendering, intent dispatch, selector presentation | `domain`, `application` |
| `test-support` | deterministic builders, fake clocks/audio, independent corpora | any production layer |
| `scripts` | build-time compilation and verification | any production layer |

Load-bearing boundary rules:

1. `domain` imports no theory, UI, audio, storage, browser service, or Preact.
2. `theory` is pure and cannot import content, UI, audio, persistence, export,
   or mutable application state.
3. Runtime theory receives an injected read-only `AtlasQuery`; it never imports
   the Atlas implementation.
4. `audio` consumes playback plans and transport commands. It does not inspect
   chart drafts or UI state.
5. `ui` dispatches application intents. It cannot call audio/storage/export
   adapters directly or mutate domain objects.
6. Only `application/document-validation.ts` may perform the audited opaque
   `ValidatedDocument` brand cast.
7. Only `ui` and `main.tsx` may import Preact. Only `audio` may construct
   Web Audio nodes.
8. Production modules may not import `test-support`, `tests`, or `scripts`.
9. Cross-layer imports use public module entry points once those entry points
   exist; path traversal into another layer's private implementation is rejected.
10. `main.tsx` is the sole composition root. It may wire UI to concrete
    application adapters, but it may not contain domain, theory, transport, or
    persistence logic.

The dependency checker resolves relative and aliased TypeScript imports with the
TypeScript AST. String search is not sufficient because type-only imports,
re-exports, and multiline declarations must be covered.

## TypeScript invariants

The main configuration uses browser ES modules, `moduleResolution: Bundler`,
Preact's automatic JSX runtime, and strict checking. The following options are
load-bearing:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `noPropertyAccessFromIndexSignature`
- `useUnknownInCatchVariables`
- `verbatimModuleSyntax`
- `isolatedModules`
- `noEmit`

Production `any`, unchecked JSON casts, non-null assertions used as validation,
duplicate class/object members, and duplicate exports are lint/static-test
failures. Unknown external data crosses a total decoder before it becomes a
domain candidate.

## Standalone release contract

The release is one UTF-8 HTML file with all production JavaScript, CSS, icons,
images, and compiled content inlined. Its initial uncompressed limit is
1,572,864 bytes (1.5 MiB), including the final Harmonic Atlas.

The F0 bootstrap shell has a temporary 262,144-byte ceiling. The final budget
reserves at least 524,288 bytes for the compiled Atlas/content until D0 provides
measured data. Later packages may redistribute the non-Atlas remainder, but
cannot spend the reserved content allowance silently.

Both generated HTML files begin with the fixed timestamp-free banner
`<!-- @generated; edit src/, then run bun run build -->`, followed by a
standards-mode doctype. Runtime tests require
`document.compatMode === "CSS1Compat"`.

The generated artifact may not contain a runtime dependency on:

- an external `script`, stylesheet, font, image, media, manifest, or module;
- static or dynamic JavaScript imports;
- `fetch`, XMLHttpRequest, WebSocket, EventSource, sendBeacon, service-worker
  registration, Worker, SharedWorker, or worklet module loading;
- a source-map URL;
- a model client, prompt endpoint, telemetry endpoint, or CDN.

The build injects and verifies a meta Content Security Policy. Its default,
connect, worker, object, frame, manifest, base, and form destinations are
`'none'`; executable inline script/style blocks are authorized by generated
SHA-256 hashes, and only inventoried passive `data:`/local `blob:` assets may
be allowed. CSP is defense in depth: static capability analysis and the
no-CSP negative-control harness must still prove that interception works.

Harmless URLs in license and documentation text are allowed. Verification
therefore inspects executable import/call sites and URL-bearing HTML/CSS
attributes, then independently denies nonlocal requests in a real browser.

The artifact is exercised in two modes:

1. direct `file://` navigation;
2. a loopback HTTP server whose main-document request is allowed.

For both modes, Playwright aborts and records every nonlocal request. The page
must reach the ready marker, expose the expected heading, produce no page error
or unexpected console error, and make zero forbidden requests. Blob/data URLs
created by explicit local export/preview behavior are permitted and separately
checked for cleanup.

The browser matrix contains six mandatory cells: Chromium, Firefox, and WebKit
under both `file://` and loopback HTTP. Each uses a fresh context with service
workers blocked. Routes and event listeners are installed before page creation.
HTTP permits exactly one 200 `GET` for the top-level artifact and zero
subresource, redirect, favicon, map, popup, worker, WebSocket, or background
requests—even on loopback. The file fixture is copied to a path containing
spaces, Unicode, and `#` and is converted with `pathToFileURL`.

A separate malicious no-CSP fixture attempts a remote request and must be
recorded and aborted. This negative control prevents an inert request logger or
CSP alone from making the real artifact appear offline.

## Reproducibility and reports

One build invocation produces:

- `dist/index.html`;
- `jazz_chord_progression_editor.html`;
- `dist/standalone-manifest.json` with SHA-256, bytes, budget, entrypoint,
  deterministic build fields, assets, and static-scan findings;
- `dist/licenses.json` with bundled production packages/assets and provenance.

Run-specific browser versions, request sequences, console messages, and failures
go to `test-results/standalone-browser-evidence.json`; they never enter the
deterministic manifest or release artifact.

The two HTML outputs are byte-identical. Reproducibility builds in two fresh
absolute paths with `TZ=UTC`, fixed locale, fixed `SOURCE_DATE_EPOCH`, and
different source mtimes; their artifact bytes and deterministic manifests must
match. Timestamps, absolute paths, random IDs, ports, and source-map comments are
forbidden in the artifact. Reports may include measured times, but measured time
never becomes product data. A one-byte root mutation and a stale source/root
pair are negative fixtures.

## Foundation verification matrix

| Trace | Case | Expected evidence |
|---|---|---|
| F0-TOOLCHAIN-01 | frozen install and exact versions | manifest/lock inspection and version log |
| F0-BOUNDARY-01 | every legal/illegal layer edge | TypeScript-AST fixture matrix |
| F0-DUPLICATE-01 | duplicate members/exports | failing static fixtures with file/range |
| F0-ARTIFACT-01 | source builds both outputs | byte equality and SHA-256 |
| F0-NETWORK-01 | `file://` and HTTP with network denied | request/console/page-error JSON logs |
| F0-NETWORK-02 | each forbidden attribute/import/call | mutation fixtures rejected with code/range |
| F0-REPRO-01 | two clean builds | identical hashes and bytes |
| F0-SIZE-01 | 1.5 MiB boundary | exact byte pass and +1 byte rejection fixture |
| F0-LICENSE-01 | bundled asset/dependency provenance | stable license inventory |
| F0-CSP-01 | restrictive hash-based embedded CSP | directive/hash and no-CSP negative-control tests |
| F0-NODE-01 | Playwright uses real Node 22/24/26 | toolchain-doctor report |
| L-OFFLINE-01 | legacy CDN dependency cannot recur | standalone-offline E2E |
| L-SOURCE-01 | source-order duplicate override cannot recur | duplicate-member static test |

Every structured verification log includes schema version, trace ID, tool and
browser versions, artifact hash, mode, deterministic seed where relevant,
outcome, and findings. Logs must not include progression text or user data.

## Forbidden shortcuts

- Hand-editing the generated root HTML.
- Copying the legacy inline script into a new entrypoint.
- Allowing remote resources because they are cached during tests.
- Treating a static string scan as the only offline proof.
- Treating a browser smoke test as the only dependency-boundary proof.
- Adding a second production package for convenience.
- Updating a golden, screenshot, size budget, or license expectation merely to
  make a failure disappear.
- Shipping a skipped, retried, quarantined, or mock-only substitute for a named
  real-browser gate.

## Evolution

A layer edge, production dependency, artifact-size increase, new runtime
capability, or browser-baseline change requires an explicit contract update,
measured justification, and revised fixtures before implementation. Later
packages may add detail, but may not weaken this foundation silently.

# X0 human listening evidence

This directory owns the human-only `TR-X0-LISTENING` release proof. Browser
render metrics, screenshots, waveform hashes, and automated audio analysis do
not satisfy this gate: a named human reviewer must physically audition every
required cell after the production audio code and reviewed rubric are current.

The X0 matrix is the 11 case IDs named by `TR-X0-LISTENING` in
`tests/fixtures/audio-engine/trace-ledger.json`, crossed with all three browser
families and both output categories in `listening-rubric.json`: 66 records.
Scenario rows 003 through 005 belong to later transport work and are not used
to manufacture an X0 pass before that behavior exists.

For each physical session, copy `x0-listening-v1.template.json` to
`x0-listening-v1.json`, set every attestation to `true`, and add exactly one
record for every required case/browser/output tuple. Use the rubric's exact
browser and output vocabulary. `notes` must say what was actually heard;
`knownLimitations` is an empty string only when none were observed. A missing
capability uses `not-supported-with-recorded-reason`, narrows the support claim,
and leaves the full release gate incomplete.

Validate the record with:

```sh
bun scripts/verify-x0-listening-evidence.ts
```

Do not copy automated results into this file, name an AI tool as reviewer, or
set the attestations before the physical auditions have occurred.

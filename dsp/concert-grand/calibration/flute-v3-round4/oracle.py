#!/usr/bin/env python3
"""Flute v3 round-4 oracle: patch 15 params into a worker copy, build, run the
UIowa runner, emit a JSON metrics record on stdout.

argv: workdir p0..p14
  p0-2  bright pp/mf/ff
  p3-5  corner pp/mf/ff (Hz)
  p6-8  sat half-width pp/mf/ff
  p9-10 growth mf/ff
  p11-14 pp cap m72/m76/m79/m82

The oracle is measurement-only: the runner is the unmodified repo script; the
laws and bounds live there (winds-reference-policy@2)."""
import json, re, subprocess, sys

work = sys.argv[1]
p = [float(v) for v in sys.argv[2:17]]
src = f"{work}/dsp/concert-grand/src/flute_v3.rs"
s = open(src).read()

def fmt(v):
    return f"{v:.4f}"

s = re.sub(
    r"const BRIGHT_MIX_TABLE: \[\[f32; 3\]; 3\] = \[\n    \[[^\]]*\],\n    \[[^\]]*\],",
    "const BRIGHT_MIX_TABLE: [[f32; 3]; 3] = [\n    [0.120, 0.210, 0.300],\n"
    f"    [{fmt(p[0])}, {fmt(p[1])}, {fmt(p[2])}],",
    s, count=1)
s = re.sub(
    r"const RADIATION_CORNER_TABLE: \[\[f32; 3\]; 3\] = \[\n    \[[^\]]*\],\n    \[[^\]]*\],",
    "const RADIATION_CORNER_TABLE: [[f32; 3]; 3] = [\n    [5500.0, 5500.0, 5500.0],\n"
    f"    [{p[3]:.1f}, {p[4]:.1f}, {p[5]:.1f}],",
    s, count=1)
s = re.sub(
    r"const SAT_HALF_WIDTH_R1_ANCHORS: \[f32; 3\] = \[[^\]]*\];",
    f"const SAT_HALF_WIDTH_R1_ANCHORS: [f32; 3] = [{fmt(p[6])}, {fmt(p[7])}, {fmt(p[8])}];",
    s, count=1)
s = re.sub(
    r"const JET_GROWTH_CAP_R1_ANCHORS: \[f32; 3\] = \[[^\]]*\];",
    f"const JET_GROWTH_CAP_R1_ANCHORS: [f32; 3] = [3.0000, {fmt(p[9])}, {fmt(p[10])}];",
    s, count=1)
# Per-note pp caps: patch indices 0 (m72), 4 (m76), 7 (m79), 10 (m82); other
# notes keep the round-3 landed values (the matrix cannot judge them).
caps = [3.10, 3.05, 3.00, 2.90, 2.70, 2.80, 2.90, 2.80, 3.00, 3.10, 3.30, 3.30]
caps[0], caps[4], caps[7], caps[10] = p[11], p[12], p[13], p[14]
s = re.sub(
    r"const PP_GROWTH_CAP_BY_NOTE_R1: \[f32; 12\] = \[\n[^;]*\];",
    "const PP_GROWTH_CAP_BY_NOTE_R1: [f32; 12] = [\n    "
    + ", ".join(fmt(c) for c in caps) + ",\n];",
    s, count=1)
open(src, "w").write(s)

build = subprocess.run(
    ["bash", "-c",
     f"cd {work}/dsp/concert-grand && CARGO_TARGET_DIR={work}/target "
     "RCH_CARGO_WRAPPER_BYPASS=1 RUSTFLAGS='-C link-arg=--export=__heap_base' "
     "~/.cargo/bin/cargo build --release --target wasm32-unknown-unknown 2>&1"],
    capture_output=True, text=True)
if build.returncode != 0:
    print(json.dumps({"error": "build", "detail": build.stdout[-400:]}))
    sys.exit(0)

run = subprocess.run(
    ["bash", "-c",
     f"cd {work} && bun scripts/run-uiowa-flute-v2-reference.ts "
     f"--wasm {work}/target/wasm32-unknown-unknown/release/concert_grand.wasm 2>/dev/null"],
    capture_output=True, text=True)
out = run.stdout
try:
    d = json.loads(out[out.find("{"):])
except Exception:
    print(json.dumps({"error": "runner", "detail": out[-400:]}))
    sys.exit(0)

def cells(o):
    if isinstance(o, dict):
        if "cells" in o and isinstance(o["cells"], list):
            return o["cells"]
        for v in o.values():
            r = cells(v)
            if r is not None:
                return r
    return None

# Bounds from winds-reference-policy@2 (scripts/reference-similarity.ts).
ENV, HARM, HNR, HB, IDM = 18.0, 20.0, 12.0, 8.0, 3.5
ATT_LO, ATT_HI = 0.015, 0.18
records = []
for cell in cells(d) or []:
    if cell.get("outcome") == "reference-unavailable":
        continue
    fs = cell.get("findings") or []
    excess = {}
    hard_fail = False
    for f in fs:
        code = f.get("code", "?")
        nums = re.findall(r"-?[0-9]+\.?[0-9]*", f.get("message", ""))
        v = float(nums[0]) if nums else None
        if code == "ENVELOPE_DISTANCE" and v is not None:
            excess[code] = max(0.0, (v - ENV) / ENV)
        elif code == "HARMONIC_DISTANCE" and v is not None:
            excess[code] = max(0.0, (v - HARM) / HARM)
        elif code == "HNR_DELTA" and v is not None:
            excess[code] = max(0.0, (abs(v) - HNR) / HNR)
        elif code == "HIGH_BAND_DELTA" and v is not None:
            excess[code] = max(0.0, (abs(v) - HB) / HB)
        elif code == "CANDIDATE_TARGET_IDENTITY_MARGIN" and v is not None:
            excess[code] = max(0.0, (IDM - v) / IDM)
        elif code == "CANDIDATE_ATTACK_ABSOLUTE_RANGE" and v is not None:
            if v > ATT_HI:
                excess[code] = (v - ATT_HI) / ATT_HI
            elif v < ATT_LO:
                excess[code] = (ATT_LO - v) / ATT_LO
        else:
            # Phonation/pitch/periodicity or unparsed law: hard admission
            # failure (large fixed penalty keeps the floor hard without
            # destroying gradient structure entirely).
            hard_fail = True
    records.append({
        "id": cell.get("id"),
        "pass": cell.get("outcome") == "pass",
        "hardFail": hard_fail,
        "excess": excess,
    })

fail_cells = sum(1 for r in records if not r["pass"])
total_excess = sum(sum(r["excess"].values()) + (10.0 if r["hardFail"] else 0.0)
                   for r in records)
max_excess = max((max(list(r["excess"].values()) + [0.0])
                  + (10.0 if r["hardFail"] else 0.0)) for r in records) if records else 10.0
print(json.dumps({
    "objectives": [float(fail_cells), round(total_excess, 6), round(max_excess, 6)],
    "cells": records,
}))

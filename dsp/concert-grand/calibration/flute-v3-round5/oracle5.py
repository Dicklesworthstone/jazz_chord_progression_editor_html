#!/usr/bin/env python3
"""Flute v3 round-5 HONEST oracle: patch 10 params into a worker copy, build,
run the UNMODIFIED runner at its 44.1 kHz policy rate, emit metrics JSON.

argv: workdir p0..p9
  p0-2 bright row1 pp/mf/ff      p3-5 corner row1 pp/mf/ff (Hz)
  p6 turbulence base  p7 turbulence slope  p8 m72 bright trim  p9 turb corner Hz
Objectives out: fail_count, total_excess, monotonicity_violations.
"""
import json, re, subprocess, sys

work = sys.argv[1]
p = [float(v) for v in sys.argv[2:12]]
src = f"{work}/dsp/concert-grand/src/flute_v3.rs"
s = open(src).read()

def sub(pat, rep, s):
    out, n = re.subn(pat, rep, s, count=1)
    assert n == 1, pat
    return out

s = sub(r"(const BRIGHT_MIX_TABLE: \[\[f32; 3\]; 3\] = \[\n    \[[^\]]*\],\n)    \[[^\]]*\],",
        rf"\g<1>    [{p[0]:.4f}, {p[1]:.4f}, {p[2]:.4f}],", s)
s = sub(r"(const RADIATION_CORNER_TABLE: \[\[f32; 3\]; 3\] = \[\n    \[[^\]]*\],\n)    \[[^\]]*\],",
        rf"\g<1>    [{p[3]:.1f}, {p[4]:.1f}, {p[5]:.1f}],", s)
s = sub(r"const TURBULENCE_BASE: f32 = [0-9.e_-]+;",
        f"const TURBULENCE_BASE: f32 = {p[6]:.6f};", s)
s = sub(r"const TURBULENCE_SLOPE: f32 = [0-9.e_-]+;",
        f"const TURBULENCE_SLOPE: f32 = {p[7]:.6f};", s)
s = sub(r"const NOTE_BRIGHT_TRIM_R1: \[f32; 12\] = \[\n    [0-9.]+,",
        f"const NOTE_BRIGHT_TRIM_R1: [f32; 12] = [\n    {p[8]:.4f},", s)
s = sub(r"const TURBULENCE_CORNER_HZ: f32 = [0-9._]+;",
        f"const TURBULENCE_CORNER_HZ: f32 = {p[9]:.1f};", s)
open(src, "w").write(s)

b = subprocess.run(["bash", "-c",
    f"cd {work}/dsp/concert-grand && CARGO_TARGET_DIR={work}/target "
    "RCH_CARGO_WRAPPER_BYPASS=1 RUSTFLAGS='-C link-arg=--export=__heap_base' "
    "~/.cargo/bin/cargo build --release --target wasm32-unknown-unknown 2>&1"],
    capture_output=True, text=True)
if b.returncode != 0:
    print(json.dumps({"error": "build", "detail": b.stdout[-300:]})); sys.exit(0)

r = subprocess.run(["bash", "-c",
    f"cd {work} && bun scripts/run-uiowa-flute-v2-reference.ts "
    f"--wasm {work}/target/wasm32-unknown-unknown/release/concert_grand.wasm 2>/dev/null"],
    capture_output=True, text=True)
t = r.stdout
try:
    d = json.loads(t[t.find("{"):])
except Exception:
    print(json.dumps({"error": "runner", "detail": t[-300:]})); sys.exit(0)

def cells(o):
    if isinstance(o, dict):
        if "cells" in o and isinstance(o["cells"], list):
            for c in o["cells"]:
                yield c
        else:
            for v in o.values():
                yield from cells(v)
    elif isinstance(o, list):
        for v in o:
            yield from cells(v)

fails = 0
excess = 0.0
rms_by_note = {}
for c in cells(d):
    if not isinstance(c, dict) or c.get("outcome") not in ("pass", "fail"):
        continue
    if c["outcome"] == "fail":
        fails += 1
    for f in c.get("findings") or []:
        m = re.search(r"(-?[0-9.]+) exceeds (-?[0-9.]+)", f.get("message", ""))
        if m:
            excess += abs(float(m.group(1)) - float(m.group(2)))
        else:
            excess += 5.0  # non-numeric finding (attack range, identity) flat penalty
    cand = (c.get("report") or {}).get("candidate") or {}
    band = cand.get("integratedBandDb")
    if band:
        rms_by_note.setdefault(c["midi"], {})[c["dynamic"]] = max(band)
mono = 0
for midi, dyn in rms_by_note.items():
    seq = [dyn.get(k) for k in ("pp", "mf", "ff") if k in dyn]
    mono += sum(1 for a, b2 in zip(seq, seq[1:]) if a is not None and b2 is not None and b2 < a - 0.5)
print(json.dumps({"fails": fails, "excess": round(excess, 3), "mono": mono}))

/**
 * The independent ear (jcpe-7she): a live spectral view of what the master
 * bus actually carried, with note detection and an honest verdict against
 * the chart's sounding chord. Display-only — it polls the same read-only
 * accessors the playhead uses and can neither steer nor claim more than it
 * measured.
 */
import { useEffect, useRef, useState } from "preact/hooks";

import {
  computeAnalyzerVerdict,
  PITCH_CLASS_LABELS,
  type StudioAnalysisFrame,
  type StudioAnalyzerExpectation,
  type StudioAnalyzerVerdict,
} from "../../application/runtime";

export type AnalyzerPanelProps = Readonly<{
  /** True while the transport is playing; the panel idles otherwise. */
  active: boolean;
  readFrame: () => StudioAnalysisFrame | null;
  expectation: StudioAnalyzerExpectation | null;
}>;

const NOTE_NAMES = PITCH_CLASS_LABELS;

function noteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12] ?? "?"}${String(Math.floor(rounded / 12) - 1)}`;
}

function cssColor(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

function drawFrame(
  canvas: HTMLCanvasElement,
  frame: StudioAnalysisFrame | null,
): void {
  const context = canvas.getContext("2d");
  if (context === null) return;
  const width = canvas.width;
  const height = canvas.height;
  const accent = cssColor(canvas, "--accent", "#d9a45b");
  const dim = cssColor(canvas, "--text-subtle", "rgba(128,128,128,0.5)");
  context.clearRect(0, 0, width, height);
  if (frame === null) return;

  /* Scope strip across the top. */
  const scopeHeight = Math.floor(height * 0.22);
  context.strokeStyle = dim;
  context.lineWidth = 1;
  context.beginPath();
  const stride = Math.max(1, Math.floor(frame.samples.length / width));
  for (let x = 0; x < width; x += 1) {
    const sample = frame.samples[x * stride] ?? 0;
    const y = scopeHeight / 2 - sample * scopeHeight * 1.4;
    if (x === 0) context.moveTo(0, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  /* Log-frequency spectrum, 55 Hz .. 5.2 kHz. */
  const spectrumTop = scopeHeight + 4;
  const spectrumHeight = height - spectrumTop;
  const binHz = frame.sampleRateHz / frame.fftSize;
  const logLow = Math.log2(55);
  const logSpan = Math.log2(5_200) - logLow;
  let ceiling = 1.0e-6;
  for (const magnitude of frame.magnitudes) {
    if (magnitude > ceiling) ceiling = magnitude;
  }
  context.fillStyle = accent;
  for (let x = 0; x < width; x += 1) {
    const hz = 2 ** (logLow + (x / width) * logSpan);
    const bin = Math.min(
      frame.magnitudes.length - 1,
      Math.max(0, Math.round(hz / binHz)),
    );
    const level = (frame.magnitudes[bin] ?? 0) / ceiling;
    const bar = Math.sqrt(level) * spectrumHeight;
    context.globalAlpha = 0.28 + 0.72 * Math.min(1, level * 4);
    context.fillRect(x, spectrumTop + spectrumHeight - bar, 1, bar);
  }
  context.globalAlpha = 1;
}

export function AnalyzerPanel({
  active,
  readFrame,
  expectation,
}: AnalyzerPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readRef = useRef(readFrame);
  readRef.current = readFrame;
  const expectationRef = useRef(expectation);
  expectationRef.current = expectation;
  const [verdict, setVerdict] = useState<StudioAnalyzerVerdict>(
    computeAnalyzerVerdict(null, null),
  );
  const [detected, setDetected] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!active) {
      setVerdict(computeAnalyzerVerdict(null, null));
      setDetected([]);
      const canvas = canvasRef.current;
      if (canvas !== null) drawFrame(canvas, null);
      return undefined;
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frameHandle = 0;
    let lastVerdictAt = 0;
    let lastDrawAt = 0;
    const tick = (timestamp: number): void => {
      const minInterval = reducedMotion ? 250 : 0;
      if (timestamp - lastDrawAt >= minInterval) {
        lastDrawAt = timestamp;
        const frame = readRef.current();
        const canvas = canvasRef.current;
        if (canvas !== null) drawFrame(canvas, frame);
        /* Text updates at a readable cadence, not the frame rate. */
        if (timestamp - lastVerdictAt >= 180) {
          lastVerdictAt = timestamp;
          setVerdict(computeAnalyzerVerdict(frame, expectationRef.current));
          setDetected(
            (frame?.notes ?? [])
              .slice(0, 6)
              .map(
                (note) =>
                  `${noteName(note.midiPitch)} ${note.centsDeviation >= 0 ? "+" : ""}${note.centsDeviation.toFixed(0)}¢`,
              ),
          );
        }
      }
      frameHandle = window.requestAnimationFrame(tick);
    };
    frameHandle = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameHandle);
    };
  }, [active]);

  return (
    <aside
      class="studio-analyzer"
      data-active={String(active)}
      data-verdict={verdict.kind}
      aria-label="Live audio analyzer"
    >
      <header class="studio-analyzer__header">
        <span class="studio-analyzer__title">Analyzer</span>
        <span
          class="studio-analyzer__verdict"
          id="studio-analyzer-verdict"
          title={verdict.detail}
        >
          {verdict.kind === "match"
            ? "MATCH"
            : verdict.kind === "mismatch"
              ? "MISMATCH"
              : verdict.kind === "listening"
                ? "LISTENING"
                : "—"}
        </span>
      </header>
      <canvas
        ref={canvasRef}
        class="studio-analyzer__canvas"
        width={296}
        height={128}
        aria-hidden="true"
      />
      {/*
        The trailing space is load-bearing: this paragraph and the detail
        line below are adjacent in the extracted text flow, and without it
        they fuse into "…detected.No signal…".
      */}
      <p class="studio-analyzer__notes" aria-live="off">
        {detected.length === 0 ? "No notes detected. " : detected.join("  ")}
      </p>
      <p class="studio-analyzer__detail">{verdict.detail}</p>
    </aside>
  );
}

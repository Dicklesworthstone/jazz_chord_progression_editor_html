import { useEffect, useRef, useState } from "preact/hooks";

import { Button } from "../primitives";
import type { StudioDetailView } from "./studio-contract";

/**
 * The chord-detail teaching surface (jcpe-v2r-detail-yimm): the prototype's
 * Chord Detail panel on real data. Everything rendered here arrives from the
 * chart-annotation read ports; the panel computes only presentation (keyboard
 * geometry, spectrum drawing).
 *
 * OWNER LAW (2026-08-04): the keyboard's hover/click preview sounds ONLY
 * keys whose pitch class is in the selected chord. Non-chord keys carry no
 * preview handler at all and present an inert cursor — silence is structural,
 * not a guard clause.
 */

const KEYBOARD_BASE_MIDI = 60;
const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const;
/** White-key index each black key sits after, per octave. */
const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5] as const;

/** Log-frequency axis bounds, matching the prototype's spectrum. */
const SPECTRUM_MIN_HZ = 55;
const SPECTRUM_MAX_HZ = 9000;
const SPECTRUM_LOG_SPAN = Math.log2(SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ);
const SPECTRUM_PARTIALS = 14;
const SPECTRUM_ROLLOFF = -1.18;

function hzOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

type SpectrumNote = Readonly<{ midi: number; amp: number }>;

function addSeries(
  magnitudes: Float32Array,
  width: number,
  note: SpectrumNote,
): void {
  const fundamental = hzOf(note.midi);
  for (let partial = 1; partial <= SPECTRUM_PARTIALS; partial += 1) {
    const frequency = fundamental * partial;
    if (frequency > SPECTRUM_MAX_HZ) break;
    const center =
      (Math.log2(frequency / SPECTRUM_MIN_HZ) / SPECTRUM_LOG_SPAN) * width;
    const amplitude = note.amp * partial ** SPECTRUM_ROLLOFF;
    const sigma = Math.max(2.4, width * 0.0055);
    const from = Math.max(0, Math.floor(center - 4 * sigma));
    const to = Math.min(width, Math.ceil(center + 4 * sigma));
    for (let x = from; x < to; x += 1) {
      const distance = x - center;
      magnitudes[x] =
        (magnitudes[x] ?? 0) +
        amplitude * Math.exp(-(distance * distance) / (2 * sigma * sigma));
    }
  }
}

function tracePath(
  context: CanvasRenderingContext2D,
  magnitudes: Float32Array,
  width: number,
  height: number,
  peak: number,
): void {
  context.beginPath();
  context.moveTo(0, height);
  for (let x = 0; x < width; x += 1) {
    const value = Math.min(1, (magnitudes[x] ?? 0) / peak);
    context.lineTo(x, height - value ** 0.78 * (height - 12) - 1);
  }
  context.lineTo(width - 1, height);
  context.closePath();
}

/**
 * A display voicing for the spectrum: the root in the bass octave, every
 * chord tone in the keyboard octave — the same presentation-only shape the
 * reviewed prototype drew. It is a picture of the chord's harmonic content,
 * never the transport's actual voicing.
 */
function spectrumNotes(
  tones: StudioDetailView["tones"],
): readonly SpectrumNote[] {
  const notes: SpectrumNote[] = [];
  tones.forEach((tone, index) => {
    if (index === 0) {
      notes.push({ midi: 36 + tone.pitchClass, amp: 1.15 });
      return;
    }
    notes.push({ midi: KEYBOARD_BASE_MIDI + tone.pitchClass, amp: 0.9 });
  });
  return notes;
}

function SpectrumCanvas({
  detail,
  hoverMidi,
}: Readonly<{ detail: StudioDetailView; hoverMidi: number | null }>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    /* Octave grid: C1..C8 that land inside the axis. The inset is a fixed
       DAW-dark picture in both themes, so its colors are literal. */
    context.strokeStyle = "rgba(251, 248, 241, 0.07)";
    context.lineWidth = 1;
    context.font = "8px Archivo, sans-serif";
    context.fillStyle = "rgba(251, 248, 241, 0.26)";
    for (let octave = 1; octave <= 8; octave += 1) {
      const frequency = 32.703 * 2 ** octave;
      if (frequency < SPECTRUM_MIN_HZ || frequency > SPECTRUM_MAX_HZ) continue;
      const x =
        Math.round(
          (Math.log2(frequency / SPECTRUM_MIN_HZ) / SPECTRUM_LOG_SPAN) * width,
        ) + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height - 9);
      context.stroke();
      context.fillText(`C${String(octave)}`, x + 3, height - 3);
    }

    const notes = spectrumNotes(detail.tones);
    if (notes.length === 0) return;
    const magnitudes = new Float32Array(width);
    for (const note of notes) addSeries(magnitudes, width, note);
    let peak = 0;
    for (let x = 0; x < width; x += 1) {
      const value = magnitudes[x] ?? 0;
      if (value > peak) peak = value;
    }
    if (peak <= 0) return;

    const gradient = context.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, "rgba(178, 58, 42, 0.95)");
    gradient.addColorStop(0.42, "rgba(196, 104, 52, 0.9)");
    gradient.addColorStop(0.78, "rgba(226, 168, 86, 0.85)");
    gradient.addColorStop(1, "rgba(246, 226, 168, 0.95)");
    tracePath(context, magnitudes, width, height, peak);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "rgba(246, 226, 168, 0.5)";
    context.lineWidth = 1;
    context.stroke();

    if (hoverMidi !== null) {
      const hovered = new Float32Array(width);
      addSeries(hovered, width, { midi: hoverMidi, amp: 1 });
      tracePath(context, hovered, width, height, peak);
      context.fillStyle = "rgba(127, 168, 232, 0.42)";
      context.fill();
      context.strokeStyle = "rgba(180, 214, 255, 0.95)";
      context.lineWidth = 1.4;
      context.stroke();
    }

    /* Fundamental markers with names. */
    context.font = "600 9px Archivo, sans-serif";
    notes.forEach((note, index) => {
      const x =
        (Math.log2(hzOf(note.midi) / SPECTRUM_MIN_HZ) / SPECTRUM_LOG_SPAN) *
        width;
      const tone = detail.tones[index];
      if (tone === undefined) return;
      const isHover = hoverMidi === note.midi;
      context.strokeStyle = isHover
        ? "rgba(180, 214, 255, 0.95)"
        : tone.guide
          ? "rgba(255, 196, 182, 0.7)"
          : "rgba(251, 248, 241, 0.34)";
      context.lineWidth = isHover ? 1.4 : 1;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 9);
      context.stroke();
      context.fillStyle = isHover
        ? "#DCEBFF"
        : tone.guide
          ? "#FFC9BC"
          : "rgba(251, 248, 241, 0.62)";
      context.fillText(tone.name, x + 3, 9);
    });
  }, [detail, hoverMidi]);

  return (
    <div class="studio-detail-spectrum">
      <canvas
        ref={(element) => {
          canvasRef.current = element;
        }}
        aria-label="Harmonic spectrum of the selected chord"
      />
    </div>
  );
}

export type ChordDetailPanelProps = Readonly<{
  detail: StudioDetailView;
  context: "rail" | "sheet";
  onAddSuggestedChord: (symbolText: string) => void;
  onPreviewPitch: (midiPitch: number) => void;
}>;

/** Split an engraved symbol into root letter, accidental glyphs, and rest. */
function splitSymbol(symbolText: string): {
  head: string;
  accidental: string;
  rest: string;
} {
  const match = /^([A-G])([♭♯#b]*)(.*)$/u.exec(symbolText);
  if (match === null) return { head: symbolText, accidental: "", rest: "" };
  return {
    head: match[1] ?? symbolText,
    accidental: (match[2] ?? "").replaceAll("#", "♯").replaceAll("b", "♭"),
    rest: match[3] ?? "",
  };
}

export function ChordDetailPanel({
  detail,
  context,
  onAddSuggestedChord,
  onPreviewPitch,
}: ChordDetailPanelProps) {
  const [hoverMidi, setHoverMidi] = useState<number | null>(null);
  const chordPitchClasses = new Set(
    detail.tones.map((tone) => tone.pitchClass),
  );
  const symbol = splitSymbol(detail.symbolText);

  /* A fresh selection means a fresh exploration; stale hover would light a
     note the new chord may not even contain. */
  const lastSymbol = useRef(detail.symbolText);
  if (lastSymbol.current !== detail.symbolText) {
    lastSymbol.current = detail.symbolText;
    if (hoverMidi !== null) setHoverMidi(null);
  }

  const strike = (midi: number): void => {
    setHoverMidi(midi);
    onPreviewPitch(midi);
  };
  const release = (): void => {
    setHoverMidi(null);
  };

  const whiteKeys = [0, 1].flatMap((octave) =>
    WHITE_PITCH_CLASSES.map((pitchClass, index) => ({
      id: `white-${String(octave)}-${String(index)}`,
      midi: KEYBOARD_BASE_MIDI + octave * 12 + pitchClass,
      pitchClass,
      inChord: chordPitchClasses.has(pitchClass),
      name:
        detail.tones.find((tone) => tone.pitchClass === pitchClass)?.name ?? "",
    })),
  );
  const blackKeys = [0, 1].flatMap((octave) =>
    BLACK_AFTER_WHITE.map((whiteIndex, index) => {
      const pitchClass = (WHITE_PITCH_CLASSES[whiteIndex] ?? 0) + 1;
      return {
        id: `black-${String(octave)}-${String(index)}`,
        midi: KEYBOARD_BASE_MIDI + octave * 12 + pitchClass,
        pitchClass: pitchClass % 12,
        inChord: chordPitchClasses.has(pitchClass % 12),
        name:
          detail.tones.find((tone) => tone.pitchClass === pitchClass % 12)
            ?.name ?? "",
        /* Percent offset across 14 white keys, mirroring the prototype. */
        left: `${(((octave * 7 + whiteIndex + 1) / 14) * 100 - 2.3).toFixed(2)}%`,
      };
    }),
  );

  return (
    <div class="studio-chord-detail" data-testid={`chord-detail-${context}`}>
      <header class="studio-chord-detail__head">
        <p class="studio-kicker">{detail.place}</p>
        <p class="studio-chord-detail__symbol" aria-label={detail.symbolText}>
          <span aria-hidden="true">
            {symbol.head}
            {symbol.accidental === "" ? null : (
              <span class="studio-chord-detail__accidental">
                {symbol.accidental}
              </span>
            )}
            <span class="studio-chord-detail__quality">{symbol.rest}</span>
          </span>
        </p>
        {detail.roman === null ? null : (
          <p class="studio-chord-detail__roman">{detail.roman}</p>
        )}
      </header>

      <p class="studio-chord-detail__function">{detail.functionSentence}.</p>

      <section class="studio-chord-detail__tones" aria-label="Chord tones">
        <p class="studio-kicker">Notes — hover to hear</p>
        <div class="studio-chord-detail__chips">
          {detail.tones.map((tone) => {
            const midi = KEYBOARD_BASE_MIDI + tone.pitchClass;
            const active = hoverMidi === midi;
            return (
              <button
                key={`${tone.name}-${String(tone.pitchClass)}`}
                class="studio-chord-detail__chip"
                data-active={active ? "true" : "false"}
                data-guide={tone.guide ? "true" : "false"}
                onClick={() => {
                  strike(midi);
                }}
                onMouseEnter={() => {
                  strike(midi);
                }}
                onMouseLeave={release}
                type="button"
              >
                <span class="studio-chord-detail__chip-name">{tone.name}</span>
                <span class="studio-chord-detail__chip-role">
                  {tone.role ?? "—"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/*
        The two-octave keyboard. In-chord keys are interactive buttons; the
        rest are inert spans by construction (the owner law): no handler, no
        button role, no pointer affordance — a non-chord key cannot sound.
      */}
      <div
        class="studio-chord-detail__keyboard"
        aria-label="Two-octave keyboard with the chord tones lit"
        role="img"
        onMouseLeave={release}
      >
        <div class="studio-chord-detail__whites">
          {whiteKeys.map((key) =>
            key.inChord ? (
              <button
                key={key.id}
                aria-label={`Preview ${key.name}`}
                class="studio-detail-key studio-detail-key--white"
                data-lit="true"
                onClick={() => {
                  strike(key.midi);
                }}
                onMouseEnter={() => {
                  strike(key.midi);
                }}
                type="button"
              >
                <span class="studio-detail-key__dot">{key.name}</span>
              </button>
            ) : (
              <span
                key={key.id}
                aria-hidden="true"
                class="studio-detail-key studio-detail-key--white"
                data-lit="false"
              />
            ),
          )}
        </div>
        {blackKeys.map((key) =>
          key.inChord ? (
            <button
              key={key.id}
              aria-label={`Preview ${key.name}`}
              class="studio-detail-key studio-detail-key--black"
              data-lit="true"
              onClick={() => {
                strike(key.midi);
              }}
              onMouseEnter={() => {
                strike(key.midi);
              }}
              style={`inset-inline-start: ${key.left}`}
              type="button"
            >
              <span class="studio-detail-key__dot">{key.name}</span>
            </button>
          ) : (
            <span
              key={key.id}
              aria-hidden="true"
              class="studio-detail-key studio-detail-key--black"
              data-lit="false"
              style={`inset-inline-start: ${key.left}`}
            />
          ),
        )}
      </div>

      <SpectrumCanvas detail={detail} hoverMidi={hoverMidi} />

      {detail.scaleSentence === null ? null : (
        <section class="studio-chord-detail__fact">
          <p class="studio-kicker">Scale to play over it</p>
          <p class="studio-chord-detail__fact-value">{detail.scaleSentence}</p>
        </section>
      )}

      {detail.guideToneNames.length === 0 ? null : (
        <section class="studio-chord-detail__fact">
          <p class="studio-kicker">Guide tones</p>
          <p class="studio-chord-detail__fact-value">
            {detail.guideToneNames.join("  and  ")}
          </p>
          <p class="studio-chord-detail__fact-note">
            The third and seventh. These two carry the voice leading into the
            next chord.
          </p>
        </section>
      )}

      {detail.resolution === null ? null : (
        <section class="studio-chord-detail__resolution">
          <p class="studio-kicker">
            Moving into {detail.resolution.targetSymbol}
          </p>
          <div class="studio-chord-detail__moves">
            {detail.resolution.moves.map((move) => (
              <span
                key={`${move.fromName}-${move.toName}`}
                class="studio-chord-detail__move"
              >
                <span>{move.fromName}</span>
                <span
                  aria-hidden="true"
                  class="studio-chord-detail__move-arrow"
                >
                  {move.held ? "=" : "→"}
                </span>
                <span>{move.toName}</span>
              </span>
            ))}
          </div>
          <p class="studio-chord-detail__fact-note">
            {detail.resolution.note}.
          </p>
        </section>
      )}

      {detail.next.length === 0 ? null : (
        <section class="studio-chord-detail__next">
          <p class="studio-kicker">What could come next</p>
          <p class="studio-chord-detail__fact-note">Options, not answers.</p>
          <ul class="studio-chord-detail__next-list">
            {detail.next.map((option) => (
              <li key={option.id} class="studio-chord-detail__next-row">
                <div class="studio-chord-detail__next-head">
                  <span class="studio-chord-detail__next-symbol">
                    {option.symbolText}
                  </span>
                  {option.roman === null ? null : (
                    <span class="studio-chord-detail__next-roman">
                      {option.roman}
                    </span>
                  )}
                  <Button
                    busy={false}
                    density="dense"
                    describedBy={[]}
                    disabled={false}
                    id={`studio-detail-insert-${context}-${option.id.replace(/[^a-zA-Z0-9-]/g, "-")}`}
                    invalid={false}
                    label={`Insert ${option.symbolText}`}
                    onAction={() => {
                      onAddSuggestedChord(option.symbolText);
                    }}
                    type="button"
                    variant="secondary"
                  />
                </div>
                <p class="studio-chord-detail__next-why">{option.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

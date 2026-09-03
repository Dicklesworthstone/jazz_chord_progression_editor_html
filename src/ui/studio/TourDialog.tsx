/**
 * The four-step tour (jcpe-v2r-tour-i504): the prototype's "How this works"
 * walkthrough adapted to the keys and gestures this build actually ships.
 * Each step is illustrated with a small engraved fragment built from real
 * markup and the chart's own tokens — never a screenshot, never an emoji —
 * so the pictures stay honest in both themes and forced colors.
 */
import type { JSX } from "preact";

export type TourStep = Readonly<{
  numeral: string;
  title: string;
  body: string;
  illustration: () => JSX.Element;
}>;

function EntryIllustration() {
  return (
    <div class="studio-tour-figure studio-tour-figure--entry" aria-hidden="true">
      <div class="studio-tour-figure__bar">
        <span class="studio-tour-figure__symbol">
          Dm<sup>7</sup>
        </span>
        <span class="studio-tour-figure__slashes">/ / / /</span>
      </div>
      <div class="studio-tour-figure__bar studio-tour-figure__bar--divided">
        <span class="studio-tour-figure__symbol studio-tour-figure__symbol--editing">
          G7
        </span>
        <span class="studio-tour-figure__caret" />
      </div>
    </div>
  );
}

function DragIllustration() {
  return (
    <div class="studio-tour-figure studio-tour-figure--drag" aria-hidden="true">
      <div class="studio-tour-figure__bar">
        <span class="studio-tour-figure__symbol">
          G<sup>7</sup>
        </span>
      </div>
      <div class="studio-tour-figure__bar studio-tour-figure__bar--divided studio-tour-figure__bar--target">
        <span class="studio-tour-figure__symbol studio-tour-figure__symbol--quiet">
          C<sup>maj7</sup>
        </span>
      </div>
      <span class="studio-tour-figure__ghost">
        Dm<sup>7</sup>
      </span>
    </div>
  );
}

function AnalysisIllustration() {
  return (
    <div class="studio-tour-figure studio-tour-figure--analysis" aria-hidden="true">
      <div class="studio-tour-figure__row">
        {(
          [
            ["Dm", "7", "ii7"],
            ["G", "7", "V7"],
            ["C", "maj7", "Imaj7"],
          ] as const
        ).map(([root, quality, roman]) => (
          <div class="studio-tour-figure__cell" key={roman}>
            <span class="studio-tour-figure__symbol">
              {root}
              <sup>{quality}</sup>
            </span>
            <span class="studio-tour-figure__roman">{roman}</span>
          </div>
        ))}
      </div>
      <div class="studio-tour-figure__bracket">
        <span class="studio-tour-figure__bracket-line" />
        <span class="studio-tour-figure__bracket-label">ii–V–I in C</span>
      </div>
    </div>
  );
}

function PlayIllustration() {
  return (
    <div class="studio-tour-figure studio-tour-figure--play" aria-hidden="true">
      <span class="studio-tour-figure__transport-key studio-tour-figure__transport-key--play">
        ▶
      </span>
      <span class="studio-tour-figure__transport-label">space</span>
      <span class="studio-tour-figure__meter">
        {[30, 62, 96, 54, 74, 34, 18].map((height, index) => (
          <span
            class="studio-tour-figure__meter-bar"
            data-hot={height > 50 ? "true" : "false"}
            key={index}
            style={`--tour-bar-height: ${String(height)}%`}
          />
        ))}
      </span>
    </div>
  );
}

export const TOUR_STEPS: readonly TourStep[] = Object.freeze([
  Object.freeze({
    numeral: "i",
    title: "Put chords on the page",
    body:
      "Double-click any chord (or press Enter on it) and type the symbol — "
      + "Tab commits and moves to the next one. Or press ⌘K and type a whole "
      + "chart: | Dm7 G7 | Cmaj7 |",
    illustration: EntryIllustration,
  }),
  Object.freeze({
    numeral: "ii",
    title: "Move measures by dragging",
    body:
      "Drag a chord and the bundle floats with you while the bar under the "
      + "pointer lifts to receive it — one undoable step. To split a shared "
      + "bar apart, select it and press the cut mark on the dashed line.",
    illustration: DragIllustration,
  }),
  Object.freeze({
    numeral: "iii",
    title: "Read the analysis",
    body:
      "Set a key by pressing the Key block on the paper. Numerals appear "
      + "under the chords, brackets mark the phrases, and the panel on the "
      + "right explains the selected chord — notes, scale, guide tones.",
    illustration: AnalysisIllustration,
  }),
  Object.freeze({
    numeral: "iv",
    title: "Play it back",
    body:
      "Space plays and pauses. Step through chords with the arrows, drag "
      + "the tempo, pick a groove and an instrument, and watch the spectrum "
      + "breathe while it sounds.",
    illustration: PlayIllustration,
  }),
]);

export type TourDialogContentProps = Readonly<{
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
  /**
   * The last step's call to action. When the chart can play, the shell
   * passes the real Play dispatch so "Start playing" keeps its promise —
   * the click is a genuine trusted pointer gesture. With nothing to play,
   * the shell passes a plain close and the label says "Done" instead:
   * the button never promises sound it cannot make.
   */
  onFinish: () => void;
  finishLabel: string;
}>;

export function TourDialogContent({
  step,
  onStepChange,
  onClose,
  onFinish,
  finishLabel,
}: TourDialogContentProps) {
  const active = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  if (active === undefined) return null;
  const last = step >= TOUR_STEPS.length - 1;
  const Illustration = active.illustration;
  return (
    <div class="studio-tour">
      <div class="studio-tour__head">
        <span class="studio-tour__numeral">{active.numeral}</span>
        <h3 class="studio-tour__title">{active.title}</h3>
      </div>
      <p class="studio-tour__body">{active.body}</p>
      <div class="studio-tour__stage">
        <Illustration />
      </div>
      <div class="studio-tour__footer">
        <div class="studio-tour__dots" role="group" aria-label="Tour steps">
          {TOUR_STEPS.map((candidate, index) => (
            <button
              aria-label={`Step ${candidate.numeral}`}
              class="studio-tour__dot"
              data-active={index === step ? "true" : "false"}
              key={candidate.numeral}
              onClick={() => {
                onStepChange(index);
              }}
              type="button"
            />
          ))}
        </div>
        <span class="studio-tour__spacer" />
        <button
          class="studio-tour__skip"
          id="studio-tour-skip"
          onClick={onClose}
          type="button"
        >
          Skip
        </button>
        {step > 0 ? (
          <button
            class="studio-tour__back"
            id="studio-tour-back"
            onClick={() => {
              onStepChange(step - 1);
            }}
            type="button"
          >
            Back
          </button>
        ) : null}
        <button
          class="studio-tour__next"
          id="studio-tour-next"
          onClick={() => {
            if (last) onFinish();
            else onStepChange(step + 1);
          }}
          type="button"
        >
          {last ? finishLabel : "Next"}
        </button>
      </div>
    </div>
  );
}

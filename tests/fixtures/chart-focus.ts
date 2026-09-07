/** Independently calculated CSS-pixel anchors, before the presentation helper. */
export const CHART_FOCUS_ANCHORS = [
  { name: "unchanged", scroll: 120, before: 32, after: 32, maximum: 500, expected: 120 },
  { name: "anchor moves down", scroll: 120, before: 32, after: 72, maximum: 500, expected: 160 },
  { name: "anchor moves up", scroll: 120, before: 100, after: 20, maximum: 500, expected: 40 },
  { name: "lower boundary", scroll: 30, before: 120, after: 0, maximum: 500, expected: 0 },
  { name: "upper boundary", scroll: 220, before: 20, after: 80, maximum: 240, expected: 240 },
  { name: "fractional CSS pixels", scroll: 120.5, before: 20.25, after: 10.75, maximum: 500, expected: 111 },
  { name: "fractional result", scroll: 120.5, before: 20.25, after: 11, maximum: 500, expected: 111.25 },
  { name: "all content fits", scroll: 50, before: 50, after: 40, maximum: 0, expected: 0 },
  { name: "one pixel below maximum", scroll: 239, before: 20, after: 20, maximum: 240, expected: 239 },
  { name: "exact maximum", scroll: 240, before: 20, after: 20, maximum: 240, expected: 240 },
  { name: "one pixel beyond maximum", scroll: 241, before: 20, after: 20, maximum: 240, expected: 240 },
] as const;

export const CHART_FOCUS_PROFILES = [
  { width: 1440, height: 1000, touch: false },
  { width: 320, height: 568, touch: true },
  { width: 390, height: 844, touch: true },
] as const;

export const CHART_FOCUS_OBLIGATIONS = [
  ["toggle", "Same focused toggle enters Focus chart and visibly exits with Exit focus; no Fullscreen prerequisite."],
  ["document", "Exact chart IDs, spelling, pitch arrays, rational time, selection, history and revision do not change."],
  ["draft", "Existing field node, raw value and caret survive toggling; normal modal focus ownership has priority."],
  ["scroll", "Top stays at top; otherwise retain the first visible measure and offset, clamped to the new scroll range."],
  ["transport", "Playback position, loop, Play/Pause and Stop remain reachable; toggling neither rebuilds nor stops audio."],
  ["panels", "Named Library and Harmony controls use existing sheets and restore focus to their visible trigger."],
  ["recovery", "Recovery remains readable and actionable, with dialog focus ownership ahead of background controls."],
  ["layout", "Desktop, 320x568, 390x844 and 200% layout retain a whole chord and reachable Stop and Exit."],
  ["preference", "Session-only state adds no persistence operation; unavailable storage cannot block the toggle."],
  ["ownership", "No duplicate chart, DOM IDs, landmarks or native listeners; reduced motion remains respected."],
] as const;

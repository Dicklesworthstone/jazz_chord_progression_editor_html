/**
 * U4 transport-controls and truthful audio-status contract.
 *
 * This module is the code-facing U4 authority. It declares the transport
 * control surface, its bounded public values, the closed operation
 * inventory, the total status-enablement laws, and the exact application
 * channel each operation is allowed to use. It contains no DOM access, no
 * Preact import, and no application or audio import: U4 adds no transport
 * or mutation channel of its own, so the bindings to X1 and A0 are declared
 * as reviewed literal strings and proved against the live tuples by the
 * static contract test.
 *
 * The independent expectations live under `tests/fixtures/transport-controls/`.
 * Production components may be compared with those fixtures; they may never
 * generate, rewrite, or bless their expectations.
 */

export const U4_TRANSPORT_CONTROLS_CONTRACT_SCHEMA =
  "changes.ui.u4-transport-controls-contract.v1";
export const U4_TRANSPORT_CONTROLS_PACKAGE = "U4";
export const U4_TRANSPORT_CONTROLS_POLICY_ID = "changes.ui.transport-controls";
export const U4_TRANSPORT_CONTROLS_POLICY_VERSION = 1;
export const U4_TRANSPORT_CONTROLS_BEAD_ID =
  "jcpe-milestone-reliable-studio-l3a.12.1";

/**
 * The code-facing status of the U4 surface. No U4 production component is
 * claimed by this packet; moving this value requires the recorded human
 * acceptance owned by the U4 verify leg.
 */
export const U4_TRANSPORT_CONTROLS_IMPLEMENTATION_STATUS =
  "specified-not-implemented";

/* -------------------------------------------------------------------------- */
/* Frozen upstream bindings (reviewed literals; proved by the static test)     */
/* -------------------------------------------------------------------------- */

/** Mirrors `TRANSPORT_STATES` in `src/audio/transport-contract.ts`. */
export const U4_X1_TRANSPORT_STATES = /* @__PURE__ */ Object.freeze([
  "locked",
  "ready",
  "playing",
  "paused",
  "interrupted",
  "fault",
  "disposed",
] as const);

/** Mirrors `APPLICATION_TRANSPORT_STATUSES` in the A0 state contract. */
export const U4_A0_TRANSPORT_STATUSES = /* @__PURE__ */ Object.freeze([
  "unavailable",
  "ready",
  "starting",
  "playing",
  "paused",
  "stopping",
  "failed",
] as const);

export type U4TransportStatus = (typeof U4_A0_TRANSPORT_STATUSES)[number];

/**
 * The X1 command kinds U4 operations rely on the controller to issue. A
 * subset of `TRANSPORT_COMMAND_KINDS`; preview commands belong to the chord
 * preview surface, and `replace-plan` belongs to document replacement.
 */
export const U4_X1_COMMAND_KINDS_CONSUMED = /* @__PURE__ */ Object.freeze([
  "initialize-transport",
  "play",
  "pause",
  "resume",
  "seek",
  "stop",
  "set-tempo",
  "set-loop",
  "set-performance",
  "set-instrument",
  "set-mix",
  "set-count-in",
  "set-metronome",
  "dispose-transport",
] as const);

/**
 * U4 dispatches no A0 ephemeral intent directly: every effect crosses one
 * controller intent. The complete A0 `EphemeralIntent` union is pinned as
 * forbidden so a future implementation cannot smuggle a channel in.
 */
export const U4_AUTHORIZED_EPHEMERAL_INTENT_KINDS = /* @__PURE__ */ Object.freeze(
  [] as const,
);
export const U4_FORBIDDEN_EPHEMERAL_INTENT_KINDS = /* @__PURE__ */ Object.freeze([
  "set-bookmarks",
  "set-panels",
  "push-dialog",
  "pop-dialog",
  "set-quick-entry",
  "set-import-draft",
  "dismiss-notice",
  "mark-exported",
  "set-recovery",
  "set-document-transition",
  "expect-transport",
  "settle-transport-expectation",
  "acknowledge-focus",
] as const);

/* -------------------------------------------------------------------------- */
/* Surfaces and components                                                     */
/* -------------------------------------------------------------------------- */

export const U4_TRANSPORT_SURFACES = /* @__PURE__ */ Object.freeze([
  "transport-bar",
  "status",
  "settings",
  "scope",
] as const);

export type U4TransportSurface = (typeof U4_TRANSPORT_SURFACES)[number];

export const U4_COMPONENT_INVENTORY = /* @__PURE__ */ Object.freeze([
  { id: "U4-CMP-001", name: "TransportBar", surface: "transport-bar" },
  { id: "U4-CMP-002", name: "TransportPlayButton", surface: "transport-bar" },
  { id: "U4-CMP-003", name: "TransportPauseButton", surface: "transport-bar" },
  { id: "U4-CMP-004", name: "TransportStopButton", surface: "transport-bar" },
  { id: "U4-CMP-005", name: "TransportRestartButton", surface: "transport-bar" },
  { id: "U4-CMP-006", name: "TransportPreviousButton", surface: "transport-bar" },
  { id: "U4-CMP-007", name: "TransportNextButton", surface: "transport-bar" },
  { id: "U4-CMP-008", name: "TransportScrubSlider", surface: "transport-bar" },
  { id: "U4-CMP-009", name: "TransportLoopToggle", surface: "transport-bar" },
  {
    id: "U4-CMP-010",
    name: "TransportLoopRegionOverlay",
    surface: "transport-bar",
  },
  { id: "U4-CMP-011", name: "TransportNowBlock", surface: "transport-bar" },
  { id: "U4-CMP-012", name: "TransportMeterStrip", surface: "transport-bar" },
  { id: "U4-CMP-013", name: "TransportStatusBadge", surface: "status" },
  { id: "U4-CMP-014", name: "TransportStatusDetail", surface: "status" },
  {
    id: "U4-CMP-015",
    name: "TransportInstrumentBoundaryNotice",
    surface: "status",
  },
  { id: "U4-CMP-016", name: "TransportTempoStepper", surface: "settings" },
  { id: "U4-CMP-017", name: "TransportTempoField", surface: "settings" },
  { id: "U4-CMP-018", name: "TransportGrooveSelect", surface: "settings" },
  { id: "U4-CMP-019", name: "TransportInstrumentSelect", surface: "settings" },
  { id: "U4-CMP-020", name: "TransportClickToggles", surface: "settings" },
  { id: "U4-CMP-021", name: "SectionLoopButton", surface: "scope" },
  { id: "U4-CMP-022", name: "SoundSheetTrigger", surface: "scope" },
] as const);

export type U4ComponentContract = (typeof U4_COMPONENT_INVENTORY)[number];
export type U4ComponentId = U4ComponentContract["id"];

export const U4_COMPONENT_COUNT = 22;

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every bound is inherited from an upstream contract or derived from one.
 * The seek quantum is the X1 display playhead's 960 PPQ; the tempo range is
 * the domain tempo range the studio clamps to today.
 */
export const U4_TRANSPORT_LIMITS = /* @__PURE__ */ Object.freeze({
  seekQuantumTicksPerBeat: 960,
  minTempoBpm: 20,
  maxTempoBpm: 300,
  tempoStepBpm: 4,
  maxStatusDetailCodePoints: 256,
  maxBoundaryNoticeCodePoints: 128,
  maxOperations: 24,
  maxComponents: 22,
  maxArmedSectionScopes: 1,
  coarsePointerMinTargetCssPx: 44,
  transportMinBlockDefaultRem: 4.5,
  transportMinBlockCoarseRem: 6,
  settingsSheetBreakpointRem: 71.875,
} as const);

/* -------------------------------------------------------------------------- */
/* Status presentation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The truthful badge projection. One row per A0 status, with the
 * interruption row distinguished by the stable X1 failure code. Labels and
 * details are the exact strings the status block renders.
 */
export const U4_STATUS_PRESENTATION = /* @__PURE__ */ Object.freeze([
  {
    status: "unavailable",
    failureCode: null,
    badgeLabel: "Audio unavailable",
    detailKind: "recovery-actionable",
  },
  {
    status: "ready",
    failureCode: null,
    badgeLabel: "Ready",
    detailKind: "bound-plan-or-empty",
  },
  {
    status: "starting",
    failureCode: null,
    badgeLabel: "Starting…",
    detailKind: "none",
  },
  {
    status: "playing",
    failureCode: null,
    badgeLabel: "Playing",
    detailKind: "now-chord-and-exact-beat",
  },
  {
    status: "paused",
    failureCode: null,
    badgeLabel: "Paused",
    detailKind: "paused-at-exact-beat",
  },
  {
    status: "paused",
    failureCode: "transport.interrupted",
    badgeLabel: "Interrupted",
    detailKind: "trusted-gesture-resume",
  },
  {
    status: "stopping",
    failureCode: null,
    badgeLabel: "Stopping…",
    detailKind: "none",
  },
  {
    status: "failed",
    failureCode: null,
    badgeLabel: "Audio fault",
    detailKind: "fault-code-and-recovery",
  },
] as const);

export type U4StatusPresentation = (typeof U4_STATUS_PRESENTATION)[number];

/** The instrument/groove change boundary statements (§7 of the doc). */
export const U4_BOUNDARY_STATEMENTS = /* @__PURE__ */ Object.freeze({
  whilePlaying: "Takes effect at the next unstarted note",
  whileStopped: "Applies to the next Play.",
} as const);

/* -------------------------------------------------------------------------- */
/* Disabled reasons                                                            */
/* -------------------------------------------------------------------------- */

export const U4_CONTROL_DISABLED_REASONS = /* @__PURE__ */ Object.freeze([
  "untrusted-gesture",
  "no-playable-chord",
  "no-bound-plan",
  "audio-unavailable",
  "not-running",
  "no-active-run",
  "seek-out-of-range",
  "status-settling",
] as const);

export type U4ControlDisabledReason =
  (typeof U4_CONTROL_DISABLED_REASONS)[number];

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

export const U4_OPERATION_CHANNELS = /* @__PURE__ */ Object.freeze([
  "controller-intent",
  "presentation-only",
] as const);

export type U4OperationChannel = (typeof U4_OPERATION_CHANNELS)[number];

export type U4OperationContract = Readonly<{
  id: string;
  label: string;
  component: U4ComponentId;
  channel: U4OperationChannel;
  /** The one StudioController method the row may invoke; null when presentation-only. */
  controllerIntent: string | null;
  /** X1 command kinds the controller intent relies on; empty when none. */
  x1CommandKinds: readonly string[];
  requiresTrustedGesture: boolean;
  keyboardAccess: string;
  pointerAlternative: string;
}>;

export const U4_TRANSPORT_OPERATIONS: readonly U4OperationContract[] =
  /* @__PURE__ */ Object.freeze([
    {
      id: "play-run",
      label: "Play",
      component: "U4-CMP-002",
      channel: "controller-intent",
      controllerIntent: "playProgression",
      x1CommandKinds: ["initialize-transport", "play"],
      requiresTrustedGesture: true,
      keyboardAccess: "global-space",
      pointerAlternative: "button-activation",
    },
    {
      id: "pause-run",
      label: "Pause",
      component: "U4-CMP-003",
      channel: "controller-intent",
      controllerIntent: "pauseProgression",
      x1CommandKinds: ["pause"],
      requiresTrustedGesture: false,
      keyboardAccess: "global-space",
      pointerAlternative: "button-activation",
    },
    {
      id: "stop-run",
      label: "Stop",
      component: "U4-CMP-004",
      channel: "controller-intent",
      controllerIntent: "stopProgression",
      x1CommandKinds: ["stop"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "restart-run",
      label: "Restart",
      component: "U4-CMP-005",
      channel: "controller-intent",
      controllerIntent: "restartProgression",
      x1CommandKinds: ["stop", "play"],
      requiresTrustedGesture: true,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "resume-from-interruption",
      label: "Resume",
      component: "U4-CMP-013",
      channel: "controller-intent",
      controllerIntent: "resumeProgression",
      x1CommandKinds: ["resume"],
      requiresTrustedGesture: true,
      keyboardAccess: "global-space",
      pointerAlternative: "status-action-activation",
    },
    {
      id: "reinitialize-audio",
      label: "Restart audio",
      component: "U4-CMP-014",
      channel: "controller-intent",
      controllerIntent: "reinitializeAudio",
      x1CommandKinds: ["initialize-transport"],
      requiresTrustedGesture: true,
      keyboardAccess: "status-action-focus-enter",
      pointerAlternative: "status-action-activation",
    },
    {
      id: "previous-chord",
      label: "Previous chord",
      component: "U4-CMP-006",
      channel: "controller-intent",
      controllerIntent: "stepChordOrSeek",
      x1CommandKinds: ["seek"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "next-chord",
      label: "Next chord",
      component: "U4-CMP-007",
      channel: "controller-intent",
      controllerIntent: "stepChordOrSeek",
      x1CommandKinds: ["seek"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "scrub-pointer-seek",
      label: "Seek",
      component: "U4-CMP-008",
      channel: "controller-intent",
      controllerIntent: "seekToBeat",
      x1CommandKinds: ["seek"],
      requiresTrustedGesture: false,
      keyboardAccess: "slider-keys",
      pointerAlternative: "slider-drag",
    },
    {
      id: "scrub-keyboard-seek",
      label: "Seek by key",
      component: "U4-CMP-008",
      channel: "controller-intent",
      controllerIntent: "seekToBeat",
      x1CommandKinds: ["seek"],
      requiresTrustedGesture: false,
      keyboardAccess: "slider-keys",
      pointerAlternative: "slider-drag",
    },
    {
      id: "tempo-step-down",
      label: "Slow down",
      component: "U4-CMP-016",
      channel: "controller-intent",
      controllerIntent: "setTempo",
      x1CommandKinds: ["set-tempo"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "tempo-step-up",
      label: "Speed up",
      component: "U4-CMP-016",
      channel: "controller-intent",
      controllerIntent: "setTempo",
      x1CommandKinds: ["set-tempo"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "tempo-exact-commit",
      label: "Set tempo",
      component: "U4-CMP-017",
      channel: "controller-intent",
      controllerIntent: "setTempo",
      x1CommandKinds: ["set-tempo"],
      requiresTrustedGesture: false,
      keyboardAccess: "text-entry-commit",
      pointerAlternative: "text-entry-commit",
    },
    {
      id: "groove-change",
      label: "Groove",
      component: "U4-CMP-018",
      channel: "controller-intent",
      controllerIntent: "setPerformanceStyle",
      x1CommandKinds: ["set-performance"],
      requiresTrustedGesture: false,
      keyboardAccess: "select-keys",
      pointerAlternative: "select-activation",
    },
    {
      id: "instrument-change",
      label: "Instrument",
      component: "U4-CMP-019",
      channel: "controller-intent",
      controllerIntent: "setInstrument",
      x1CommandKinds: ["set-instrument"],
      requiresTrustedGesture: false,
      keyboardAccess: "select-keys",
      pointerAlternative: "select-activation",
    },
    {
      id: "volume-preview",
      label: "Preview volume",
      component: "U4-CMP-016",
      channel: "controller-intent",
      controllerIntent: "previewMasterVolume",
      x1CommandKinds: ["set-mix"],
      requiresTrustedGesture: false,
      keyboardAccess: "slider-keys",
      pointerAlternative: "slider-drag",
    },
    {
      id: "volume-commit",
      label: "Set volume",
      component: "U4-CMP-016",
      channel: "controller-intent",
      controllerIntent: "setMasterVolume",
      x1CommandKinds: ["set-mix"],
      requiresTrustedGesture: false,
      keyboardAccess: "slider-keys",
      pointerAlternative: "slider-drag",
    },
    {
      id: "mute-toggle",
      label: "Mute",
      component: "U4-CMP-016",
      channel: "controller-intent",
      controllerIntent: "toggleMute",
      x1CommandKinds: ["set-mix"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "loop-toggle-chart",
      label: "Loop chart",
      component: "U4-CMP-009",
      channel: "controller-intent",
      controllerIntent: "toggleLoop",
      x1CommandKinds: ["set-loop"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "loop-arm-section",
      label: "Loop section",
      component: "U4-CMP-021",
      channel: "controller-intent",
      controllerIntent: "armSectionLoop",
      x1CommandKinds: ["set-loop"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "count-in-toggle",
      label: "Count-in",
      component: "U4-CMP-020",
      channel: "controller-intent",
      controllerIntent: "setCountInEnabled",
      x1CommandKinds: ["set-count-in"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "metronome-toggle",
      label: "Metronome",
      component: "U4-CMP-020",
      channel: "controller-intent",
      controllerIntent: "setMetronomeEnabled",
      x1CommandKinds: ["set-metronome"],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "open-sound-sheet",
      label: "Sound",
      component: "U4-CMP-022",
      channel: "controller-intent",
      controllerIntent: "openSoundSheet",
      x1CommandKinds: [],
      requiresTrustedGesture: false,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "section-play",
      label: "Play section",
      component: "U4-CMP-021",
      channel: "controller-intent",
      controllerIntent: "playSectionRun",
      x1CommandKinds: ["set-loop", "play"],
      requiresTrustedGesture: true,
      keyboardAccess: "global-shift-space",
      pointerAlternative: "none-provided-by-loop-arm-then-play",
    },
  ] as const);

export type U4OperationId = (typeof U4_TRANSPORT_OPERATIONS)[number]["id"];
export const U4_OPERATION_COUNT = 24;

/* -------------------------------------------------------------------------- */
/* Enablement laws (the matrix is recomputed by the validator)                 */
/* -------------------------------------------------------------------------- */

/**
 * The total enablement law. Given the accepted status and whether the chart
 * can play / a plan is bound / a run exists, each row resolves to `true`
 * or a named `U4_CONTROL_DISABLED_REASON`. The fixture states the expanded
 * matrix; the validator recomputes it from this law.
 */
export const U4_ENABLEMENT_LAWS = /* @__PURE__ */ Object.freeze({
  "play-run": {
    enabledStatuses: ["ready", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      playing: "not-running",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "pause-run": {
    enabledStatuses: ["playing"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      ready: "not-running",
      starting: "status-settling",
      paused: "not-running",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "stop-run": {
    enabledStatuses: ["playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      ready: "no-active-run",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "restart-run": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "resume-from-interruption": {
    enabledStatuses: ["paused"],
    needsCanPlay: false,
    onlyWhenFailureCode: "transport.interrupted",
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      ready: "no-active-run",
      starting: "status-settling",
      playing: "not-running",
      paused: "no-active-run",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "reinitialize-audio": {
    enabledStatuses: ["unavailable", "failed"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      ready: "status-settling",
      starting: "status-settling",
      playing: "status-settling",
      paused: "status-settling",
      stopping: "status-settling",
    },
  },
  "previous-chord": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "next-chord": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "scrub-pointer-seek": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",

      failed: "audio-unavailable",
    },
  },
  "scrub-keyboard-seek": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "tempo-step-down": {
    enabledStatuses: ["unavailable", "ready", "playing", "paused", "failed"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      starting: "status-settling",
      stopping: "status-settling",
    },
  },
  "tempo-step-up": {
    enabledStatuses: ["unavailable", "ready", "playing", "paused", "failed"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      starting: "status-settling",
      stopping: "status-settling",
    },
  },
  "tempo-exact-commit": {
    enabledStatuses: ["unavailable", "ready", "playing", "paused", "failed"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      starting: "status-settling",
      stopping: "status-settling",
    },
  },
  "groove-change": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "instrument-change": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "volume-preview": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "volume-commit": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "mute-toggle": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "loop-toggle-chart": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "loop-arm-section": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "count-in-toggle": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "metronome-toggle": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: false,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
  "open-sound-sheet": {
    enabledStatuses: [
      "unavailable",
      "ready",
      "starting",
      "playing",
      "paused",
      "stopping",
      "failed",
    ],
    needsCanPlay: false,
    disabledReasonByStatus: {},
  },
  "section-play": {
    enabledStatuses: ["ready", "playing", "paused"],
    needsCanPlay: true,
    disabledReasonByStatus: {
      unavailable: "audio-unavailable",
      starting: "status-settling",
      stopping: "status-settling",
      failed: "audio-unavailable",
    },
  },
} as const);

/* -------------------------------------------------------------------------- */
/* Keyboard law                                                                */
/* -------------------------------------------------------------------------- */

export const U4_GLOBAL_TRANSPORT_KEYS = /* @__PURE__ */ Object.freeze([
  {
    key: "Space",
    shift: false,
    resolvesTo: ["pause-run", "play-run"],
    guard: "global-transport-guard",
  },
  {
    key: "Space",
    shift: true,
    resolvesTo: ["section-play"],
    guard: "global-transport-guard",
  },
] as const);

/** Conditions under which the global transport keys must be ignored. */
export const U4_GLOBAL_KEY_GUARD_CONDITIONS = /* @__PURE__ */ Object.freeze([
  "default-prevented",
  "modifier-held",
  "target-input",
  "target-textarea",
  "target-select",
  "target-content-editable",
  "target-inside-button-or-link",
  "slider-focus",
] as const);

export const U4_SLIDER_KEY_LAW = /* @__PURE__ */ Object.freeze({
  "ArrowLeft": "-1 beat",
  "ArrowRight": "+1 beat",
  "Shift+ArrowLeft": "-1 bar",
  "Shift+ArrowRight": "+1 bar",
  "PageDown": "-4 beats",
  "PageUp": "+4 beats",
  "Home": "beat 0",
  "End": "total beats",
} as const);


/**
 * The trusted gesture sources U4 recognizes. X1 admits
 * `initialize-transport` and interruption-recovering `resume` only with an
 * AudioUserGestureReceipt; the UI side of that law is this closed pair.
 * Declared here as the U4 authority; the static test proves the production
 * gesture plumbing accepts exactly these two sources.
 */
export const U4_TRUSTED_GESTURE_SOURCES = /* @__PURE__ */ Object.freeze([
  "trusted-pointer",
  "trusted-keyboard",
] as const);

export type U4TrustedGestureSource =
  (typeof U4_TRUSTED_GESTURE_SOURCES)[number];

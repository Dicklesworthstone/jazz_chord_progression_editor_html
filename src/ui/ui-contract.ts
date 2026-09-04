/**
 * Dependency-free, code-facing U0 UI contract.
 *
 * This module intentionally contains only types and immutable contract data.
 * Production Preact components implement these shapes; they do not import a
 * runtime component library and they never receive raw application adapters.
 */

export const UI_CONTRACT_SCHEMA = "changes.ui.u0-contract.v1";
export const UI_PRIMITIVE_MATRIX_SCHEMA =
  "changes.ui.u0-primitive-matrix.v1";
export const UI_SHELL_MATRIX_SCHEMA = "changes.ui.u0-shell-matrix.v1";
export const UI_TRACE_LEDGER_SCHEMA = "changes.ui.u0-trace-ledger.v1";
export const UI_PROVENANCE_LEDGER_SCHEMA =
  "changes.ui.u0-provenance-ledger.v1";
export const UI_CONTRACT_PACKAGE = "U0";
export const UI_CONTRACT_VERSION = 1;
export const UI_CONTRACT_BEAD_ID =
  "jcpe-milestone-reliable-studio-l3a.9.1";

export const UI_DESIGN_SYSTEM_POLICY_ID = "changes.ui.design-system";
export const UI_INTERACTION_POLICY_ID = "changes.ui.interaction";
export const UI_OVERLAY_POLICY_ID = "changes.ui.overlay";
export const UI_RESPONSIVE_SHELL_POLICY_ID =
  "changes.ui.responsive-shell";
export const UI_GALLERY_EXCLUSION_POLICY_ID =
  "changes.ui.gallery-exclusion";
export const UI_POLICY_VERSION = 1;

export const UI_COMPONENT_STATES = Object.freeze([
  "default",
  "hover",
  "active",
  "focus",
  "disabled",
  "loading",
  "error",
  "empty",
  "dense",
  "responsive",
  "forced-colors",
  "reduced-motion",
  "200-percent-zoom",
  "touch",
] as const);

export type UiComponentState = (typeof UI_COMPONENT_STATES)[number];

export const UI_CASE_KINDS = Object.freeze([
  "positive",
  "near-miss",
  "malformed",
  "limit",
  "cancellation",
  "stale",
] as const);

export type UiCaseKind = (typeof UI_CASE_KINDS)[number];

export const UI_COMPONENT_INVENTORY = Object.freeze([
  { id: "U0-CMP-001", name: "Button", family: "foundation", kind: "render" },
  { id: "U0-CMP-002", name: "IconButton", family: "foundation", kind: "render" },
  { id: "U0-CMP-003", name: "LinkButton", family: "foundation", kind: "render" },
  { id: "U0-CMP-004", name: "Badge", family: "foundation", kind: "render" },
  { id: "U0-CMP-005", name: "Kbd", family: "foundation", kind: "render" },
  { id: "U0-CMP-006", name: "Separator", family: "foundation", kind: "render" },
  { id: "U0-CMP-007", name: "Skeleton", family: "foundation", kind: "render" },
  { id: "U0-CMP-008", name: "Spinner", family: "foundation", kind: "render" },
  { id: "U0-CMP-009", name: "VisuallyHidden", family: "foundation", kind: "render" },
  { id: "U0-CMP-010", name: "Card", family: "foundation", kind: "render" },
  { id: "U0-CMP-011", name: "EmptyState", family: "foundation", kind: "render" },
  { id: "U0-CMP-012", name: "StatusPill", family: "foundation", kind: "render" },
  { id: "U0-CMP-013", name: "Progress", family: "foundation", kind: "render" },
  { id: "U0-CMP-014", name: "Meter", family: "foundation", kind: "render" },
  { id: "U0-CMP-015", name: "Field", family: "form", kind: "render" },
  { id: "U0-CMP-016", name: "Label", family: "form", kind: "render" },
  { id: "U0-CMP-017", name: "Input", family: "form", kind: "render" },
  { id: "U0-CMP-018", name: "Textarea", family: "form", kind: "render" },
  { id: "U0-CMP-019", name: "NumberField", family: "form", kind: "render" },
  { id: "U0-CMP-020", name: "Select", family: "form", kind: "render" },
  { id: "U0-CMP-021", name: "Combobox", family: "form", kind: "render" },
  { id: "U0-CMP-022", name: "Listbox", family: "form", kind: "render" },
  { id: "U0-CMP-023", name: "Checkbox", family: "form", kind: "render" },
  { id: "U0-CMP-024", name: "RadioGroup", family: "form", kind: "render" },
  { id: "U0-CMP-025", name: "Switch", family: "form", kind: "render" },
  { id: "U0-CMP-026", name: "Slider", family: "form", kind: "render" },
  { id: "U0-CMP-027", name: "SegmentedControl", family: "form", kind: "render" },
  { id: "U0-CMP-028", name: "Toggle", family: "form", kind: "render" },
  { id: "U0-CMP-029", name: "ToggleGroup", family: "form", kind: "render" },
  { id: "U0-CMP-030", name: "Tabs", family: "navigation", kind: "render" },
  { id: "U0-CMP-031", name: "Breadcrumb", family: "navigation", kind: "render" },
  { id: "U0-CMP-032", name: "Toolbar", family: "navigation", kind: "render" },
  { id: "U0-CMP-033", name: "Menu", family: "navigation", kind: "render" },
  { id: "U0-CMP-034", name: "ContextMenu", family: "navigation", kind: "render" },
  { id: "U0-CMP-035", name: "CommandPalette", family: "navigation", kind: "render" },
  { id: "U0-CMP-036", name: "Disclosure", family: "navigation", kind: "render" },
  { id: "U0-CMP-037", name: "Accordion", family: "navigation", kind: "render" },
  { id: "U0-CMP-038", name: "ScrollArea", family: "navigation", kind: "render" },
  { id: "U0-CMP-039", name: "RovingFocus", family: "navigation", kind: "behavior" },
  { id: "U0-CMP-040", name: "Tooltip", family: "overlay", kind: "render" },
  { id: "U0-CMP-041", name: "Popover", family: "overlay", kind: "render" },
  { id: "U0-CMP-042", name: "Dialog", family: "overlay", kind: "render" },
  { id: "U0-CMP-043", name: "AlertDialog", family: "overlay", kind: "render" },
  { id: "U0-CMP-044", name: "SheetDrawer", family: "overlay", kind: "render" },
  { id: "U0-CMP-045", name: "ToastNotice", family: "overlay", kind: "render" },
  { id: "U0-CMP-046", name: "FocusDismissLayer", family: "overlay", kind: "behavior" },
  { id: "U0-CMP-047", name: "KeyValueList", family: "structured", kind: "render" },
  { id: "U0-CMP-048", name: "DataTable", family: "structured", kind: "render" },
  { id: "U0-CMP-049", name: "Tree", family: "structured", kind: "render" },
  { id: "U0-CMP-050", name: "ResizablePanels", family: "structured", kind: "render" },
  { id: "U0-CMP-051", name: "TimelineLane", family: "structured", kind: "render" },
] as const);

export type UiComponentContract = (typeof UI_COMPONENT_INVENTORY)[number];
export type UiComponentId = UiComponentContract["id"];
export type UiComponentName = UiComponentContract["name"];
export type UiComponentFamily = UiComponentContract["family"];

export const UI_RENDER_COMPONENT_COUNT = 49;
export const UI_BEHAVIOR_HELPER_COUNT = 2;
export const UI_COMPONENT_CONTRACT_COUNT = 51;

export const UI_LIMITS = Object.freeze({
  maxSafeInteger: Number.MAX_SAFE_INTEGER,
  maxIdCodePoints: 128,
  maxRequestKindCodePoints: 64,
  maxLabelCodePoints: 160,
  maxTextValueCodePoints: 4_096,
  maxKeywordCodePoints: 64,
  maxKbdKeyCodePoints: 32,
  maxFilenameCodePoints: 255,
  maxFragmentHrefCodePoints: 129,
  maxLocalHrefCodePoints: 2_048,
  maxExactValueCodePoints: 128,
  maxModalScopes: 1,
  maxDismissAncestors: 8,
  maxNonmodalSurfaces: 4,
  maxFocusCandidates: 4_096,
  maxReferenceIds: 64,
  maxDiagnostics: 64,
  maxDiagnosticPathSegments: 64,
  maxKbdKeys: 8,
  maxSkeletonLines: 20,
  maxTextareaRows: 40,
  maxRovingItems: 5_000,
  maxSelectOptions: 200,
  maxComboboxOptions: 1_000,
  maxMenuItems: 200,
  maxMenuDepth: 4,
  maxListboxOptions: 1_000,
  maxRadioItems: 64,
  maxToggleItems: 64,
  maxCommandItems: 1_000,
  maxCommandKeywords: 16,
  maxTabs: 64,
  maxBreadcrumbItems: 64,
  maxToolbarItems: 200,
  maxAccordionItems: 128,
  maxKeyValueItems: 1_000,
  maxTreeItems: 5_000,
  maxTreeDepth: 64,
  maxTableColumns: 64,
  maxTableRows: 5_000,
  maxTableCells: 50_000,
  maxResizablePanels: 8,
  maxTimelineItems: 5_000,
  maxNoticeCenterItems: 32,
  maxVisibleNotices: 5,
  maxAccessibleNameCodePoints: 160,
  maxDescriptionCodePoints: 512,
  maxTooltipCodePoints: 256,
  maxTypeaheadCodePoints: 64,
  typeaheadResetMs: 700,
  tooltipPointerOpenDelayMs: 500,
  tooltipCloseDelayMs: 100,
  noticePresentationMs: 6_000,
  pointerDragThresholdCssPx: 8,
  projectTouchTargetCssPx: 44,
  wcagTargetFloorCssPx: 24,
  focusRingCssPx: 2,
  focusRingOffsetCssPx: 2,
  compactBreakpointCssPx: 640,
  wideBreakpointCssPx: 1_100,
  fastMotionMs: 120,
  deliberateMotionMs: 180,
  reducedMotionMs: 0,
} as const);

export const UI_TOKEN_DEFINITIONS = Object.freeze({
  color: Object.freeze({
    "--background": "#d9d4c6",
    "--surface-app": "#d9d4c6",
    "--surface-header": "#f4f1e8",
    "--surface-rail": "#f4f1e8",
    "--surface-chart": "#fbf8f1",
    "--surface-panel": "#fbf8f1",
    "--surface-elevated": "#fdfcf8",
    "--surface-sunken": "#d5cfc0",
    "--surface-overlay": "rgb(25 23 19 / 0.4)",
    "--text-primary": "#191713",
    "--text-muted": "#4a453a",
    "--text-subtle": "#5c5647",
    "--text-inverse": "#fbf8f1",
    "--border-default": "#d6d0be",
    "--border-strong": "#6b6353",
    "--action-primary": "#191713",
    "--action-primary-hover": "#b23a2a",
    "--action-secondary": "#f3efe3",
    "--state-info": "#2f5490",
    "--state-success": "#0f5c37",
    "--state-warning": "#6b4e0b",
    "--state-error": "#9c2e20",
    "--state-selected": "#dce3f0",
    "--focus-ring": "#2f5490",
    "--accent": "#b23a2a",
    "--accent-strong": "#8e2e21",
    "--accent-soft": "#f3dedb",
    "--on-accent": "#fbf8f1",
    "--shadow-1": "0 1px 2px rgb(25 23 19 / 0.1)",
    "--shadow-2": "0 3px 12px rgb(25 23 19 / 0.14)",
    "--shadow-3": "0 14px 36px rgb(25 23 19 / 0.22)",
    "--glow-accent": "0 0 0 1px rgb(178 58 42 / 0.55), 0 0 20px rgb(178 58 42 / 0.2)",
  }),
  studio: Object.freeze({
    "--desk": "#d9d4c6",
    "--desk-1": "#e4dfd1",
    "--desk-2": "#cfc9b9",
    "--chrome": "#f4f1e8",
    "--paper": "#fbf8f1",
    "--paper-2": "#fdfcf8",
    "--paper-hi": "#fdfbf6",
    "--paper-lo": "#f8f4ea",
    "--field": "#fffdf7",
    "--field-2": "#fffdf4",
    "--hover": "#f3efe3",
    "--tint": "#f4f0e4",
    "--line-1": "#efebdf",
    "--line-2": "#e2dcca",
    "--rule": "#d6d0be",
    "--slash": "#cdc6b2",
    "--rule-2": "#c9c2ae",
    "--rule-3": "#b8b19c",
    "--ink": "#191713",
    "--ink-1": "#2e2a22",
    "--ink-2": "#4a453a",
    "--ink-3": "#6b6353",
    "--ink-4": "#a9a28c",
    "--red": "#b23a2a",
    "--blue": "#2f5490",
    "--red-wash": "rgb(178 58 42 / 0.06)",
    "--blue-wash": "rgb(47 84 144 / 0.12)",
    "--sh": "25 23 19",
    "--grain-blend": "multiply",
    "--grain-op": "0.28",
    "--page-edge": "transparent",
    "--shadow-page": "0 1px 1px rgb(25 23 19 / 0.1), 0 2px 5px rgb(25 23 19 / 0.07), 0 18px 44px rgb(25 23 19 / 0.22)",
    "--daw-inset": "#17150f",
    "--daw-inset-edge": "#2a261c",
    "--key-white": "#ede9de",
    "--key-white-lit": "#fffdf4",
    "--key-black": "#1a1814",
    "--key-frame": "#8b8474",
  }),
  typography: Object.freeze({
    "--font-ui": "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif",
    "--font-mono": "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    "--text-xs": "0.75rem",
    "--text-sm": "0.875rem",
    "--text-md": "1rem",
    "--text-lg": "1.125rem",
    "--text-xl": "1.5rem",
    "--line-tight": "1.25",
    "--line-normal": "1.5",
    "--font-chord": "'Literata', Georgia, 'Times New Roman', serif",
    "--text-chord": "1.5rem",
    "--text-chord-super": "0.66em",
    "--text-display": "2rem",
  }),
  space: Object.freeze({
    "--space-0": "0",
    "--space-1": "0.25rem",
    "--space-2": "0.5rem",
    "--space-3": "0.75rem",
    "--space-4": "1rem",
    "--space-5": "1.25rem",
    "--space-6": "1.5rem",
    "--space-8": "2rem",
    "--space-10": "2.5rem",
    "--space-12": "3rem",
  }),
  shape: Object.freeze({
    "--radius-xs": "0.125rem",
    "--radius-sm": "0.1875rem",
    "--radius-md": "0.25rem",
    "--radius-lg": "0.5rem",
    "--border-width": "1px",
    "--focus-width": "2px",
    "--focus-offset": "2px",
  }),
  motion: Object.freeze({
    "--motion-fast": "120ms",
    "--motion-deliberate": "180ms",
    "--motion-reduced": "0ms",
    "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  }),
  layout: Object.freeze({
    "--rail-library-inline": "18.25rem",
    "--rail-harmony-inline": "22.5rem",
    "--transport-min-block": "4.5rem",
    "--sheet-context-reveal": "3rem",
    "--control-min-block": "2.25rem",
    "--touch-target": "2.75rem",
  }),
  colorDark: Object.freeze({
    "--background": "#100f0c",
    "--surface-app": "#100f0c",
    "--surface-header": "#1b1a15",
    "--surface-rail": "#1b1a15",
    "--surface-chart": "#272419",
    "--surface-panel": "#272419",
    "--surface-elevated": "#302c24",
    "--surface-sunken": "#080806",
    "--surface-overlay": "rgb(0 0 0 / 0.55)",
    "--text-primary": "#f2eee2",
    "--text-muted": "#cdc6b2",
    "--text-subtle": "#a19980",
    "--text-inverse": "#191713",
    "--border-default": "#423c2f",
    "--border-strong": "#a19980",
    "--action-primary": "#f2eee2",
    "--action-primary-hover": "#e0654c",
    "--action-secondary": "#2e2b23",
    "--state-info": "#86a9e2",
    "--state-success": "#5fd39c",
    "--state-warning": "#e5b95c",
    "--state-error": "#e88a72",
    "--state-selected": "#2c3a55",
    "--focus-ring": "#86a9e2",
    "--accent": "#e0654c",
    "--accent-strong": "#ee8a70",
    "--accent-soft": "#3a2620",
    "--on-accent": "#191713",
    "--shadow-1": "0 1px 2px rgb(0 0 0 / 0.55)",
    "--shadow-2": "0 3px 12px rgb(0 0 0 / 0.5)",
    "--shadow-3": "0 14px 36px rgb(0 0 0 / 0.6)",
    "--glow-accent": "0 0 0 1px rgb(224 101 76 / 0.55), 0 0 22px rgb(224 101 76 / 0.24)",
    "--desk": "#100f0c",
    "--desk-1": "#17160f",
    "--desk-2": "#080806",
    "--chrome": "#1b1a15",
    "--paper": "#272419",
    "--paper-2": "#2c2921",
    "--paper-hi": "#2e2b21",
    "--paper-lo": "#232017",
    "--field": "#302c24",
    "--field-2": "#353027",
    "--hover": "#2e2b23",
    "--tint": "#2c2921",
    "--line-1": "#302c24",
    "--line-2": "#383327",
    "--rule": "#423c2f",
    "--slash": "#4e4738",
    "--rule-2": "#4e4738",
    "--rule-3": "#635b49",
    "--ink": "#f2eee2",
    "--ink-1": "#e6e1d3",
    "--ink-2": "#cdc6b2",
    "--ink-3": "#a19980",
    "--ink-4": "#7a7361",
    "--red": "#e0654c",
    "--blue": "#86a9e2",
    "--red-wash": "rgb(224 101 76 / 0.1)",
    "--blue-wash": "rgb(134 169 226 / 0.16)",
    "--sh": "0 0 0",
    "--grain-blend": "screen",
    "--grain-op": "0.09",
    "--page-edge": "#3a3527",
    "--shadow-page": "0 1px 1px rgb(0 0 0 / 0.3), 0 2px 5px rgb(0 0 0 / 0.26), 0 18px 44px rgb(0 0 0 / 0.5)",
  }),
} as const);

export type UiColorToken = keyof typeof UI_TOKEN_DEFINITIONS.color;
export type UiContrastPair = Readonly<{
  id: string;
  foregrounds: readonly UiColorToken[];
  backgrounds: readonly UiColorToken[];
  minimumRatio: 3 | 4.5;
  purpose:
    | "normal-text"
    | "normal-text-and-icons"
    | "focus-indicator"
    | "component-boundary";
}>;

export const UI_OPAQUE_SURFACE_TOKENS = Object.freeze([
  "--background",
  "--surface-app",
  "--surface-header",
  "--surface-rail",
  "--surface-chart",
  "--surface-panel",
  "--surface-elevated",
  "--surface-sunken",
] as const satisfies readonly UiColorToken[]);

/**
 * Exhaustive meaningful foreground/background pairs for the frozen dark theme.
 * Implementations may use `--border-default` decoratively, but never as the
 * sole component boundary or state cue.
 */
export const UI_ALLOWED_CONTRAST_PAIRS = Object.freeze([
  {
    id: "primary-text-on-surfaces",
    foregrounds: ["--text-primary"],
    backgrounds: UI_OPAQUE_SURFACE_TOKENS,
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "muted-text-on-surfaces",
    foregrounds: ["--text-muted"],
    backgrounds: UI_OPAQUE_SURFACE_TOKENS,
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "subtle-text-on-surfaces",
    foregrounds: ["--text-subtle"],
    backgrounds: UI_OPAQUE_SURFACE_TOKENS,
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "semantic-text-on-surfaces",
    foregrounds: [
      "--state-info",
      "--state-success",
      "--state-warning",
      "--state-error",
    ],
    backgrounds: UI_OPAQUE_SURFACE_TOKENS,
    minimumRatio: 4.5,
    purpose: "normal-text-and-icons",
  },
  {
    id: "inverse-text-on-strong-fills",
    foregrounds: ["--text-inverse", "--on-accent"],
    backgrounds: [
      "--action-primary",
      "--action-primary-hover",
      "--state-info",
      "--state-success",
      "--state-warning",
      "--state-error",
      "--accent",
      "--accent-strong",
    ],
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "primary-text-on-secondary-action",
    foregrounds: ["--text-primary"],
    backgrounds: ["--action-secondary"],
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "primary-text-on-selection",
    foregrounds: ["--text-primary"],
    backgrounds: ["--state-selected"],
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "focus-on-surfaces",
    foregrounds: ["--focus-ring"],
    backgrounds: UI_OPAQUE_SURFACE_TOKENS,
    minimumRatio: 3,
    purpose: "focus-indicator",
  },
  {
    id: "strong-border-on-surfaces",
    foregrounds: ["--border-strong"],
    backgrounds: UI_OPAQUE_SURFACE_TOKENS,
    minimumRatio: 3,
    purpose: "component-boundary",
  },
] as const satisfies readonly UiContrastPair[]);

/** Maps every collection-valued public field to one exact bound. */
export const UI_PUBLIC_COLLECTION_LIMITS = Object.freeze({
  commonDescribedBy: "maxReferenceIds",
  diagnosticPath: "maxDiagnosticPathSegments",
  diagnostics: "maxDiagnostics",
  kbdKeys: "maxKbdKeys",
  fieldDescriptionIds: "maxReferenceIds",
  fieldErrorIds: "maxReferenceIds",
  selectOptions: "maxSelectOptions",
  comboboxOptions: "maxComboboxOptions",
  listboxOptions: "maxListboxOptions",
  listboxSelectedIds: "maxListboxOptions",
  radioOptions: "maxRadioItems",
  toggleItems: "maxToggleItems",
  togglePressedIds: "maxToggleItems",
  tabs: "maxTabs",
  breadcrumbs: "maxBreadcrumbItems",
  toolbarItemIds: "maxToolbarItems",
  menuFlattenedItems: "maxMenuItems",
  commandItems: "maxCommandItems",
  commandKeywords: "maxCommandKeywords",
  accordionItems: "maxAccordionItems",
  accordionExpandedIds: "maxAccordionItems",
  rovingItemIds: "maxRovingItems",
  rovingDisabledIds: "maxRovingItems",
  overlayDescendants: "maxNonmodalSurfaces",
  overlayDismissAncestors: "maxDismissAncestors",
  visibleNotices: "maxVisibleNotices",
  keyValueItems: "maxKeyValueItems",
  tableColumns: "maxTableColumns",
  tableRows: "maxTableRows",
  tableCells: "maxTableCells",
  treeNodes: "maxTreeItems",
  treeRootIds: "maxTreeItems",
  treeChildIds: "maxTreeItems",
  resizablePanels: "maxResizablePanels",
  resizablePanelSizes: "maxResizablePanels",
  resizableCollapsedIds: "maxResizablePanels",
  timelineItems: "maxTimelineItems",
} as const satisfies Readonly<Record<string, keyof typeof UI_LIMITS>>);

/** Maps string-valued public fields to the bound applied before rendering. */
export const UI_PUBLIC_TEXT_LIMITS = Object.freeze({
  idsAndIdReferences: "maxIdCodePoints",
  requestKinds: "maxRequestKindCodePoints",
  accessibleNamesAndTitles: "maxAccessibleNameCodePoints",
  visibleLabelsAndRecoveryActions: "maxLabelCodePoints",
  descriptionsErrorsMessagesPlaceholdersAndValueText:
    "maxDescriptionCodePoints",
  rawTextValuesAndQueries: "maxTextValueCodePoints",
  tooltipText: "maxTooltipCodePoints",
  commandKeywords: "maxKeywordCodePoints",
  kbdKeys: "maxKbdKeyCodePoints",
  filenames: "maxFilenameCodePoints",
  fragmentHrefs: "maxFragmentHrefCodePoints",
  blobHrefs: "maxLocalHrefCodePoints",
  exactDisplayValues: "maxExactValueCodePoints",
  tableCellText: "maxDescriptionCodePoints",
} as const satisfies Readonly<Record<string, keyof typeof UI_LIMITS>>);

export const UI_PUBLIC_NUMERIC_POLICY = Object.freeze({
  identifiersRevisionsSequencesAndCounts:
    "integer-from-0-through-maxSafeInteger-unless-a-smaller-bound-applies",
  coordinatesAndScalarValues: "finite-numbers",
  textareaRows: "integer-from-1-through-maxTextareaRows",
  skeletonLines: "integer-from-1-through-maxSkeletonLines",
  percentages: "finite-from-0-through-100-inclusive",
  rangeOrder: "min-less-than-or-equal-to-value-less-than-or-equal-to-max",
  steps: "finite-and-greater-than-zero",
  hiddenNoticeCount:
    "integer-from-0-through-maxNoticeCenterItems-minus-maxVisibleNotices",
} as const);

export const UI_OPAQUE_VALUE_POLICY = Object.freeze({
  genericContent: "caller-owned-and-not-traversed-by-u0",
  applicationIntentPayload: "a0-owned-and-not-traversed-by-u0",
  asyncReadyValue: "selector-owner-bounded-and-not-traversed-by-u0",
  dataTableRow: "caller-owned; u0-visits-only-rowId-and-renderText-results",
} as const);

export type UiDensity = "comfortable" | "dense";
export type UiOrientation = "horizontal" | "vertical";
export type UiTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "error";
export type UiInteractionSource =
  | "keyboard"
  | "pointer"
  | "assistive-technology"
  | "programmatic";
export type UiDismissReason =
  | "escape"
  | "outside-pointer"
  | "focus-left"
  | "action-complete"
  | "cancel"
  | "stale-owner"
  | "replaced";

export type UiDismissibility =
  | Readonly<{ kind: "dismissible" }>
  /** Close/Cancel remain visible but disabled and reference this reason. */
  | Readonly<{ kind: "blocked"; reason: string }>;

export type UiCommonProps = Readonly<{
  id: string;
  density: UiDensity;
  disabled: boolean;
  busy: boolean;
  invalid: boolean;
  describedBy: readonly string[];
}>;

export type UiActionEvent<Value = null> = Readonly<{
  componentId: string;
  itemId: string | null;
  source: UiInteractionSource;
  action: "activate" | "commit" | "cancel" | "dismiss";
  value: Value;
}>;

export type UiValueChangeEvent<Value, PreviousValue = Value> = Readonly<{
  componentId: string;
  source: UiInteractionSource;
  phase: "preview" | "commit" | "cancel";
  previousValue: PreviousValue;
  value: Value;
}>;

export type UiCheckboxValueChangeEvent = UiValueChangeEvent<
  boolean,
  boolean | "mixed"
>;

export type UiApplicationIntentEnvelope<
  Kind extends string = string,
  Payload = unknown,
> = Readonly<{
  id: string;
  kind: Kind;
  expectedDocumentId: string | null;
  expectedRevision: number | null;
  payload: Payload;
}>;

export type UiIntentDispatcher<Intent extends UiApplicationIntentEnvelope> = (
  intent: Intent,
) => void;

export const UI_REFUSAL_CODES = Object.freeze([
  "ui.id_invalid",
  "ui.accessible_name_required",
  "ui.description_invalid",
  "ui.collection_limit",
  "ui.duplicate_item_id",
  "ui.selection_invalid",
  "ui.value_malformed",
  "ui.range_invalid",
  "ui.step_invalid",
  "ui.disabled",
  "ui.busy",
  "ui.cancelled",
  "ui.stale_revision",
  "ui.stale_owner",
  "ui.overlay_conflict",
  "ui.modal_scope_limit",
  "ui.dismiss_depth_limit",
  "ui.focus_target_missing",
  "ui.focus_candidate_limit",
  "ui.application_intent_required",
] as const);

export type UiRefusalCode = (typeof UI_REFUSAL_CODES)[number];

export type UiDiagnostic = Readonly<{
  code: UiRefusalCode;
  severity: "warning" | "error";
  componentId: string;
  path: readonly (string | number)[];
  message: string;
  recoveryAction: string | null;
}>;

export type UiResult<Value> =
  | Readonly<{ ok: true; value: Value; diagnostics: readonly UiDiagnostic[] }>
  | Readonly<{
      ok: false;
      refusal: UiDiagnostic;
      diagnostics: readonly UiDiagnostic[];
    }>;

export type UiRequestToken = Readonly<{
  kind: string;
  requestId: number;
  documentId: string;
  baseRevision: number;
}>;

export type UiAsyncPresentation<Value> =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "pending"; token: UiRequestToken; message: string }>
  | Readonly<{ kind: "ready"; token: UiRequestToken; value: Value }>
  | Readonly<{ kind: "empty"; token: UiRequestToken; message: string }>
  | Readonly<{
      kind: "refused";
      token: UiRequestToken;
      diagnostics: readonly UiDiagnostic[];
    }>
  | Readonly<{ kind: "cancelled"; token: UiRequestToken }>
  | Readonly<{ kind: "stale"; token: UiRequestToken; currentRevision: number }>;

export type UiOption<Value extends string = string> = Readonly<{
  id: string;
  value: Value;
  label: string;
  description: string | null;
  disabled: boolean;
}>;

export type UiLocalDownloadHref = `blob:${string}`;

export const UI_OWNED_ICON_IDS = Object.freeze([
  "aim",
  "audio-off",
  "check",
  "chevron-left",
  "chevron-down",
  "chevron-right",
  "close",
  "error",
  "harmony",
  "info",
  "insert",
  "library",
  "loop",
  "menu",
  "next",
  "pause",
  "play",
  "previous",
  "redo",
  "restart",
  "split",
  "status",
  "stop",
  "undo",
  "warning",
] as const);

export type UiOwnedIconId = (typeof UI_OWNED_ICON_IDS)[number];

export type UiButtonProps = UiCommonProps &
  Readonly<{
    label: string;
    variant: "primary" | "secondary" | "outline" | "ghost" | "destructive";
    type: "button" | "submit" | "reset";
    onAction: (event: UiActionEvent) => void;
  }>;

export type UiIconButtonProps = Omit<UiButtonProps, "label"> &
  Readonly<{ accessibleName: string; iconId: UiOwnedIconId }>;

export type UiLinkButtonProps = UiCommonProps &
  Readonly<{
    label: string;
    destination:
      | Readonly<{ kind: "fragment"; href: `#${string}` }>
      | Readonly<{
          kind: "download";
          href: UiLocalDownloadHref;
          filename: string;
        }>;
  }>;

export type UiBadgeProps = Readonly<{ label: string; tone: UiTone }>;
export type UiKbdProps = Readonly<{ keys: readonly [string, ...string[]] }>;
export type UiSeparatorProps = Readonly<{
  orientation: UiOrientation;
  decorative: boolean;
  accessibleName: string | null;
}>;
export type UiSkeletonProps = Readonly<{
  shape: "text" | "circle" | "rectangle";
  lines: number;
  ariaHidden: true;
}>;
export type UiSpinnerProps =
  | Readonly<{ mode: "decorative"; ariaHidden: true }>
  | Readonly<{ mode: "status"; ariaHidden: false; accessibleName: string }>;
export type UiVisuallyHiddenProps<Content = unknown> = Readonly<{
  content: Content;
  focusableWhenSkippedTo: boolean;
}>;
export type UiCardProps<Content = unknown> = Readonly<{
  id: string;
  headingId: string | null;
  tone: UiTone;
  interactive: false;
  content: Content;
}>;
export type UiEmptyStateProps<Content = unknown> = Readonly<{
  title: string;
  description: string;
  illustration: Content | null;
  primaryAction: UiButtonProps | null;
  secondaryAction: UiButtonProps | null;
}>;
export type UiStatusPillProps = Readonly<{
  label: string;
  tone: UiTone;
  iconId: UiOwnedIconId | null;
}>;
export type UiProgressProps = Readonly<{
  accessibleName: string;
  value: number | null;
  min: number;
  max: number;
  valueText: string | null;
}>;
export type UiMeterProps = Readonly<{
  accessibleName: string;
  value: number;
  min: number;
  max: number;
  low: number | null;
  high: number | null;
  optimum: number | null;
  valueText: string;
}>;

export type UiFieldProps<Content = unknown> = Readonly<{
  id: string;
  controlId: string;
  labelId: string;
  descriptionIds: readonly string[];
  errorIds: readonly string[];
  required: boolean;
  invalid: boolean;
  content: Content;
}>;
export type UiLabelProps = Readonly<{
  id: string;
  controlId: string;
  text: string;
  required: boolean;
}>;
export type UiTextControlProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    value: string;
    placeholder: string | null;
    readOnly: boolean;
    onValueChange: (event: UiValueChangeEvent<string>) => void;
  }>;
export type UiInputProps = UiTextControlProps &
  Readonly<{ inputType: "text" | "search" | "email" | "url" | "password" }>;
export type UiTextareaProps = UiTextControlProps &
  Readonly<{ rows: number; maxCodePoints: number }>;
export type UiNumberFieldProps = UiTextControlProps &
  Readonly<{
    parsedValue: number | null;
    min: number | null;
    max: number | null;
    step: number;
  }>;
export type UiSelectProps<Value extends string = string> = UiCommonProps &
  Readonly<{
    accessibleName: string;
    options: readonly UiOption<Value>[];
    value: Value | null;
    onValueChange: (event: UiValueChangeEvent<Value, Value | null>) => void;
  }>;
export type UiComboboxProps<Value extends string = string> = UiCommonProps &
  Readonly<{
    accessibleName: string;
    inputValue: string;
    options: readonly UiOption<Value>[];
    selectedValue: Value | null;
    activeOptionId: string | null;
    open: boolean;
    autocomplete: "none" | "list-manual";
    onInputChange: (event: UiValueChangeEvent<string>) => void;
    onValueChange: (event: UiValueChangeEvent<Value | null>) => void;
    onOpenChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiListboxProps<Value extends string = string> = UiCommonProps &
  Readonly<{
    accessibleName: string;
    options: readonly UiOption<Value>[];
    selectionMode: "single" | "multiple";
    selectedIds: readonly string[];
    activeId: string | null;
    onSelectionChange: (event: UiValueChangeEvent<readonly string[]>) => void;
  }>;
export type UiCheckboxProps = UiCommonProps &
  Readonly<{
    label: string;
    checked: boolean | "mixed";
    onCheckedChange: (event: UiCheckboxValueChangeEvent) => void;
  }>;
export type UiRadioGroupProps<Value extends string = string> = UiCommonProps &
  Readonly<{
    accessibleName: string;
    options: readonly UiOption<Value>[];
    value: Value | null;
    insideToolbar: boolean;
    onValueChange: (event: UiValueChangeEvent<Value, Value | null>) => void;
  }>;
export type UiSwitchProps = UiCommonProps &
  Readonly<{
    label: string;
    checked: boolean;
    onCheckedChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiSliderProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    orientation: UiOrientation;
    value: number;
    min: number;
    max: number;
    step: number;
    pageStep: number | null;
    valueText: string;
    onValueChange: (event: UiValueChangeEvent<number>) => void;
  }>;
export type UiSegmentedControlProps<Value extends string = string> =
  UiRadioGroupProps<Value>;
export type UiToggleProps = UiCommonProps &
  Readonly<{
    label: string;
    pressed: boolean;
    onPressedChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiToggleGroupProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    selectionMode: "single" | "multiple";
    items: readonly UiToggleProps[];
    pressedIds: readonly string[];
    onPressedIdsChange: (event: UiValueChangeEvent<readonly string[]>) => void;
  }>;

export type UiTab = Readonly<{
  id: string;
  panelId: string;
  label: string;
  disabled: boolean;
}>;
export type UiTabsProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    orientation: UiOrientation;
    tabs: readonly UiTab[];
    activeId: string | null;
    focusedId: string | null;
    activation: "manual";
    onActiveChange: (event: UiValueChangeEvent<string | null>) => void;
  }>;
export type UiBreadcrumbItem = Readonly<{
  id: string;
  label: string;
  href: `#${string}` | null;
  current: boolean;
}>;
export type UiBreadcrumbProps = Readonly<{
  accessibleName: string;
  items: readonly [UiBreadcrumbItem, ...UiBreadcrumbItem[]];
}>;
export type UiToolbarProps<Content = unknown> = UiCommonProps &
  Readonly<{
    accessibleName: string;
    orientation: UiOrientation;
    itemIds: readonly string[];
    focusedId: string | null;
    content: Content;
  }>;
export type UiMenuItem =
  | Readonly<{ id: string; kind: "action"; label: string; disabled: boolean }>
  | Readonly<{
      id: string;
      kind: "checkbox";
      label: string;
      checked: boolean;
      disabled: boolean;
    }>
  | Readonly<{
      id: string;
      kind: "radio";
      label: string;
      groupId: string;
      checked: boolean;
      disabled: boolean;
    }>
  | Readonly<{ id: string; kind: "separator" }>
  | Readonly<{
      id: string;
      kind: "submenu";
      label: string;
      disabled: boolean;
      items: readonly UiMenuItem[];
    }>;

export const UI_MENU_TOPOLOGY_POLICY = Object.freeze({
  flattenedItemLimit: UI_LIMITS.maxMenuItems,
  maximumSubmenuDepth: UI_LIMITS.maxMenuDepth,
  countIncludesSeparatorsAndNestedItems: true,
  uniqueIdsAcrossFlattenedTree: true,
  cycles: "refuse-ui.value_malformed",
  repeatedObjectIdentity: "refuse-ui.value_malformed",
  traversal: "caller-depth-first-order-with-visited-set",
} as const);

export type UiMenuProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    triggerId: string;
    open: boolean;
    items: readonly UiMenuItem[];
    activeItemId: string | null;
    onAction: (event: UiActionEvent<string>) => void;
    onOpenChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiContextMenuProps = UiMenuProps &
  Readonly<{
    targetId: string;
    anchor: Readonly<{ clientX: number; clientY: number }> | null;
  }>;
export type UiCommandItem = Readonly<{
  id: string;
  label: string;
  description: string | null;
  keywords: readonly string[];
  disabled: boolean;
}>;
export type UiCommandPaletteProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    query: string;
    items: readonly UiCommandItem[];
    activeItemId: string | null;
    open: boolean;
    onQueryChange: (event: UiValueChangeEvent<string>) => void;
    onAction: (event: UiActionEvent<string>) => void;
    onOpenChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiDisclosureProps<Content = unknown> = UiCommonProps &
  Readonly<{
    label: string;
    panelId: string;
    expanded: boolean;
    content: Content;
    onExpandedChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiAccordionItem<Content = unknown> = Readonly<{
  id: string;
  headingLevel: 2 | 3 | 4 | 5 | 6;
  label: string;
  panelId: string;
  expanded: boolean;
  disabled: boolean;
  content: Content;
}>;
export type UiAccordionProps<Content = unknown> = UiCommonProps &
  Readonly<{
    accessibleName: string;
    selectionMode: "single" | "multiple";
    items: readonly UiAccordionItem<Content>[];
    focusedId: string | null;
    onExpandedIdsChange: (event: UiValueChangeEvent<readonly string[]>) => void;
  }>;
export type UiScrollAreaProps<Content = unknown> = Readonly<{
  id: string;
  accessibleName: string | null;
  orientation: UiOrientation | "both";
  nativeScrollbar: true;
  content: Content;
}>;
export type UiRovingFocusProps = Readonly<{
  ownerId: string;
  orientation: UiOrientation | "both";
  wrap: boolean;
  itemIds: readonly string[];
  disabledIds: readonly string[];
  currentId: string | null;
  typeahead: boolean;
}>;

export const UI_OVERLAY_KINDS = Object.freeze([
  "tooltip",
  "menu",
  "context-menu",
  "popover",
  "command-palette",
  "dialog",
  "alert-dialog",
  "sheet",
] as const);
export type UiOverlayKind = (typeof UI_OVERLAY_KINDS)[number];
export type UiOverlayMode = "nonmodal" | "modal";

export const UI_OVERLAY_KIND_MODES = Object.freeze({
  tooltip: ["nonmodal"],
  menu: ["nonmodal"],
  "context-menu": ["nonmodal"],
  popover: ["nonmodal"],
  "command-palette": ["modal"],
  dialog: ["modal"],
  "alert-dialog": ["modal"],
  sheet: ["nonmodal", "modal"],
} as const satisfies Readonly<
  Record<UiOverlayKind, readonly [UiOverlayMode, ...UiOverlayMode[]]>
>);

export type UiOverlayDescriptor = Readonly<{
  id: string;
  ownerId: string;
  kind: UiOverlayKind;
  mode: UiOverlayMode;
  triggerId: string;
  titleId: string | null;
  descriptionId: string | null;
  initialFocusId: string | null;
  restoreFocusId: string;
  requestRevision: number;
  dismissibility: UiDismissibility;
}>;
export type UiOverlayLayerState = Readonly<{
  root: UiOverlayDescriptor | null;
  descendantNonmodalIds: readonly string[];
  activeTransientId: string | null;
  modalScopeDepth: 0 | 1;
  dismissAncestorIds: readonly string[];
}>;
export type UiTooltipProps = Readonly<{
  id: string;
  triggerId: string;
  text: string;
  open: boolean;
  onOpenChange: (event: UiValueChangeEvent<boolean>) => void;
}>;
export type UiPopoverProps<Content = unknown> = UiCommonProps &
  Readonly<{
    triggerId: string;
    accessibleName: string;
    open: boolean;
    content: Content;
    onOpenChange: (event: UiValueChangeEvent<boolean>) => void;
  }>;
export type UiDialogProps<Content = unknown> = UiCommonProps &
  Readonly<{
    title: string;
    description: string | null;
    open: boolean;
    closeLabel: string;
    dismissibility: UiDismissibility;
    initialFocus: "first-control" | "heading" | "explicit";
    initialFocusId: string | null;
    content: Content;
    onDismiss: (event: UiActionEvent<UiDismissReason>) => void;
  }>;
export type UiAlertDialogProps<Content = unknown> = Omit<
  UiDialogProps<Content>,
  "description"
> &
  Readonly<{
    description: string;
    leastDestructiveActionId: string;
    confirmActionId: string;
  }>;
export type UiSheetDrawerProps<Content = unknown> = UiDialogProps<Content> &
  Readonly<{
    side: "inline-start" | "inline-end" | "block-end";
    mode: UiOverlayMode;
    contextRevealCssPx: 48;
  }>;
export type UiToastNotice = Readonly<{
  id: string;
  sequence: number;
  tone: Exclude<UiTone, "neutral" | "primary">;
  title: string;
  message: string;
  dismissible: boolean;
  persistent: boolean;
}>;
export type UiToastNoticeProps = Readonly<{
  notices: readonly UiToastNotice[];
  hiddenNoticeCount: number;
  onDismiss: (event: UiActionEvent<number>) => void;
  onOpenNoticeCenter: (event: UiActionEvent) => void;
}>;
export type UiFocusDismissLayerProps = Readonly<{
  state: UiOverlayLayerState;
  backgroundRootId: string;
  inertWhenModal: true;
  escapePolicy: "dismiss-when-owner-allows";
  outsidePointerDismissesNonmodal: true;
}>;

export type UiKeyValueItem = Readonly<{
  id: string;
  key: string;
  value: string;
  description: string | null;
}>;
export type UiKeyValueListProps = Readonly<{
  accessibleName: string | null;
  items: readonly UiKeyValueItem[];
}>;
export type UiDataColumn<Row> = Readonly<{
  id: string;
  label: string;
  scope: "col";
  /** U0 table body cells are text-only; header sort buttons are separate. */
  renderText: (row: Row) => string;
  sortable: boolean;
}>;
export type UiDataTableSort = Readonly<{
  columnId: string;
  direction: "ascending" | "descending";
}> | null;
export type UiDataTableProps<Row> = Readonly<{
  id: string;
  caption: string;
  columns: readonly UiDataColumn<Row>[];
  rows: readonly Row[];
  rowId: (row: Row) => string;
  sort: UiDataTableSort;
  emptyMessage: string;
  onSortChange: (event: UiValueChangeEvent<UiDataTableSort>) => void;
}>;
export type UiTreeNode = Readonly<{
  id: string;
  parentId: string | null;
  label: string;
  childIds: readonly string[];
  expanded: boolean;
  selected: boolean;
  disabled: boolean;
}>;
export type UiTreeProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    nodes: readonly UiTreeNode[];
    rootIds: readonly string[];
    activeId: string | null;
    selectionMode: "single" | "multiple";
    onAction: (event: UiActionEvent<string>) => void;
  }>;

export const UI_TREE_TOPOLOGY_POLICY = Object.freeze({
  structure: "rooted-forest",
  rootParentId: null,
  uniqueNodeIds: true,
  uniqueRootIds: true,
  uniqueChildIdsPerParent: true,
  exactlyOneParentPerNonRoot: true,
  parentChildReferencesAreReciprocal: true,
  allNodesReachableFromRoots: true,
  cycles: "refuse-ui.value_malformed",
  missingReferences: "refuse-ui.value_malformed",
  maximumDepth: UI_LIMITS.maxTreeDepth,
  traversalBound: UI_LIMITS.maxTreeItems,
} as const);
export type UiResizablePanel = Readonly<{
  id: string;
  label: string;
  minPercent: number;
  maxPercent: number;
  /** Retained restore size even while `collapsed` is true. */
  sizePercent: number;
  collapsible: boolean;
  collapsed: boolean;
}>;
export type UiResizablePanelsProps = UiCommonProps &
  Readonly<{
    orientation: UiOrientation;
    panels: readonly [UiResizablePanel, UiResizablePanel, ...UiResizablePanel[]];
    onSizesChange: (event: UiValueChangeEvent<readonly number[]>) => void;
    onCollapsedIdsChange: (
      event: UiValueChangeEvent<readonly string[]>,
    ) => void;
  }>;
export type UiTimelineItem = Readonly<{
  id: string;
  label: string;
  exactStart: string;
  exactDuration: string;
  selected: boolean;
  disabled: boolean;
}>;
export type UiTimelineLaneProps = UiCommonProps &
  Readonly<{
    accessibleName: string;
    items: readonly UiTimelineItem[];
    activeId: string | null;
    horizontalScroll: true;
    onAction: (event: UiActionEvent<string>) => void;
  }>;

export const UI_SHELL_REGION_IDS = Object.freeze([
  "skip-link",
  "app-header",
  "document-status",
  "document-menu",
  "workspace",
  "library-rail",
  "chart-workspace",
  "harmony-lens-rail",
  "transport-bar",
  "dialog-host",
  "notice-region",
  "help",
] as const);
export type UiShellRegionId = (typeof UI_SHELL_REGION_IDS)[number];
export type UiLayoutMode = "compact" | "balanced" | "wide";
export type UiRailState = "persistent" | "closed" | "open-nonmodal" | "open-modal";
export type UiShellState = Readonly<{
  layout: UiLayoutMode;
  libraryRail: UiRailState;
  harmonyRail: UiRailState;
  activePanelId: string;
  overlay: UiOverlayLayerState;
  transportVisible: true;
}>;

export const UI_RESPONSIVE_LAYOUTS = Object.freeze([
  {
    id: "compact",
    minCssPx: 0,
    maxCssPxExclusive: 640,
    libraryRail: "sheet",
    harmonyRail: "sheet",
    columns: 1,
  },
  {
    id: "balanced",
    minCssPx: 640,
    maxCssPxExclusive: 1_100,
    libraryRail: "sheet",
    harmonyRail: "persistent",
    columns: 2,
  },
  {
    id: "wide",
    minCssPx: 1_100,
    maxCssPxExclusive: null,
    libraryRail: "persistent",
    harmonyRail: "persistent",
    columns: 3,
  },
] as const);

export const UI_REQUIRED_VIEWPORTS = Object.freeze([
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1_024 },
  { width: 1_280, height: 800 },
  { width: 1_440, height: 900 },
] as const);

export const UI_ACCESSIBILITY_POLICY = Object.freeze({
  wcagVersion: "2.2",
  targetConformance: "AA",
  zoomPercent: 200,
  reflowInlineCssPx: 320,
  focusIndicator: "2px solid plus 2px offset",
  targetFloorCssPx: 24,
  projectTouchTargetCssPx: 44,
  noPositiveTabIndex: true,
  noHueOnlyState: true,
  noHoverOnlyAction: true,
  noDragOnlyAction: true,
  forcedColorsRequired: true,
  reducedMotionRequired: true,
} as const);

export const UI_ORDERING_POLICY = Object.freeze({
  collections: "caller order after duplicate-ID and limit validation",
  disabledItems: "retain structural position and skip during roving focus",
  typeahead: "case-folded prefix, current item exclusive, wrap once",
  overlays: "one root layer; active transient replaces its sibling",
  notices: "increasing application sequence; newest five visible",
  focusRestore: "exact trigger, then stable workflow target, then workspace",
  stale: "token mismatch refuses with no callback or focus mutation",
} as const);

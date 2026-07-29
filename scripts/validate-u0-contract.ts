import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

export type U0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U0ContractValidationReport = Readonly<{
  schema: "changes.validation.u0-contract.v1";
  package: "U0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    components: number;
    primitiveCases: number;
    galleryCells: number;
    topologyCases: number;
    menuTopologyCases: number;
    contrastCases: number;
    shellCases: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly U0ContractFinding[];
}>;

type ParsedFixture = Readonly<{
  filename: ExpectedFilename;
  source: string;
  root: JsonObject;
  byteDigest: string;
  semanticDigest: string;
}>;

type LinkedRecord = Readonly<{
  id: string;
  path: string;
  record: JsonObject;
}>;

const CONTRACT_FILENAME = "u0-ui-contract.json";

export const U0_REVIEWED_COMPANIONS = [
  "primitive-state-matrix.json",
  "provenance-ledger.json",
  "shell-state-matrix.json",
  "trace-ledger.json",
] as const;

const EXPECTED_FILES = [CONTRACT_FILENAME, ...U0_REVIEWED_COMPANIONS] as const;
type ExpectedFilename = (typeof EXPECTED_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<ExpectedFilename, string>> = {
  "u0-ui-contract.json": "changes.ui.u0-contract.v1",
  "primitive-state-matrix.json": "changes.ui.u0-primitive-matrix.v1",
  "provenance-ledger.json": "changes.ui.u0-provenance-ledger.v1",
  "shell-state-matrix.json": "changes.ui.u0-shell-matrix.v1",
  "trace-ledger.json": "changes.ui.u0-trace-ledger.v1",
};

export const U0_REVIEWED_SEMANTIC_DIGESTS: Readonly<
  Record<ExpectedFilename, string>
> = {
  "u0-ui-contract.json":
    "5df94c4fac91ad9e159ab07cbdea6cf6ba096ee433f37b89ea4ad681b0f311a6",
  "primitive-state-matrix.json":
    "6e05bbe3bb4d442adb0510f87d12b72bcc3c19e01c7a56655025bd0e699c9568",
  "provenance-ledger.json":
    "ceb276f41a9eef5b22af193cb63b3c18348c6d57a139bc9094032b56745e3a61",
  "shell-state-matrix.json":
    "7c6076cfc710b70ee248302c3598f808371973a550f808400e31baaad81e2e8a",
  "trace-ledger.json":
    "71e6a1467dd92280a690d3f0086d225bbc9049d91c5aacdda2a85c9ef214e4e4",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<ExpectedFilename, readonly string[]>
> = {
  "u0-ui-contract.json": [
    "allowedContrastPairs",
    "beadId",
    "breakpointPolicy",
    "companions",
    "contractVersion",
    "coverageSummary",
    "description",
    "dismissalPolicies",
    "expectedValuesGenerated",
    "focusPolicies",
    "handoff",
    "identities",
    "independence",
    "interactionStateVocabulary",
    "inventory",
    "limits",
    "menuTopologyPolicy",
    "opaqueValuePolicy",
    "ordering",
    "overlayKindModes",
    "package",
    "policies",
    "productionOutputUsed",
    "publicCollectionLimits",
    "publicNumericPolicy",
    "publicSurface",
    "publicTextLimits",
    "refusalCodes",
    "reviewedFileSha256",
    "schema",
    "stateVocabulary",
    "tokenDefinitions",
    "treeTopologyPolicy",
    "workBounds",
  ],
  "primitive-state-matrix.json": [
    "cases",
    "componentOrdering",
    "components",
    "contrastCases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "galleryCells",
    "menuTopologyCases",
    "productionOutputUsed",
    "schema",
    "stateVocabulary",
    "topologyCases",
  ],
  "provenance-ledger.json": [
    "authoringStatement",
    "authorities",
    "classificationPolicy",
    "expectedValuesGenerated",
    "ledgerVersion",
    "productionOutputUsed",
    "reviewState",
    "schema",
  ],
  "shell-state-matrix.json": [
    "environmentCases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "landmarkContract",
    "overlayCases",
    "productionOutputUsed",
    "refusalCases",
    "schema",
    "shellModes",
    "systemStateCases",
    "viewportCases",
  ],
  "trace-ledger.json": [
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "tracePolicy",
    "traces",
  ],
};

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const U0_REVIEWED_COMPONENT_STATES = [
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
] as const;

export const U0_REVIEWED_CASE_KINDS = [
  "positive",
  "near-miss",
  "malformed",
  "limit",
  "cancellation",
  "stale",
] as const;

export const U0_REVIEWED_LIMITS = {
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
} as const;

export const U0_REVIEWED_REFUSAL_CODES = [
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
] as const;

export const U0_REVIEWED_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1_024 },
  { width: 1_280, height: 800 },
  { width: 1_440, height: 900 },
] as const;

export const U0_REVIEWED_COMPONENTS = [
  { id: "U0-CMP-001", name: "Button", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-002", name: "IconButton", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-003", name: "LinkButton", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-004", name: "Badge", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-005", name: "Kbd", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-006", name: "Separator", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-007", name: "Skeleton", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-008", name: "Spinner", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-009", name: "VisuallyHidden", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-010", name: "Card", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-011", name: "EmptyState", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-012", name: "StatusPill", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-013", name: "Progress", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-014", name: "Meter", family: "foundation", group: "foundations", kind: "render" },
  { id: "U0-CMP-015", name: "Field", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-016", name: "Label", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-017", name: "Input", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-018", name: "Textarea", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-019", name: "NumberField", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-020", name: "Select", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-021", name: "Combobox", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-022", name: "Listbox", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-023", name: "Checkbox", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-024", name: "RadioGroup", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-025", name: "Switch", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-026", name: "Slider", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-027", name: "SegmentedControl", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-028", name: "Toggle", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-029", name: "ToggleGroup", family: "form", group: "forms", kind: "render" },
  { id: "U0-CMP-030", name: "Tabs", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-031", name: "Breadcrumb", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-032", name: "Toolbar", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-033", name: "Menu", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-034", name: "ContextMenu", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-035", name: "CommandPalette", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-036", name: "Disclosure", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-037", name: "Accordion", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-038", name: "ScrollArea", family: "navigation", group: "navigation-and-commands", kind: "render" },
  { id: "U0-CMP-039", name: "RovingFocus", family: "navigation", group: "navigation-and-commands", kind: "behavior" },
  { id: "U0-CMP-040", name: "Tooltip", family: "overlay", group: "overlays-and-feedback", kind: "render" },
  { id: "U0-CMP-041", name: "Popover", family: "overlay", group: "overlays-and-feedback", kind: "render" },
  { id: "U0-CMP-042", name: "Dialog", family: "overlay", group: "overlays-and-feedback", kind: "render" },
  { id: "U0-CMP-043", name: "AlertDialog", family: "overlay", group: "overlays-and-feedback", kind: "render" },
  { id: "U0-CMP-044", name: "SheetDrawer", family: "overlay", group: "overlays-and-feedback", kind: "render" },
  { id: "U0-CMP-045", name: "ToastNotice", family: "overlay", group: "overlays-and-feedback", kind: "render" },
  { id: "U0-CMP-046", name: "FocusDismissLayer", family: "overlay", group: "overlays-and-feedback", kind: "behavior" },
  { id: "U0-CMP-047", name: "KeyValueList", family: "structured", group: "structured-views", kind: "render" },
  { id: "U0-CMP-048", name: "DataTable", family: "structured", group: "structured-views", kind: "render" },
  { id: "U0-CMP-049", name: "Tree", family: "structured", group: "structured-views", kind: "render" },
  { id: "U0-CMP-050", name: "ResizablePanels", family: "structured", group: "structured-views", kind: "render" },
  { id: "U0-CMP-051", name: "TimelineLane", family: "structured", group: "structured-views", kind: "render" },
] as const;

const U0_REVIEWED_IDENTITIES = {
  designSystem: { id: "changes.ui.design-system", version: 1 },
  interaction: { id: "changes.ui.interaction", version: 1 },
  overlay: { id: "changes.ui.overlay", version: 1 },
  responsiveShell: { id: "changes.ui.responsive-shell", version: 1 },
  galleryExclusion: { id: "changes.ui.gallery-exclusion", version: 1 },
} as const;

const U0_REVIEWED_FORBIDDEN_SHORTCUTS = [
  "react-or-preact-compat",
  "radix-tailwind-shadcn-package-or-css-runtime",
  "cdn-font-icon-modal-or-drag-runtime",
  "nested-modal-scope",
  "javascript-device-detection",
  "hue-only-or-hover-only-state",
  "invalid-nested-interactive-control",
  "zoom-blocking",
  "direct-audio-storage-export-or-parser-call",
  "production-generated-expectation",
  "gallery-in-release-artifact",
] as const;

export const U0_REVIEWED_COMPUTED_ROLES = [
  "button",
  "link",
  "none",
  "separator",
  "status",
  "region",
  "progressbar",
  "meter",
  "group",
  "textbox",
  "spinbutton",
  "combobox",
  "listbox",
  "checkbox",
  "radiogroup",
  "switch",
  "slider",
  "tablist",
  "navigation",
  "toolbar",
  "menu",
  "dialog",
  "tooltip",
  "alertdialog",
  "table",
  "tree",
] as const;

const U0_REVIEWED_COMPONENT_ROLE_TOKENS = [
  ...U0_REVIEWED_COMPUTED_ROLES,
  "alert",
  "application",
  "article",
  "banner",
  "caption",
  "cell",
  "columnheader",
  "complementary",
  "contentinfo",
  "form",
  "grid",
  "gridcell",
  "heading",
  "img",
  "list",
  "listitem",
  "log",
  "main",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "note",
  "option",
  "presentation",
  "radio",
  "row",
  "rowgroup",
  "rowheader",
  "search",
  "tab",
  "tabpanel",
  "timer",
  "treegrid",
  "treeitem",
] as const;

const U0_REVIEWED_OPAQUE_SURFACES = [
  "--background",
  "--surface-app",
  "--surface-header",
  "--surface-rail",
  "--surface-chart",
  "--surface-panel",
  "--surface-elevated",
  "--surface-sunken",
] as const;

export const U0_REVIEWED_ALLOWED_CONTRAST_PAIRS = [
  {
    id: "primary-text-on-surfaces",
    foregrounds: ["--text-primary"],
    backgrounds: U0_REVIEWED_OPAQUE_SURFACES,
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "muted-text-on-surfaces",
    foregrounds: ["--text-muted"],
    backgrounds: U0_REVIEWED_OPAQUE_SURFACES,
    minimumRatio: 4.5,
    purpose: "normal-text",
  },
  {
    id: "subtle-text-on-surfaces",
    foregrounds: ["--text-subtle"],
    backgrounds: U0_REVIEWED_OPAQUE_SURFACES,
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
    backgrounds: U0_REVIEWED_OPAQUE_SURFACES,
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
    backgrounds: U0_REVIEWED_OPAQUE_SURFACES,
    minimumRatio: 3,
    purpose: "focus-indicator",
  },
  {
    id: "strong-border-on-surfaces",
    foregrounds: ["--border-strong"],
    backgrounds: U0_REVIEWED_OPAQUE_SURFACES,
    minimumRatio: 3,
    purpose: "component-boundary",
  },
] as const;

const U0_REVIEWED_TRACE_IDS = [
  "TR-U0-SOURCE",
  "TR-U0-INVENTORY",
  "TR-U0-TOKENS",
  "TR-U0-STATES",
  "TR-U0-SHELL",
  "TR-U0-MOBILE",
  "TR-U0-LANDMARKS",
  "TR-U0-KEYBOARD",
  "TR-U0-FOCUS",
  "TR-U0-OVERLAY",
  "TR-U0-TOUCH",
  "TR-U0-REFLOW",
  "TR-U0-FORCED",
  "TR-U0-MOTION",
  "TR-U0-STATUS",
  "TR-U0-BOUNDARY",
  "TR-U0-EMPTY-ERROR",
  "TR-U0-LIMITS",
  "TR-U0-AXE",
  "TR-U0-GALLERY",
] as const;

const U0_REVIEWED_AUTHORITY_IDS = [
  "AUTH-U0-BEAD",
  "AUTH-ARCH",
  "AUTH-PLAN-VISUAL",
  "AUTH-PLAN-A11Y",
  "AUTH-PLAN-UI",
  "AUTH-A0",
  "AUTH-WCAG22",
  "AUTH-PROJECT-UX",
  "AUTH-MECHANICAL",
] as const;

export const U0_REVIEWED_PUBLIC_COLLECTION_LIMITS = {
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
} as const;

export const U0_REVIEWED_PUBLIC_TEXT_LIMITS = {
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
} as const;

export const U0_REVIEWED_PUBLIC_NUMERIC_POLICY = {
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
} as const;

export const U0_REVIEWED_OPAQUE_VALUE_POLICY = {
  genericContent: "caller-owned-and-not-traversed-by-u0",
  applicationIntentPayload: "a0-owned-and-not-traversed-by-u0",
  asyncReadyValue: "selector-owner-bounded-and-not-traversed-by-u0",
  dataTableRow: "caller-owned; u0-visits-only-rowId-and-renderText-results",
} as const;

export const U0_REVIEWED_MENU_TOPOLOGY_POLICY = {
  flattenedItemLimit: 200,
  maximumSubmenuDepth: 4,
  countIncludesSeparatorsAndNestedItems: true,
  uniqueIdsAcrossFlattenedTree: true,
  cycles: "refuse-ui.value_malformed",
  repeatedObjectIdentity: "refuse-ui.value_malformed",
  traversal: "caller-depth-first-order-with-visited-set",
} as const;

export const U0_REVIEWED_TREE_TOPOLOGY_POLICY = {
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
  maximumDepth: 64,
  traversalBound: 5_000,
} as const;

export const U0_REVIEWED_OVERLAY_KIND_MODES = {
  tooltip: ["nonmodal"],
  menu: ["nonmodal"],
  "context-menu": ["nonmodal"],
  popover: ["nonmodal"],
  "command-palette": ["modal"],
  dialog: ["modal"],
  "alert-dialog": ["modal"],
  sheet: ["nonmodal", "modal"],
} as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]";
  }
  if (isObject(value)) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ":" + stableJson(value[key]),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pathString(path: readonly (string | number)[]): string {
  if (path.length === 0) return "$";
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return result + "[" + String(part) + "]";
    return result + "." + JSON.stringify(part);
  }, "$");
}

/** Detect decoded duplicate keys before JSON.parse applies last-key-wins. */
function duplicateJsonKeys(source: string): readonly string[] {
  let cursor = 0;
  const duplicates: string[] = [];

  const whitespace = (): void => {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  };

  const stringToken = (): Readonly<{
    decoded: string;
    start: number;
  }> | null => {
    whitespace();
    if (source[cursor] !== '"') return null;
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const unit = source[cursor];
      if (unit === "\\") {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (unit === '"') {
        try {
          return {
            decoded: JSON.parse(source.slice(start, cursor)) as string,
            start,
          };
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  const value = (path: readonly (string | number)[]): void => {
    whitespace();
    const unit = source[cursor];
    if (unit === "{") {
      cursor += 1;
      const seen = new Set<string>();
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        const key = stringToken();
        if (key === null) return;
        if (seen.has(key.decoded)) {
          duplicates.push(
            pathString(path) +
              "." +
              JSON.stringify(key.decoded) +
              "@" +
              String(key.start),
          );
        }
        seen.add(key.decoded);
        whitespace();
        if (source[cursor] !== ":") return;
        cursor += 1;
        value([...path, key.decoded]);
        whitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === "[") {
      cursor += 1;
      let index = 0;
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        value([...path, index]);
        index += 1;
        whitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === '"') {
      stringToken();
      return;
    }
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };

  value([]);
  return duplicates.sort();
}

function finding(
  findings: U0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function findingOrder(
  left: U0ContractFinding,
  right: U0ContractFinding,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function exactKeys(
  value: JsonObject,
  expected: readonly string[],
  path: string,
  findings: U0ContractFinding[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (stableJson(actual) !== stableJson(wanted)) {
    finding(
      findings,
      "U0_CONTRACT_KEYS",
      path,
      "Expected keys " + wanted.join(", ") + "; received " + actual.join(", ") + ".",
    );
  }
}

function exactValue(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  findings: U0ContractFinding[],
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    finding(findings, code, path, "Value differs from the reviewed U0 contract.");
  }
}

function uniqueStrings(
  value: unknown,
  path: string,
  findings: U0ContractFinding[],
): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.length > 0)
  ) {
    finding(
      findings,
      "U0_CONTRACT_SCHEMA",
      path,
      "Expected a non-empty-string array.",
    );
    return [];
  }
  const result = value as string[];
  const seen = new Set<string>();
  for (const [index, item] of result.entries()) {
    if (seen.has(item)) {
      finding(
        findings,
        "U0_CONTRACT_DUPLICATE_ID",
        path + "[" + String(index) + "]",
        "Duplicate value " + JSON.stringify(item) + ".",
      );
    }
    seen.add(item);
  }
  return result;
}

function indexedRecords(
  records: readonly JsonObject[],
  path: string,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const indexed = new Map<string, LinkedRecord>();
  for (const [index, record] of records.entries()) {
    const recordPath = path + "[" + String(index) + "]";
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      finding(
        findings,
        "U0_CONTRACT_SCHEMA",
        recordPath + ".id",
        "Record ID must be a non-empty string.",
      );
      continue;
    }
    if (indexed.has(id)) {
      finding(
        findings,
        "U0_CONTRACT_DUPLICATE_ID",
        recordPath + ".id",
        "Duplicate record ID " + JSON.stringify(id) + ".",
      );
      continue;
    }
    indexed.set(id, { id, path: recordPath, record });
  }
  return indexed;
}

function referenceIds(
  record: LinkedRecord,
  field: string,
  findings: U0ContractFinding[],
): readonly string[] {
  return uniqueStrings(
    record.record[field],
    record.path + "." + field,
    findings,
  );
}

function checkReferences(
  owners: ReadonlyMap<string, LinkedRecord>,
  ownerField: string,
  targets: ReadonlyMap<string, LinkedRecord>,
  targetKind: string,
  findings: U0ContractFinding[],
): void {
  for (const owner of owners.values()) {
    for (const id of referenceIds(owner, ownerField, findings)) {
      if (!targets.has(id)) {
        finding(
          findings,
          "U0_CONTRACT_UNKNOWN_LINK",
          owner.path + "." + ownerField,
          "Unknown " + targetKind + " ID " + JSON.stringify(id) + ".",
        );
      }
    }
  }
}

function checkReciprocalReferences(
  left: ReadonlyMap<string, LinkedRecord>,
  leftField: string,
  right: ReadonlyMap<string, LinkedRecord>,
  rightField: string,
  findings: U0ContractFinding[],
): void {
  for (const leftRecord of left.values()) {
    for (const rightId of referenceIds(leftRecord, leftField, findings)) {
      const rightRecord = right.get(rightId);
      if (rightRecord === undefined) continue;
      const reverse = strings(rightRecord.record[rightField]);
      if (!reverse.includes(leftRecord.id)) {
        finding(
          findings,
          "U0_CONTRACT_NONRECIPROCAL_LINK",
          leftRecord.path + "." + leftField,
          leftRecord.id +
            " links " +
            rightId +
            " but " +
            rightRecord.path +
            "." +
            rightField +
            " does not link back.",
        );
      }
    }
  }
}

function collectStrings(value: unknown, collected: string[] = []): string[] {
  if (typeof value === "string") {
    collected.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, collected);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) collectStrings(item, collected);
  }
  return collected;
}

function checkCaseKinds(
  cases: ReadonlyMap<string, LinkedRecord>,
  findings: U0ContractFinding[],
): Set<string> {
  const allowed = new Set<string>(U0_REVIEWED_CASE_KINDS);
  const covered = new Set<string>();
  for (const item of cases.values()) {
    const kind = item.record["kind"];
    if (typeof kind !== "string" || !allowed.has(kind)) {
      finding(
        findings,
        "U0_CONTRACT_CASE_KIND",
        item.path + ".kind",
        "Unknown U0 case kind " + JSON.stringify(kind) + ".",
      );
      continue;
    }
    covered.add(kind);
  }
  return covered;
}

function expectedGalleryCellId(componentId: string, state: string): string {
  return (
    "U0-GAL-" +
    componentId.slice("U0-CMP-".length) +
    "-" +
    state.toUpperCase()
  );
}

function checkGalleryCells(
  value: unknown,
  components: ReadonlyMap<string, LinkedRecord>,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(value);
  const cells = indexedRecords(
    records,
    "primitive-state-matrix.json.galleryCells",
    findings,
  );
  const expectedCount =
    U0_REVIEWED_COMPONENTS.length * U0_REVIEWED_COMPONENT_STATES.length;
  if (records.length !== expectedCount) {
    finding(
      findings,
      "U0_CONTRACT_GALLERY_COVERAGE",
      "primitive-state-matrix.json.galleryCells",
      "Expected exactly " +
        String(expectedCount) +
        " component/state gallery cells; received " +
        String(records.length) +
        ".",
    );
  }

  const allowedRoles = new Set<string>(U0_REVIEWED_COMPONENT_ROLE_TOKENS);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined) continue;
    const path =
      "primitive-state-matrix.json.galleryCells[" + String(index) + "]";
    exactKeys(
      record,
      [
        "applicability",
        "authorityIds",
        "caseIds",
        "componentId",
        "expected",
        "id",
        "notApplicableReason",
        "props",
        "state",
        "traceIds",
      ],
      path,
      findings,
    );

    const componentIndex = Math.floor(
      index / U0_REVIEWED_COMPONENT_STATES.length,
    );
    const stateIndex = index % U0_REVIEWED_COMPONENT_STATES.length;
    const expectedComponent = U0_REVIEWED_COMPONENTS[componentIndex];
    const expectedState = U0_REVIEWED_COMPONENT_STATES[stateIndex];
    if (
      expectedComponent === undefined ||
      expectedState === undefined ||
      record["componentId"] !== expectedComponent.id ||
      record["state"] !== expectedState ||
      record["id"] !== expectedGalleryCellId(expectedComponent.id, expectedState)
    ) {
      finding(
        findings,
        "U0_CONTRACT_GALLERY_ORDER",
        path,
        "Gallery cells must use stable IDs in component-ID then state-vocabulary order.",
      );
    }

    const componentId = record["componentId"];
    const state = record["state"];
    const component =
      typeof componentId === "string" ? components.get(componentId) : undefined;
    if (component === undefined) {
      finding(
        findings,
        "U0_CONTRACT_UNKNOWN_LINK",
        path + ".componentId",
        "Gallery cell references an unknown component.",
      );
    }
    if (
      typeof state !== "string" ||
      !(U0_REVIEWED_COMPONENT_STATES as readonly string[]).includes(state)
    ) {
      finding(
        findings,
        "U0_CONTRACT_STATE",
        path + ".state",
        "Gallery cell uses an unknown component state.",
      );
    }

    exactValue(
      record["caseIds"],
      ["U0-PRIM-002"],
      "U0_CONTRACT_GALLERY_LINK",
      path + ".caseIds",
      findings,
    );
    exactValue(
      record["traceIds"],
      ["TR-U0-STATES"],
      "U0_CONTRACT_GALLERY_LINK",
      path + ".traceIds",
      findings,
    );
    exactValue(
      record["authorityIds"],
      ["AUTH-PLAN-UI"],
      "U0_CONTRACT_GALLERY_LINK",
      path + ".authorityIds",
      findings,
    );

    const applicability = record["applicability"];
    const declaredStates =
      component === undefined ? [] : strings(component.record["states"]);
    const declaredApplicable =
      typeof state === "string" && declaredStates.includes(state);
    if (applicability === "applicable") {
      if (!declaredApplicable) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_APPLICABILITY",
          path + ".applicability",
          "Applicable gallery cell is absent from the component state declaration.",
        );
      }
      if (!isObject(record["props"]) || !isObject(record["expected"])) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_ORACLE",
          path,
          "Applicable cell requires controlled props and exact expectations.",
        );
        continue;
      }
      if (record["notApplicableReason"] !== null) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_APPLICABILITY",
          path + ".notApplicableReason",
          "Applicable cell must use a null not-applicable rationale.",
        );
      }
      const props = record["props"];
      const expected = record["expected"];
      exactKeys(
        props,
        [
          "busy",
          "density",
          "disabled",
          "empty",
          "environment",
          "interaction",
          "invalid",
          "setId",
          "variant",
        ],
        path + ".props",
        findings,
      );
      exactKeys(
        expected,
        ["event", "focus", "name", "role", "state"],
        path + ".expected",
        findings,
      );
      if (
        typeof expected["role"] !== "string" ||
        !allowedRoles.has(expected["role"])
      ) {
        finding(
          findings,
          "U0_CONTRACT_COMPUTED_ROLE",
          path + ".expected.role",
          "Expected role must be a computed native/ARIA role token.",
        );
      }
      if (typeof expected["name"] !== "string" && expected["name"] !== null) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_ORACLE",
          path + ".expected.name",
          "Expected accessible name must be an exact string or null.",
        );
      }
      if (!isObject(expected["state"])) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_ORACLE",
          path + ".expected.state",
          "Expected state must be an exact object.",
        );
      } else {
        exactKeys(
          expected["state"],
          [
            "busy",
            "density",
            "disabled",
            "empty",
            "environment",
            "invalid",
          ],
          path + ".expected.state",
          findings,
        );
      }
      if (!isObject(expected["focus"])) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_ORACLE",
          path + ".expected.focus",
          "Expected focus must be an exact object.",
        );
      } else {
        exactKeys(
          expected["focus"],
          ["indicator", "return", "target"],
          path + ".expected.focus",
          findings,
        );
      }
      if (!isObject(expected["event"])) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_ORACLE",
          path + ".expected.event",
          "Expected event must be an exact object.",
        );
      } else {
        exactKeys(
          expected["event"],
          ["count", "type"],
          path + ".expected.event",
          findings,
        );
        if (
          !Number.isSafeInteger(expected["event"]["count"]) ||
          (expected["event"]["count"] as number) < 0
        ) {
          finding(
            findings,
            "U0_CONTRACT_GALLERY_ORACLE",
            path + ".expected.event.count",
            "Expected event count must be a nonnegative safe integer.",
          );
        }
      }
    } else if (applicability === "not-applicable") {
      if (declaredApplicable) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_APPLICABILITY",
          path + ".applicability",
          "Not-applicable gallery cell conflicts with the component state declaration.",
        );
      }
      if (
        record["props"] !== null ||
        record["expected"] !== null ||
        typeof record["notApplicableReason"] !== "string" ||
        record["notApplicableReason"].trim().length === 0
      ) {
        finding(
          findings,
          "U0_CONTRACT_GALLERY_APPLICABILITY",
          path,
          "Not-applicable cell requires null props/expected and a rationale.",
        );
      }
    } else {
      finding(
        findings,
        "U0_CONTRACT_GALLERY_APPLICABILITY",
        path + ".applicability",
        "Applicability must be applicable or not-applicable.",
      );
    }
  }

  return cells;
}

function checkComponents(
  primitive: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(primitive["components"]);
  const components = indexedRecords(
    records,
    "primitive-state-matrix.json.components",
    findings,
  );
  if (records.length !== U0_REVIEWED_COMPONENTS.length) {
    finding(
      findings,
      "U0_CONTRACT_COMPONENT_COUNT",
      "primitive-state-matrix.json.components",
      "Expected exactly 51 public component contracts.",
    );
  }

  const allowedStates = new Set<string>(U0_REVIEWED_COMPONENT_STATES);
  const allowedRoles = new Set<string>(U0_REVIEWED_COMPONENT_ROLE_TOKENS);
  const seenNames = new Set<string>();
  for (const [index, record] of records.entries()) {
    const path =
      "primitive-state-matrix.json.components[" + String(index) + "]";
    exactKeys(
      record,
      [
        "family",
        "focus",
        "galleryCellIds",
        "group",
        "id",
        "keyboard",
        "kind",
        "name",
        "roles",
        "semantic",
        "semantics",
        "states",
        "traceIds",
      ],
      path,
      findings,
    );
    const expected = U0_REVIEWED_COMPONENTS[index];
    if (expected === undefined) {
      continue;
    }
    exactValue(
      {
        id: record["id"],
        name: record["name"],
        family: record["family"],
        group: record["group"],
        kind: record["kind"],
      },
      expected,
      "U0_CONTRACT_COMPONENT_INVENTORY",
      path,
      findings,
    );
    if (
      typeof record["name"] === "string" &&
      seenNames.has(record["name"])
    ) {
      finding(
        findings,
        "U0_CONTRACT_DUPLICATE_ID",
        path + ".name",
        "Duplicate component name " + JSON.stringify(record["name"]) + ".",
      );
    }
    if (typeof record["name"] === "string") seenNames.add(record["name"]);

    const states = uniqueStrings(record["states"], path + ".states", findings);
    for (const state of states) {
      if (!allowedStates.has(state)) {
        finding(
          findings,
          "U0_CONTRACT_STATE",
          path + ".states",
          "Unknown component state " + JSON.stringify(state) + ".",
        );
      }
    }
    if (!states.includes("default") || !states.includes("200-percent-zoom")) {
      finding(
        findings,
        "U0_CONTRACT_STATE_COVERAGE",
        path + ".states",
        "Every component requires default and 200-percent-zoom coverage.",
      );
    }

    const roles = uniqueStrings(record["roles"], path + ".roles", findings);
    for (const role of roles) {
      if (!allowedRoles.has(role)) {
        finding(
          findings,
          "U0_CONTRACT_COMPUTED_ROLE",
          path + ".roles",
          "Role declarations must use computed native/ARIA role tokens; received " +
            JSON.stringify(role) +
            ".",
        );
      }
    }
    uniqueStrings(record["keyboard"], path + ".keyboard", findings);
    uniqueStrings(record["semantics"], path + ".semantics", findings);
    uniqueStrings(record["traceIds"], path + ".traceIds", findings);

    if (!isObject(record["focus"])) {
      finding(
        findings,
        "U0_CONTRACT_SCHEMA",
        path + ".focus",
        "Component focus policy must be an object.",
      );
    } else {
      exactKeys(
        record["focus"],
        ["entry", "movement", "return"],
        path + ".focus",
        findings,
      );
    }

    const expectedCells = U0_REVIEWED_COMPONENT_STATES.map((state) =>
      expectedGalleryCellId(expected.id, state),
    );
    exactValue(
      record["galleryCellIds"],
      expectedCells,
      "U0_CONTRACT_GALLERY_LINK",
      path + ".galleryCellIds",
      findings,
    );
  }

  const scrollArea = components.get("U0-CMP-038");
  if (
    !isObject(scrollArea?.record["focus"]) ||
    scrollArea.record["focus"]["entry"] !== "self-or-child" ||
    scrollArea.record["focus"]["movement"] !== "browser-native"
  ) {
    finding(
      findings,
      "U0_CONTRACT_FOCUS_POLICY",
      scrollArea?.path ?? "primitive-state-matrix.json.components",
      "ScrollArea focus must enter self-or-child and retain browser-native movement.",
    );
  }

  const statusPill = components.get("U0-CMP-012");
  const statusSemantics = collectStrings(statusPill?.record["semantics"])
    .join(" ")
    .toLowerCase();
  if (
    stableJson(statusPill?.record["roles"]) !== stableJson(["none"]) ||
    !(
      statusSemantics.includes("static") &&
      statusSemantics.includes("owning application state")
    )
  ) {
    finding(
      findings,
      "U0_CONTRACT_STATUS_OWNERSHIP",
      statusPill?.path ?? "primitive-state-matrix.json.components",
      "StatusPill is static presentation; live announcement belongs to the state owner.",
    );
  }

  const checkbox = components.get("U0-CMP-023");
  const checkboxSemantics = collectStrings(checkbox?.record["semantics"])
    .join(" ")
    .toLowerCase();
  if (
    !checkboxSemantics.includes("mixed") ||
    !checkboxSemantics.includes("previous")
  ) {
    finding(
      findings,
      "U0_CONTRACT_CHECKBOX_PREVIOUS_STATE",
      checkbox?.path ?? "primitive-state-matrix.json.components",
      "Checkbox oracle must preserve a previous mixed state in its event.",
    );
  }

  const dataTable = components.get("U0-CMP-048");
  const tableSemantics = collectStrings(dataTable?.record["semantics"])
    .join(" ")
    .toLowerCase();
  if (
    !tableSemantics.includes("ascending") ||
    !tableSemantics.includes("descending")
  ) {
    finding(
      findings,
      "U0_CONTRACT_TABLE_SORT",
      dataTable?.path ?? "primitive-state-matrix.json.components",
      "DataTable oracle must represent ascending and descending sort direction.",
    );
  }

  const tooltip = components.get("U0-CMP-040");
  const tooltipKeyboard = collectStrings(tooltip?.record["keyboard"])
    .join(" ")
    .toLowerCase();
  if (
    !tooltipKeyboard.includes("keyboard focus opens immediately") ||
    !tooltipKeyboard.includes("pointer hover opens after 500 ms")
  ) {
    finding(
      findings,
      "U0_CONTRACT_TOOLTIP_TIMING",
      tooltip?.path ?? "primitive-state-matrix.json.components",
      "Tooltip must open immediately for keyboard focus and delay only pointer hover.",
    );
  }
  return components;
}

function checkPrimitiveCases(
  primitive: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(primitive["cases"]);
  const cases = indexedRecords(
    records,
    "primitive-state-matrix.json.cases",
    findings,
  );
  const maxKeys = Object.keys(U0_REVIEWED_LIMITS).filter((key) =>
    key.startsWith("max"),
  );
  const thresholdKeys = Object.keys(U0_REVIEWED_LIMITS).filter(
    (key) => !key.startsWith("max"),
  );
  const seenMaxKeys = new Set<string>();
  const seenThresholdKeys = new Set<string>();
  const cancellationFamilies = new Set<string>();
  const staleFamilies = new Set<string>();
  const allowedFamilies = new Set([
    "foundation",
    "form",
    "navigation",
    "overlay",
    "structured",
  ]);
  const allowedRefusals = new Set<string>(U0_REVIEWED_REFUSAL_CODES);

  for (const [index, record] of records.entries()) {
    const path = "primitive-state-matrix.json.cases[" + String(index) + "]";
    const id = record["id"];
    if (typeof id === "string" && id.startsWith("U0-LIM-")) {
      exactKeys(
        record,
        [
          "atLimitExpected",
          "atLimitInput",
          "authorityIds",
          "id",
          "kind",
          "limitKey",
          "plusOneExpected",
          "plusOneInput",
          "refusal",
          "traceIds",
        ],
        path,
        findings,
      );
      if (record["kind"] !== "limit") {
        finding(
          findings,
          "U0_CONTRACT_LIMIT_CASE",
          path + ".kind",
          "Maximum-boundary case kind must be limit.",
        );
      }
      const limitKey = record["limitKey"];
      if (typeof limitKey !== "string" || !maxKeys.includes(limitKey)) {
        finding(
          findings,
          "U0_CONTRACT_LIMIT_CASE",
          path + ".limitKey",
          "Maximum-boundary case must name one reviewed max* limit.",
        );
      } else {
        if (seenMaxKeys.has(limitKey)) {
          finding(
            findings,
            "U0_CONTRACT_DUPLICATE_ID",
            path + ".limitKey",
            "Duplicate maximum-boundary coverage for " + limitKey + ".",
          );
        }
        seenMaxKeys.add(limitKey);
        const limit = U0_REVIEWED_LIMITS[
          limitKey as keyof typeof U0_REVIEWED_LIMITS
        ];
        if (
          record["atLimitInput"] !== limit ||
          record["plusOneInput"] !== limit + 1
        ) {
          finding(
            findings,
            "U0_CONTRACT_LIMIT_BOUNDARY",
            path,
            "Maximum case inputs must be the exact limit and exact limit plus one.",
          );
        }
      }
      if (
        record["refusal"] !== null &&
        (typeof record["refusal"] !== "string" ||
          !allowedRefusals.has(record["refusal"]))
      ) {
        finding(
          findings,
          "U0_CONTRACT_REFUSAL",
          path + ".refusal",
          "Maximum plus-one refusal must be null or a reviewed U0 refusal code.",
        );
      }
      if (
        record["atLimitExpected"] === null ||
        record["atLimitExpected"] === undefined ||
        record["plusOneExpected"] === null ||
        record["plusOneExpected"] === undefined
      ) {
        finding(
          findings,
          "U0_CONTRACT_LIMIT_BOUNDARY",
          path,
          "Maximum case requires exact at-limit and plus-one expectations.",
        );
      }
    } else if (typeof id === "string" && id.startsWith("U0-THRESH-")) {
      exactKeys(
        record,
        [
          "aboveExpected",
          "aboveInput",
          "atThresholdExpected",
          "atThresholdInput",
          "authorityIds",
          "belowExpected",
          "belowInput",
          "id",
          "kind",
          "limitKey",
          "traceIds",
        ],
        path,
        findings,
      );
      if (record["kind"] !== "limit") {
        finding(
          findings,
          "U0_CONTRACT_THRESHOLD_CASE",
          path + ".kind",
          "Threshold-boundary case kind must be limit.",
        );
      }
      const limitKey = record["limitKey"];
      if (typeof limitKey !== "string" || !thresholdKeys.includes(limitKey)) {
        finding(
          findings,
          "U0_CONTRACT_THRESHOLD_CASE",
          path + ".limitKey",
          "Threshold case must name one reviewed non-max limit.",
        );
      } else {
        if (seenThresholdKeys.has(limitKey)) {
          finding(
            findings,
            "U0_CONTRACT_DUPLICATE_ID",
            path + ".limitKey",
            "Duplicate threshold coverage for " + limitKey + ".",
          );
        }
        seenThresholdKeys.add(limitKey);
        const threshold = U0_REVIEWED_LIMITS[
          limitKey as keyof typeof U0_REVIEWED_LIMITS
        ];
        if (
          typeof record["belowInput"] !== "number" ||
          record["atThresholdInput"] !== threshold ||
          typeof record["aboveInput"] !== "number" ||
          record["belowInput"] >= threshold ||
          record["aboveInput"] <= threshold
        ) {
          finding(
            findings,
            "U0_CONTRACT_THRESHOLD_BOUNDARY",
            path,
            "Threshold inputs must explicitly straddle the exact reviewed threshold.",
          );
        }
      }
      for (const key of [
        "belowExpected",
        "atThresholdExpected",
        "aboveExpected",
      ]) {
        if (record[key] === null || record[key] === undefined) {
          finding(
            findings,
            "U0_CONTRACT_THRESHOLD_BOUNDARY",
            path + "." + key,
            "Threshold case requires exact below, at, and above expectations.",
          );
        }
      }
    } else if (
      typeof id === "string" &&
      (id.startsWith("U0-CANCEL-") || id.startsWith("U0-STALE-"))
    ) {
      exactKeys(
        record,
        [
          "authorityIds",
          "expected",
          "family",
          "id",
          "input",
          "kind",
          "subject",
          "traceIds",
        ],
        path,
        findings,
      );
      const expectedKind = id.startsWith("U0-CANCEL-")
        ? "cancellation"
        : "stale";
      if (record["kind"] !== expectedKind) {
        finding(
          findings,
          "U0_CONTRACT_CASE_KIND",
          path + ".kind",
          "Dedicated " + expectedKind + " case has the wrong kind.",
        );
      }
      const family = record["family"];
      if (typeof family !== "string" || !allowedFamilies.has(family)) {
        finding(
          findings,
          "U0_CONTRACT_FAMILY_COVERAGE",
          path + ".family",
          "Cancellation/stale case must name one component family.",
        );
      } else {
        (expectedKind === "cancellation"
          ? cancellationFamilies
          : staleFamilies
        ).add(family);
      }
    } else {
      exactKeys(
        record,
        id === "U0-PRIM-002"
          ? [
              "authorityIds",
              "expected",
              "galleryCellIds",
              "id",
              "input",
              "kind",
              "subject",
              "traceIds",
            ]
          : [
              "authorityIds",
              "expected",
              "id",
              "input",
              "kind",
              "subject",
              "traceIds",
            ],
        path,
        findings,
      );
    }
    uniqueStrings(record["traceIds"], path + ".traceIds", findings);
    uniqueStrings(record["authorityIds"], path + ".authorityIds", findings);
  }

  exactValue(
    [...seenMaxKeys].sort(),
    [...maxKeys].sort(),
    "U0_CONTRACT_LIMIT_COVERAGE",
    "primitive-state-matrix.json.cases",
    findings,
  );
  exactValue(
    [...seenThresholdKeys].sort(),
    [...thresholdKeys].sort(),
    "U0_CONTRACT_THRESHOLD_COVERAGE",
    "primitive-state-matrix.json.cases",
    findings,
  );
  exactValue(
    [...cancellationFamilies].sort(),
    [...allowedFamilies].sort(),
    "U0_CONTRACT_FAMILY_COVERAGE",
    "primitive-state-matrix.json.cases",
    findings,
  );
  exactValue(
    [...staleFamilies].sort(),
    [...allowedFamilies].sort(),
    "U0_CONTRACT_FAMILY_COVERAGE",
    "primitive-state-matrix.json.cases",
    findings,
  );

  const kinds = checkCaseKinds(cases, findings);
  exactValue(
    [...kinds].sort(),
    [...U0_REVIEWED_CASE_KINDS].sort(),
    "U0_CONTRACT_CASE_COVERAGE",
    "primitive-state-matrix.json.cases",
    findings,
  );
  return cases;
}

function checkTopologyCases(
  primitive: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(primitive["topologyCases"]);
  const cases = indexedRecords(
    records,
    "primitive-state-matrix.json.topologyCases",
    findings,
  );
  if (records.length !== 13) {
    finding(
      findings,
      "U0_CONTRACT_TOPOLOGY_COVERAGE",
      "primitive-state-matrix.json.topologyCases",
      "Expected exactly 13 rooted-forest topology and boundary cases.",
    );
  }
  for (const [index, record] of records.entries()) {
    const path =
      "primitive-state-matrix.json.topologyCases[" + String(index) + "]";
    exactKeys(
      record,
      [
        "authorityIds",
        "componentIds",
        "expected",
        "id",
        "input",
        "kind",
        "refusal",
        "subject",
        "traceIds",
      ],
      path,
      findings,
    );
    if (
      record["id"] !== "U0-TOPO-" + String(index + 1).padStart(3, "0")
    ) {
      finding(
        findings,
        "U0_CONTRACT_TOPOLOGY_ORDER",
        path + ".id",
        "Topology cases require stable sequential U0-TOPO IDs.",
      );
    }
    exactValue(
      record["componentIds"],
      ["U0-CMP-049"],
      "U0_CONTRACT_TOPOLOGY_LINK",
      path + ".componentIds",
      findings,
    );
    const traceIds = uniqueStrings(
      record["traceIds"],
      path + ".traceIds",
      findings,
    );
    if (!traceIds.includes("TR-U0-LIMITS")) {
      finding(
        findings,
        "U0_CONTRACT_TOPOLOGY_LINK",
        path + ".traceIds",
        "Every topology case must link TR-U0-LIMITS.",
      );
    }
    uniqueStrings(record["authorityIds"], path + ".authorityIds", findings);
    const kind = record["kind"];
    if (
      typeof kind !== "string" ||
      !(U0_REVIEWED_CASE_KINDS as readonly string[]).includes(kind)
    ) {
      finding(
        findings,
        "U0_CONTRACT_CASE_KIND",
        path + ".kind",
        "Unknown topology case kind.",
      );
    }
    const refusal = record["refusal"];
    if (
      refusal !== null &&
      (typeof refusal !== "string" ||
        !(U0_REVIEWED_REFUSAL_CODES as readonly string[]).includes(refusal))
    ) {
      finding(
        findings,
        "U0_CONTRACT_REFUSAL",
        path + ".refusal",
        "Topology refusal must be null or a reviewed U0 refusal code.",
      );
    }
  }
  return cases;
}

function checkMenuTopologyCases(
  primitive: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(primitive["menuTopologyCases"]);
  const cases = indexedRecords(
    records,
    "primitive-state-matrix.json.menuTopologyCases",
    findings,
  );
  if (records.length !== 7) {
    finding(
      findings,
      "U0_CONTRACT_MENU_TOPOLOGY_COVERAGE",
      "primitive-state-matrix.json.menuTopologyCases",
      "Expected exactly seven menu topology and boundary cases.",
    );
  }
  for (const [index, record] of records.entries()) {
    const path =
      "primitive-state-matrix.json.menuTopologyCases[" + String(index) + "]";
    exactKeys(
      record,
      [
        "authorityIds",
        "componentIds",
        "expected",
        "id",
        "input",
        "kind",
        "refusal",
        "subject",
        "traceIds",
      ],
      path,
      findings,
    );
    if (
      record["id"] !==
      "U0-MENU-TOPO-" + String(index + 1).padStart(3, "0")
    ) {
      finding(
        findings,
        "U0_CONTRACT_MENU_TOPOLOGY_ORDER",
        path + ".id",
        "Menu topology cases require stable sequential IDs.",
      );
    }
    exactValue(
      record["componentIds"],
      ["U0-CMP-033", "U0-CMP-034"],
      "U0_CONTRACT_MENU_TOPOLOGY_LINK",
      path + ".componentIds",
      findings,
    );
    exactValue(
      record["traceIds"],
      ["TR-U0-LIMITS"],
      "U0_CONTRACT_MENU_TOPOLOGY_LINK",
      path + ".traceIds",
      findings,
    );
    exactValue(
      record["authorityIds"],
      ["AUTH-MECHANICAL"],
      "U0_CONTRACT_MENU_TOPOLOGY_LINK",
      path + ".authorityIds",
      findings,
    );
    const kind = record["kind"];
    if (
      typeof kind !== "string" ||
      !(U0_REVIEWED_CASE_KINDS as readonly string[]).includes(kind)
    ) {
      finding(
        findings,
        "U0_CONTRACT_CASE_KIND",
        path + ".kind",
        "Unknown menu topology case kind.",
      );
    }
    const refusal = record["refusal"];
    if (
      refusal !== null &&
      (typeof refusal !== "string" ||
        !(U0_REVIEWED_REFUSAL_CODES as readonly string[]).includes(refusal))
    ) {
      finding(
        findings,
        "U0_CONTRACT_REFUSAL",
        path + ".refusal",
        "Menu topology refusal must be null or a reviewed U0 refusal code.",
      );
    }
  }
  return cases;
}

function checkContrastCases(
  primitive: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(primitive["contrastCases"]);
  const cases = indexedRecords(
    records,
    "primitive-state-matrix.json.contrastCases",
    findings,
  );
  if (records.length !== U0_REVIEWED_ALLOWED_CONTRAST_PAIRS.length) {
    finding(
      findings,
      "U0_CONTRACT_CONTRAST_COVERAGE",
      "primitive-state-matrix.json.contrastCases",
      "Expected exactly one contrast case for each allowed pair.",
    );
  }
  for (const [index, record] of records.entries()) {
    const path =
      "primitive-state-matrix.json.contrastCases[" + String(index) + "]";
    exactKeys(
      record,
      [
        "authorityIds",
        "backgrounds",
        "foregrounds",
        "id",
        "kind",
        "minimumRatio",
        "pairId",
        "purpose",
        "traceIds",
      ],
      path,
      findings,
    );
    const expected = U0_REVIEWED_ALLOWED_CONTRAST_PAIRS[index];
    if (expected === undefined) continue;
    exactValue(
      {
        pairId: record["pairId"],
        foregrounds: record["foregrounds"],
        backgrounds: record["backgrounds"],
        minimumRatio: record["minimumRatio"],
        purpose: record["purpose"],
      },
      {
        pairId: expected.id,
        foregrounds: expected.foregrounds,
        backgrounds: expected.backgrounds,
        minimumRatio: expected.minimumRatio,
        purpose: expected.purpose,
      },
      "U0_CONTRACT_CONTRAST_PAIR",
      path,
      findings,
    );
    if (
      record["id"] !== "U0-CONTRAST-" + String(index + 1).padStart(3, "0") ||
      record["kind"] !== "positive"
    ) {
      finding(
        findings,
        "U0_CONTRACT_CONTRAST_ORDER",
        path,
        "Contrast cases require stable sequential IDs and positive kind.",
      );
    }
    uniqueStrings(record["traceIds"], path + ".traceIds", findings);
    uniqueStrings(record["authorityIds"], path + ".authorityIds", findings);
  }
  return cases;
}

function checkShell(
  shell: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const modes = objects(shell["shellModes"]);
  if (modes.length !== 3) {
    finding(
      findings,
      "U0_CONTRACT_SHELL_MODE",
      "shell-state-matrix.json.shellModes",
      "Expected compact, balanced, and wide shell modes.",
    );
  }
  const expectedModes = [
    {
      id: "compact",
      contentWidth: "below-640-css-px",
      library: "named-modal-or-nonmodal-sheet",
      harmonyLens: "bottom-sheet-with-visible-close",
    },
    {
      id: "balanced",
      contentWidth: "at-least-640-and-below-1100-css-px",
      library: "named-sheet",
      harmonyLens: "persistent-rail",
    },
    {
      id: "wide",
      contentWidth: "at-least-1100-css-px",
      library: "persistent-collapsible-rail",
      harmonyLens: "persistent-collapsible-rail",
    },
  ] as const;
  for (const [index, mode] of modes.entries()) {
    const path = "shell-state-matrix.json.shellModes[" + String(index) + "]";
    exactKeys(
      mode,
      ["contentWidth", "harmonyLens", "id", "layout", "library"],
      path,
      findings,
    );
    const expected = expectedModes[index];
    if (
      expected === undefined ||
      mode["id"] !== expected.id ||
      mode["contentWidth"] !== expected.contentWidth ||
      mode["library"] !== expected.library ||
      mode["harmonyLens"] !== expected.harmonyLens
    ) {
      finding(
        findings,
        "U0_CONTRACT_SHELL_MODE",
        path,
        "Shell mode conflicts with the reviewed compact/balanced/wide disposition.",
      );
    }
  }

  const landmarks = shell["landmarkContract"];
  if (!isObject(landmarks)) {
    finding(
      findings,
      "U0_CONTRACT_LANDMARK",
      "shell-state-matrix.json.landmarkContract",
      "Landmark contract must be an object.",
    );
  } else {
    exactKeys(
      landmarks,
      [
        "chartSemantics",
        "chordCardSemantics",
        "headings",
        "landmarks",
        "landmarkTokens",
        "skipLinkTarget",
        "tabOrder",
      ],
      "shell-state-matrix.json.landmarkContract",
      findings,
    );
    exactValue(
      landmarks["skipLinkTarget"],
      "workspace",
      "U0_CONTRACT_LANDMARK",
      "shell-state-matrix.json.landmarkContract.skipLinkTarget",
      findings,
    );
    exactValue(
      landmarks["landmarks"],
      [
        { id: "app-header", role: "banner", name: null },
        { id: "workspace", role: "main", name: null },
        { id: "library-rail", role: "complementary", name: "Library" },
        {
          id: "chart-workspace",
          role: "region",
          name: "Chart workspace",
        },
        {
          id: "harmony-lens-rail",
          role: "complementary",
          name: "Harmony Lens",
        },
        { id: "transport-bar", role: "region", name: "Transport" },
      ],
      "U0_CONTRACT_LANDMARK",
      "shell-state-matrix.json.landmarkContract.landmarks",
      findings,
    );
    exactValue(
      landmarks["landmarkTokens"],
      [
        "app-header/banner",
        "workspace/main",
        "library-rail/complementary",
        "chart-workspace/region-within-main",
        "harmony-lens-rail/complementary",
        "transport-bar/named-region",
      ],
      "U0_CONTRACT_LANDMARK",
      "shell-state-matrix.json.landmarkContract.landmarkTokens",
      findings,
    );
  }

  const caseGroups = [
    {
      field: "viewportCases",
      count: 5,
      keys: [
        "authorityIds",
        "expected",
        "expectedMode",
        "id",
        "kind",
        "traceIds",
        "viewport",
      ],
    },
    {
      field: "environmentCases",
      count: 8,
      keys: [
        "authorityIds",
        "claimBoundary",
        "environment",
        "expected",
        "id",
        "kind",
        "traceIds",
      ],
    },
    {
      field: "overlayCases",
      count: 12,
      keys: ["action", "authorityIds", "expected", "id", "kind", "traceIds"],
    },
    {
      field: "systemStateCases",
      count: 20,
      keys: ["authorityIds", "expected", "id", "kind", "state", "traceIds"],
    },
    {
      field: "refusalCases",
      count: 10,
      keys: [
        "authorityIds",
        "expected",
        "id",
        "input",
        "kind",
        "traceIds",
      ],
    },
  ] as const;
  const allRecords: JsonObject[] = [];
  for (const group of caseGroups) {
    const records = objects(shell[group.field]);
    allRecords.push(...records);
    if (records.length !== group.count) {
      finding(
        findings,
        "U0_CONTRACT_CASE_COUNT",
        "shell-state-matrix.json." + group.field,
        "Expected exactly " + String(group.count) + " reviewed cases.",
      );
    }
    for (const [index, record] of records.entries()) {
      const path =
        "shell-state-matrix.json." + group.field + "[" + String(index) + "]";
      exactKeys(
        record,
        group.field === "overlayCases" && record["id"] === "U0-OVR-006"
          ? [...group.keys, "focusFallbackOrder"]
          : group.keys,
        path,
        findings,
      );
      if (
        group.field === "overlayCases" &&
        record["id"] === "U0-OVR-006" &&
        record["focusFallbackOrder"] !==
          "exact-trigger-then-a0-workflow-target-then-workspace"
      ) {
        finding(
          findings,
          "U0_CONTRACT_FOCUS_FALLBACK",
          path + ".focusFallbackOrder",
          "Overlay focus fallback order drifted.",
        );
      }
      uniqueStrings(record["traceIds"], path + ".traceIds", findings);
      uniqueStrings(record["authorityIds"], path + ".authorityIds", findings);
    }
  }
  const cases = indexedRecords(
    allRecords,
    "shell-state-matrix.json.allCases",
    findings,
  );
  const kinds = checkCaseKinds(cases, findings);
  exactValue(
    [...kinds].sort(),
    [...U0_REVIEWED_CASE_KINDS].sort(),
    "U0_CONTRACT_CASE_COVERAGE",
    "shell-state-matrix.json",
    findings,
  );

  const viewports = objects(shell["viewportCases"]);
  for (const [index, reviewed] of U0_REVIEWED_VIEWPORTS.entries()) {
    const actual = viewports[index];
    const expectedMode = index < 2 ? "compact" : index === 2 ? "balanced" : "wide";
    if (
      actual === undefined ||
      !isObject(actual["viewport"]) ||
      actual["viewport"]["width"] !== reviewed.width ||
      actual["viewport"]["height"] !== reviewed.height ||
      actual["viewport"]["deviceScaleFactor"] !== 1 ||
      actual["expectedMode"] !== expectedMode
    ) {
      finding(
        findings,
        "U0_CONTRACT_VIEWPORT",
        "shell-state-matrix.json.viewportCases[" + String(index) + "]",
        "Required viewport or responsive shell mode drifted.",
      );
    }
  }

  const shellStrings = collectStrings(shell);
  if (!shellStrings.includes("exact-trigger-then-a0-workflow-target-then-workspace")) {
    finding(
      findings,
      "U0_CONTRACT_FOCUS_FALLBACK",
      "shell-state-matrix.json.overlayCases",
      "Overlay focus fallback must be exact trigger, then A0 workflow target, then workspace.",
    );
  }
  return cases;
}

function checkTraces(
  traceLedger: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(traceLedger["traces"]);
  const traces = indexedRecords(
    records,
    "trace-ledger.json.traces",
    findings,
  );
  exactValue(
    records.map((record) => record["id"]),
    U0_REVIEWED_TRACE_IDS,
    "U0_CONTRACT_TRACE_INVENTORY",
    "trace-ledger.json.traces",
    findings,
  );
  for (const [index, record] of records.entries()) {
    const path = "trace-ledger.json.traces[" + String(index) + "]";
    const hasGalleryCells = record["id"] === "TR-U0-STATES";
    exactKeys(
      record,
      hasGalleryCells
        ? [
            "authorityIds",
            "caseIds",
            "componentIds",
            "galleryCellIds",
            "id",
            "parentSource",
            "plannedEvidenceOwner",
            "requirement",
          ]
        : [
            "authorityIds",
            "caseIds",
            "componentIds",
            "id",
            "parentSource",
            "plannedEvidenceOwner",
            "requirement",
          ],
      path,
      findings,
    );
    uniqueStrings(record["componentIds"], path + ".componentIds", findings);
    uniqueStrings(record["caseIds"], path + ".caseIds", findings);
    uniqueStrings(record["authorityIds"], path + ".authorityIds", findings);
    if (hasGalleryCells) {
      uniqueStrings(record["galleryCellIds"], path + ".galleryCellIds", findings);
    }
    if (
      typeof record["requirement"] !== "string" ||
      record["requirement"].trim().length === 0 ||
      typeof record["parentSource"] !== "string" ||
      record["parentSource"].trim().length === 0 ||
      typeof record["plannedEvidenceOwner"] !== "string" ||
      !record["plannedEvidenceOwner"].startsWith("tests/")
    ) {
      finding(
        findings,
        "U0_CONTRACT_TRACE_SCHEMA",
        path,
        "Trace requires a requirement, parent authority, and local test evidence owner.",
      );
    }
  }
  return traces;
}

function checkAuthorities(
  provenance: JsonObject,
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const records = objects(provenance["authorities"]);
  const authorities = indexedRecords(
    records,
    "provenance-ledger.json.authorities",
    findings,
  );
  exactValue(
    records.map((record) => record["id"]),
    U0_REVIEWED_AUTHORITY_IDS,
    "U0_CONTRACT_AUTHORITY_INVENTORY",
    "provenance-ledger.json.authorities",
    findings,
  );
  for (const [index, record] of records.entries()) {
    const path = "provenance-ledger.json.authorities[" + String(index) + "]";
    const hasGalleryCells = record["id"] === "AUTH-PLAN-UI";
    exactKeys(
      record,
      hasGalleryCells
        ? [
            "caseIds",
            "class",
            "galleryCellIds",
            "id",
            "source",
            "supports",
            "traceIds",
          ]
        : ["caseIds", "class", "id", "source", "supports", "traceIds"],
      path,
      findings,
    );
    uniqueStrings(record["caseIds"], path + ".caseIds", findings);
    uniqueStrings(record["traceIds"], path + ".traceIds", findings);
    uniqueStrings(record["supports"], path + ".supports", findings);
    if (hasGalleryCells) {
      uniqueStrings(record["galleryCellIds"], path + ".galleryCellIds", findings);
    }
    if (
      typeof record["source"] !== "string" ||
      record["source"].trim().length === 0 ||
      typeof record["class"] !== "string" ||
      record["class"].trim().length === 0
    ) {
      finding(
        findings,
        "U0_CONTRACT_AUTHORITY",
        path,
        "Authority source and classification must be non-empty.",
      );
    }
  }
  if (provenance["reviewState"] !== "reviewed-contract-authority") {
    finding(
      findings,
      "U0_CONTRACT_AUTHORITY",
      "provenance-ledger.json.reviewState",
      "Provenance ledger must remain reviewed contract authority.",
    );
  }
  return authorities;
}

function relativeLuminance(hex: string): number | null {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) return null;
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return (
    0.2126 * (linear[0] ?? 0) +
    0.7152 * (linear[1] ?? 0) +
    0.0722 * (linear[2] ?? 0)
  );
}

function checkContrastRatios(
  contract: JsonObject,
  findings: U0ContractFinding[],
): void {
  const tokenDefinitions = contract["tokenDefinitions"];
  const baseColors =
    isObject(tokenDefinitions) && isObject(tokenDefinitions["color"])
      ? tokenDefinitions["color"]
      : {};
  const lightOverrides =
    isObject(tokenDefinitions) && isObject(tokenDefinitions["colorLight"])
      ? tokenDefinitions["colorLight"]
      : {};
  /* Both reviewed themes must clear every pair: the dark base map, and the
   * light map formed by the overrides layered over that base. */
  const themes: readonly (readonly [string, JsonObject])[] = [
    ["dark", baseColors],
    ["light", { ...baseColors, ...lightOverrides }],
  ];
  const pairs = objects(contract["allowedContrastPairs"]);
  for (const [themeName, colors] of themes)
  for (const [index, pair] of pairs.entries()) {
    const path =
      "u0-ui-contract.json.allowedContrastPairs[" +
      String(index) +
      "]@" +
      themeName;
    const minimum = pair["minimumRatio"];
    if (typeof minimum !== "number" || !Number.isFinite(minimum)) {
      finding(
        findings,
        "U0_CONTRACT_CONTRAST_RATIO",
        path + ".minimumRatio",
        "Contrast minimum must be finite.",
      );
      continue;
    }
    for (const foreground of strings(pair["foregrounds"])) {
      for (const background of strings(pair["backgrounds"])) {
        const foregroundValue = colors[foreground];
        const backgroundValue = colors[background];
        const foregroundLuminance =
          typeof foregroundValue === "string"
            ? relativeLuminance(foregroundValue)
            : null;
        const backgroundLuminance =
          typeof backgroundValue === "string"
            ? relativeLuminance(backgroundValue)
            : null;
        if (foregroundLuminance === null || backgroundLuminance === null) {
          finding(
            findings,
            "U0_CONTRACT_CONTRAST_TOKEN",
            path,
            "Contrast pair references a missing or non-opaque hex color token.",
          );
          continue;
        }
        const ratio =
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
        if (ratio + Number.EPSILON < minimum) {
          finding(
            findings,
            "U0_CONTRACT_CONTRAST_RATIO",
            path,
            foreground +
              " on " +
              background +
              " has ratio " +
              ratio.toFixed(3) +
              ", below " +
              String(minimum) +
              ".",
          );
        }
      }
    }
  }
}

function checkManifest(
  contract: JsonObject,
  fixtures: ReadonlyMap<ExpectedFilename, ParsedFixture>,
  findings: U0ContractFinding[],
): void {
  exactValue(
    {
      package: contract["package"],
      contractVersion: contract["contractVersion"],
      beadId: contract["beadId"],
    },
    {
      package: "U0",
      contractVersion: 1,
      beadId: "jcpe-milestone-reliable-studio-l3a.9.1",
    },
    "U0_CONTRACT_IDENTITY",
    "u0-ui-contract.json",
    findings,
  );
  exactValue(
    contract["companions"],
    U0_REVIEWED_COMPANIONS,
    "U0_CONTRACT_COMPANIONS",
    "u0-ui-contract.json.companions",
    findings,
  );
  exactValue(
    contract["identities"],
    U0_REVIEWED_IDENTITIES,
    "U0_CONTRACT_IDENTITY",
    "u0-ui-contract.json.identities",
    findings,
  );
  exactValue(
    contract["stateVocabulary"],
    U0_REVIEWED_COMPONENT_STATES,
    "U0_CONTRACT_STATE",
    "u0-ui-contract.json.stateVocabulary",
    findings,
  );
  exactValue(
    contract["limits"],
    U0_REVIEWED_LIMITS,
    "U0_CONTRACT_LIMITS",
    "u0-ui-contract.json.limits",
    findings,
  );
  exactValue(
    contract["refusalCodes"],
    U0_REVIEWED_REFUSAL_CODES,
    "U0_CONTRACT_REFUSAL",
    "u0-ui-contract.json.refusalCodes",
    findings,
  );
  exactValue(
    contract["allowedContrastPairs"],
    U0_REVIEWED_ALLOWED_CONTRAST_PAIRS,
    "U0_CONTRACT_CONTRAST_PAIR",
    "u0-ui-contract.json.allowedContrastPairs",
    findings,
  );
  exactValue(
    contract["publicCollectionLimits"],
    U0_REVIEWED_PUBLIC_COLLECTION_LIMITS,
    "U0_CONTRACT_PUBLIC_LIMIT_ASSIGNMENT",
    "u0-ui-contract.json.publicCollectionLimits",
    findings,
  );
  exactValue(
    contract["publicTextLimits"],
    U0_REVIEWED_PUBLIC_TEXT_LIMITS,
    "U0_CONTRACT_PUBLIC_LIMIT_ASSIGNMENT",
    "u0-ui-contract.json.publicTextLimits",
    findings,
  );
  exactValue(
    contract["publicNumericPolicy"],
    U0_REVIEWED_PUBLIC_NUMERIC_POLICY,
    "U0_CONTRACT_PUBLIC_NUMERIC_POLICY",
    "u0-ui-contract.json.publicNumericPolicy",
    findings,
  );
  exactValue(
    contract["opaqueValuePolicy"],
    U0_REVIEWED_OPAQUE_VALUE_POLICY,
    "U0_CONTRACT_OPAQUE_VALUE_POLICY",
    "u0-ui-contract.json.opaqueValuePolicy",
    findings,
  );
  exactValue(
    contract["menuTopologyPolicy"],
    U0_REVIEWED_MENU_TOPOLOGY_POLICY,
    "U0_CONTRACT_MENU_TOPOLOGY",
    "u0-ui-contract.json.menuTopologyPolicy",
    findings,
  );
  exactValue(
    contract["treeTopologyPolicy"],
    U0_REVIEWED_TREE_TOPOLOGY_POLICY,
    "U0_CONTRACT_TREE_TOPOLOGY",
    "u0-ui-contract.json.treeTopologyPolicy",
    findings,
  );
  exactValue(
    contract["overlayKindModes"],
    U0_REVIEWED_OVERLAY_KIND_MODES,
    "U0_CONTRACT_OVERLAY_MODES",
    "u0-ui-contract.json.overlayKindModes",
    findings,
  );

  const focusPolicies = [
    "browser-native",
    "self",
    "self-or-child",
    "first-enabled-item",
    "selected-item",
    "explicit-initial-focus",
    "roving-horizontal",
    "roving-vertical",
    "roving-both",
    "normal-tab-sequence",
    "restore-trigger-or-stable-fallback",
    "programmatic-only",
    "none",
  ];
  exactValue(
    contract["focusPolicies"],
    focusPolicies,
    "U0_CONTRACT_FOCUS_POLICY",
    "u0-ui-contract.json.focusPolicies",
    findings,
  );

  const inventory = contract["inventory"];
  if (!isObject(inventory)) {
    finding(
      findings,
      "U0_CONTRACT_COMPONENT_INVENTORY",
      "u0-ui-contract.json.inventory",
      "Inventory must be an object.",
    );
  } else {
    const groups = [
      "foundations",
      "forms",
      "navigation-and-commands",
      "overlays-and-feedback",
      "structured-views",
    ].map((group) => {
      const componentIds = U0_REVIEWED_COMPONENTS.filter(
        (component) => component.group === group,
      ).map((component) => component.id);
      return { id: group, count: componentIds.length, componentIds };
    });
    exactValue(
      inventory,
      { total: 51, groups },
      "U0_CONTRACT_COMPONENT_INVENTORY",
      "u0-ui-contract.json.inventory",
      findings,
    );
  }

  const publicSurface = contract["publicSurface"];
  if (
    !isObject(publicSurface) ||
    publicSurface["contractModule"] !== "src/ui/ui-contract.ts" ||
    publicSurface["galleryReleaseDisposition"] !==
      "test-only-excluded-from-release-artifact" ||
    publicSurface["renderInput"] !== "application-selector-values" ||
    publicSurface["output"] !== "typed-application-intents" ||
    publicSurface["directAdapterCalls"] !== "forbidden"
  ) {
    finding(
      findings,
      "U0_CONTRACT_RUNTIME_BOUNDARY",
      "u0-ui-contract.json.publicSurface",
      "UI must remain selector-in/intent-out with no direct adapter calls.",
    );
  }
  const policies = contract["policies"];
  if (
    !isObject(policies) ||
    policies["runtime"] !==
      "native-preact-and-css-source-owned-no-compat-layer" ||
    policies["assets"] !== "system-fonts-and-inline-reviewed-svg-only" ||
    policies["gallery"] !== "test-only-and-absent-from-standalone-artifact"
  ) {
    finding(
      findings,
      "U0_CONTRACT_RUNTIME_BOUNDARY",
      "u0-ui-contract.json.policies",
      "Runtime policy permits a forbidden UI dependency or release capability.",
    );
  }
  const independence = contract["independence"];
  if (
    !isObject(independence) ||
    independence["productionImplementationAvailableWhenAuthored"] !== false ||
    independence["productionImportsForbidden"] !== true ||
    independence["expectedValuesGenerated"] !== false ||
    independence["productionOutputUsed"] !== false
  ) {
    finding(
      findings,
      "U0_CONTRACT_INDEPENDENCE",
      "u0-ui-contract.json.independence",
      "Fixture authority must be independently authored without production output.",
    );
  }
  const handoff = contract["handoff"];
  if (!isObject(handoff)) {
    finding(
      findings,
      "U0_CONTRACT_RUNTIME_BOUNDARY",
      "u0-ui-contract.json.handoff",
      "Handoff policy must be an object.",
    );
  } else {
    exactValue(
      handoff["forbiddenShortcuts"],
      U0_REVIEWED_FORBIDDEN_SHORTCUTS,
      "U0_CONTRACT_RUNTIME_BOUNDARY",
      "u0-ui-contract.json.handoff.forbiddenShortcuts",
      findings,
    );
    if (
      handoff["implementationMayConsultMarkdownPlan"] !== false ||
      handoff["mustUseReviewedFixtures"] !== true
    ) {
      finding(
        findings,
        "U0_CONTRACT_RUNTIME_BOUNDARY",
        "u0-ui-contract.json.handoff",
        "Implementations must consume reviewed fixtures, not prose or shortcuts.",
      );
    }
  }

  const assignments = [
    ...Object.values(U0_REVIEWED_PUBLIC_COLLECTION_LIMITS),
    ...Object.values(U0_REVIEWED_PUBLIC_TEXT_LIMITS),
  ];
  const knownLimits = new Set(Object.keys(U0_REVIEWED_LIMITS));
  for (const assignment of assignments) {
    if (!knownLimits.has(assignment)) {
      finding(
        findings,
        "U0_CONTRACT_PUBLIC_LIMIT_ASSIGNMENT",
        "u0-ui-contract.json",
        "Public field assignment names unknown limit " + assignment + ".",
      );
    }
  }

  const reviewedHashes = contract["reviewedFileSha256"];
  if (!isObject(reviewedHashes)) {
    finding(
      findings,
      "U0_CONTRACT_COMPANION_HASH",
      "u0-ui-contract.json.reviewedFileSha256",
      "Companion byte digests must be an object.",
    );
  } else {
    exactKeys(
      reviewedHashes,
      U0_REVIEWED_COMPANIONS,
      "u0-ui-contract.json.reviewedFileSha256",
      findings,
    );
    for (const filename of U0_REVIEWED_COMPANIONS) {
      const reviewed = reviewedHashes[filename];
      const actual = fixtures.get(filename)?.byteDigest;
      if (
        typeof reviewed !== "string" ||
        !SHA256_PATTERN.test(reviewed) ||
        reviewed !== actual
      ) {
        finding(
          findings,
          "U0_CONTRACT_COMPANION_HASH",
          "u0-ui-contract.json.reviewedFileSha256." + filename,
          "Reviewed companion SHA-256 is missing, pending, malformed, or stale.",
        );
      }
    }
  }
  checkContrastRatios(contract, findings);
}

function mergeCaseMaps(
  maps: readonly ReadonlyMap<string, LinkedRecord>[],
  findings: U0ContractFinding[],
): Map<string, LinkedRecord> {
  const merged = new Map<string, LinkedRecord>();
  for (const records of maps) {
    for (const record of records.values()) {
      if (merged.has(record.id)) {
        finding(
          findings,
          "U0_CONTRACT_DUPLICATE_ID",
          record.path + ".id",
          "Case ID duplicates another matrix record: " + record.id + ".",
        );
      } else {
        merged.set(record.id, record);
      }
    }
  }
  return merged;
}

function checkLinkedLedgers(
  components: ReadonlyMap<string, LinkedRecord>,
  cases: ReadonlyMap<string, LinkedRecord>,
  galleryCells: ReadonlyMap<string, LinkedRecord>,
  traces: ReadonlyMap<string, LinkedRecord>,
  authorities: ReadonlyMap<string, LinkedRecord>,
  findings: U0ContractFinding[],
): void {
  checkReferences(components, "traceIds", traces, "trace", findings);
  checkReferences(cases, "traceIds", traces, "trace", findings);
  checkReferences(cases, "authorityIds", authorities, "authority", findings);
  checkReferences(traces, "componentIds", components, "component", findings);
  checkReferences(traces, "caseIds", cases, "case", findings);
  checkReferences(traces, "authorityIds", authorities, "authority", findings);
  checkReferences(authorities, "traceIds", traces, "trace", findings);
  checkReferences(authorities, "caseIds", cases, "case", findings);

  checkReciprocalReferences(
    components,
    "traceIds",
    traces,
    "componentIds",
    findings,
  );
  checkReciprocalReferences(
    traces,
    "componentIds",
    components,
    "traceIds",
    findings,
  );
  checkReciprocalReferences(cases, "traceIds", traces, "caseIds", findings);
  checkReciprocalReferences(traces, "caseIds", cases, "traceIds", findings);
  checkReciprocalReferences(
    cases,
    "authorityIds",
    authorities,
    "caseIds",
    findings,
  );
  checkReciprocalReferences(
    authorities,
    "caseIds",
    cases,
    "authorityIds",
    findings,
  );
  checkReciprocalReferences(
    traces,
    "authorityIds",
    authorities,
    "traceIds",
    findings,
  );
  checkReciprocalReferences(
    authorities,
    "traceIds",
    traces,
    "authorityIds",
    findings,
  );

  for (const record of cases.values()) {
    const componentIds = record.record["componentIds"];
    if (componentIds === undefined) continue;
    for (const componentId of uniqueStrings(
      componentIds,
      record.path + ".componentIds",
      findings,
    )) {
      if (!components.has(componentId)) {
        finding(
          findings,
          "U0_CONTRACT_UNKNOWN_LINK",
          record.path + ".componentIds",
          "Unknown component ID " + JSON.stringify(componentId) + ".",
        );
      }
    }
  }

  for (const component of components.values()) {
    const linked = new Set<string>();
    for (const trace of traces.values()) {
      if (strings(trace.record["componentIds"]).includes(component.id)) {
        linked.add(trace.id);
      }
    }
    if (linked.size === 0) {
      finding(
        findings,
        "U0_CONTRACT_ORPHAN_COMPONENT",
        component.path + ".id",
        "Every component must be owned by at least one trace.",
      );
    }
  }
  for (const item of cases.values()) {
    const linked = [...traces.values()].some((trace) =>
      strings(trace.record["caseIds"]).includes(item.id),
    );
    if (!linked) {
      finding(
        findings,
        "U0_CONTRACT_ORPHAN_CASE",
        item.path + ".id",
        "Every case must be owned by at least one trace.",
      );
    }
  }

  const allGalleryIds = [...galleryCells.keys()];
  const galleryCase = cases.get("U0-PRIM-002");
  const galleryTrace = traces.get("TR-U0-STATES");
  const galleryAuthority = authorities.get("AUTH-PLAN-UI");
  exactValue(
    galleryCase?.record["galleryCellIds"],
    allGalleryIds,
    "U0_CONTRACT_GALLERY_LINK",
    (galleryCase?.path ?? "primitive-state-matrix.json.cases") +
      ".galleryCellIds",
    findings,
  );
  exactValue(
    galleryTrace?.record["galleryCellIds"],
    allGalleryIds,
    "U0_CONTRACT_GALLERY_LINK",
    (galleryTrace?.path ?? "trace-ledger.json.traces") + ".galleryCellIds",
    findings,
  );
  exactValue(
    galleryAuthority?.record["galleryCellIds"],
    allGalleryIds,
    "U0_CONTRACT_GALLERY_LINK",
    (galleryAuthority?.path ?? "provenance-ledger.json.authorities") +
      ".galleryCellIds",
    findings,
  );
  for (const cell of galleryCells.values()) {
    const componentId = cell.record["componentId"];
    const component =
      typeof componentId === "string" ? components.get(componentId) : undefined;
    if (
      component === undefined ||
      !strings(component.record["galleryCellIds"]).includes(cell.id)
    ) {
      finding(
        findings,
        "U0_CONTRACT_NONRECIPROCAL_LINK",
        cell.path + ".componentId",
        "Gallery cell/component link is not reciprocal.",
      );
    }
    for (const caseId of strings(cell.record["caseIds"])) {
      if (!strings(cases.get(caseId)?.record["galleryCellIds"]).includes(cell.id)) {
        finding(
          findings,
          "U0_CONTRACT_NONRECIPROCAL_LINK",
          cell.path + ".caseIds",
          "Gallery cell/case link is not reciprocal.",
        );
      }
    }
    for (const traceId of strings(cell.record["traceIds"])) {
      if (
        !strings(traces.get(traceId)?.record["galleryCellIds"]).includes(cell.id)
      ) {
        finding(
          findings,
          "U0_CONTRACT_NONRECIPROCAL_LINK",
          cell.path + ".traceIds",
          "Gallery cell/trace link is not reciprocal.",
        );
      }
    }
    for (const authorityId of strings(cell.record["authorityIds"])) {
      if (
        !strings(
          authorities.get(authorityId)?.record["galleryCellIds"],
        ).includes(cell.id)
      ) {
        finding(
          findings,
          "U0_CONTRACT_NONRECIPROCAL_LINK",
          cell.path + ".authorityIds",
          "Gallery cell/authority link is not reciprocal.",
        );
      }
    }
  }
}

function checkRefusalTokens(
  fixtures: ReadonlyMap<ExpectedFilename, ParsedFixture>,
  findings: U0ContractFinding[],
): void {
  const allowed = new Set<string>(U0_REVIEWED_REFUSAL_CODES);
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, path + "[" + String(index) + "]");
      });
      return;
    }
    if (!isObject(value)) return;
    for (const [key, item] of Object.entries(value)) {
      const itemPath = path + "." + key;
      if (
        (key === "refusal" || key === "refusalCode") &&
        item !== null &&
        (typeof item !== "string" || !allowed.has(item))
      ) {
        finding(
          findings,
          "U0_CONTRACT_REFUSAL",
          itemPath,
          "Unknown refusal code " + JSON.stringify(item) + ".",
        );
      }
      visit(item, itemPath);
    }
  };
  for (const fixture of fixtures.values()) {
    visit(fixture.root, fixture.filename);
  }
}

async function loadFixtures(
  fixtureRoot: string,
  findings: U0ContractFinding[],
): Promise<Map<ExpectedFilename, ParsedFixture>> {
  const fixtures = new Map<ExpectedFilename, ParsedFixture>();
  let actualNames: string[] = [];
  try {
    actualNames = (await readdir(fixtureRoot)).sort();
  } catch (error) {
    finding(
      findings,
      "U0_CONTRACT_ROOT",
      ".",
      "Cannot read fixture root: " +
        (error instanceof Error ? error.message : String(error)) +
        ".",
    );
  }

  const expectedNames = [...EXPECTED_FILES].sort();
  if (stableJson(actualNames) !== stableJson(expectedNames)) {
    finding(
      findings,
      "U0_CONTRACT_FILE_SET",
      ".",
      "Expected exactly " +
        expectedNames.join(", ") +
        "; received " +
        actualNames.join(", ") +
        ".",
    );
  }

  for (const filename of EXPECTED_FILES) {
    let source: string;
    try {
      source = await readFile(join(fixtureRoot, filename), "utf8");
    } catch {
      finding(
        findings,
        "U0_CONTRACT_FILE_MISSING",
        filename,
        "Required U0 fixture is missing or unreadable.",
      );
      continue;
    }

    for (const duplicate of duplicateJsonKeys(source)) {
      finding(
        findings,
        "U0_CONTRACT_DUPLICATE_KEY",
        filename,
        "Decoded duplicate JSON key at " + duplicate + ".",
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch (error) {
      finding(
        findings,
        "U0_CONTRACT_JSON",
        filename,
        "Invalid JSON: " +
          (error instanceof Error ? error.message : String(error)) +
          ".",
      );
      continue;
    }
    if (!isObject(decoded)) {
      finding(
        findings,
        "U0_CONTRACT_SCHEMA",
        filename,
        "Top-level JSON value must be an object.",
      );
      continue;
    }

    exactKeys(decoded, EXPECTED_TOP_LEVEL_KEYS[filename], filename, findings);
    if (decoded["schema"] !== EXPECTED_SCHEMAS[filename]) {
      finding(
        findings,
        "U0_CONTRACT_SCHEMA",
        filename + ".schema",
        "Expected schema " + EXPECTED_SCHEMAS[filename] + ".",
      );
    }
    const versionField =
      filename === CONTRACT_FILENAME
        ? "contractVersion"
        : filename === "provenance-ledger.json"
          ? "ledgerVersion"
          : "fixtureVersion";
    if (decoded[versionField] !== 1) {
      finding(
        findings,
        "U0_CONTRACT_VERSION",
        filename + "." + versionField,
        "U0 fixture version must remain exactly 1.",
      );
    }
    if (decoded["productionOutputUsed"] !== false) {
      finding(
        findings,
        "U0_CONTRACT_INDEPENDENCE",
        filename + ".productionOutputUsed",
        "Production output cannot certify an independent U0 fixture.",
      );
    }
    if (decoded["expectedValuesGenerated"] !== false) {
      finding(
        findings,
        "U0_CONTRACT_INDEPENDENCE",
        filename + ".expectedValuesGenerated",
        "Generated expected values cannot certify an independent U0 fixture.",
      );
    }

    fixtures.set(filename, {
      filename,
      source,
      root: decoded,
      byteDigest: digest(source),
      semanticDigest: digest(stableJson(decoded)),
    });
  }
  return fixtures;
}

export async function validateU0Contract(
  fixtureRoot = resolve("tests/fixtures/ui"),
): Promise<U0ContractValidationReport> {
  const findings: U0ContractFinding[] = [];
  const fixtures = await loadFixtures(fixtureRoot, findings);
  for (const filename of EXPECTED_FILES) {
    const fixture = fixtures.get(filename);
    if (
      fixture !== undefined &&
      fixture.semanticDigest !== U0_REVIEWED_SEMANTIC_DIGESTS[filename]
    ) {
      finding(
        findings,
        "U0_CONTRACT_SEMANTIC_DIGEST",
        filename,
        "Fixture semantics differ from the independently reviewed snapshot.",
      );
    }
  }

  const contract = fixtures.get(CONTRACT_FILENAME)?.root ?? {};
  const primitive =
    fixtures.get("primitive-state-matrix.json")?.root ?? {};
  const shell = fixtures.get("shell-state-matrix.json")?.root ?? {};
  const traceLedger = fixtures.get("trace-ledger.json")?.root ?? {};
  const provenance =
    fixtures.get("provenance-ledger.json")?.root ?? {};

  checkManifest(contract, fixtures, findings);
  exactValue(
    primitive["componentOrdering"],
    "group-order-then-numeric-component-id",
    "U0_CONTRACT_COMPONENT_INVENTORY",
    "primitive-state-matrix.json.componentOrdering",
    findings,
  );
  exactValue(
    primitive["stateVocabulary"],
    U0_REVIEWED_COMPONENT_STATES,
    "U0_CONTRACT_STATE",
    "primitive-state-matrix.json.stateVocabulary",
    findings,
  );

  const components = checkComponents(primitive, findings);
  const primitiveCases = checkPrimitiveCases(primitive, findings);
  const galleryCells = checkGalleryCells(
    primitive["galleryCells"],
    components,
    findings,
  );
  const topologyCases = checkTopologyCases(primitive, findings);
  const menuTopologyCases = checkMenuTopologyCases(primitive, findings);
  const contrastCases = checkContrastCases(primitive, findings);
  const shellCases = checkShell(shell, findings);
  const traces = checkTraces(traceLedger, findings);
  const authorities = checkAuthorities(provenance, findings);
  const allCases = mergeCaseMaps(
    [
      primitiveCases,
      topologyCases,
      menuTopologyCases,
      contrastCases,
      shellCases,
    ],
    findings,
  );
  checkLinkedLedgers(
    components,
    allCases,
    galleryCells,
    traces,
    authorities,
    findings,
  );
  checkRefusalTokens(fixtures, findings);

  const shellRoot = fixtures.get("shell-state-matrix.json")?.root ?? {};
  const coverageSummary = {
    components: components.size,
    primitiveCases: primitiveCases.size,
    galleryCells: galleryCells.size,
    topologyCases: topologyCases.size,
    menuTopologyCases: menuTopologyCases.size,
    contrastCases: contrastCases.size,
    viewportCases: objects(shellRoot["viewportCases"]).length,
    environmentCases: objects(shellRoot["environmentCases"]).length,
    overlayCases: objects(shellRoot["overlayCases"]).length,
    systemStateCases: objects(shellRoot["systemStateCases"]).length,
    shellRefusalCases: objects(shellRoot["refusalCases"]).length,
    traces: traces.size,
    authorities: authorities.size,
  };
  exactValue(
    contract["coverageSummary"],
    coverageSummary,
    "U0_CONTRACT_COUNT",
    "u0-ui-contract.json.coverageSummary",
    findings,
  );

  findings.sort(findingOrder);
  return {
    schema: "changes.validation.u0-contract.v1",
    package: "U0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: U0_REVIEWED_COMPANIONS.length,
      components: components.size,
      primitiveCases: primitiveCases.size,
      galleryCells: galleryCells.size,
      topologyCases: topologyCases.size,
      menuTopologyCases: menuTopologyCases.size,
      contrastCases: contrastCases.size,
      shellCases: shellCases.size,
      traces: traces.size,
      authorities: authorities.size,
    },
    findings,
  };
}

if (import.meta.main) {
  const report = await validateU0Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exit(1);
}

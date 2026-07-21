# U0 Source-Owned UI Contract

Status: reviewed implementation contract  
Package: `U0`  
Contract schema: `changes.ui.u0-contract.v1`  
Primitive matrix: `changes.ui.u0-primitive-matrix.v1`  
Shell matrix: `changes.ui.u0-shell-matrix.v1`  
Trace ledger: `changes.ui.u0-trace-ledger.v1`  
Provenance ledger: `changes.ui.u0-provenance-ledger.v1`  
Bead: `jcpe-milestone-reliable-studio-l3a.9.1`

This document and `src/ui/ui-contract.ts` are the code-facing U0 authority.
The independent fixture package under `tests/fixtures/ui/` supplies expected
states and traces. Production components may be compared with those fixtures;
they may not generate, rewrite, or bless their expectations.

## 1. Boundary and implementation model

U0 replaces the legacy interface. It borrows shadcn's useful source-ownership,
composition, semantic-token, and consistent-state ideas, but not its runtime
stack. The implementation is native Preact and authored CSS. It must not add or
copy React, Radix, Tailwind, shadcn packages or CLI output, `preact/compat`, a
CSS runtime, an icon package, a modal package, a remote font, a CDN, telemetry,
or any runtime network capability. Inline SVG icons are source-owned and are
decorative unless the owning control supplies its accessible name.

Preact is used only by implementation modules. `ui-contract.ts` deliberately
has no imports. Primitives know nothing about chord documents. Feature
components receive application selector values and emit semantic callbacks;
the composition root translates accepted callbacks into typed application
commands or ephemeral intents. A UI module never imports or calls audio,
persistence, export, parser, migration, content, or browser-service adapters.
It never mutates selector values.

The stable public boundary is controlled:

- the caller owns values, selection, expansion, open state, disabled state,
  request tokens, and application revision;
- a primitive may own only transient DOM focus, pointer capture, a bounded
  typeahead buffer, and animation phase;
- callbacks carry `UiActionEvent` or `UiValueChangeEvent`, never a DOM event;
- preview events cannot mutate the application document; commit events may be
  translated into one application intent;
- cancellation and stale ownership produce no commit callback and do not move
  application focus;
- a control remains usable without its tooltip, animation, pointer drag, or
  hover presentation.

`UiApplicationIntentEnvelope` is an adapter seam, not a second application
state model. The exact A0 `DocumentCommand`/`EphemeralIntent` remains
authoritative. A feature adapter must add the current document ID and revision
and must pass A0 refusal, stale-result, notice, and focus-request output back
through selectors.

## 2. Tokens and visual language

`UI_TOKEN_DEFINITIONS` freezes every shipped token and literal value. CSS must
consume those custom properties; component selectors must not copy their color,
space, radius, motion, or focus values. The system is dark, restrained, and
lead-sheet-like: quiet neutral surfaces, one warm primary action color, cool
focus/selection, and separate information/success/warning/error semantics.

The token groups are:

- surfaces: app, header, rail, chart, panel, elevated, sunken, and overlay;
- text: primary, muted, subtle, and inverse;
- borders/actions/states: default, strong, primary, secondary, selected,
  information, success, warning, error, and focus;
- typography: system UI and system monospace stacks, five sizes, and two line
  heights; no font file is bundled or requested;
- spacing: a fixed `0, 1, 2, 3, 4, 5, 6, 8, 10, 12` scale based on 0.25 rem;
- radii/borders: four radii, one-pixel border, two-pixel focus ring and
  two-pixel offset;
- motion: 120 ms fast, 180 ms deliberate, standard easing, and zero-ms reduced
  motion;
- shell: 17 rem Library rail, 20 rem Harmony rail, 4.5 rem minimum transport,
  3 rem drawer context reveal, 2.25 rem standard control, and 2.75 rem touch
  target.

State color is always paired with text, icon/shape, or both. Forced-colors
replaces decorative fills/shadows with system colors and a visible border. It
must preserve current, selected, invalid, disabled, expanded, checked, pressed,
and focus-visible distinctions. Increased contrast may strengthen borders and
text; it may not change meaning or order. `prefers-reduced-motion: reduce`
changes every transition/animation duration to zero and leaves the final state
fully rendered.

`UI_ALLOWED_CONTRAST_PAIRS` is the exhaustive dark-theme pairing authority.
Primary, muted, subtle, and semantic state text may be used on the declared
opaque surfaces at 4.5:1 or better. Inverse text may be used on the declared
primary/state fills, and primary text may be used on secondary/selected fills,
also at 4.5:1 or better. The focus token and strong border token clear 3:1 on
every opaque surface. `--border-default` is decorative and may never be the sole
component boundary or state cue. `--surface-overlay` is a translucent backdrop,
not a text surface; overlay content uses an opaque surface token. The frozen
`--text-subtle` value is `#8793a2` and `--border-strong` is `#657487`, so their
worst declared pairs remain above the relevant threshold. The validator computes
every declared pair rather than trusting these claims.

## 3. Public inventory

The inventory is closed for U0: 49 render components and two shared behavior
helpers. The implementation may split a component into private source files,
but its exported controlled shape and semantic behavior remain as follows.

### 3.1 Foundations

| ID | Component / public type | Required implementation semantics |
|---|---|---|
| U0-CMP-001 | Button / `UiButtonProps` | Native `button`; explicit type; loading remains named and disables repeat activation. |
| U0-CMP-002 | IconButton / `UiIconButtonProps` | Native button with mandatory accessible name; SVG is hidden from accessibility APIs. |
| U0-CMP-003 | LinkButton / `UiLinkButtonProps` | Native anchor only for a local fragment or user-gesture-created `blob:` download; commands remain buttons and remote hrefs refuse. |
| U0-CMP-004 | Badge / `UiBadgeProps` | Noninteractive short metadata; no status announcement. |
| U0-CMP-005 | Kbd / `UiKbdProps` | Visual key hint; never the only instruction or accessible name. |
| U0-CMP-006 | Separator / `UiSeparatorProps` | Decorative by default; named structural separator only when it conveys a boundary. |
| U0-CMP-007 | Skeleton / `UiSkeletonProps` | Always accessibility-hidden; owning region exposes `aria-busy` and one status message. |
| U0-CMP-008 | Spinner / `UiSpinnerProps` | Decorative inside a named busy control or an explicitly named standalone status. |
| U0-CMP-009 | VisuallyHidden / `UiVisuallyHiddenProps` | Remains available to accessibility APIs; focusable skip targets become visible on focus. |
| U0-CMP-010 | Card / `UiCardProps` | Presentational/section container, never a generic clickable `div`. |
| U0-CMP-011 | EmptyState / `UiEmptyStateProps` | Heading, honest explanation, and zero to two real actions. |
| U0-CMP-012 | StatusPill / `UiStatusPillProps` | Text plus non-color state cue; announcement belongs to the state owner. |
| U0-CMP-013 | Progress / `UiProgressProps` | Native progress or equivalent named progressbar; `null` is explicitly indeterminate. |
| U0-CMP-014 | Meter / `UiMeterProps` | Native meter for a scalar in a known range; never used for task progress. |

### 3.2 Forms

| ID | Component / public type | Required implementation semantics |
|---|---|---|
| U0-CMP-015 | Field / `UiFieldProps` | Binds visible label, descriptions, and all errors to one control with stable IDs. |
| U0-CMP-016 | Label / `UiLabelProps` | Native label whose text includes the control's accessible name. |
| U0-CMP-017 | Input / `UiInputProps` | Controlled native input; platform text-editing keys are never intercepted. |
| U0-CMP-018 | Textarea / `UiTextareaProps` | Controlled native textarea; grows/reflows without hiding its label or errors. |
| U0-CMP-019 | NumberField / `UiNumberFieldProps` | Retains raw malformed text separately from parsed value; bounds/step are disclosed. |
| U0-CMP-020 | Select / `UiSelectProps` | Native select for a bounded static choice set. |
| U0-CMP-021 | Combobox / `UiComboboxProps` | Editable input with manual list autocomplete; DOM focus stays in input, active option is named. |
| U0-CMP-022 | Listbox / `UiListboxProps` | Roving option focus; focus and selection are distinct; no interactive descendants in options. |
| U0-CMP-023 | Checkbox / `UiCheckboxProps` | Native checkbox where possible; supports checked, unchecked, and explicit mixed state. |
| U0-CMP-024 | RadioGroup / `UiRadioGroupProps` | One named group; arrows select outside a toolbar and only move focus inside a toolbar. |
| U0-CMP-025 | Switch / `UiSwitchProps` | Binary on/off only; label text does not change with state. |
| U0-CMP-026 | Slider / `UiSliderProps` | Named single-thumb value; arrows step, Home/End bound, optional Page step; numeric alternative required. |
| U0-CMP-027 | SegmentedControl / `UiSegmentedControlProps` | Radio semantics for one-of-many view/value choice, not a row of unrelated buttons. |
| U0-CMP-028 | Toggle / `UiToggleProps` | Native button with `aria-pressed`; visible name remains stable. |
| U0-CMP-029 | ToggleGroup / `UiToggleGroupProps` | Named single/multiple pressed set with roving focus and explicit selection mode. |

Field failures never silently repair input. `aria-invalid` is set only after
validation, and error IDs are included in the control description/error
relationship. Placeholder text is not a label. Error order is caller order;
duplicate error IDs refuse before render. Disabled controls emit no event.
Read-only controls may receive focus and be copied. A busy control retains its
name, exposes busy state on the owning region, and suppresses repeated commit.
Select and RadioGroup transitions permit `null` only as the prior value; a
commit always identifies a real option. Combobox transitions permit `null` in
both positions because clearing its editable selection is an explicit action.
First selection, clear, and cancellation therefore require no sentinel or
stale closure inference. A
mixed Checkbox reports `boolean | "mixed"` as its previous value and a concrete
boolean as the user-produced value.

### 3.3 Navigation and commands

| ID | Component / public type | Required implementation semantics |
|---|---|---|
| U0-CMP-030 | Tabs / `UiTabsProps` | `tablist`/`tab`/`tabpanel`, manual activation, one tab stop, stable tab/panel IDs. |
| U0-CMP-031 | Breadcrumb / `UiBreadcrumbProps` | Named navigation containing an ordered list; current item uses `aria-current`. |
| U0-CMP-032 | Toolbar / `UiToolbarProps` | Role toolbar only for three or more controls; one tab stop and orientation-aware roving focus. |
| U0-CMP-033 | Menu / `UiMenuProps` | Action menu, not site navigation; one tab stop, arrow/typeahead movement, Escape restoration. |
| U0-CMP-034 | ContextMenu / `UiContextMenuProps` | Same menu semantics; opens by context-menu pointer, Menu key, or Shift+F10. |
| U0-CMP-035 | CommandPalette / `UiCommandPaletteProps` | Modal dialog containing combobox/listbox in the same focus scope; filtering never invokes commands. |
| U0-CMP-036 | Disclosure / `UiDisclosureProps` | Native button with `aria-expanded` and `aria-controls`; panel remains structurally adjacent. |
| U0-CMP-037 | Accordion / `UiAccordionProps` | Each trigger is the only button in a correctly leveled heading; headers support optional roving keys. |
| U0-CMP-038 | ScrollArea / `UiScrollAreaProps` | Native overflow and visible system scrollbar; never replaces wheel/keyboard scrolling. |
| U0-CMP-039 | RovingFocus / `UiRovingFocusProps` | Shared stable-ID algorithm; one `tabindex=0`, disabled items skipped, current item retained across reorder. |

Tabs use Left/Right for horizontal or Up/Down for vertical movement, Home/End
for bounds, and Enter/Space to activate. Selection never follows focus because
studio panels can be large or stateful. An empty Tabs collection has null active
and focused IDs and renders its declared empty state; no sentinel tab is
invented. Toolbar uses its orientation keys and
does not consume arrow pairs needed by an embedded text field or slider. Menu
uses Up/Down, Home/End, Enter/Space, Escape, and a 700 ms bounded typeahead
buffer; Tab closes it and continues the document tab order. Submenus are
descendant nonmodal surfaces in the same dismissal layer, not nested modal
scopes. The 200-item Menu bound is the flattened total including separators and
nested items; maximum submenu depth is four, IDs are unique across the flattened
tree, and cycles/reused object identities refuse before open. Accordion
Enter/Space toggles; Up/Down/Home/End move between headers.

### 3.4 Overlays and feedback

| ID | Component / public type | Required implementation semantics |
|---|---|---|
| U0-CMP-040 | Tooltip / `UiTooltipProps` | Noninteractive description; focus or hover opens, Escape closes, focus remains on trigger. |
| U0-CMP-041 | Popover / `UiPopoverProps` | Named nonmodal interactive surface; explicit close, Escape/outside dismiss, trigger restoration. |
| U0-CMP-042 | Dialog / `UiDialogProps` | One modal scope, inert/visually obscured background, contained Tab order, visible close, logical focus return. |
| U0-CMP-043 | AlertDialog / `UiAlertDialogProps` | Brief important confirmation; description required and initial focus goes to least destructive action. |
| U0-CMP-044 | SheetDrawer / `UiSheetDrawerProps` | Logical-side sheet; explicitly modal or nonmodal; shell drawers leave 3 rem of chart context visible. |
| U0-CMP-045 | ToastNotice / `UiToastNoticeProps` | Polite info/success and assertive warning/error announcement; persistent notice source remains available. |
| U0-CMP-046 | FocusDismissLayer / `UiFocusDismissLayerProps` | Sole overlay host, inertness, dismissal order, focus containment/restoration, and stale-owner rejection. |

The overlay state is one root `UiOverlayLayerState`, not a stack of dialogs.
It permits exactly one modal focus scope. A root may own at most four nonmodal
descendant surfaces (for example a dialog's combobox popup), all rendered
inside the same root and dismissal layer. Only one transient sibling is active;
opening another replaces it. A tooltip is suppressed while another transient
is active. Notices are not focus scopes and do not count as overlays.

Opening validates owner, trigger, title/description, revision, collection
limits, and initial focus before changing the DOM. Modal open then marks the
background inert, visibly obscures it, renders the surface, and focuses the
declared target (heading for long semantic content, explicit target, otherwise
first enabled control). Tab and Shift+Tab wrap within it; no positive tabindex
is used. Escape closes unless an application-owned committing transaction has
made cancellation unavailable and presents that reason visibly. Close removes
inertness before restoring focus to the exact trigger, then the application
focus request, then the workspace. A missing owner/trigger or stale revision
closes without activating an alternate command.

Overlay kind/mode combinations are closed: Tooltip, Menu, ContextMenu, and
Popover are nonmodal; CommandPalette, Dialog, and AlertDialog are modal; only a
SheetDrawer may be either. Any other pairing refuses `ui.value_malformed` before
the layer changes.

`UiDismissibility` makes that exception controlled and inspectable. A
`dismissible` owner accepts Escape and visible Close/Cancel. A `blocked` owner
keeps those controls visible but disabled, associates the bounded reason with
them, and emits no dismiss callback. Application completion, replacement, or a
stale-owner retirement may still remove a blocked surface through controlled
state. AlertDialog narrows the general Dialog contract by requiring a non-null
description.

The maximum dismissal-owner ancestry is eight. That is a bounded composed-path
walk inside the one layer, not permission for eight nested overlays. A modal
inside a modal is always refused. A mobile rail may be the root modal sheet or
a declared nonmodal sheet; it cannot contain another modal scope.

Tooltip text is capped at 256 code points, opens after 500 ms for pointer hover
and immediately for keyboard focus, and closes after 100 ms to permit pointer
travel between trigger and tooltip. It contains no focusable content. Info and
success toast presentation may retire after 6,000 ms, paused while hovered or
focused; warnings/errors do not auto-retire. In all cases the A0 notice remains
in the notice center until the application dismisses/evicts it. At most five
toasts are visible; an explicit “N more notices” control exposes the remainder.
The notice region never covers the transport.

### 3.5 Structured views

| ID | Component / public type | Required implementation semantics |
|---|---|---|
| U0-CMP-047 | KeyValueList / `UiKeyValueListProps` | Native description list; source order retained. |
| U0-CMP-048 | DataTable / `UiDataTableProps` | Native table/caption/headers; sorting is a named button in header, not an ARIA grid. |
| U0-CMP-049 | Tree / `UiTreeProps` | Tree/treeitem hierarchy with stable IDs, level/set metadata, expansion and selection distinct. |
| U0-CMP-050 | ResizablePanels / `UiResizablePanelsProps` | Focusable separator with value/name/controls; pointer drag plus arrow/Home/End and collapse action. |
| U0-CMP-051 | TimelineLane / `UiTimelineLaneProps` | Named region/list over exact-time strings; native horizontal scroll and non-drag activation/move controls. |

Tree Right opens or moves to first child, Left closes or moves to parent,
Up/Down traverse visible items, Home/End reach visible bounds, Enter activates,
and typeahead moves focus without selecting. Tree input is a rooted forest:
root IDs are unique and name only nodes with null parents; every non-root occurs
under exactly one parent; parent/child references are reciprocal; every node is
reachable; IDs/child IDs are unique; maximum depth is 64; and missing references
or cycles refuse `ui.value_malformed` within the 5,000-node traversal bound.
DataTable intentionally remains a native table with text-only body cells until a
planned surface requires two-dimensional cell interaction. Its only table-owned
interactive descendants are named header sort buttons; row/cell actions must be
composed outside this primitive or request a contract revision.
Resizable panels commit one size change at pointer/key completion; an 8 CSS px
threshold distinguishes drag from click, pointer capture is released on
cancel/unmount, and a visible numeric/keyboard alternative is always present.
Collapse/restore publishes `onCollapsedIdsChange`; a collapsed panel retains its
last noncollapsed `sizePercent`, so restore is deterministic, while resize emits
only `onSizesChange`.
Timeline geometry may derive from exact musical values but the UI contract
passes exact strings and never turns floating layout coordinates into musical
truth.

## 4. Shell, landmarks, and responsive states

DOM/landmark order is fixed:

1. `skip-link` is the first focusable element and targets `workspace`;
2. `app-header` contains brand/one page `h1`, `document-status`, and
   `document-menu`;
3. `workspace` is `main` and contains Library rail, chart workspace, and Harmony
   Lens rail in that source order;
4. `transport-bar` is a named region in its own grid row;
5. `dialog-host`, `notice-region`, and consistently placed Help follow as
   composition hosts without changing reading order.

The chart is the primary region. Rails are complementary regions with visible
headings, not duplicate navigation landmarks. Collapse buttons name both the
rail and resulting state. The app shell uses logical properties, safe-area
insets, and an intrinsic grid. Header/workspace/transport are rows; transport
never overlays workspace focus. Main content owns scrolling and reserves focus
scroll margin. The page does not set a maximum scale or block browser zoom.

Layout is selected by CSS content width, never user-agent/device guesses:

| Mode | CSS inline size | Shell |
|---|---:|---|
| compact | below 640 px | chart only; both rails available as named sheets |
| balanced | 640 through 1,099 px | Library sheet, chart, persistent Harmony rail |
| wide | 1,100 px and above | persistent Library, chart, and Harmony columns |

Opening a compact sheet leaves 48 CSS px of chart context visible and cannot
cover the transport row. At 200% zoom the layout responds to the resulting CSS
viewport exactly as a resized window does. Required cells are 320x568,
390x844, 768x1024, 1280x800, and 1440x900, each in default, forced-colors, and
reduced-motion modes, plus 200% zoom coverage. At 320 CSS px, ordinary text and
controls require one-axis page reading; intrinsically two-dimensional tables,
trees, and timeline lanes may scroll inside their named region while each cell
or item remains readable without page-level two-dimensional scrolling.

Every target is at least the WCAG 2.2 AA floor of 24 by 24 CSS px without using
the spacing exception. Primary actions and every target under coarse-pointer
media are at least 44 by 44 CSS px. The visual focus indicator is a two-pixel
solid ring with two-pixel offset and is never clipped or fully obscured. Dense
mode may reduce visual padding but not the 24 px target floor; touch mode keeps
44 px hit areas non-overlapping.

## 5. Ordering, bounds, refusals, and state coverage

All collections preserve caller order after validation. IDs must be nonblank
and unique. Disabled items remain in structural/announcement order but roving
focus skips them. Typeahead compares case-folded prefixes, starts after the
current item, wraps at most once, and resets after 700 ms. No locale sort or
geometry sort changes musical/document order. Focus restoration is exact
trigger, then stable application workflow target, then workspace. Notices are
in increasing application sequence and the newest five are presented as
toasts.

Exact collection/structure bounds are:

| Bound | Value |
|---|---:|
| modal focus scopes / nonmodal descendants / dismissal ancestors | 1 / 4 / 8 |
| focus candidates / referenced IDs | 4,096 / 64 |
| diagnostics / diagnostic path segments | 64 / 64 |
| Kbd keys / Skeleton lines / Textarea rows | 8 / 20 / 40 |
| roving items | 5,000 |
| Select / Combobox / Listbox options | 200 / 1,000 / 1,000 |
| RadioGroup / ToggleGroup items | 64 / 64 |
| Menu flattened items / submenu depth | 200 / 4 |
| command items / keywords per command | 1,000 / 16 |
| tabs / breadcrumbs / toolbar items / accordion items | 64 / 64 / 200 / 128 |
| key-value items | 1,000 |
| tree nodes / tree depth | 5,000 / 64 |
| table columns / rows / derived cells | 64 / 5,000 / 50,000 |
| resizable panels / timeline items | 8 / 5,000 |
| notice-center items / visible toast presentations | 32 / 5 |

Exact string bounds are measured in Unicode code points:

| String category | Value |
|---|---:|
| IDs and ID references | 128 |
| request/intent kinds | 64 |
| accessible names, labels, titles, and recovery actions | 160 |
| descriptions, errors, messages, placeholders, value text, and table-cell text | 512 |
| raw text-control values and command queries | 4,096 |
| tooltip text / typeahead buffer | 256 / 64 |
| command keyword / visual Kbd key | 64 / 32 |
| local filename / fragment href / `blob:` href | 255 / 129 / 2,048 |
| exact display value such as a rational time string | 128 |

Exact interaction thresholds and presentation constants are:

| Constant | Value |
|---|---:|
| typeahead reset | 700 ms |
| pointer tooltip open / close | 500 / 100 ms |
| eligible notice presentation | 6,000 ms |
| pointer drag threshold | 8 CSS px |
| project touch target / WCAG floor | 44 / 24 CSS px |
| focus ring / offset | 2 / 2 CSS px |
| compact / wide breakpoint | 640 / 1,100 CSS px |
| fast / deliberate / reduced motion | 120 / 180 / 0 ms |

`UI_PUBLIC_COLLECTION_LIMITS` assigns every public array to one of those
bounds. In particular, reference lists use 64; Listbox selections cannot exceed
its 1,000 options; Toggle pressed IDs cannot exceed its 64 items; expanded
Accordion IDs cannot exceed 128; Roving disabled IDs cannot exceed its 5,000
items; Tree root/child references cannot exceed its node bound; and panel size
and collapsed-ID vectors cannot exceed eight. A table must satisfy its column,
row, and `columns * rows <= 50,000` bounds simultaneously. At most five of the
32 A0 notice-center items enter `UiToastNoticeProps`; `hiddenNoticeCount` is a
nonnegative integer no greater than 27.

All revision, sequence, request, count, and index numbers are integers from zero
through `Number.MAX_SAFE_INTEGER` unless a smaller bound above applies.
Coordinates and scalar values are finite. Percentages are within 0 through 100; ordered ranges satisfy
`min <= value <= max`; and steps are positive. Textarea rows are 1 through 40,
Skeleton lines are 1 through 20, and a Textarea's own `maxCodePoints` is 1
through 4,096. Generic `Content`, application-intent payloads, async ready
values, and DataTable row objects remain owned and bounded by their upstream
contracts; U0 treats them as opaque and does not traverse them. It traverses
only the bounded IDs, collections, and callback text declared here.

Crossing a collection, topology, string, or numeric-input bound refuses before
listeners, focus, pointer capture, inertness, or callbacks change. Threshold
exact-plus-one cases keep their declared threshold semantics rather than being
misreported as collection refusals. U0 never truncates a choice collection and
never chooses a different selection to make malformed state renderable.
`UiResult` returns
either a value or one sanitized `UiDiagnostic` refusal plus ordered diagnostics.
Diagnostics contain a stable code, severity, component ID, structural path,
bounded generic message, and optional recovery action. They never echo chart
text, annotations, imported values, or arbitrary labels into machine logs.

The stable refusal codes cover invalid IDs/names/descriptions, collection and
focus bounds, duplicate IDs, malformed selection/value/range/step, disabled or
busy activation, cancellation, stale revision/owner, overlay conflicts, modal
or dismissal limits, missing focus target, and missing application intent.
Refusals are ordered by structural path, then the declaration order of
`UI_REFUSAL_CODES`.

Every meaningful component participates in the independent matrix for each
applicable state: default, hover, active, focus, disabled, loading, error,
empty, dense, responsive, forced-colors, reduced-motion, 200-percent-zoom, and
touch. Each family also contains:

- positive accepted activation/navigation/render cases;
- near misses such as a disabled neighbor, boundary key, no match, or focus
  owner removed;
- malformed duplicate IDs, absent names, invalid range/selection, and excess
  collection cases that refuse atomically;
- cancellation by Escape, explicit Cancel, pointer cancellation, and unmount;
- stale overlay/request/revision cases that publish nothing and retain current
  application state.

Loading is not simulated where no asynchronous work exists. Hover is visual
only. Empty is an honest named state, not a disabled unlabeled surface. Error
does not destroy the user's raw edit. Responsive is tested at a changed content
width, not by setting a JS “mobile” flag.

## 6. Accessibility authority and disclosed choices

U0 targets WCAG 2.2 AA and native HTML first. Current primary references checked
for this contract are the [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/),
the [WAI-ARIA Authoring Practices patterns](https://www.w3.org/WAI/ARIA/apg/patterns/),
and the APG patterns for
[dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/),
[comboboxes](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/),
[listboxes](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/),
[menus](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/),
[toolbars](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/),
[trees](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/), and
[sliders](https://www.w3.org/WAI/ARIA/apg/patterns/slider/). WCAG choices also
apply the guidance for reflow, 200% text resize, focus not obscured, dragging
alternatives, and 24 CSS px minimum targets.

APG is design guidance, not a conformance certificate. Its Tooltip and Window
Splitter patterns explicitly remain works in progress. Project choices are
therefore frozen here and browser/assistive-technology tested: tooltips never
contain interaction; resizers always have direct keyboard/numeric alternatives;
tabs use manual activation; listbox/tree focus does not automatically select;
DataTable uses native table rather than grid; Switch has a stable label; and no
modal nesting is implemented. Native controls are preferred when they satisfy
the required semantics. ARIA never replaces missing behavior.

Automated axe evidence must record tool/browser versions, viewport, color and
motion modes, rule IDs, target component/case IDs, findings, and reviewed
exceptions. Serious and critical findings are zero. Automation is accompanied
by keyboard order, visible focus, focus return, 200% zoom, 320 px reflow,
forced-colors, coarse pointer, reduced motion, and named screen-reader smoke
evidence. There are no skipped/retried/quarantined cells.

## 7. Independent fixtures, traceability, and gallery exclusion

The five companion schemas are reciprocal:

- `u0-ui-contract.json` inventories policies, identities, public surfaces,
  exact limits/order, refusal codes, coverage, independence, and handoff;
- `primitive-state-matrix.json` owns per-component states, roles, names, keyboard,
  focus, and accepted/refused interactions;
- `shell-state-matrix.json` owns viewport, environment, overlay, system-state,
  cancellation, stale, and refusal cases;
- `trace-ledger.json` maps every parent invariant/success criterion to exact
  case and component IDs and names the future evidence owner;
- `provenance-ledger.json` names architecture, A0, rebuild-plan, WCAG/APG,
  and definition-derived authorities and reciprocates trace/case IDs.

Expected roles, key outcomes, focus targets, refusals, and visual states are
authored in fixtures, never captured from production output. Production cannot
update screenshots or expected accessibility trees in an “accept all” mode.
The validator must reject missing companion hashes, orphan trace/case/component
IDs, nonreciprocal provenance, unknown state/refusal values, changed limits,
missing negative/cancel/stale coverage, and a gallery marker in a release build.

The component gallery is a test-only composition with route ID
`u0-component-gallery`. It includes every applicable component/state and is
compiled only from the test entry. Production source may not import it, and the
standalone artifact must not contain `data-u0-component-gallery`, gallery
labels, fixture IDs, or test controls. This exclusion is a static source graph
and built-artifact gate, not a CSS `display:none` convention.

## 8. Handoff and forbidden shortcuts

The U0 build agent implements the exact public contract and independently
authored matrices before feature-specific UI. Private helpers are allowed only
when they preserve these observable types, roles, key results, focus order,
limits, and refusals. Feature packages may request a contract revision; they may
not bypass a primitive with a one-off inaccessible control.

The following are contract violations:

- importing a runtime UI, CSS, font, icon, dialog, drag, or compatibility
  package, or using a remote resource;
- running the shadcn CLI or copying React/Radix/Tailwind source into production;
- dispatching from a primitive directly to audio, storage, export, parser, or
  another adapter;
- passing DOM events through the application intent boundary;
- making a card or row a clickable `div`, nesting a button in a button, or using
  positive tabindex;
- using hue, hover, drag, animation, pointer precision, or a visual piano as the
  only carrier of meaning or action;
- silently truncating a collection, coercing malformed input, repairing stale
  selection, or accepting a stale request;
- nesting modal scopes, marking background content inert without a real modal,
  or setting `aria-modal` on a nonmodal sheet;
- hiding native scrollbars, blocking browser zoom, guessing a device in JS, or
  allowing sticky transport/notices to obscure focus;
- auto-dismissing warning/error information or destroying the persistent A0
  notice when a toast presentation retires;
- shipping the gallery, fixtures, snapshots, test hooks, or privileged state
  mutation in the standalone artifact;
- deriving fixture expectations or accessibility snapshots from production
  behavior merely to make a gate pass.

U0/spec defines the complete target library and proof surface. It does not claim
that the current foundation shell already implements this contract. The U0
build and independent verify leaves must implement and prove it before the
package or user-visible studio UI is called complete.

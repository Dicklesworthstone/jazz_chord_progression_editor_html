import { render, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

import {
  Accordion,
  Button,
  DataTable,
  IconButton,
  Input,
  Listbox,
  Menu,
  Meter,
  Progress,
  ResizablePanels,
  Select,
  Slider,
  StatusPill,
  Tabs,
  TimelineLane,
  Toolbar,
  Tree,
} from "../../src/ui/primitives";
import {
  AlertDialog,
  Dialog,
  FocusDismissLayer,
  Popover,
  SheetDrawer,
  Tooltip,
} from "../../src/ui/overlays";
import type {
  UiActionEvent,
  UiDiagnostic,
  UiOverlayDescriptor,
} from "../../src/ui/ui-contract";

type LedgerEntry = Readonly<Record<string, unknown>>;

const common = Object.freeze({
  busy: false,
  density: "comfortable" as const,
  describedBy: Object.freeze([]),
  disabled: false,
  invalid: false,
});
const dismissible = Object.freeze({ kind: "dismissible" as const });

function EventLedger({ entries }: Readonly<{ entries: readonly LedgerEntry[] }>) {
  return (
    <output
      aria-live="polite"
      data-event-count={String(entries.length)}
      id="u0-event-ledger"
    >
      {JSON.stringify(entries)}
    </output>
  );
}

function KeyboardScenario() {
  const [events, setEvents] = useState<LedgerEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>("keyboard-tab-one");
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<readonly string[]>([]);
  const [sliderValue, setSliderValue] = useState(40);
  const [showSlider, setShowSlider] = useState(true);
  const [panelSizes, setPanelSizes] = useState<readonly number[]>([50, 50]);

  const record = (entry: LedgerEntry) => {
    setEvents((current) => [...current, entry]);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F8") return;
      event.preventDefault();
      setShowSlider(false);
      record({ action: "unmount", componentId: "keyboard-slider" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <main data-u0-harness-ready="keyboard" id="keyboard-scenario">
      <h1>U0 keyboard and cancellation harness</h1>
      <button id="keyboard-before" type="button">Before primitives</button>

      <Tabs
        {...common}
        accessibleName="Editor views"
        activation="manual"
        activeId={activeTab}
        focusedId="keyboard-tab-one"
        id="keyboard-tabs"
        onActiveChange={(event) => {
          setActiveTab(event.value);
          record(event);
        }}
        orientation="horizontal"
        tabs={[
          { disabled: false, id: "keyboard-tab-one", label: "Harmony", panelId: "keyboard-panel-one" },
          { disabled: true, id: "keyboard-tab-two", label: "Disabled voicing", panelId: "keyboard-panel-two" },
          { disabled: false, id: "keyboard-tab-three", label: "Rhythm", panelId: "keyboard-panel-three" },
        ]}
      />

      <Toolbar
        {...common}
        accessibleName="Edit commands"
        content={(
          <>
            <button id="toolbar-cut" type="button">Cut</button>
            <button disabled id="toolbar-copy" type="button">Copy</button>
            <button id="toolbar-paste" type="button">Paste</button>
          </>
        )}
        focusedId="toolbar-cut"
        id="keyboard-toolbar"
        itemIds={["toolbar-cut", "toolbar-copy", "toolbar-paste"]}
        orientation="horizontal"
      />

      <Listbox
        {...common}
        accessibleName="Chord qualities"
        activeId="listbox-major"
        id="keyboard-listbox"
        onSelectionChange={(event) => {
          setSelectedIds(event.value);
          record(event);
        }}
        options={[
          { description: null, disabled: false, id: "listbox-major", label: "Major", value: "major" },
          { description: null, disabled: true, id: "listbox-minor", label: "Minor unavailable", value: "minor" },
          { description: null, disabled: false, id: "listbox-mixolydian", label: "Mixolydian", value: "mixolydian" },
          { description: null, disabled: false, id: "listbox-dorian", label: "Dorian", value: "dorian" },
        ]}
        selectedIds={selectedIds}
        selectionMode="single"
      />

      <Menu
        {...common}
        accessibleName="Keyboard menu"
        activeItemId="menu-alpha"
        id="keyboard-menu"
        items={[
          { disabled: false, id: "menu-alpha", kind: "action", label: "Alpha voicing" },
          { disabled: true, id: "menu-beta", kind: "action", label: "Beta unavailable" },
          { disabled: false, id: "menu-charlie", kind: "action", label: "Charlie voicing" },
        ]}
        onAction={(event) => { record(event); }}
        onOpenChange={(event) => {
          setMenuOpen(event.value);
          record(event);
        }}
        open={menuOpen}
        triggerId="keyboard-menu-trigger"
      />

      <Accordion
        {...common}
        accessibleName="Theory sections"
        focusedId="accordion-one"
        id="keyboard-accordion"
        items={[
          { content: <p>First section</p>, disabled: false, expanded: expandedIds.includes("accordion-one"), headingLevel: 2, id: "accordion-one", label: "Chord tones", panelId: "accordion-panel-one" },
          { content: <p>Unavailable section</p>, disabled: true, expanded: false, headingLevel: 2, id: "accordion-two", label: "Unavailable", panelId: "accordion-panel-two" },
          { content: <p>Third section</p>, disabled: false, expanded: expandedIds.includes("accordion-three"), headingLevel: 2, id: "accordion-three", label: "Voice leading", panelId: "accordion-panel-three" },
        ]}
        onExpandedIdsChange={(event) => {
          setExpandedIds(event.value);
          record(event);
        }}
        selectionMode="multiple"
      />

      <Tree
        {...common}
        accessibleName="Chord families"
        activeId="tree-parent"
        id="keyboard-tree"
        nodes={[
          { childIds: ["tree-child-a", "tree-child-b"], disabled: false, expanded: true, id: "tree-parent", label: "Dominant family", parentId: null, selected: false },
          { childIds: [], disabled: false, expanded: false, id: "tree-child-a", label: "Altered dominant", parentId: "tree-parent", selected: false },
          { childIds: [], disabled: false, expanded: false, id: "tree-child-b", label: "Lydian dominant", parentId: "tree-parent", selected: false },
        ]}
        onAction={(event) => { record(event); }}
        rootIds={["tree-parent"]}
        selectionMode="single"
      />

      {showSlider ? (
        <Slider
          {...common}
          accessibleName="Swing amount"
          id="keyboard-slider"
          max={100}
          min={0}
          onValueChange={(event) => {
            setSliderValue(event.value);
            record(event);
          }}
          orientation="horizontal"
          pageStep={10}
          step={1}
          value={sliderValue}
          valueText={`${String(sliderValue)} percent`}
        />
      ) : (
        <p data-slider-unmounted="true">Slider unmounted safely.</p>
      )}
      <p>Press F8 while the slider owns a gesture to exercise unmount cancellation.</p>

      <ResizablePanels
        {...common}
        id="keyboard-panels"
        onCollapsedIdsChange={(event) => { record(event); }}
        onSizesChange={(event) => {
          setPanelSizes(event.value);
          record(event);
        }}
        orientation="horizontal"
        panels={[
          { collapsible: true, collapsed: false, id: "keyboard-panel-left", label: "Library panel", maxPercent: 80, minPercent: 20, sizePercent: panelSizes[0] ?? 50 },
          { collapsible: true, collapsed: false, id: "keyboard-panel-right", label: "Chart panel", maxPercent: 80, minPercent: 20, sizePercent: panelSizes[1] ?? 50 },
        ]}
      />

      <TimelineLane
        {...common}
        accessibleName="Chord timeline"
        activeId="timeline-one"
        horizontalScroll
        id="keyboard-timeline"
        items={[
          { disabled: false, exactDuration: "1/1", exactStart: "0/1", id: "timeline-one", label: "Cmaj7", selected: true },
          { disabled: false, exactDuration: "1/1", exactStart: "1/1", id: "timeline-two", label: "Dm7", selected: false },
          { disabled: false, exactDuration: "1/1", exactStart: "2/1", id: "timeline-three", label: "G7", selected: false },
        ]}
        onAction={(event) => { record(event); }}
      />

      <button id="keyboard-after" type="button">After primitives</button>
      <EventLedger entries={events} />
    </main>
  );
}

function descriptor(id: string, mode: "modal" | "nonmodal", kind: UiOverlayDescriptor["kind"]): UiOverlayDescriptor {
  return {
    descriptionId: null,
    dismissibility: { kind: "dismissible" },
    id,
    initialFocusId: null,
    kind,
    mode,
    ownerId: `${id}-owner`,
    requestRevision: 0,
    restoreFocusId: `${id}-restore`,
    titleId: null,
    triggerId: `${id}-trigger`,
  };
}

function PopoverProbe({
  nested,
  record,
}: Readonly<{
  nested: boolean;
  record: (entry: LedgerEntry) => void;
}>) {
  const [open, setOpen] = useState(false);
  const triggerId = nested ? "nested-popover-trigger" : "standalone-popover-trigger";
  const surfaceId = nested ? "nested-popover" : "standalone-popover";
  const accessibleName = nested ? "Nested options" : "Standalone options";
  const actionId = nested ? "nested-popover-action" : "standalone-popover-action";
  return (
    <>
      <button id={triggerId} onClick={() => { setOpen(true); }} type="button">
        {nested ? "Open nested menu" : "Open standalone popover"}
      </button>
      {open ? (
        <Popover
          {...common}
          accessibleName={accessibleName}
          content={<button id={actionId} type="button">{nested ? "Nested action" : "Popover action"}</button>}
          id={surfaceId}
          onOpenChange={(event) => {
            setOpen(event.value);
            record(event);
          }}
          open
          triggerId={triggerId}
        />
      ) : null}
    </>
  );
}

function invokeInvalidDismissibleDialog(): UiDiagnostic | null {
  try {
    Dialog({
      ...common,
      backgroundRootId: "overlay-background",
      closeLabel: "",
      content: null,
      description: "A malformed dismissible surface.",
      dismissibility: dismissible,
      focusTargets: {
        triggerId: "dialog-trigger",
        workflowTargetId: "workflow-fallback",
        workspaceId: "overlay-workspace",
      },
      id: "invalid-dismissible-dialog",
      initialFocus: "heading",
      initialFocusId: null,
      onContractRefusal: () => undefined,
      onDismiss: () => undefined,
      open: false,
      title: "Invalid dismissal surface",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "diagnostic" in error &&
      typeof error.diagnostic === "object" &&
      error.diagnostic !== null
    ) {
      return error.diagnostic as UiDiagnostic;
    }
    throw error;
  }
  return null;
}

function OverlayScenario() {
  const [events, setEvents] = useState<LedgerEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [secondDialogOpen, setSecondDialogOpen] = useState(false);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipTriggerMounted, setTooltipTriggerMounted] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [staleDialogOpen, setStaleDialogOpen] = useState(false);
  const [showDialogTrigger, setShowDialogTrigger] = useState(true);
  const authoritativeDocument = "Cmaj7 | Dm7 G7";

  useEffect(() => {
    setTooltipTriggerMounted(true);
  }, []);

  const record = (entry: LedgerEntry) => {
    setEvents((current) => [...current, entry]);
  };
  const recordRefusal = (diagnostic: UiDiagnostic) => {
    record({ code: diagnostic.code, componentId: diagnostic.componentId, kind: "refusal", path: diagnostic.path });
  };
  const dismissDialog = (event: UiActionEvent<unknown>) => {
    record(event);
    setDialogOpen(false);
    setSheetOpen(false);
    setSecondDialogOpen(false);
  };

  const runLimitPreflight = () => {
    const root = descriptor("limit-root", "modal", "dialog");
    const modal = FocusDismissLayer({
      backgroundRootId: "limit-background",
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: { activeTransientId: null, descendantNonmodalIds: [], dismissAncestorIds: [], modalScopeDepth: 2 as 1, root },
    });
    const exactAncestors = Array.from({ length: 8 }, (_, index) => `dismiss-owner-${String(index)}`);
    const exact = FocusDismissLayer({
      backgroundRootId: "limit-background",
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: { activeTransientId: null, descendantNonmodalIds: [], dismissAncestorIds: exactAncestors, modalScopeDepth: 1, root },
    });
    const overflow = FocusDismissLayer({
      backgroundRootId: "limit-background",
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: { activeTransientId: null, descendantNonmodalIds: [], dismissAncestorIds: [...exactAncestors, "dismiss-owner-8"], modalScopeDepth: 1, root },
    });
    const mobileSheet = FocusDismissLayer({
      backgroundRootId: "limit-background",
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: { activeTransientId: null, descendantNonmodalIds: ["mobile-sheet-descendant"], dismissAncestorIds: [], modalScopeDepth: 1, root },
    });
    record({
      action: "limit-preflight",
      exactAncestorsAccepted: exact.ok,
      mobileSheetAsNonmodalDescendantAccepted: mobileSheet.ok,
      modalCode: modal.ok ? null : modal.refusal.code,
      overflowCode: overflow.ok ? null : overflow.refusal.code,
    });
  };

  return (
    <main data-u0-harness-ready="overlays" id="overlay-scenario">
      <h1>U0 overlay arbitration harness</h1>
      <div id="overlay-background">
        {showDialogTrigger ? (
          <button id="dialog-trigger" onClick={() => { setDialogOpen(true); }} type="button">Open editing dialog</button>
        ) : null}
        <PopoverProbe nested={false} record={record} />
        <Menu
          {...common}
          accessibleName="Overlay action menu"
          activeItemId="overlay-menu-action"
          id="overlay-action-menu"
          items={[{ disabled: false, id: "overlay-menu-action", kind: "action", label: "Keep chart unchanged" }]}
          onAction={(event) => { record(event); }}
          onOpenChange={(event) => {
            setOverlayMenuOpen(event.value);
            record(event);
          }}
          open={overlayMenuOpen}
          triggerId="overlay-menu-trigger"
        />
        <button id="tooltip-trigger" type="button">Voicing help</button>
        {tooltipTriggerMounted ? (
          <Tooltip
            id="keyboard-tooltip"
            onOpenChange={(event) => {
              setTooltipOpen(event.value);
              record(event);
            }}
            open={tooltipOpen}
            text="Explains this voicing without changing the chart."
            triggerId="tooltip-trigger"
          />
        ) : null}
        <button id="alert-trigger" onClick={() => { setAlertOpen(true); }} type="button">Open destructive confirmation</button>
        <button id="stale-open-probe" onClick={() => { setStaleDialogOpen(true); }} type="button">Attempt stale-owner dialog</button>
        <button
          id="outside-focus-target"
          style={{ insetBlockEnd: "1rem", insetInlineEnd: "1rem", position: "fixed", zIndex: 20 }}
          type="button"
        >
          Outside focus target
        </button>
        <button id="workflow-fallback" type="button">Workflow fallback</button>
        <section aria-label="Workspace fallback" id="overlay-workspace" tabIndex={-1}>Workspace</section>
        <button id="limit-preflight" onClick={runLimitPreflight} type="button">Run overlay limit preflight</button>
        <button
          id="invalid-dismissibility-probe"
          onClick={() => {
            const refusal = invokeInvalidDismissibleDialog();
            record({ action: "invalid-dismissibility-refusal", code: refusal?.code ?? null, path: refusal?.path ?? [] });
          }}
          type="button"
        >
          Attempt dialog without a visible Close label
        </button>
        <p data-authoritative-document={authoritativeDocument}>Document: {authoritativeDocument}</p>
      </div>

      <div id="overlay-host">
        <Dialog
          {...common}
          backgroundRootId="overlay-background"
          closeLabel="Close editing dialog"
          content={(
            <div>
              <Button
                {...common}
                id="dialog-cancel"
                label="Cancel changes"
                onAction={dismissDialog}
                type="button"
                variant="secondary"
              />
              <PopoverProbe nested record={record} />
              <button id="sheet-trigger" onClick={() => { setSheetOpen(true); }} type="button">Open mobile details</button>
              <SheetDrawer
                {...common}
                backgroundRootId="overlay-background"
                closeLabel="Close mobile details"
                content={<button id="sheet-action" type="button">Sheet action</button>}
                contextRevealCssPx={48}
                description="A nonmodal descendant while the dialog remains the sole modal root."
                dismissibility={dismissible}
                focusTargets={{ triggerId: "sheet-trigger", workflowTargetId: null, workspaceId: "dialog-cancel" }}
                id="nested-mobile-sheet"
                initialFocus="heading"
                initialFocusId={null}
                mode="nonmodal"
                onContractRefusal={recordRefusal}
                onDismiss={(event) => {
                  setSheetOpen(false);
                  record(event);
                }}
                open={sheetOpen}
                side="block-end"
                title="Mobile details"
              />
              <button id="second-dialog-trigger" onClick={() => { setSecondDialogOpen(true); }} type="button">Attempt second modal</button>
              <button
                id="remove-trigger-and-close"
                onClick={() => {
                  setShowDialogTrigger(false);
                  setDialogOpen(false);
                  record({ action: "stale-owner-close", preserved: authoritativeDocument });
                }}
                type="button"
              >
                Remove trigger and close
              </button>
            </div>
          )}
          description="Changes remain local until a named application intent commits."
          dismissibility={dismissible}
          focusTargets={{ triggerId: "dialog-trigger", workflowTargetId: "workflow-fallback", workspaceId: "overlay-workspace" }}
          id="editing-dialog"
          initialFocus="explicit"
          initialFocusId="dialog-cancel"
          onContractRefusal={recordRefusal}
          onDismiss={(event) => {
            dismissDialog(event);
          }}
          open={dialogOpen}
          title="Edit chord"
        />

        <Dialog
          {...common}
          backgroundRootId="overlay-background"
          closeLabel="Close second dialog"
          content={<button id="second-dialog-action" type="button">Second action</button>}
          description="This second modal must be refused."
          dismissibility={dismissible}
          focusTargets={{ triggerId: "second-dialog-trigger", workflowTargetId: null, workspaceId: "dialog-cancel" }}
          id="second-dialog"
          initialFocus="heading"
          initialFocusId={null}
          onContractRefusal={recordRefusal}
          onDismiss={(event) => {
            setSecondDialogOpen(false);
            record(event);
          }}
          open={secondDialogOpen}
          title="Second modal"
        />

        <AlertDialog
          {...common}
          backgroundRootId="overlay-background"
          closeLabel="Cancel destructive action"
          confirmActionId="alert-confirm"
          content={(
            <div>
              <button id="alert-cancel" onClick={() => { setAlertOpen(false); }} type="button">Keep chart</button>
              <button id="alert-confirm" type="button">Delete chart</button>
            </div>
          )}
          description="Deleting removes the local chart. Exported files remain preserved."
          dismissibility={dismissible}
          focusTargets={{ triggerId: "alert-trigger", workflowTargetId: null, workspaceId: "overlay-workspace" }}
          id="destructive-alert"
          initialFocus="explicit"
          initialFocusId="alert-cancel"
          leastDestructiveActionId="alert-cancel"
          onContractRefusal={recordRefusal}
          onDismiss={(event) => {
            setAlertOpen(false);
            record(event);
          }}
          open={alertOpen}
          title="Delete chart?"
        />

        <Dialog
          {...common}
          backgroundRootId="overlay-background"
          closeLabel="Close stale dialog"
          content={<button id="stale-dialog-action" type="button">Stale action</button>}
          description="This surface cannot open without a current owner."
          dismissibility={dismissible}
          focusTargets={{ triggerId: "missing-stale-trigger", workflowTargetId: "workflow-fallback", workspaceId: "overlay-workspace" }}
          id="stale-owner-dialog"
          initialFocus="heading"
          initialFocusId={null}
          onContractRefusal={recordRefusal}
          onDismiss={(event) => {
            setStaleDialogOpen(false);
            record(event);
          }}
          open={staleDialogOpen}
          title="Stale owner"
        />
      </div>
      <EventLedger entries={events} />
    </main>
  );
}

type SystemStateDefinition = Readonly<{
  action: string;
  id: string;
  message: string;
  preservation: string;
  title: string;
  tone: "error" | "info" | "neutral" | "success" | "warning";
}>;

const systemStates: readonly SystemStateDefinition[] = Object.freeze([
  { action: "Open quick entry", id: "U0-STATE-001", message: "This valid chart is blank. Insert a first chord or open quick entry.", preservation: "The blank chart remains a valid unchanged document.", title: "Empty chart", tone: "neutral" },
  { action: "Focus chart", id: "U0-STATE-002", message: "Select a chord to inspect it. No stale chord facts are shown.", preservation: "The current chart and selection remain unchanged.", title: "Empty inspector", tone: "neutral" },
  { action: "Create custom chord", id: "U0-STATE-003", message: "No results for the retained query. Custom chord and Help remain available.", preservation: "The typed query remains visible and unmodified.", title: "No search results", tone: "info" },
  { action: "Review invalid tokens", id: "U0-STATE-004", message: "Invalid tokens are identified; valid source text is retained and no guessed chord was committed.", preservation: "All original entry text remains available for correction.", title: "Token parse errors", tone: "error" },
  { action: "Continue editing", id: "U0-STATE-005", message: "Recovery is current for this document revision.", preservation: "The current recovery snapshot is intact.", title: "Recovery current", tone: "success" },
  { action: "Continue editing", id: "U0-STATE-006", message: "Recovery update pending. Editing remains available.", preservation: "The last current recovery snapshot remains intact.", title: "Pending recovery", tone: "info" },
  { action: "Export JSON", id: "U0-STATE-007", message: "Local storage is unavailable. Editing and export still work.", preservation: "The in-memory chart remains unchanged and exportable.", title: "Storage unavailable", tone: "warning" },
  { action: "Export JSON", id: "U0-STATE-008", message: "Storage quota was exceeded. Export this chart before clearing space.", preservation: "The current document remains present in memory.", title: "Quota exceeded", tone: "warning" },
  { action: "View corruption details", id: "U0-STATE-009", message: "A recovery record is corrupted. Keep the current chart or inspect details.", preservation: "The current chart was not replaced by corrupted recovery data.", title: "Corrupted recovery", tone: "error" },
  { action: "Export chart", id: "U0-STATE-010", message: "Export recommended. This is not presented as Save.", preservation: "The recovery snapshot and chart remain current.", title: "Export recommended", tone: "info" },
  { action: "Play", id: "U0-STATE-011", message: "Audio is locked until the Play gesture. The workspace remains editable.", preservation: "The chart and playback plan remain unchanged.", title: "Audio locked", tone: "warning" },
  { action: "Play", id: "U0-STATE-012", message: "Audio ready.", preservation: "The chart remains editable before playback begins.", title: "Audio ready", tone: "success" },
  { action: "Pause", id: "U0-STATE-013", message: "Playing Cmaj7. Playback status updates are restrained.", preservation: "The immutable playback plan remains the active authority.", title: "Playing", tone: "success" },
  { action: "Resume", id: "U0-STATE-014", message: "Playback paused.", preservation: "The playback position and chart remain intact.", title: "Paused", tone: "info" },
  { action: "Resume audio", id: "U0-STATE-015", message: "Audio was interrupted. Resume when ready; chart editing still works.", preservation: "The chart and exact playback position remain intact.", title: "Audio interrupted", tone: "warning" },
  { action: "Export chart", id: "U0-STATE-016", message: "Audio is unavailable on this device. Editing and export remain usable.", preservation: "No document or playback-plan data was discarded.", title: "Audio unavailable", tone: "error" },
  { action: "Review import details", id: "U0-STATE-017", message: "Import failed validation. The current chart was not replaced.", preservation: "The current chart remains byte-for-byte authoritative.", title: "Import failed", tone: "error" },
  { action: "Continue editing", id: "U0-STATE-018", message: "Analysis busy. Prior facts are retained and explicitly marked stale.", preservation: "Prior factual analysis remains visible without being relabeled current.", title: "Analysis busy", tone: "info" },
  { action: "Open notice center", id: "U0-STATE-019", message: "Repeated notice grouped 3 times at deterministic sequence 19.", preservation: "One deduplicated notice represents the repeated event.", title: "Duplicate notice", tone: "info" },
  { action: "Retry export", id: "U0-STATE-020", message: "Export failed. Retry or choose an alternate local format.", preservation: "The chart and recovery snapshot remain unchanged.", title: "Export failed", tone: "error" },
]);

function SystemStatesScenario() {
  const [events, setEvents] = useState<LedgerEntry[]>([]);
  const [analysisText] = useState("Current analysis: C major");
  const record = (entry: LedgerEntry) => {
    setEvents((current) => [...current, entry]);
  };

  return (
    <main data-u0-harness-ready="system-states" id="system-states-scenario">
      <h1>U0 system states</h1>
      <p id="system-state-claim-boundary">
        Fixture-authored U0 presentation and safe-action proof; adapter integration remains with its owning package.
      </p>
      <section aria-label="Stale async presentation probe">
        <h2>Stale result suppression</h2>
        <p data-current-analysis="true" id="current-analysis-status" role="status">{analysisText}</p>
        <button
          id="stale-analysis-result"
          onClick={() => { record({ action: "ignored-stale-presentation", preserved: analysisText, tokenRevision: 2, currentRevision: 3 }); }}
          type="button"
        >
          Attempt stale analysis result
        </button>
      </section>
      <div class="u0-system-state-grid">
        {systemStates.map((state, index) => {
          const urgent = state.tone === "error";
          return (
            <section
              aria-labelledby={`${state.id}-heading`}
              data-preservation={state.preservation}
              data-safe-action={state.action}
              data-u0-state-id={state.id}
              key={state.id}
            >
              <h2 id={`${state.id}-heading`}>{state.title}</h2>
              <div aria-atomic="true" aria-live={urgent ? "assertive" : "polite"} role={urgent ? "alert" : "status"}>
                <StatusPill iconId={urgent ? "error" : state.tone === "warning" ? "warning" : "status"} label={state.title} tone={state.tone} />
                <p>{state.message}</p>
              </div>
              <p data-state-preservation="true">Preserved: {state.preservation}</p>
              <Button
                {...common}
                id={`state-action-${String(index + 1)}`}
                label={state.action}
                onAction={(event) => { record({ ...event, stateId: state.id }); }}
                type="button"
                variant={urgent ? "outline" : "secondary"}
              />
              {state.id === "U0-STATE-019" ? (
                <span data-duplicate-count="3" data-sequence="19">3 repeats, sequence 19</span>
              ) : null}
            </section>
          );
        })}
      </div>
      <EventLedger entries={events} />
    </main>
  );
}

function invokeInvalidIconButton(): UiDiagnostic | null {
  try {
    IconButton({
      ...common,
      accessibleName: "",
      iconId: "play",
      id: "invalid-icon-button",
      onAction: () => undefined,
      type: "button",
      variant: "ghost",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "diagnostic" in error &&
      typeof error.diagnostic === "object" &&
      error.diagnostic !== null
    ) {
      return error.diagnostic as UiDiagnostic;
    }
    throw error;
  }
  return null;
}

function AccessibilityScenario() {
  const [events, setEvents] = useState<LedgerEntry[]>([]);
  const [inputValue, setInputValue] = useState("Cmaj7");
  const [selectValue, setSelectValue] = useState<"major" | "minor" | null>("major");
  const [sort, setSort] = useState<null | Readonly<{ columnId: string; direction: "ascending" | "descending" }>>(null);
  const record = (entry: LedgerEntry) => { setEvents((current) => [...current, entry]); };

  return (
    <main data-u0-harness-ready="accessibility" id="accessibility-scenario">
      <h1>U0 semantic primitive smoke</h1>
      <Button {...common} id="semantic-button" label="Apply chord" onAction={record} type="button" variant="primary" />
      <Input
        {...common}
        accessibleName="Chord symbol"
        id="semantic-input"
        inputType="text"
        onValueChange={(event) => {
          setInputValue(event.value);
          record(event);
        }}
        placeholder="Dm7"
        readOnly={false}
        value={inputValue}
      />
      <Select
        {...common}
        accessibleName="Chord quality"
        id="semantic-select"
        onValueChange={(event) => {
          setSelectValue(event.value);
          record(event);
        }}
        options={[
          { description: null, disabled: false, id: "semantic-major-option", label: "Major", value: "major" as const },
          { description: null, disabled: false, id: "semantic-minor-option", label: "Minor", value: "minor" as const },
        ]}
        value={selectValue}
      />
      <Progress accessibleName="Analysis progress" max={100} min={0} value={50} valueText="Half complete" />
      <Meter accessibleName="Voice-leading score" high={80} low={30} max={100} min={0} optimum={100} value={72} valueText="72 out of 100" />
      <DataTable
        caption="Chord facts"
        columns={[
          { id: "fact-name", label: "Fact", renderText: (row: Readonly<{ fact: string; value: string }>) => row.fact, scope: "col", sortable: true },
          { id: "fact-value", label: "Value", renderText: (row: Readonly<{ fact: string; value: string }>) => row.value, scope: "col", sortable: false },
        ]}
        emptyMessage="No facts"
        id="semantic-table"
        onSortChange={(event) => {
          setSort(event.value);
          record(event);
        }}
        rowId={(row) => `fact-${row.fact.toLowerCase().replaceAll(" ", "-")}`}
        rows={[{ fact: "Root", value: "C" }, { fact: "Quality", value: "major seventh" }]}
        sort={sort}
      />
      <button
        id="invalid-icon-probe"
        onClick={() => {
          const refusal = invokeInvalidIconButton();
          record({ action: "invalid-icon-refusal", code: refusal?.code ?? null, path: refusal?.path ?? [] });
        }}
        type="button"
      >
        Attempt unnamed icon button
      </button>
      <button id="semantic-after" type="button">After semantic primitives</button>
      <EventLedger entries={events} />
    </main>
  );
}

function UnknownScenario({ scenario }: Readonly<{ scenario: string }>) {
  return <main data-u0-harness-ready="unknown"><h1>Unknown scenario</h1><p>{scenario}</p></main>;
}

const root = document.getElementById("u0-interaction-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("U0_INTERACTION_HARNESS_ROOT_MISSING");
}
const scenario = root.dataset["u0Scenario"] ?? "unknown";
const content: ComponentChildren = scenario === "keyboard"
  ? <KeyboardScenario />
  : scenario === "overlays"
    ? <OverlayScenario />
    : scenario === "system-states"
      ? <SystemStatesScenario />
      : scenario === "accessibility"
        ? <AccessibilityScenario />
        : <UnknownScenario scenario={scenario} />;

render(content, root);

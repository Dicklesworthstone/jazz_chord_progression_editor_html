import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import {
  createStudioController,
  type StudioController,
} from "./application/runtime";
import { App, StudioStartupFailure } from "./ui/runtime";

const mountPoint = document.querySelector<HTMLElement>("#app");

if (mountPoint === null) {
  throw new Error("Changes could not find its application mount point.");
}

type StudioRootProps = Readonly<{
  controller: StudioController;
}>;

function StudioRoot({ controller }: StudioRootProps) {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());

  useEffect(() => {
    const publishSnapshot = (): void => {
      setSnapshot(controller.getSnapshot());
    };
    const unsubscribe = controller.subscribe(publishSnapshot);
    publishSnapshot();
    return unsubscribe;
  }, [controller]);

  return (
    <App
      snapshot={snapshot}
      actions={{
        acknowledgeFocus: controller.acknowledgeFocus,
        annotateSection: controller.annotateSection,
        applyInlineSymbol: controller.applyInlineSymbol,
        applyQuickEntryPreview: controller.applyQuickEntryPreview,
        clearQuickEntry: controller.clearQuickEntry,
        declareMeasureCompletion: controller.declareMeasureCompletion,
        deleteSelection: controller.deleteSelection,
        duplicateSelection: controller.duplicateSelection,
        insertMeasure: controller.insertMeasure,
        insertRecoveredChord: controller.insertRecoveredChord,
        insertSection: controller.insertSection,
        joinEventDurations: controller.joinEventDurations,
        joinSections: controller.joinSections,
        moveFollowingEvents: controller.moveFollowingEvents,
        moveSelection: controller.moveSelection,
        moveSelectionTo: controller.moveSelectionTo,
        extendSelectionTo: controller.extendSelectionTo,
        previewChartText: controller.previewChartText,
        previewInsertionPlan: controller.previewInsertionPlan,
        previewQuickEntryDraft: controller.previewQuickEntryDraft,
        redo: controller.redo,
        renameSection: controller.renameSection,
        selectEvent: controller.selectEvent,
        setInsertionPoint: controller.setInsertionPoint,
        setRange: controller.setRange,
        setRangeEdge: controller.setRangeEdge,
        setRangeEdgeBeat: controller.setRangeEdgeBeat,
        clearRange: controller.clearRange,
        splitEventDuration: controller.splitEventDuration,
        splitSection: controller.splitSection,
        setSectionBoundary: controller.setSectionBoundary,
        setEventDurationText: controller.setEventDurationText,
        setQuickEntryDraft: controller.setQuickEntryDraft,
        setRailCollapsed: controller.setRailCollapsed,
        setTitle: controller.setTitle,
        undo: controller.undo,
      }}
    />
  );
}

const creation = createStudioController({
  nowMs: () => performance.now(),
});

if (creation.ok) {
  render(<StudioRoot controller={creation.controller} />, mountPoint);
} else {
  render(
    <StudioStartupFailure
      message={creation.refusal.message}
      recoveryAction={creation.refusal.recoveryAction}
    />,
    mountPoint,
  );
}

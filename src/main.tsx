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
        annotateSection: controller.annotateSection,
        applyInlineSymbol: controller.applyInlineSymbol,
        applyQuickEntryPreview: controller.applyQuickEntryPreview,
        clearQuickEntry: controller.clearQuickEntry,
        deleteSelection: controller.deleteSelection,
        duplicateSelection: controller.duplicateSelection,
        insertMeasure: controller.insertMeasure,
        insertSection: controller.insertSection,
        moveSelection: controller.moveSelection,
        moveSelectionTo: controller.moveSelectionTo,
        extendSelectionTo: controller.extendSelectionTo,
        previewChartText: controller.previewChartText,
        redo: controller.redo,
        renameSection: controller.renameSection,
        selectEvent: controller.selectEvent,
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

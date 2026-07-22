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
        setTitle: controller.setTitle,
        undo: controller.undo,
        redo: controller.redo,
        setRailCollapsed: controller.setRailCollapsed,
      }}
    />
  );
}

const creation = createStudioController();

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

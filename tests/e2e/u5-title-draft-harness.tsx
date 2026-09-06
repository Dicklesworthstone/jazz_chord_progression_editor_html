import { options, render } from "preact";
import { createStudioComposition } from "../../src/application/runtime";
import { StudioRoot } from "../../src/ui/App";

declare global {
  interface Window {
    u5TitleScheduling: {
      flushEffects: () => void;
      commitExternalTitle: (title: string) => void;
      committedTitle: () => string;
    };
  }
}

// Hold only Preact's passive-effect queue. Rendering, DOM input, application
// commands and focus stay real; the test chooses the otherwise racy interleave.
const pending: (() => void)[] = [];
options.requestAnimationFrame = callback => { pending.push(callback); };
const created = createStudioComposition();
if (!created.ok) throw new Error(created.refusal.code);
const { controller } = created.composition;
window.u5TitleScheduling = {
  flushEffects: () => { for (const callback of pending.splice(0)) callback(); },
  commitExternalTitle: title => {
    const result = controller.setTitle(title);
    if (!result.ok) throw new Error("EXTERNAL_TITLE_REFUSED");
    // Background startup acknowledges its own command focus, exactly as
    // seedStarterChart does; it must not move focus out of an active field.
    const focus = controller.getSnapshot().focusRequest;
    if (focus !== null) controller.acknowledgeFocus(focus.sequence);
  },
  committedTitle: () => controller.getSnapshot().title,
};
render(<StudioRoot controller={controller} />, document.body);

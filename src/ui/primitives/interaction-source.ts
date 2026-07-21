import type { KeyboardEventHandler, PointerEventHandler } from "preact";
import { useRef } from "preact/hooks";

import type { UiInteractionSource } from "../ui-contract";

export type UiInteractionSourceTracker<Element extends HTMLElement> = Readonly<{
  onPointerDown: PointerEventHandler<Element>;
  onKeyDown: KeyboardEventHandler<Element>;
  reset: () => void;
  take: (fallback: UiInteractionSource) => UiInteractionSource;
}>;

/** Keeps DOM modality private while callbacks receive only the U0 source enum. */
export function useInteractionSource<Element extends HTMLElement>():
  UiInteractionSourceTracker<Element> {
  const source = useRef<UiInteractionSource | null>(null);

  return {
    onPointerDown: () => {
      source.current = "pointer";
    },
    onKeyDown: () => {
      source.current = "keyboard";
    },
    reset: () => {
      source.current = null;
    },
    take: (fallback) => {
      const current = source.current ?? fallback;
      source.current = null;
      return current;
    },
  };
}

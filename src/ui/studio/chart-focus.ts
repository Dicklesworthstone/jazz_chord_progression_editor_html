/** Compensate a reading anchor's layout movement within the new scroll range. */
export function anchoredChartScroll(
  scroll: number,
  before: number,
  after: number,
  maximum: number,
): number {
  return Math.max(0, Math.min(maximum, scroll + after - before));
}

export type ChartFocusScroll = Readonly<{
  scroller: HTMLElement;
  anchor: HTMLElement | null;
  offset: number;
  atTop: boolean;
  left: number;
  frame: HTMLElement | null;
  frameTop: number;
}>;

/** Called only by the explicit presentation toggle, never ordinary renders. */
export function captureChartFocusScroll(root: HTMLElement): ChartFocusScroll | null {
  const scroller = root.querySelector<HTMLElement>(".studio-chart__scroller");
  if (scroller === null) return null;
  const top = scroller.getBoundingClientRect().top;
  const anchor = Array.from(scroller.querySelectorAll<HTMLElement>(".studio-measure"))
    .find(measure => measure.getBoundingClientRect().bottom > top) ?? null;
  const frame = root.querySelector<HTMLElement>(".studio-shell__frame");
  return {
    scroller, anchor, offset: anchor === null ? 0 : anchor.getBoundingClientRect().top - top,
    atTop: scroller.scrollTop === 0, left: scroller.scrollLeft,
    frame, frameTop: frame?.scrollTop ?? 0,
  };
}

export function restoreChartFocusScroll(saved: ChartFocusScroll): void {
  const { scroller, anchor, frame } = saved;
  if (!scroller.isConnected) return;
  if (frame?.isConnected) frame.scrollTop = saved.frameTop;
  scroller.scrollLeft = saved.left;
  if (saved.atTop) {
    scroller.scrollTop = 0;
  } else if (anchor !== null && scroller.contains(anchor)) {
    scroller.scrollTop = anchoredChartScroll(
      scroller.scrollTop, saved.offset,
      anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      scroller.scrollHeight - scroller.clientHeight,
    );
  }
}

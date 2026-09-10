import { useEffect, useRef, useState } from "preact/hooks";
import type { StudioPlayAlongView } from "../../application/runtime";

/** A bounded display reader; this interval never schedules or advances music. */
export function PlayAlongDisplay({ read, onStop, onExit, canStop }: Readonly<{
  read: () => StudioPlayAlongView;
  onStop: () => void;
  canStop: boolean;
  onExit: () => void;
}>) {
  const [view, setView] = useState(read);
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const refresh = (): void => {
      const next = read();
      setView(previous => previous.status === next.status && previous.current === next.current &&
        previous.next === next.next && previous.bar === next.bar && previous.pulse === next.pulse &&
        previous.section === next.section && previous.beatsPerBar === next.beatsPerBar ? previous : next);
    };
    refresh();
    const timer = window.setInterval(refresh, 100);
    return () => { window.clearInterval(timer); };
  }, [read]);
  return (
    <section class="studio-play-along" aria-label="Play-along display">
      <div class="studio-play-along__heading">
        <p ref={heading} tabIndex={-1}>{view.status}</p>
        <div class="studio-play-along__actions">
          <button class="ui-button" data-variant="secondary" type="button" disabled={!canStop} onClick={onStop}>Stop</button>
          <button class="ui-button" data-variant="secondary" type="button" onClick={onExit}>Exit Focus</button>
        </div>
      </div>
      <p class="studio-play-along__current" aria-label="Current chord">{view.current ?? "—"}</p>
      <p class="studio-play-along__next">Next: {view.next ?? "—"}</p>
      <p>{view.bar === null ? "Your chart stays below." : `${view.section ?? ""} · Bar ${String(view.bar)} · Chart beat ${String(view.pulse)} of ${String(view.beatsPerBar)}`}</p>
    </section>
  );
}

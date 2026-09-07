import {
  decodeDocumentShape, makeBeatDuration, makeChordEvent, parseStableId,
  type ChordEvent, type ChordEventInput,
} from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import type { AppState } from "../../src/application/application-state-contract";

/** Construct valid fixtures; negative tests should send explicit refusal inputs. */
export function inspectorEvent(
  input: Omit<ChordEventInput, "id" | "duration"> & { id: string },
): ChordEvent {
  const id = parseStableId("event", input.id);
  const duration = makeBeatDuration({ numerator: 4, denominator: 1 });
  if (!id.ok || !duration.ok) throw new Error("Invalid inspector fixture identity/time");
  const event = makeChordEvent({ ...input, id: id.value, duration: duration.value });
  if (!event.ok) throw new Error(JSON.stringify(event.refusal));
  return event.value;
}

/** Publish a complete four-beat measure through the real F2/F3 boundary. */
export function inspectorState(event: ChordEvent): AppState {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("Inspector fixture bootstrap failed");
  const base = bootstrap.value.state;
  const decoded = decodeDocumentShape({
    ...base.document,
    sections: base.document.sections.map((section, index) => index === 0 ? {
      ...section,
      measures: section.measures.map((measure, measureIndex) => measureIndex === 0 ? {
        ...measure, events: [event], completion: { kind: "complete" },
      } : measure),
    } : section),
  });
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) throw new Error(JSON.stringify(published.errors));
  return {
    ...base, document: published.value,
    bookmarks: { ...base.bookmarks, selection: {
      kind: "events", eventIds: [event.id], anchorEventId: event.id, focusEventId: event.id,
    } },
  };
}

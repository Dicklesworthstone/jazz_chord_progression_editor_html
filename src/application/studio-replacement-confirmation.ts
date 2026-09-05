import type { RecoverySnapshot } from "../persistence";
import type { AppState } from "./application-state-contract";

/** U5's reviewed confirmation matrix; recovery status is the actual A1 observation. */
export function selectReplacementConfirmation(state: AppState, recovery: RecoverySnapshot) {
  const unexported = state.exportRevision !== state.revision;
  const unrecovered = recovery.documentId !== state.document.id || recovery.cleanRevision !== state.revision;
  const nonempty = state.document.sections.some(section => section.measures.some(measure => measure.events.length > 0));
  const active = ["starting", "playing", "paused", "stopping"].includes(state.transport.status);
  return Object.freeze({ confirmationRequired: nonempty && (unexported || unrecovered || active), exportRecommended: unexported && unrecovered });
}

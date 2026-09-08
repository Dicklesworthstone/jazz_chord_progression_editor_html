import { addBeatValues, makeBeatPosition, type ProgressionDocumentV2 } from "../domain";
import { resolveChord, type DiscoveryRequest } from "../theory";
import type { DiscoveryApplicationPorts } from "./discovery-execution-contract";
import type { AppState } from "./application-state-contract";
import { deepStructuralEqual } from "./application-state-helpers";

/** Existing A0/F3 values are compared literally; never repair a request. */
export function discoverySourceMatches(request: DiscoveryRequest, state: AppState,
  readSelected: DiscoveryApplicationPorts["readSelectedRealization"]): boolean {
  if (state.document.id !== request.identity.documentId || state.revision !== request.identity.sourceRevision) return false;
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) return false;
  let position = zero.value, index = 0;
  for (const section of state.document.sections) for (const measure of section.measures) for (const event of measure.events) {
    const source = request.source[index];
    if (source?.event.id === event.id) {
      if (!deepStructuralEqual(source.event, event) || !deepStructuralEqual(source.position, position) ||
        readSelected(event.id) !== source.selectedRealizationId) return false;
      const resolution = resolveChord(event.chord);
      if (!resolution.ok || (source.selectedRealizationId === null ? resolution.value.realizations.length > 1 :
        !resolution.value.realizations.some(row => row.id === source.selectedRealizationId))) return false;
      index += 1;
    }
    const sum = addBeatValues(position, event.duration);
    if (!sum.ok) return false;
    const next = makeBeatPosition(sum.value);
    if (!next.ok) return false;
    position = next.value;
  }
  return index === request.source.length;
}

/** This generic path only publishes confirmed, time-preserving source edits. */
export function discoveryScopePreserved(before: ProgressionDocumentV2, after: ProgressionDocumentV2,
  request: DiscoveryRequest): boolean {
  const { sections: oldSections, ...oldOwn } = before;
  const { sections: newSections, ...newOwn } = after;
  if (!deepStructuralEqual(oldOwn, newOwn) || oldSections.length !== newSections.length) return false;
  const sourceIds = new Set(request.source.map(row => row.event.id));
  for (let s = 0; s < oldSections.length; s += 1) {
    const oldSection = oldSections[s], newSection = newSections[s];
    if (oldSection === undefined || newSection === undefined) return false;
    const { measures: oldMeasures, ...oldSectionOwn } = oldSection;
    const { measures: newMeasures, ...newSectionOwn } = newSection;
    if (!deepStructuralEqual(oldSectionOwn, newSectionOwn) || oldMeasures.length !== newMeasures.length) return false;
    for (let m = 0; m < oldMeasures.length; m += 1) {
      const oldMeasure = oldMeasures[m], newMeasure = newMeasures[m];
      if (oldMeasure === undefined || newMeasure === undefined) return false;
      const { events: oldEvents, ...oldMeasureOwn } = oldMeasure;
      const { events: newEvents, ...newMeasureOwn } = newMeasure;
      if (!deepStructuralEqual(oldMeasureOwn, newMeasureOwn) || oldEvents.length !== newEvents.length) return false;
      for (let e = 0; e < oldEvents.length; e += 1) {
        const oldEvent = oldEvents[e], newEvent = newEvents[e];
        if (oldEvent === undefined || newEvent === undefined || oldEvent.id !== newEvent.id ||
          !deepStructuralEqual(oldEvent.duration, newEvent.duration) ||
          (!sourceIds.has(oldEvent.id) && !deepStructuralEqual(oldEvent, newEvent))) return false;
      }
    }
  }
  return true;
}

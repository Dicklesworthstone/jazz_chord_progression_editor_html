import { makeBeatPosition, type ChordEvent, type ChordEventId } from "../../src/domain";
import { createDiscoveryJobService, reduceEphemeralIntent, runDocumentCommand,
  type AppState, type DiscoveryApplicationPorts, type DiscoveryPublicationAdapter } from "../../src/application";
import { createDiscoveryStepper, type DiscoveryArena, type DiscoveryEngine, type DiscoveryOptionDraft,
  type DiscoveryRequest } from "../../src/theory";
import { a0Dependencies, a0Envelope, a0InitialState, publishA0Candidate } from "./a0-application-fixture";
import { discoveryDraft, discoveryRequest } from "./discovery-execution-fixture";
import documentFixture from "../fixtures/exact-share/document.changes.json";
import laws from "../fixtures/discovery-execution/law-cases.json";

export const annotationDraft = (): DiscoveryOptionDraft => ({ ...discoveryDraft(1),
  proposal: laws.publicationSource.positiveProposal,
  evidence: [{ kind: "rule", id: "literal-annotation.1", statement: "Explicitly requested annotation; all other fields unchanged.",
    sourceEventIds: ["share-event-frozen"] }],
});

/** Independent finite protocol adapter; this is no musical-engine endorsement. */
export const annotationPublication: DiscoveryPublicationAdapter = {
  validate: (request, option, current) => {
    const draft: DiscoveryOptionDraft = { value: option.value, proposal: option.proposal, evidence: option.evidence,
      counterevidence: option.counterevidence, missingPremises: option.missingPremises, costs: option.costs, order: option.order };
    if (JSON.stringify(draft) !== JSON.stringify(annotationDraft()) ||
      request.identity.policy.id !== "literal-order" || request.constraints !== null || request.input !== null) {
      return { ok: false, refusal: { code: "discovery.invalid-proof", path: ["literal-annotation"] } };
    }
    const sourceEvent = request.source.find(row => row.event.id === "share-event-frozen")?.event;
    if (sourceEvent?.annotation !== "Do not optimize this inversion.") {
      return { ok: false, refusal: { code: "discovery.invalid-proof", path: ["source"] } };
    }
    return { ok: true, patch: {
      baseRevision: request.identity.sourceRevision,
      sourceEventIds: request.source.map(row => row.event.id), declaredChangedIds: [sourceEvent.id],
      exactTimingPreserved: true, stableIdentityPolicy: "preserve-unmodified-allocate-new-inserts",
      candidate: { ...current, sections: current.sections.map(section => ({ ...section,
        measures: section.measures.map(measure => {
          if (measure.completion.kind === "empty") return measure;
          const first = measure.events[0];
          if (first === undefined) throw new Error("Nonempty independent measure has no first event");
          const update = (event: ChordEvent): ChordEvent => event.id === sourceEvent.id ? { ...event, annotation: "Keep the written line." } : event;
          const events: readonly [ChordEvent, ...ChordEvent[]] = [update(first), ...measure.events.slice(1).map(update)];
          return { id: measure.id, completion: measure.completion, events };
        }),
      })) },
    } };
  },
};

export function discoveryApplicationFixture(options: Readonly<{
  retire?: () => Promise<boolean>;
  publication?: DiscoveryPublicationAdapter;
  draft?: () => DiscoveryOptionDraft;
  create?: DiscoveryEngine["create"];
  work?: number;
  quantum?: number;
}> = {}) {
  const dependencies = a0Dependencies();
  let state = a0InitialState(publishA0Candidate(documentFixture));
  for (let n = 1; n <= 5; n += 1) {
    const changed = runDocumentCommand({ state, dependencies, command: { ...a0Envelope(state, `history.${String(n)}`, n),
      kind: "set-text", target: { kind: "document-title" }, value: n === 5 ? documentFixture.title : `Draft ${String(n)}`,
      coalescing: { kind: "text-field", key: "title", focusSessionId: n === 5 ? "second" : "first" } } });
    if (!changed.ok) throw new Error(changed.refusal.code); state = changed.state;
  }
  state = reduceEphemeralIntent({ state, intent: { kind: "mark-exported", revision: 4 } }).state;
  state = reduceEphemeralIntent({ state, intent: { kind: "set-recovery", recovery: { kind: "clean", persistedRevision: 3 } } }).state;
  const original = state;
  const selected = new Map<string, string>(Object.entries(laws.publicationSource.selectedRealizations));
  const base = discoveryRequest();
  const request: DiscoveryRequest = { ...base, identity: { ...base.identity, documentId: state.document.id, sourceRevision: state.revision },
    source: state.document.sections.flatMap(section => section.measures.flatMap(measure => measure.events)).map(event => {
      const position = laws.publicationSource.positions.find(row => row.eventId === event.id);
      if (position === undefined) throw new Error("Missing independent source position");
      const beat = makeBeatPosition(position);
      if (!beat.ok) throw new Error("Independent beat refused");
      return { event, position: beat.value, selectedRealizationId: selected.get(event.id) ?? null };
    }),
  };
  const arenas: DiscoveryArena[] = [];
  const visits: number[] = [];
  let retirementCalls = 0;
  const engine: DiscoveryEngine = {
    version: request.identity.engine, policy: request.identity.policy, laws: request.identity.laws, corpora: request.identity.corpora,
    create: (bound, arena) => {
      arenas.push(arena);
      if (options.create !== undefined) return options.create(bound, arena);
      return createDiscoveryStepper(bound, arena, { family: "protocol", maximumWorkspaceBytes: 4096,
        seed: (_request, sink) => { sink.enqueue(() => 0); },
        expand: (value, _request, sink) => {
          if (typeof value !== "number") throw new Error("Invalid protocol state");
          visits.push(value);
          if (value + 1 < (options.work ?? 3)) sink.enqueue(() => value + 1);
          else sink.offer(options.draft ?? annotationDraft);
        },
      });
    },
  };
  const ports: DiscoveryApplicationPorts = { readState: () => state, writeState: next => { state = next; },
    dependencies, engine, readSelectedRealization: (id: ChordEventId) => selected.get(id) ?? null,
    retireTransport: async () => { retirementCalls += 1; return options.retire === undefined ? true : options.retire(); },
    publication: options.publication ?? annotationPublication,
  };
  const service = createDiscoveryJobService(ports, options.quantum ?? 1);
  const editTitle = (title: string): void => {
    const result = runDocumentCommand({ state, dependencies, command: { ...a0Envelope(state, "user.edit", state.nextSequence),
      kind: "set-text", target: { kind: "document-title" }, value: title,
      coalescing: { kind: "text-field", key: "title", focusSessionId: "new-user-edit" } } });
    if (!result.ok) throw new Error(result.refusal.code); state = result.state;
  };
  return { service, request, original, engine, ports, selected, arenas, visits, editTitle,
    read: () => state, write: (next: AppState) => { state = next; }, retirementCalls: () => retirementCalls };
}

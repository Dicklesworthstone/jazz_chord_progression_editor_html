/**
 * Production X1 replacement-retirement adapter over the serialized
 * transport (docs/E0_INTERCHANGE_CONTRACT.md section 9; X1 package
 * l3a.7 closed 2026-07-23). This is the binding that retires
 * `createUnavailableReplacementRetirementAdapter()`: the E0 commit
 * driver's retirement leg now rides the REAL X1 FIFO.
 *
 * Retirement is `replace-plan` with a null binding: the serialized
 * transport increments the generation, clears the timer, runs the full
 * X0 retirement (reporting `noFutureAttackPostcondition`), releases the
 * active preview, clears every scheduled event, and lands in `ready`
 * with no plan — exactly the "progression-and-preview" /
 * "zero-future-attack" scope the E0 request names.
 *
 * Honesty laws:
 * - The exact no-effect refusal envelope (`retirementEffect: "none"`) is
 *   returned ONLY when nothing was submitted or the transport refused
 *   before mutating (a `replace-plan(null)` refusal is only
 *   `transport.state_invalid`, which mutates nothing).
 * - When the world may have changed but the evidence cannot honestly
 *   claim the requested retirement — the receipt reports a false
 *   no-future-attack postcondition, or the retired generation is not the
 *   one the prepared echo named — the adapter deliberately returns a
 *   NONCONFORMING envelope. The driver's evidence judge maps it to
 *   `transport.replacement_retirement_evidence_invalid` with the
 *   retirement-protocol-invalid discard, which is the reconciliation
 *   obligation such a state requires. Fabricating either the exact
 *   refusal (claiming "none" happened) or full evidence (claiming the
 *   exact retirement happened) would be a lie in both directions.
 */
import type { TransportCommandOutcome, TransportService } from "../audio";
import {
  X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA,
  type RetireImportReplacementRequest,
  type X1ReplacementRetirementAdapter,
} from "./e0-interchange-contract";

export type LocalReplacementRetirementRequest = Readonly<Omit<RetireImportReplacementRequest, "sourceFormat"> & { origin: "new" | "lesson" }>;
export type StudioReplacementRetirementAdapter = X1ReplacementRetirementAdapter & Readonly<{
  retireLocalReplacement: (request: LocalReplacementRetirementRequest) => Promise<unknown>;
}>;

export function createX1SerializedTransportRetirementAdapter(
  transport: TransportService,
  /** The composition's single monotonic command-ID source — the same
   * counter every other transport caller draws from, so the serialized
   * FIFO's ID law holds across the whole app. */
  allocateCommandRequestId: () => number,
  observation?: Readonly<{
    beforeSubmit: (commandRequestId: number) => boolean;
    settled: (outcome: TransportCommandOutcome) => void;
  }>,
): StudioReplacementRetirementAdapter {
  // replace-plan(null) emits no notification. A0 correctly retains its last
  // accepted generation. Remember ONLY this adapter's proven retirement chain
  // so another replacement can retire the next empty epoch without inventing
  // a notification or accepting an unrelated generation advance.
  let covered: Readonly<{ requested: number; physical: number }> | null = null;
  const retire = async (request: RetireImportReplacementRequest | LocalReplacementRetirementRequest): Promise<unknown> => {
      const before = transport.inspectTransport();
      if (before.state === "locked") {
        /* Vacuous retirement: a locked transport has never opened an
         * epoch — no plan is bound, nothing is scheduled, and no attack
         * can start without a trusted-gesture initialize. The recovery
         * contract forbids startup from initializing audio, so boot-time
         * Keep retires against this state; the postconditions hold
         * trivially and the evidence is honest for the expected
         * generation the owner echoed. */
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            schema: X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA,
            authority: "x1-serialized-transport" as const,
            request,
            receipt: Object.freeze({
              requestId: request.identity.requestId,
              retiredTransportGeneration: request.expectedTransportGeneration,
              progressionRetired: true as const,
              previewRetired: true as const,
              noFutureAttack: true as const,
            }),
          }),
        });
      }
      if (before.generation !== request.expectedTransportGeneration &&
          !(covered?.requested === request.expectedTransportGeneration && covered.physical === before.generation)) {
        /* Nothing submitted; the world already moved past the prepared
         * echo. The exact no-effect refusal is honest. */
        return Object.freeze({
          ok: false as const,
          code: "transport.replacement_retirement_stale" as const,
          retirementEffect: "none" as const,
        });
      }

      const commandRequestId = allocateCommandRequestId();
      if (observation !== undefined && !observation.beforeSubmit(commandRequestId)) {
        return Object.freeze({ ok: false, code: "transport.replacement_retirement_failed", retirementEffect: "none" });
      }
      const outcome = await transport.submitTransportCommand(
        Object.freeze({
          commandRequestId,
          payload: Object.freeze({
            kind: "replace-plan" as const,
            binding: null,
          }),
        }),
      );
      observation?.settled(outcome);

      if (outcome.termination === "refusal") {
        /* replace-plan(null) refuses only from an illegal state, before
         * any mutation: still a no-effect refusal. */
        return Object.freeze({
          ok: false as const,
          code: "transport.replacement_retirement_failed" as const,
          retirementEffect: "none" as const,
        });
      }

      if (
        !outcome.noFutureAttackPostcondition ||
        outcome.generation !== before.generation + 1
      ) {
        /* A retirement ran but the evidence cannot claim the requested
         * one. Deliberately nonconforming: the driver judges this
         * evidence-invalid and demands reconciliation. */
        return Object.freeze({
          ok: false,
          code: "transport.replacement_retirement_failed",
          retirementEffect: outcome.noFutureAttackPostcondition
            ? "retired-unexpected-generation"
            : "no-future-attack-unproven",
        });
      }

      covered = Object.freeze({ requested: request.expectedTransportGeneration, physical: outcome.generation });

      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          schema: X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA,
          authority: "x1-serialized-transport" as const,
          request,
          receipt: Object.freeze({
            requestId: request.identity.requestId,
            retiredTransportGeneration: request.expectedTransportGeneration,
            progressionRetired: true as const,
            previewRetired: true as const,
            noFutureAttack: true as const,
          }),
        }),
      });
  };
  return Object.freeze({ retireImportReplacement: retire, retireLocalReplacement: retire });
}

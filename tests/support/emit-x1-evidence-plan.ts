import { customPlan } from "./transport-test-kit";

/**
 * Emits the reviewed X1 browser-evidence plan as stable JSON on stdout.
 * Invoked as a Bun subprocess by scripts/run-x1-transport-evidence.ts so
 * the tools project never imports browser-typed modules.
 */

const plan = customPlan({
  documentId: "doc-x1-browser-evidence",
  tempoBpm: 240,
  durations: [
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
    { numerator: 1, denominator: 1 },
  ],
});

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "changes.evidence.x1-transport-plan.v1",
      documentId: plan.sourceDocumentId,
      plan,
    },
    null,
    2,
  )}\n`,
);

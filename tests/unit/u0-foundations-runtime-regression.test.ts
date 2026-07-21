import { describe, expect, test } from "bun:test";

import type {
  UiButtonProps,
  UiLinkButtonProps,
  UiKbdProps,
  UiProgressProps,
} from "../../src/ui/ui-contract";
import {
  EmptyState,
  Kbd,
  LinkButton,
  preflightEmptyStateAction,
  Progress,
} from "../../src/ui/primitives/Foundations";
import {
  UiContractError,
  validateUiCommonProps,
} from "../../src/ui/primitives/validation";

const VALID_PROGRESS: UiProgressProps = Object.freeze({
  accessibleName: "Import progress",
  max: 100,
  min: 0,
  value: 40,
  valueText: "40 percent",
});

const VALID_ACTION: UiButtonProps = Object.freeze({
  busy: false,
  density: "comfortable",
  describedBy: [],
  disabled: false,
  id: "empty-state-action",
  invalid: false,
  label: "Continue",
  onAction: () => undefined,
  type: "button",
  variant: "primary",
});

const VALID_LINK: UiLinkButtonProps = Object.freeze({
  busy: false,
  density: "comfortable",
  describedBy: [],
  destination: Object.freeze({ href: "#studio", kind: "fragment" }),
  disabled: false,
  id: "studio-link",
  invalid: false,
  label: "Open studio",
});

function captureContractError(action: () => void): UiContractError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UiContractError);
    if (error instanceof UiContractError) return error;
    throw error;
  }
  throw new Error("Expected a U0 contract refusal.");
}

function isUnknownRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function progressProps(
  value: ReturnType<typeof Progress>,
): Readonly<Record<string, unknown>> {
  const props: unknown = value.props;
  if (!isUnknownRecord(props)) {
    throw new Error("Expected native progress props.");
  }
  return props;
}

describe("U0 Foundations runtime preflight", () => {
  test("refuses malformed Kbd collections and entries before collection access", () => {
    const collection = captureContractError(() => {
      Kbd({ keys: null } as unknown as UiKbdProps);
    });
    expect(collection.diagnostic.code).toBe("ui.value_malformed");
    expect(collection.diagnostic.path).toEqual(["keys"]);

    const entry = captureContractError(() => {
      Kbd({ keys: [null] } as unknown as UiKbdProps);
    });
    expect(entry.diagnostic.code).toBe("ui.value_malformed");
    expect(entry.diagnostic.path).toEqual(["keys", 0]);
  });

  test("refuses malformed LinkButton destinations before discriminant access", () => {
    const missingRecord = captureContractError(() => {
      LinkButton({
        ...VALID_LINK,
        destination: null,
      } as unknown as UiLinkButtonProps);
    });
    expect(missingRecord.diagnostic.code).toBe("ui.value_malformed");
    expect(missingRecord.diagnostic.path).toEqual(["destination"]);

    const unknownKind = captureContractError(() => {
      LinkButton({
        ...VALID_LINK,
        destination: { href: "#studio", kind: "remote" },
      } as unknown as UiLinkButtonProps);
    });
    expect(unknownKind.diagnostic.code).toBe("ui.value_malformed");
    expect(unknownKind.diagnostic.path).toEqual(["destination", "kind"]);

    const malformedFragment = captureContractError(() => {
      LinkButton({
        ...VALID_LINK,
        destination: { href: null, kind: "fragment" },
      } as unknown as UiLinkButtonProps);
    });
    expect(malformedFragment.diagnostic.code).toBe("ui.value_malformed");
    expect(malformedFragment.diagnostic.path).toEqual([
      "destination",
      "href",
    ]);

    const malformedDownload = captureContractError(() => {
      LinkButton({
        ...VALID_LINK,
        destination: { href: "blob:local", kind: "download" },
      } as unknown as UiLinkButtonProps);
    });
    expect(malformedDownload.diagnostic.code).toBe("ui.value_malformed");
    expect(malformedDownload.diagnostic.path).toEqual([
      "destination",
      "filename",
    ]);
  });

  test("refuses malformed EmptyState action records before useId or identity access", () => {
    const malformed = captureContractError(() => {
      EmptyState({
        description: "No progressions have been saved.",
        illustration: null,
        primaryAction: undefined,
        secondaryAction: null,
        title: "No saved progressions",
      } as unknown as Parameters<typeof EmptyState>[0]);
    });
    expect(malformed.diagnostic.code).toBe("ui.value_malformed");
    expect(malformed.diagnostic.path).toEqual(["primaryAction"]);
  });

  test("refuses a common describedBy reference that repeats its component ID", () => {
    const result = validateUiCommonProps({
      ...VALID_ACTION,
      describedBy: [VALID_ACTION.id],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe("ui.duplicate_item_id");
    expect(result.refusal.path).toEqual(["describedBy", 0]);
  });

  test("accepts finite determinate progress and explicit null indeterminate progress", () => {
    const determinate = Progress(VALID_PROGRESS);
    const determinateProps = progressProps(determinate);
    expect(determinate.type).toBe("progress");
    expect(determinateProps["max"]).toBe(100);
    expect(determinateProps["value"]).toBe(40);

    const offsetRange = Progress({
      ...VALID_PROGRESS,
      max: 15,
      min: 5,
      value: 9,
    });
    const offsetRangeProps = progressProps(offsetRange);
    expect(offsetRangeProps["max"]).toBe(10);
    expect(offsetRangeProps["value"]).toBe(4);
    expect(offsetRangeProps["aria-valuemin"]).toBe(5);
    expect(offsetRangeProps["aria-valuemax"]).toBe(15);
    expect(offsetRangeProps["aria-valuenow"]).toBe(9);

    const indeterminate = Progress({
      ...VALID_PROGRESS,
      value: null,
      valueText: "Loading",
    });
    const indeterminateProps = progressProps(indeterminate);
    expect(indeterminate.type).toBe("progress");
    expect(indeterminateProps["value"]).toBeUndefined();
  });

  test("refuses a missing or nonfinite progress value before ratio rendering", () => {
    const missing = captureContractError(() => {
      Progress({
        ...VALID_PROGRESS,
        value: undefined,
      } as unknown as UiProgressProps);
    });
    expect(missing.diagnostic.code).toBe("ui.value_malformed");
    expect(missing.diagnostic.path).toEqual(["value"]);

    const nonfinite = captureContractError(() => {
      Progress({ ...VALID_PROGRESS, value: Number.NaN });
    });
    expect(nonfinite.diagnostic.code).toBe("ui.range_invalid");
    expect(nonfinite.diagnostic.path).toEqual(["value"]);
  });

  test("preflights each EmptyState child callback at its owning path", () => {
    expect(() => {
      preflightEmptyStateAction(VALID_ACTION, ["primaryAction"]);
    }).not.toThrow();

    const malformed = captureContractError(() => {
      preflightEmptyStateAction(
        { ...VALID_ACTION, onAction: null } as unknown as UiButtonProps,
        ["secondaryAction"],
      );
    });
    expect(malformed.diagnostic.code).toBe("ui.value_malformed");
    expect(malformed.diagnostic.path).toEqual(["secondaryAction", "onAction"]);
  });
});

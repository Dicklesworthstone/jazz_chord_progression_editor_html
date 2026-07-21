import { UI_LIMITS, type UiOrientation, type UiResult, type UiRovingFocusProps } from "../ui-contract";
import { uiDiagnostic, validateUiId } from "./validation";

export type UiRovingKey = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "End" | "Home";

export type UiRovingMove = Readonly<{
  currentId: string | null;
  consumed: boolean;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRovingKey(value: unknown): value is UiRovingKey {
  return (
    value === "ArrowDown" ||
    value === "ArrowLeft" ||
    value === "ArrowRight" ||
    value === "ArrowUp" ||
    value === "End" ||
    value === "Home"
  );
}

function readableCurrentId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const currentId = value["currentId"];
  return typeof currentId === "string" || currentId === null
    ? currentId
    : null;
}

function exceedsCodePointLimit(value: string, maximum: number): boolean {
  let count = 0;
  const codePoints = value[Symbol.iterator]();
  while (!codePoints.next().done) {
    count += 1;
    if (count > maximum) return true;
  }
  return false;
}

export function preflightRovingFocus(
  props: UiRovingFocusProps,
): UiResult<UiRovingFocusProps> {
  const propsValue: unknown = props;
  if (
    typeof propsValue !== "object" ||
    propsValue === null ||
    Array.isArray(propsValue)
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      "roving-focus",
      ["props"],
      "Roving-focus state must be one declared record.",
      "Provide bounded controlled roving-focus state.",
    );
    return { diagnostics: [refusal], ok: false, refusal };
  }
  const owner = validateUiId(props.ownerId, ["ownerId"], props.ownerId);
  if (!owner.ok) return owner;
  const itemIds: unknown = props.itemIds;
  const disabledIds: unknown = props.disabledIds;
  if (!Array.isArray(itemIds) || !Array.isArray(disabledIds)) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.ownerId,
      ["itemIds", "disabledIds"],
      "Roving-focus identities must be ordered collections.",
      "Provide bounded arrays of item and disabled identities.",
    );
    return { diagnostics: [refusal], ok: false, refusal };
  }
  const orientation: unknown = props.orientation;
  const wrap: unknown = props.wrap;
  const typeahead: unknown = props.typeahead;
  if (
    (orientation !== "horizontal" &&
      orientation !== "vertical" &&
      orientation !== "both") ||
    typeof wrap !== "boolean" ||
    typeof typeahead !== "boolean"
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.ownerId,
      ["rovingState"],
      "Roving focus uses an unknown orientation or movement policy.",
      "Use a reviewed orientation and explicit boolean movement policies.",
    );
    return { diagnostics: [refusal], ok: false, refusal };
  }
  const currentId: unknown = props.currentId;
  if (currentId !== null) {
    const checkedCurrent = validateUiId(
      props.ownerId,
      ["currentId"],
      currentId,
    );
    if (!checkedCurrent.ok) return checkedCurrent;
  }
  if (
    props.itemIds.length > UI_LIMITS.maxRovingItems ||
    props.disabledIds.length > UI_LIMITS.maxRovingItems
  ) {
    const refusal = uiDiagnostic(
      "ui.collection_limit",
      props.ownerId,
      ["itemIds"],
      "The roving-focus collection exceeds its reviewed bound.",
      "Present at most 5,000 focusable items.",
    );
    return { diagnostics: [refusal], ok: false, refusal };
  }
  const items = new Set<string>([props.ownerId]);
  for (const [index, id] of props.itemIds.entries()) {
    const checked = validateUiId(props.ownerId, ["itemIds", index], id);
    if (!checked.ok) return checked;
    if (items.has(id)) {
      const refusal = uiDiagnostic(
        "ui.duplicate_item_id",
        props.ownerId,
        ["itemIds", index],
        "Roving-focus item identities must be unique.",
        "Give every item a unique stable identity.",
      );
      return { diagnostics: [refusal], ok: false, refusal };
    }
    items.add(id);
  }
  const disabled = new Set<string>();
  for (const [index, id] of props.disabledIds.entries()) {
    const checked = validateUiId(props.ownerId, ["disabledIds", index], id);
    if (!checked.ok) return checked;
    if (!items.has(id)) {
      const refusal = uiDiagnostic(
        "ui.selection_invalid",
        props.ownerId,
        ["disabledIds", index],
        "A disabled roving identity is absent from the item collection.",
        "Use disabled identities from the current collection.",
      );
      return { diagnostics: [refusal], ok: false, refusal };
    }
    if (disabled.has(id)) {
      const refusal = uiDiagnostic(
        "ui.duplicate_item_id",
        props.ownerId,
        ["disabledIds", index],
        "Disabled roving identities must be unique.",
        "List each disabled identity at most once.",
      );
      return { diagnostics: [refusal], ok: false, refusal };
    }
    disabled.add(id);
  }
  if (
    props.currentId !== null &&
    (!items.has(props.currentId) || disabled.has(props.currentId))
  ) {
    const refusal = uiDiagnostic(
      "ui.selection_invalid",
      props.ownerId,
      ["currentId"],
      "The current roving identity is absent or disabled.",
      "Use a current enabled identity or null.",
    );
    return { diagnostics: [refusal], ok: false, refusal };
  }
  return { diagnostics: [], ok: true, value: props };
}

/** Public no-DOM behavior boundary matching the reviewed component inventory. */
export function RovingFocus(
  props: UiRovingFocusProps,
): UiResult<UiRovingFocusProps> {
  return preflightRovingFocus(props);
}

function directionFor(
  orientation: UiOrientation | "both",
  key: UiRovingKey,
): -1 | 0 | 1 | "first" | "last" {
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if ((orientation === "horizontal" || orientation === "both") && key === "ArrowLeft") return -1;
  if ((orientation === "horizontal" || orientation === "both") && key === "ArrowRight") return 1;
  if ((orientation === "vertical" || orientation === "both") && key === "ArrowUp") return -1;
  if ((orientation === "vertical" || orientation === "both") && key === "ArrowDown") return 1;
  return 0;
}

/** Stable caller-order movement; disabled entries stay in order but are skipped. */
export function moveRovingFocus(
  props: UiRovingFocusProps,
  key: UiRovingKey,
): UiRovingMove {
  const currentId = readableCurrentId(props);
  const checked = preflightRovingFocus(props);
  if (!checked.ok || !isRovingKey(key)) {
    return { consumed: false, currentId };
  }
  const enabled = checked.value.itemIds.filter(
    (id) => !checked.value.disabledIds.includes(id),
  );
  const direction = directionFor(checked.value.orientation, key);
  if (direction === 0 || enabled.length === 0) {
    return { consumed: direction !== 0, currentId: checked.value.currentId };
  }
  if (direction === "first") return { consumed: true, currentId: enabled[0] ?? null };
  if (direction === "last") return { consumed: true, currentId: enabled.at(-1) ?? null };
  const currentIndex = checked.value.currentId === null
    ? -1
    : enabled.indexOf(checked.value.currentId);
  let nextIndex = currentIndex + direction;
  if (currentIndex < 0) nextIndex = direction > 0 ? 0 : enabled.length - 1;
  if (checked.value.wrap) {
    nextIndex = (nextIndex + enabled.length) % enabled.length;
  } else {
    nextIndex = Math.max(0, Math.min(enabled.length - 1, nextIndex));
  }
  return {
    consumed: true,
    currentId: enabled[nextIndex] ?? checked.value.currentId,
  };
}

export function findTypeaheadMatch(
  itemIds: readonly string[],
  disabledIds: readonly string[],
  currentId: string | null,
  labels: ReadonlyMap<string, string>,
  query: string,
): string | null {
  const itemIdsValue: unknown = itemIds;
  const disabledIdsValue: unknown = disabledIds;
  const labelsValue: unknown = labels;
  const queryValue: unknown = query;
  if (
    !Array.isArray(itemIdsValue) ||
    !Array.isArray(disabledIdsValue) ||
    !(labelsValue instanceof Map) ||
    typeof queryValue !== "string"
  ) {
    return null;
  }
  if (
    itemIds.length > UI_LIMITS.maxRovingItems ||
    disabledIds.length > UI_LIMITS.maxRovingItems ||
    exceedsCodePointLimit(queryValue, UI_LIMITS.maxTypeaheadCodePoints)
  ) {
    return null;
  }
  if (
    !itemIds.every((id) => typeof id === "string") ||
    !disabledIds.every((id) => typeof id === "string") ||
    new Set(itemIds).size !== itemIds.length ||
    new Set(disabledIds).size !== disabledIds.length ||
    disabledIds.some((id) => !itemIds.includes(id)) ||
    (currentId !== null &&
      (typeof currentId !== "string" ||
        !itemIds.includes(currentId) ||
        disabledIds.includes(currentId)))
  ) {
    return null;
  }
  const folded = query.trim().toLowerCase();
  if (folded.length === 0) return null;
  const enabled = itemIds.filter((id) => !disabledIds.includes(id));
  if (enabled.length === 0) return null;
  const start = currentId === null ? 0 : (enabled.indexOf(currentId) + 1 + enabled.length) % enabled.length;
  for (let offset = 0; offset < enabled.length; offset += 1) {
    const id = enabled[(start + offset) % enabled.length];
    if (id === undefined) continue;
    const label = labels.get(id);
    if (
      typeof label === "string" &&
      !exceedsCodePointLimit(label, UI_LIMITS.maxLabelCodePoints) &&
      label.toLowerCase().startsWith(folded)
    ) {
      return id;
    }
  }
  return null;
}

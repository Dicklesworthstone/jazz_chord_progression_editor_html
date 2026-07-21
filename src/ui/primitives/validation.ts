import {
  UI_LIMITS,
  UI_REFUSAL_CODES,
  type UiCommonProps,
  type UiDiagnostic,
  type UiMenuItem,
  type UiOption,
  type UiRefusalCode,
  type UiResult,
  type UiTreeNode,
} from "../ui-contract";

export const UI_COLLECTION_LIMIT_KEYS = Object.freeze([
  "maxToggleItems",
  "maxCommandItems",
  "maxCommandKeywords",
  "maxTabs",
  "maxBreadcrumbItems",
  "maxToolbarItems",
  "maxAccordionItems",
  "maxKeyValueItems",
  "maxTableColumns",
  "maxTableRows",
  "maxTableCells",
  "maxResizablePanels",
  "maxTimelineItems",
  "maxNoticeCenterItems",
  "maxVisibleNotices",
] as const);

export type UiCollectionLimitKey =
  (typeof UI_COLLECTION_LIMIT_KEYS)[number];

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function uiDiagnostic(
  code: UiRefusalCode,
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string | null,
): UiDiagnostic {
  return {
    code,
    componentId,
    message,
    path,
    recoveryAction,
    severity: "error",
  };
}

/**
 * Validates a diagnostic collection at publication boundaries. Diagnostics are
 * data that may cross from application state into rendered status surfaces, so
 * their collection and paths are bounded before any entry is traversed or
 * published. Accepted input is returned in its original order without repair.
 */
export function validateUiDiagnostics(
  componentId: string,
  diagnostics: unknown,
): UiResult<readonly UiDiagnostic[]> {
  const owner = validateUiId(componentId, ["componentId"], componentId);
  if (!owner.ok) return refused(owner.refusal);
  if (!Array.isArray(diagnostics)) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["diagnostics"],
        "The diagnostic collection must be an ordered array.",
        "Provide a bounded array of diagnostic records.",
      ),
    );
  }
  if (diagnostics.length > UI_LIMITS.maxDiagnostics) {
    return refused(
      uiDiagnostic(
        "ui.collection_limit",
        componentId,
        ["diagnostics"],
        "The diagnostic collection exceeds its reviewed bound.",
        "Publish no more than the declared maximum number of diagnostics.",
      ),
    );
  }

  for (const [index, candidate] of diagnostics.entries()) {
    if (!isRecord(candidate)) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["diagnostics", index],
          "Every diagnostic must be one declared diagnostic record.",
          "Provide bounded diagnostic records without partial entries.",
        ),
      );
    }
    const path = candidate["path"];
    if (!Array.isArray(path)) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["diagnostics", index, "path"],
          "A diagnostic path must be an ordered segment array.",
          "Provide a bounded array of string or nonnegative integer segments.",
        ),
      );
    }
    if (path.length > UI_LIMITS.maxDiagnosticPathSegments) {
      return refused(
        uiDiagnostic(
          "ui.collection_limit",
          componentId,
          ["diagnostics", index, "path"],
          "A diagnostic path exceeds its reviewed segment bound.",
          "Publish a path within the declared maximum depth.",
        ),
      );
    }
    if (
      !path.every(
        (segment) =>
          (typeof segment === "string" &&
            segment.length > 0 &&
            codePointLength(segment) <= UI_LIMITS.maxIdCodePoints) ||
          (typeof segment === "number" &&
            Number.isSafeInteger(segment) &&
            segment >= 0),
      )
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["diagnostics", index, "path"],
          "A diagnostic path contains a malformed or unbounded segment.",
          "Use bounded nonempty strings or nonnegative safe integers.",
        ),
      );
    }

    const diagnosticId = validateUiId(
      componentId,
      ["diagnostics", index, "componentId"],
      candidate["componentId"],
    );
    if (!diagnosticId.ok) return refused(diagnosticId.refusal);
    if (
      typeof candidate["code"] !== "string" ||
      !UI_REFUSAL_CODES.some((code) => code === candidate["code"])
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["diagnostics", index, "code"],
          "A diagnostic code is outside the reviewed closed vocabulary.",
          "Use one declared UI refusal code.",
        ),
      );
    }
    if (candidate["severity"] !== "warning" && candidate["severity"] !== "error") {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["diagnostics", index, "severity"],
          "A diagnostic severity is outside the reviewed closed vocabulary.",
          "Use warning or error severity.",
        ),
      );
    }
    const message = validateUiText(
      componentId,
      ["diagnostics", index, "message"],
      candidate["message"],
      UI_LIMITS.maxDescriptionCodePoints,
    );
    if (!message.ok) return refused(message.refusal);
    const recoveryAction = candidate["recoveryAction"];
    if (recoveryAction !== null) {
      const recovery = validateUiText(
        componentId,
        ["diagnostics", index, "recoveryAction"],
        recoveryAction,
        UI_LIMITS.maxLabelCodePoints,
      );
      if (!recovery.ok) return refused(recovery.refusal);
    }
  }

  return accepted(diagnostics as readonly UiDiagnostic[]);
}

function accepted<Value>(value: Value): UiResult<Value> {
  return { diagnostics: [], ok: true, value };
}

function refused<Value>(diagnostic: UiDiagnostic): UiResult<Value> {
  return { diagnostics: [diagnostic], ok: false, refusal: diagnostic };
}

/**
 * Pure collection preflight shared by hook-bearing render boundaries and U0's
 * independent exact-boundary proof. The limit is selected from a closed key
 * vocabulary, so callers cannot manufacture a convenient numeric maximum.
 */
export function validateUiCollectionBound(
  componentId: string,
  path: readonly (string | number)[],
  collection: unknown,
  limitKey: UiCollectionLimitKey,
): UiResult<readonly unknown[]> {
  if (!Array.isArray(collection)) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        path,
        "The UI collection must be an ordered array.",
        "Provide the declared bounded collection.",
      ),
    );
  }
  if (collection.length > UI_LIMITS[limitKey]) {
    return refused(
      uiDiagnostic(
        "ui.collection_limit",
        componentId,
        path,
        "The UI collection exceeds its reviewed bound.",
        "Reduce the collection to the declared maximum.",
      ),
    );
  }
  return accepted(collection);
}

/** Exact derived-cardinality counterpart used by DataTable's real preflight. */
export function validateUiCollectionProductBound(
  componentId: string,
  path: readonly (string | number)[],
  left: unknown,
  right: unknown,
  limitKey: "maxTableCells",
): UiResult<readonly [readonly unknown[], readonly unknown[]]> {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        path,
        "The derived UI collections must be ordered arrays.",
        "Provide both declared bounded collections.",
      ),
    );
  }
  if (left.length * right.length > UI_LIMITS[limitKey]) {
    return refused(
      uiDiagnostic(
        "ui.collection_limit",
        componentId,
        path,
        "The derived UI collection exceeds its reviewed bound.",
        "Reduce the collection product to the declared maximum.",
      ),
    );
  }
  return accepted([left, right] as const);
}

export class UiContractError extends Error {
  readonly diagnostic: UiDiagnostic;

  constructor(diagnostic: UiDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.message}`);
    this.name = "UiContractError";
    this.diagnostic = diagnostic;
  }
}

/**
 * Production components use this at their render boundary. Malformed caller
 * state is rejected before listeners, focus, pointer capture, or callbacks are
 * installed; the exception contains only the bounded, sanitized diagnostic.
 */
export function requireUiResult<Value>(result: UiResult<Value>): Value {
  if (!result.ok) throw new UiContractError(result.refusal);
  return result.value;
}

export function validateUiText(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
  maximumCodePoints: number,
  options: Readonly<{ allowEmpty: boolean }> = { allowEmpty: false },
): UiResult<string> {
  const malformedCode = path.includes("description")
    ? "ui.description_invalid"
    : path.includes("accessibleName") || path.includes("label")
      ? "ui.accessible_name_required"
      : "ui.value_malformed";
  if (
    typeof value !== "string" ||
    (!options.allowEmpty && value.trim().length === 0)
  ) {
    return refused(
      uiDiagnostic(
        malformedCode,
        componentId,
        path,
        "A required UI text value is malformed or blank.",
        "Provide a text value and include non-whitespace content when required.",
      ),
    );
  }
  if (codePointLength(value) > maximumCodePoints) {
    return refused(
      uiDiagnostic(
        path.includes("description")
          ? "ui.description_invalid"
          : "ui.range_invalid",
        componentId,
        path,
        "A UI text value exceeds its reviewed code-point bound.",
        "Provide a value within the declared maximum length.",
      ),
    );
  }
  return accepted(value);
}

export function validateUiId(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): UiResult<string> {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    codePointLength(value) > UI_LIMITS.maxIdCodePoints ||
    /\s/u.test(value)
  ) {
    return refused(
      uiDiagnostic(
        "ui.id_invalid",
        componentId,
        path,
        "A UI identity is blank, contains whitespace, or exceeds its reviewed bound.",
        "Provide a stable bounded identity without whitespace.",
      ),
    );
  }
  return accepted(value);
}

export function validateUiCommonProps<Props extends UiCommonProps>(
  props: Props,
): UiResult<Props> {
  const id = validateUiId(props.id, ["id"], props.id);
  if (!id.ok) return refused(id.refusal);
  const density: unknown = props.density;
  const disabled: unknown = props.disabled;
  const busy: unknown = props.busy;
  const invalid: unknown = props.invalid;
  if (
    (density !== "comfortable" && density !== "dense") ||
    typeof disabled !== "boolean" ||
    typeof busy !== "boolean" ||
    typeof invalid !== "boolean"
  ) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        props.id,
        ["commonProps"],
        "UI availability, validation, and density state must use the reviewed closed values.",
        "Provide boolean disabled, busy, and invalid state plus a declared density.",
      ),
    );
  }
  const describedBy: unknown = props.describedBy;
  if (
    !Array.isArray(describedBy) ||
    !describedBy.every((reference) => typeof reference === "string")
  ) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        props.id,
        ["describedBy"],
        "The described-by references must be an ordered identity collection.",
        "Provide a bounded array of stable description identities.",
      ),
    );
  }
  if (props.describedBy.length > UI_LIMITS.maxReferenceIds) {
    return refused(
      uiDiagnostic(
        "ui.collection_limit",
        props.id,
        ["describedBy"],
        "The described-by reference list exceeds its reviewed bound.",
        "Reduce the number of referenced descriptions.",
      ),
    );
  }
  const seen = new Set<string>([props.id]);
  for (const [index, reference] of props.describedBy.entries()) {
    const checked = validateUiId(props.id, ["describedBy", index], reference);
    if (!checked.ok) return refused(checked.refusal);
    if (seen.has(reference)) {
      return refused(
        uiDiagnostic(
          "ui.duplicate_item_id",
          props.id,
          ["describedBy", index],
          "The described-by reference list contains a duplicate identity.",
          "Reference each description at most once.",
        ),
      );
    }
    seen.add(reference);
  }
  return accepted(props);
}

export function validateUiOptions<Value extends string>(
  componentId: string,
  options: readonly UiOption<Value>[],
  maximumOptions: number,
): UiResult<readonly UiOption<Value>[]> {
  const optionsValue: unknown = options;
  if (!Array.isArray(optionsValue)) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["options"],
        "The option collection must be an ordered array.",
        "Provide a bounded array of declared option records.",
      ),
    );
  }
  if (options.length > maximumOptions) {
    return refused(
      uiDiagnostic(
        "ui.collection_limit",
        componentId,
        ["options"],
        "The option collection exceeds its reviewed bound.",
        "Present a smaller bounded option collection.",
      ),
    );
  }
  const ids = new Set<string>();
  const values = new Set<string>();
  for (const [index, option] of options.entries()) {
    const optionValue: unknown = option;
    if (
      typeof optionValue !== "object" ||
      optionValue === null ||
      Array.isArray(optionValue)
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["options", index],
          "Every option must be one declared option record.",
          "Provide bounded option records with stable identities and values.",
        ),
      );
    }
    const id = validateUiId(componentId, ["options", index, "id"], option.id);
    if (!id.ok) return refused(id.refusal);
    const value = validateUiText(
      componentId,
      ["options", index, "value"],
      option.value,
      UI_LIMITS.maxTextValueCodePoints,
    );
    if (!value.ok) return refused(value.refusal);
    const label = validateUiText(
      componentId,
      ["options", index, "label"],
      option.label,
      UI_LIMITS.maxLabelCodePoints,
    );
    if (!label.ok) return refused(label.refusal);
    if (option.description !== null) {
      const description = validateUiText(
        componentId,
        ["options", index, "description"],
        option.description,
        UI_LIMITS.maxDescriptionCodePoints,
      );
      if (!description.ok) return refused(description.refusal);
    }
    if (typeof option.disabled !== "boolean") {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["options", index, "disabled"],
          "Option availability state must be boolean.",
          "Provide an explicit boolean disabled state for every option.",
        ),
      );
    }
    if (ids.has(option.id) || values.has(option.value)) {
      return refused(
        uiDiagnostic(
          "ui.duplicate_item_id",
          componentId,
          ["options", index],
          "The option collection contains a duplicate identity or value.",
          "Give every option a unique identity and value.",
        ),
      );
    }
    ids.add(option.id);
    values.add(option.value);
  }
  return accepted(options);
}

export function validateSelectedOption<Value extends string>(
  componentId: string,
  options: readonly UiOption<Value>[],
  value: Value | null,
): UiResult<Value | null> {
  if (value !== null && !options.some((option) => option.value === value)) {
    return refused(
      uiDiagnostic(
        "ui.selection_invalid",
        componentId,
        ["value"],
        "The selected value is not present in the option collection.",
        "Select a current enabled option or clear the selection where allowed.",
      ),
    );
  }
  return accepted(value);
}

export function validateFiniteRange(
  componentId: string,
  value: number,
  min: number,
  max: number,
  step: number,
): UiResult<number> {
  if (![value, min, max, step].every(Number.isFinite) || min > value || value > max) {
    return refused(
      uiDiagnostic(
        "ui.range_invalid",
        componentId,
        ["value"],
        "The numeric value is outside its finite ordered range.",
        "Provide a finite value between the declared minimum and maximum.",
      ),
    );
  }
  if (step <= 0) {
    return refused(
      uiDiagnostic(
        "ui.step_invalid",
        componentId,
        ["step"],
        "The numeric step must be finite and greater than zero.",
        "Provide a positive finite step.",
      ),
    );
  }
  return accepted(value);
}

export function preflightMenuTopology(
  componentId: string,
  items: readonly UiMenuItem[],
): UiResult<readonly UiMenuItem[]> {
  const collection: unknown = items;
  if (!Array.isArray(collection)) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["items"],
        "The menu item collection must be an ordered array.",
        "Provide a bounded array of declared menu item records.",
      ),
    );
  }

  type Pending = Readonly<{
    item: unknown;
    depth: number;
    path: readonly number[];
  }>;
  const pending: Pending[] = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    pending.push({ depth: 1, item: items[index], path: [index] });
  }
  const identities = new Set<object>();
  const ids = new Set<string>();
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    visited += 1;
    if (visited > UI_LIMITS.maxMenuItems) {
      return refused(
        uiDiagnostic(
          "ui.collection_limit",
          componentId,
          ["items"],
          "The flattened menu exceeds its reviewed item bound.",
          "Reduce the menu to at most 200 flattened items.",
        ),
      );
    }
    const item = current.item;
    if (!isRecord(item)) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["items", ...current.path],
          "Every menu entry must be one declared item record.",
          "Provide a bounded menu item record at every collection position.",
        ),
      );
    }
    if (identities.has(item)) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["items", ...current.path],
          "The menu contains a cycle or repeated object identity.",
          "Provide an acyclic menu tree with fresh item records.",
        ),
      );
    }
    identities.add(item);
    const kind = item["kind"];
    if (
      kind !== "action" &&
      kind !== "checkbox" &&
      kind !== "radio" &&
      kind !== "separator" &&
      kind !== "submenu"
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["items", ...current.path, "kind"],
          "The menu item kind is outside the reviewed closed set.",
          "Use action, checkbox, radio, separator, or submenu.",
        ),
      );
    }
    const id = validateUiId(
      componentId,
      ["items", ...current.path, "id"],
      item["id"],
    );
    if (!id.ok) return refused(id.refusal);
    if (ids.has(id.value)) {
      return refused(
        uiDiagnostic(
          "ui.duplicate_item_id",
          componentId,
          ["items", ...current.path, "id"],
          "Menu identities must be unique across the flattened tree.",
          "Give every menu item a unique identity.",
        ),
      );
    }
    ids.add(id.value);
    if (kind !== "separator") {
      const label = validateUiText(
        componentId,
        ["items", ...current.path, "label"],
        item["label"],
        UI_LIMITS.maxLabelCodePoints,
      );
      if (!label.ok) return refused(label.refusal);
    }
    if (kind !== "separator" && typeof item["disabled"] !== "boolean") {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["items", ...current.path, "disabled"],
          "Menu item availability must be an explicit boolean.",
          "Provide boolean disabled state for every actionable menu item.",
        ),
      );
    }
    if (
      (kind === "checkbox" || kind === "radio") &&
      typeof item["checked"] !== "boolean"
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["items", ...current.path, "checked"],
          "Menu choice state must be an explicit boolean.",
          "Provide boolean checked state for checkbox and radio menu items.",
        ),
      );
    }
    if (kind === "radio") {
      const groupId = validateUiId(
        componentId,
        ["items", ...current.path, "groupId"],
        item["groupId"],
      );
      if (!groupId.ok) return refused(groupId.refusal);
    }
    if (kind === "submenu") {
      const children: unknown = item["items"];
      if (!Array.isArray(children)) {
        return refused(
          uiDiagnostic(
            "ui.value_malformed",
            componentId,
            ["items", ...current.path, "items"],
            "A submenu child collection must be an ordered array.",
            "Provide a bounded array of declared child menu records.",
          ),
        );
      }
      if (current.depth >= UI_LIMITS.maxMenuDepth && children.length > 0) {
        return refused(
          uiDiagnostic(
            "ui.collection_limit",
            componentId,
            ["items", ...current.path, "items"],
            "The menu exceeds its reviewed submenu depth.",
            "Flatten or shorten the submenu hierarchy.",
          ),
        );
      }
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push({
          depth: current.depth + 1,
          item: children[index],
          path: [...current.path, index],
        });
      }
    }
  }
  return accepted(items);
}

export function preflightTreeTopology(
  componentId: string,
  nodes: readonly UiTreeNode[],
  rootIds: readonly string[],
): UiResult<readonly UiTreeNode[]> {
  const nodesValue: unknown = nodes;
  const rootIdsValue: unknown = rootIds;
  if (!Array.isArray(nodesValue) || !Array.isArray(rootIdsValue)) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["nodes", "rootIds"],
        "Tree nodes and roots must be ordered identity collections.",
        "Provide bounded arrays for the rooted forest.",
      ),
    );
  }
  if (nodes.length > UI_LIMITS.maxTreeItems || rootIds.length > UI_LIMITS.maxTreeItems) {
    return refused(
      uiDiagnostic(
        "ui.collection_limit",
        componentId,
        ["nodes"],
        "The tree exceeds its reviewed node bound.",
        "Present a tree with at most 5,000 nodes.",
      ),
    );
  }
  const byId = new Map<string, UiTreeNode>();
  let childReferenceCount = 0;
  for (const [index, node] of nodes.entries()) {
    const nodeValue: unknown = node;
    if (
      typeof nodeValue !== "object" ||
      nodeValue === null ||
      Array.isArray(nodeValue)
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["nodes", index],
          "Every tree node must be one declared node record.",
          "Provide bounded rooted-forest node records.",
        ),
      );
    }
    const childIds: unknown = node.childIds;
    const parentId: unknown = node.parentId;
    const expanded: unknown = node.expanded;
    const selected: unknown = node.selected;
    const disabled: unknown = node.disabled;
    if (
      !Array.isArray(childIds) ||
      (parentId !== null && typeof parentId !== "string") ||
      typeof expanded !== "boolean" ||
      typeof selected !== "boolean" ||
      typeof disabled !== "boolean"
    ) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["nodes", index],
          "Tree relationships and controlled states must use the reviewed closed shapes.",
          "Provide an identity array, nullable parent, and explicit boolean node states.",
        ),
      );
    }
    const id = validateUiId(componentId, ["nodes", index, "id"], node.id);
    if (!id.ok) return refused(id.refusal);
    if (typeof parentId === "string") {
      const checkedParent = validateUiId(
        componentId,
        ["nodes", index, "parentId"],
        parentId,
      );
      if (!checkedParent.ok) return refused(checkedParent.refusal);
    }
    childReferenceCount += node.childIds.length;
    if (childReferenceCount > UI_LIMITS.maxTreeItems) {
      return refused(
        uiDiagnostic(
          "ui.collection_limit",
          componentId,
          ["nodes", index, "childIds"],
          "The tree child-reference traversal exceeds its reviewed bound.",
          "Keep the rooted forest within 5,000 total child references.",
        ),
      );
    }
    for (const [childIndex, childId] of node.childIds.entries()) {
      const checkedChild = validateUiId(
        componentId,
        ["nodes", index, "childIds", childIndex],
        childId,
      );
      if (!checkedChild.ok) return refused(checkedChild.refusal);
    }
    if (byId.has(node.id)) {
      return refused(
        uiDiagnostic(
          "ui.duplicate_item_id",
          componentId,
          ["nodes", index, "id"],
          "Tree node identities must be unique.",
          "Give every tree node a unique identity.",
        ),
      );
    }
    byId.set(node.id, node);
    if (new Set(node.childIds).size !== node.childIds.length) {
      return refused(
        uiDiagnostic(
          "ui.duplicate_item_id",
          componentId,
          ["nodes", index, "childIds"],
          "A tree node repeats a child identity.",
          "Reference each child exactly once.",
        ),
      );
    }
  }
  if (new Set(rootIds).size !== rootIds.length) {
    return refused(
      uiDiagnostic(
        "ui.duplicate_item_id",
        componentId,
        ["rootIds"],
        "The tree repeats a root identity.",
        "Reference each root exactly once.",
      ),
    );
  }
  for (const [index, rootId] of rootIds.entries()) {
    const checkedRoot = validateUiId(
      componentId,
      ["rootIds", index],
      rootId,
    );
    if (!checkedRoot.ok) return refused(checkedRoot.refusal);
    const root = byId.get(rootId);
    if (root === undefined || root.parentId !== null) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["rootIds"],
          "Every root must reference an existing node whose parent is null.",
          "Repair the rooted-forest references.",
        ),
      );
    }
  }
  for (const node of nodes) {
    for (const childId of node.childIds) {
      const child = byId.get(childId);
      if (child === undefined || child.parentId !== node.id) {
        return refused(
          uiDiagnostic(
            "ui.value_malformed",
            componentId,
            ["nodes", node.id, "childIds"],
            "Tree parent and child references must be reciprocal.",
            "Repair the rooted-forest references.",
          ),
        );
      }
    }
    if (node.parentId !== null) {
      const parent = byId.get(node.parentId);
      if (parent === undefined || !parent.childIds.includes(node.id)) {
        return refused(
          uiDiagnostic(
            "ui.value_malformed",
            componentId,
            ["nodes", node.id, "parentId"],
            "Tree parent and child references must be reciprocal.",
            "Repair the rooted-forest references.",
          ),
        );
      }
    }
  }
  type Visit = Readonly<{ id: string; depth: number }>;
  const pending: Visit[] = rootIds.map((id) => ({ depth: 1, id })).reverse();
  const reached = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (reached.has(current.id)) {
      return refused(
        uiDiagnostic(
          "ui.value_malformed",
          componentId,
          ["nodes", current.id],
          "The tree contains a cycle or repeated parentage.",
          "Provide an acyclic rooted forest with one path to every node.",
        ),
      );
    }
    if (current.depth > UI_LIMITS.maxTreeDepth) {
      return refused(
        uiDiagnostic(
          "ui.collection_limit",
          componentId,
          ["nodes", current.id],
          "The tree exceeds its reviewed depth bound.",
          "Provide a rooted forest with at most 64 levels.",
        ),
      );
    }
    reached.add(current.id);
    const node = byId.get(current.id);
    if (node === undefined) continue;
    for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
      const childId = node.childIds[index];
      if (childId !== undefined) pending.push({ depth: current.depth + 1, id: childId });
    }
  }
  if (reached.size !== nodes.length) {
    return refused(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["nodes"],
        "Every tree node must be reachable from exactly one declared root.",
        "Repair disconnected or multiply parented nodes.",
      ),
    );
  }
  return accepted(nodes);
}

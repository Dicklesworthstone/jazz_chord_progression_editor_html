import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

import {
  UI_LIMITS,
  type UiBadgeProps,
  type UiButtonProps,
  type UiCardProps,
  type UiEmptyStateProps,
  type UiKbdProps,
  type UiLinkButtonProps,
  type UiMeterProps,
  type UiProgressProps,
  type UiRefusalCode,
  type UiSeparatorProps,
  type UiSkeletonProps,
  type UiSpinnerProps,
  type UiTone,
} from "../ui-contract";
import { Button } from "./Button";
import { joinIdReferences } from "./id-references";
import {
  requireUiResult,
  uiDiagnostic,
  validateFiniteRange,
  validateUiCommonProps,
  validateUiId,
  validateUiText,
} from "./validation";

const FOUNDATION_COMPONENT_IDS = Object.freeze({
  badge: "U0-CMP-004",
  card: "U0-CMP-010",
  emptyState: "U0-CMP-011",
  kbd: "U0-CMP-005",
  meter: "U0-CMP-014",
  progress: "U0-CMP-013",
  separator: "U0-CMP-006",
  skeleton: "U0-CMP-007",
  spinner: "U0-CMP-008",
} as const);

const UI_TONES: readonly UiTone[] = Object.freeze([
  "neutral",
  "primary",
  "info",
  "success",
  "warning",
  "error",
]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireCondition(
  condition: boolean,
  code: UiRefusalCode,
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): void {
  if (condition) return;
  const refusal = uiDiagnostic(
    code,
    componentId,
    path,
    message,
    recoveryAction,
  );
  requireUiResult<true>({ diagnostics: [refusal], ok: false, refusal });
}

function requireTone(componentId: string, tone: UiTone): void {
  requireCondition(
    UI_TONES.includes(tone),
    "ui.value_malformed",
    componentId,
    ["tone"],
    "The foundation tone is outside the reviewed semantic-state vocabulary.",
    "Use a declared neutral, primary, information, success, warning, or error tone.",
  );
}

export function preflightEmptyStateAction(
  props: UiButtonProps,
  path: readonly string[],
): void {
  const action: unknown = props;
  requireCondition(
    isRecord(action),
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.emptyState,
    path,
    "An EmptyState action must be one declared Button record or explicit null.",
    "Provide a complete bounded Button action record or null.",
  );
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      [...path, "label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  requireCondition(
    ["primary", "secondary", "outline", "ghost", "destructive"].includes(
      props.variant,
    ) && ["button", "submit", "reset"].includes(props.type),
    "ui.value_malformed",
    props.id,
    path,
    "An EmptyState action uses an unknown button variant or native type.",
    "Use a declared Button variant and explicit native button type.",
  );
  requireCondition(
    typeof props.onAction === "function",
    "ui.value_malformed",
    props.id,
    [...path, "onAction"],
    "An EmptyState action callback is missing or malformed.",
    "Provide a callable action boundary.",
  );
}

export function preflightLinkButton(props: UiLinkButtonProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );

  const destination: unknown = props.destination;
  requireCondition(
    isRecord(destination),
    "ui.value_malformed",
    props.id,
    ["destination"],
    "A LinkButton destination must be one declared local destination record.",
    "Provide a fragment or local-download destination record.",
  );
  const destinationKind: unknown = props.destination.kind;
  requireCondition(
    destinationKind === "fragment" || destinationKind === "download",
    "ui.value_malformed",
    props.id,
    ["destination", "kind"],
    "A LinkButton destination uses an unknown navigation kind.",
    "Use a local fragment or explicit local blob download.",
  );

  if (props.destination.kind === "fragment") {
    requireUiResult(
      validateUiText(
        props.id,
        ["destination", "href"],
        props.destination.href,
        UI_LIMITS.maxFragmentHrefCodePoints,
      ),
    );
    requireCondition(
      props.destination.href.startsWith("#") &&
        props.destination.href.length > 1,
      "ui.value_malformed",
      props.id,
      ["destination", "href"],
      "A LinkButton fragment must identify a nonempty local document target.",
      "Use a bounded href beginning with a number sign.",
    );
    return;
  }

  requireUiResult(
    validateUiText(
      props.id,
      ["destination", "href"],
      props.destination.href,
      UI_LIMITS.maxLocalHrefCodePoints,
    ),
  );
  requireCondition(
    props.destination.href.startsWith("blob:"),
    "ui.value_malformed",
    props.id,
    ["destination", "href"],
    "A LinkButton download must use a user-gesture-created local blob URL.",
    "Provide a bounded blob URL created by the local export workflow.",
  );
  requireUiResult(
    validateUiText(
      props.id,
      ["destination", "filename"],
      props.destination.filename,
      UI_LIMITS.maxFilenameCodePoints,
    ),
  );
}

/** A local fragment or explicit local-download anchor; commands remain buttons. */
export function LinkButton(props: UiLinkButtonProps) {
  preflightLinkButton(props);
  const unavailable = props.disabled || props.busy;
  const download =
    !unavailable && props.destination.kind === "download"
      ? props.destination.filename
      : undefined;

  return (
    <a
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(props.describedBy)}
      aria-disabled={unavailable ? "true" : undefined}
      aria-invalid={props.invalid ? "true" : undefined}
      class="ui-link-button"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      download={download}
      href={unavailable ? undefined : props.destination.href}
      id={props.id}
    >
      {props.busy ? <span aria-hidden="true" class="ui-busy-marker" /> : null}
      <span>{props.label}</span>
    </a>
  );
}

/** Static metadata. Its visible text is the non-color state cue. */
export function Badge(props: UiBadgeProps) {
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.badge,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  requireTone(FOUNDATION_COMPONENT_IDS.badge, props.tone);

  return (
    <span class="ui-badge" data-tone={props.tone}>
      {props.label}
    </span>
  );
}

/** A visual key chord; surrounding prose remains responsible for instruction. */
export function Kbd(props: UiKbdProps) {
  const keys: unknown = props.keys;
  requireCondition(
    Array.isArray(keys),
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.kbd,
    ["keys"],
    "The key-hint collection must be an ordered array.",
    "Provide a bounded array of visual key names.",
  );
  requireCondition(
    props.keys.length > 0 && props.keys.length <= UI_LIMITS.maxKbdKeys,
    "ui.collection_limit",
    FOUNDATION_COMPONENT_IDS.kbd,
    ["keys"],
    "The key-hint collection is empty or exceeds its reviewed bound.",
    "Provide between one and eight bounded visual key names.",
  );
  for (const [index, key] of props.keys.entries()) {
    requireUiResult(
      validateUiText(
        FOUNDATION_COMPONENT_IDS.kbd,
        ["keys", index],
        key,
        UI_LIMITS.maxKbdKeyCodePoints,
      ),
    );
  }

  return (
    <kbd class="ui-kbd">
      {props.keys.map((key, index) => (
        <span class="ui-kbd__part" key={`${index.toString()}-${key}`}>
          {index === 0 ? null : <span class="ui-kbd__separator"> + </span>}
          <span class="ui-kbd__key">{key}</span>
        </span>
      ))}
    </kbd>
  );
}

/** Decorative by default; structural separators must be explicitly named. */
export function Separator(props: UiSeparatorProps) {
  const orientation: unknown = props.orientation;
  const decorative: unknown = props.decorative;
  requireCondition(
    orientation === "horizontal" || orientation === "vertical",
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.separator,
    ["orientation"],
    "A separator orientation is outside the reviewed vocabulary.",
    "Use horizontal or vertical orientation.",
  );
  requireCondition(
    typeof decorative === "boolean",
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.separator,
    ["decorative"],
    "A separator must explicitly declare whether it is decorative.",
    "Provide a boolean decorative value.",
  );
  if (props.decorative) {
    requireCondition(
      props.accessibleName === null,
      "ui.description_invalid",
      FOUNDATION_COMPONENT_IDS.separator,
      ["accessibleName"],
      "A decorative separator cannot publish an accessible name.",
      "Remove the name or declare a structural separator.",
    );
  } else {
    requireCondition(
      props.accessibleName !== null,
      "ui.accessible_name_required",
      FOUNDATION_COMPONENT_IDS.separator,
      ["accessibleName"],
      "A structural separator requires an accessible name.",
      "Name the boundary conveyed by this separator.",
    );
    requireUiResult(
      validateUiText(
        FOUNDATION_COMPONENT_IDS.separator,
        ["accessibleName"],
        props.accessibleName ?? "",
        UI_LIMITS.maxAccessibleNameCodePoints,
      ),
    );
  }

  return (
    <div
      aria-label={props.decorative ? undefined : (props.accessibleName ?? undefined)}
      aria-orientation={props.decorative ? undefined : props.orientation}
      class="ui-separator"
      data-orientation={props.orientation}
      role={props.decorative ? "none" : "separator"}
    />
  );
}

/** Presentation-only loading geometry; its owning region supplies busy text. */
export function Skeleton(props: UiSkeletonProps) {
  const ariaHidden: unknown = props.ariaHidden;
  const shape: unknown = props.shape;
  requireCondition(
    ariaHidden === true,
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.skeleton,
    ["ariaHidden"],
    "Skeleton presentation must remain hidden from accessibility APIs.",
    "Set ariaHidden to true and name the owning busy region instead.",
  );
  requireCondition(
    shape === "text" || shape === "circle" || shape === "rectangle",
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.skeleton,
    ["shape"],
    "Skeleton shape is outside the reviewed presentation vocabulary.",
    "Use text, circle, or rectangle skeleton geometry.",
  );
  requireCondition(
    Number.isInteger(props.lines) && props.lines >= 1,
    "ui.range_invalid",
    FOUNDATION_COMPONENT_IDS.skeleton,
    ["lines"],
    "Skeleton line count is not a positive integer.",
    "Use between one and twenty skeleton lines.",
  );
  requireCondition(
    props.lines <= UI_LIMITS.maxSkeletonLines,
    "ui.collection_limit",
    FOUNDATION_COMPONENT_IDS.skeleton,
    ["lines"],
    "Skeleton line count exceeds its reviewed collection bound.",
    "Use no more than twenty skeleton lines.",
  );

  return (
    <div
      aria-hidden="true"
      class="ui-skeleton"
      data-shape={props.shape}
    >
      {Array.from({ length: props.lines }, (_, index) => (
        <span class="ui-skeleton__line" key={index} />
      ))}
    </div>
  );
}

/** Decorative inside a named control or a named standalone status. */
export function Spinner(props: UiSpinnerProps) {
  const mode: unknown = props.mode;
  requireCondition(
    mode === "decorative" || mode === "status",
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.spinner,
    ["mode"],
    "Spinner mode is outside the reviewed semantic vocabulary.",
    "Use decorative inside a named owner or status with an accessible name.",
  );
  if (props.mode === "decorative") {
    const ariaHidden: unknown = props.ariaHidden;
    requireCondition(
      ariaHidden === true,
      "ui.value_malformed",
      FOUNDATION_COMPONENT_IDS.spinner,
      ["ariaHidden"],
      "A decorative spinner must be hidden from accessibility APIs.",
      "Set ariaHidden to true and retain the owning control's accessible name.",
    );
    return (
      <span aria-hidden="true" class="ui-spinner" data-mode="decorative">
        <span class="ui-spinner__glyph" />
      </span>
    );
  }

  const ariaHidden: unknown = props.ariaHidden;
  requireCondition(
    ariaHidden === false,
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.spinner,
    ["ariaHidden"],
    "A standalone spinner status cannot be hidden from accessibility APIs.",
    "Set ariaHidden to false and provide a bounded status name.",
  );
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.spinner,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );

  return (
    <span
      aria-label={props.accessibleName}
      aria-live="polite"
      class="ui-spinner"
      data-mode="status"
      role="status"
    >
      <span aria-hidden="true" class="ui-spinner__glyph" />
    </span>
  );
}

export type CardProps = UiCardProps<ComponentChildren>;

/** A passive container; explicit child controls own every interaction. */
export function Card(props: CardProps) {
  requireUiResult(
    validateUiId(
      props.id,
      ["id"],
      props.id,
    ),
  );
  if (props.headingId !== null) {
    requireUiResult(validateUiId(props.id, ["headingId"], props.headingId));
    requireCondition(
      props.headingId !== props.id,
      "ui.duplicate_item_id",
      props.id,
      ["headingId"],
      "A labelled Card cannot use its own container identity as the heading identity.",
      "Reference a distinct visible heading identity inside the Card.",
    );
  }
  const interactive: unknown = props.interactive;
  requireCondition(
    interactive === false,
    "ui.value_malformed",
    props.id,
    ["interactive"],
    "A Card is a passive container and cannot become a generic clickable surface.",
    "Place a named Button or LinkButton inside the Card instead.",
  );
  requireTone(props.id, props.tone);

  return props.headingId === null ? (
    <div class="ui-card" data-tone={props.tone} id={props.id}>
      {props.content}
    </div>
  ) : (
    <section
      aria-labelledby={props.headingId}
      class="ui-card"
      data-tone={props.tone}
      id={props.id}
    >
      {props.content}
    </section>
  );
}

export type EmptyStateProps = UiEmptyStateProps<ComponentChildren>;

export function preflightEmptyStateProps(props: EmptyStateProps): void {
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.emptyState,
      ["title"],
      props.title,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.emptyState,
      ["description"],
      props.description,
      UI_LIMITS.maxDescriptionCodePoints,
    ),
  );
  if (props.primaryAction !== null) {
    preflightEmptyStateAction(props.primaryAction, ["primaryAction"]);
  }
  if (props.secondaryAction !== null) {
    preflightEmptyStateAction(props.secondaryAction, ["secondaryAction"]);
  }
  requireCondition(
    props.primaryAction === null ||
      props.secondaryAction === null ||
      props.primaryAction.id !== props.secondaryAction.id,
    "ui.duplicate_item_id",
    FOUNDATION_COMPONENT_IDS.emptyState,
    ["secondaryAction", "id"],
    "EmptyState actions must have distinct stable identities.",
    "Give the primary and secondary actions different identities.",
  );
}

/** Honest named emptiness with no more than two real, native Button actions. */
export function EmptyState(props: EmptyStateProps) {
  preflightEmptyStateProps(props);
  const generatedId = useId();
  const headingId = `ui-empty-state-${generatedId}`;

  return (
    <section aria-labelledby={headingId} class="ui-empty-state">
      {props.illustration === null ? null : (
        <div aria-hidden="true" class="ui-empty-state__illustration">
          {props.illustration}
        </div>
      )}
      <div class="ui-empty-state__copy">
        <h2 id={headingId}>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      {props.primaryAction === null && props.secondaryAction === null ? null : (
        <div class="ui-empty-state__actions">
          {props.primaryAction === null ? null : (
            <Button {...props.primaryAction} />
          )}
          {props.secondaryAction === null ? null : (
            <Button {...props.secondaryAction} />
          )}
        </div>
      )}
    </section>
  );
}

/** Labelled determinate or explicitly indeterminate task progress. */
export function Progress(props: UiProgressProps) {
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.progress,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  const progressValue: unknown = props.value;
  requireCondition(
    progressValue === null || typeof progressValue === "number",
    "ui.value_malformed",
    FOUNDATION_COMPONENT_IDS.progress,
    ["value"],
    "Progress value must be a finite number or explicit null.",
    "Provide a finite determinate value or null for indeterminate progress.",
  );
  requireUiResult(
    validateFiniteRange(
      FOUNDATION_COMPONENT_IDS.progress,
      props.value === null ? props.min : props.value,
      props.min,
      props.max,
      1,
    ),
  );
  if (props.valueText !== null) {
    requireUiResult(
      validateUiText(
        FOUNDATION_COMPONENT_IDS.progress,
        ["valueText"],
        props.valueText,
        UI_LIMITS.maxDescriptionCodePoints,
      ),
    );
  }
  const nativeMaximum = props.max === props.min ? 1 : props.max - props.min;
  const nativeValue = props.value === null
    ? undefined
    : props.max === props.min
      ? 1
      : props.value - props.min;

  return (
    <progress
      aria-label={props.accessibleName}
      aria-valuemax={props.max}
      aria-valuemin={props.min}
      aria-valuenow={props.value ?? undefined}
      aria-valuetext={props.valueText ?? undefined}
      class="ui-progress"
      data-indeterminate={props.value === null ? "true" : "false"}
      max={nativeMaximum}
      value={nativeValue}
    />
  );
}

/** Native scalar measurement. This is deliberately separate from Progress. */
export function Meter(props: UiMeterProps) {
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.meter,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  requireUiResult(
    validateUiText(
      FOUNDATION_COMPONENT_IDS.meter,
      ["valueText"],
      props.valueText,
      UI_LIMITS.maxDescriptionCodePoints,
    ),
  );
  requireUiResult(
    validateFiniteRange(
      FOUNDATION_COMPONENT_IDS.meter,
      props.value,
      props.min,
      props.max,
      1,
    ),
  );
  requireCondition(
    props.max > props.min,
    "ui.range_invalid",
    FOUNDATION_COMPONENT_IDS.meter,
    ["max"],
    "A native meter requires a nonempty finite range.",
    "Provide a maximum greater than the minimum.",
  );
  for (const value of [props.low, props.high, props.optimum]) {
    if (value !== null) {
      requireUiResult(
        validateFiniteRange(
          FOUNDATION_COMPONENT_IDS.meter,
          value,
          props.min,
          props.max,
          1,
        ),
      );
    }
  }
  requireCondition(
    props.low === null || props.high === null || props.low <= props.high,
    "ui.range_invalid",
    FOUNDATION_COMPONENT_IDS.meter,
    ["low", "high"],
    "Meter low and high thresholds are not in ascending order.",
    "Provide low less than or equal to high within the meter range.",
  );

  return (
    <meter
      aria-label={props.accessibleName}
      aria-valuetext={props.valueText}
      class="ui-meter"
      high={props.high ?? undefined}
      low={props.low ?? undefined}
      max={props.max}
      min={props.min}
      optimum={props.optimum ?? undefined}
      value={props.value}
    >
      {props.valueText}
    </meter>
  );
}

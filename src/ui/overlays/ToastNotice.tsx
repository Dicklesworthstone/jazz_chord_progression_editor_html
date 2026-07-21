import { useCallback, useEffect, useId, useRef, useState } from "preact/hooks";

import {
  UI_LIMITS,
  type UiInteractionSource,
  type UiOwnedIconId,
  type UiToastNotice,
  type UiToastNoticeProps,
} from "../ui-contract";
import { Button } from "../primitives/Button";
import { IconButton } from "../primitives/IconButton";
import { UiIcon } from "../primitives/Icon";
import {
  requireUiResult,
  validateUiCollectionBound,
  validateUiId,
  validateUiText,
  UiContractError,
  uiDiagnostic,
} from "../primitives/validation";

type ToastItemProps = Readonly<{
  notice: UiToastNotice;
  onDismiss: (notice: UiToastNotice, source: UiInteractionSource) => void;
  onRetire: (notice: UiToastNotice) => void;
}>;

const toneIcon: Readonly<Record<UiToastNotice["tone"], UiOwnedIconId>> = {
  error: "error",
  info: "info",
  success: "check",
  warning: "warning",
};

const TOAST_COMPONENT_ID = "toast-notice";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refuseToast(
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
  code: "ui.collection_limit" | "ui.duplicate_item_id" | "ui.range_invalid" | "ui.value_malformed" = "ui.value_malformed",
): never {
  throw new UiContractError(
    uiDiagnostic(code, componentId, path, message, recoveryAction),
  );
}

export function preflightToastNoticeProps(value: unknown): void {
  if (!isRecord(value)) {
    refuseToast(
      TOAST_COMPONENT_ID,
      ["props"],
      "Toast notice props must use the reviewed controlled record shape.",
      "Provide a bounded toast-notice prop record.",
    );
  }
  const notices = value["notices"];
  if (!Array.isArray(notices)) {
    refuseToast(
      TOAST_COMPONENT_ID,
      ["notices"],
      "Visible notices must be an ordered collection.",
      "Provide a bounded array of notice records.",
    );
  }
  requireUiResult(
    validateUiCollectionBound(
      TOAST_COMPONENT_ID,
      ["notices"],
      notices,
      "maxVisibleNotices",
    ),
  );
  const hiddenNoticeCount = value["hiddenNoticeCount"];
  if (
    !Number.isSafeInteger(hiddenNoticeCount) ||
    typeof hiddenNoticeCount !== "number" ||
    hiddenNoticeCount < 0
  ) {
    refuseToast(
      TOAST_COMPONENT_ID,
      ["hiddenNoticeCount"],
      "The hidden notice count is outside its reviewed range.",
      "Provide the exact bounded count from the notice center.",
      "ui.range_invalid",
    );
  }
  if (
    hiddenNoticeCount >
      UI_LIMITS.maxNoticeCenterItems - UI_LIMITS.maxVisibleNotices
  ) {
    refuseToast(
      TOAST_COMPONENT_ID,
      ["hiddenNoticeCount"],
      "The notice-center collection exceeds its reviewed bound.",
      "Retire or dismiss notices before publishing another notice.",
      "ui.collection_limit",
    );
  }
  if (
    typeof value["onDismiss"] !== "function" ||
    typeof value["onOpenNoticeCenter"] !== "function"
  ) {
    refuseToast(
      TOAST_COMPONENT_ID,
      typeof value["onDismiss"] !== "function"
        ? ["onDismiss"]
        : ["onOpenNoticeCenter"],
      "Toast notice callbacks must be callable semantic boundaries.",
      "Provide dismissal and notice-center action callbacks.",
    );
  }

  const ids = new Set<string>();
  let previousSequence = -1;
  for (const [index, notice] of notices.entries()) {
    if (!isRecord(notice)) {
      refuseToast(
        TOAST_COMPONENT_ID,
        ["notices", index],
        "Every visible notice must use the reviewed record shape.",
        "Provide bounded notice records in application sequence order.",
      );
    }
    const id = notice["id"];
    const noticeId = typeof id === "string" ? id : "";
    requireUiResult(
      validateUiId(
        TOAST_COMPONENT_ID,
        ["notices", index, "id"],
        noticeId,
      ),
    );
    const title = notice["title"];
    requireUiResult(
      validateUiText(
        noticeId,
        ["notices", index, "title"],
        typeof title === "string" ? title : "",
        UI_LIMITS.maxAccessibleNameCodePoints,
      ),
    );
    const tone = notice["tone"];
    const dismissible = notice["dismissible"];
    const persistent = notice["persistent"];
    if (
      (tone !== "info" &&
        tone !== "success" &&
        tone !== "warning" &&
        tone !== "error") ||
      typeof dismissible !== "boolean" ||
      typeof persistent !== "boolean"
    ) {
      refuseToast(
        noticeId,
        ["notices", index, "state"],
        "A notice uses an unknown tone, dismissal, or persistence state.",
        "Use a reviewed notice tone and explicit boolean state.",
      );
    }
    const message = notice["message"];
    requireUiResult(
      validateUiText(
        noticeId,
        ["notices", index, "message"],
        typeof message === "string" ? message : "",
        UI_LIMITS.maxDescriptionCodePoints,
      ),
    );
    const sequence = notice["sequence"];
    if (
      ids.has(noticeId) ||
      !Number.isSafeInteger(sequence) ||
      typeof sequence !== "number" ||
      sequence < 0 ||
      sequence <= previousSequence
    ) {
      refuseToast(
        noticeId,
        ["notices", index],
        "Notices require unique identities and strictly increasing safe-integer sequences.",
        "Publish notices in increasing application sequence.",
        ids.has(noticeId) ? "ui.duplicate_item_id" : "ui.value_malformed",
      );
    }
    ids.add(noticeId);
    previousSequence = sequence;
  }
}

function ToastItem({ notice, onDismiss, onRetire }: ToastItemProps) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef<number>(UI_LIMITS.noticePresentationMs);
  const startedAt = useRef<number | null>(null);
  const privateDomId = useId();
  const titleId = `${privateDomId}-title`;
  const dismissButtonId = `${privateDomId}-dismiss`;

  useEffect(() => {
    remaining.current = UI_LIMITS.noticePresentationMs;
    startedAt.current = null;
  }, [notice.id, notice.sequence]);

  useEffect(() => {
    if (
      paused ||
      notice.tone === "warning" ||
      notice.tone === "error" ||
      remaining.current <= 0
    ) {
      return;
    }
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => {
      remaining.current = 0;
      onRetire(notice);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (startedAt.current !== null) {
        remaining.current = Math.max(
          0,
          remaining.current - (performance.now() - startedAt.current),
        );
      }
      startedAt.current = null;
    };
  }, [notice, onRetire, paused]);

  return (
    <li
      aria-atomic="true"
      class="ui-toast"
      data-persistent={notice.persistent ? "true" : "false"}
      data-tone={notice.tone}
      role={
        notice.tone === "warning" || notice.tone === "error"
          ? "alert"
          : "status"
      }
      onBlur={(event) => {
        const relatedTarget = event.relatedTarget;
        if (
          !(relatedTarget instanceof Node) ||
          !event.currentTarget.contains(relatedTarget)
        ) {
          setPaused(false);
        }
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onPointerEnter={() => {
        setPaused(true);
      }}
      onPointerLeave={() => {
        setPaused(false);
      }}
    >
      <UiIcon iconId={toneIcon[notice.tone]} />
      <div class="ui-toast__copy">
        <h3 id={titleId}>{notice.title}</h3>
        <p>{notice.message}</p>
      </div>
      {notice.dismissible ? (
        <IconButton
          accessibleName="Dismiss notice"
          busy={false}
          density="comfortable"
          describedBy={[titleId]}
          disabled={false}
          iconId="close"
          id={dismissButtonId}
          invalid={false}
          onAction={(event) => {
            onDismiss(notice, event.source);
          }}
          type="button"
          variant="ghost"
        />
      ) : null}
    </li>
  );
}

export function ToastNotice(props: UiToastNoticeProps) {
  preflightToastNoticeProps(props);
  const privateDomId = useId();
  const openNoticeCenterButtonId = `${privateDomId}-open-center`;
  const [retiredTokens, setRetiredTokens] = useState<readonly string[]>([]);
  useEffect(() => {
    const noticeTokens = props.notices.map(
      (notice) => `${notice.id}:${notice.sequence.toString()}`,
    );
    setRetiredTokens((current) => {
      const next = current.filter((token) => noticeTokens.includes(token));
      return next.length === current.length &&
        next.every((token, index) => token === current[index])
        ? current
        : next;
    });
  }, [props.notices]);
  const dismiss = useCallback(
    (notice: UiToastNotice, source: UiInteractionSource) => {
      props.onDismiss({
        action: "dismiss",
        componentId: "toast-notice",
        itemId: notice.id,
        source,
        value: notice.sequence,
      });
    },
    [props.onDismiss],
  );
  const retire = useCallback((notice: UiToastNotice) => {
    const token = `${notice.id}:${notice.sequence.toString()}`;
    setRetiredTokens((current) =>
      current.includes(token)
        ? current
        : [...current, token].slice(-UI_LIMITS.maxVisibleNotices),
    );
  }, []);
  const visibleNotices = props.notices.filter(
    (notice) =>
      !retiredTokens.includes(`${notice.id}:${notice.sequence.toString()}`),
  );
  const effectiveHiddenNoticeCount =
    props.hiddenNoticeCount + (props.notices.length - visibleNotices.length);
  const renderItems = (notices: readonly UiToastNotice[]) =>
    notices.map((notice) => (
      <ToastItem
        key={notice.id}
        notice={notice}
        onDismiss={dismiss}
        onRetire={retire}
      />
    ));

  return (
    <aside aria-label="Notices" class="ui-toast-region">
      <ol aria-atomic="false" aria-live="polite">
        {renderItems(visibleNotices)}
      </ol>
      {effectiveHiddenNoticeCount > 0 ? (
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={false}
          id={openNoticeCenterButtonId}
          invalid={false}
          label={`${effectiveHiddenNoticeCount.toString()} more notices`}
          onAction={(event) => {
            props.onOpenNoticeCenter({
              action: "activate",
              componentId: "toast-notice",
              itemId: null,
              source: event.source,
              value: null,
            });
          }}
          type="button"
          variant="secondary"
        />
      ) : null}
    </aside>
  );
}

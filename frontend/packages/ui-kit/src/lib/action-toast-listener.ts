import {
  labelFromActionElement,
  progressMessageForActionLabel,
  shouldShowGlobalActionToast,
  successMessageForActionLabel,
} from "./action-progress-message";

type ActiveToast = {
  id: string;
  label: string;
  sawBusy: boolean;
  observer: MutationObserver;
  pollTimer: number;
};

const activeToasts = new WeakMap<HTMLElement, ActiveToast>();

/** Matches the progress-toast auto-dismiss in Toast.tsx — no point polling past it. */
const WATCH_TIMEOUT_MS = 15_000;

function isActionTrigger(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  if (element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLInputElement) {
    return element.type === "submit" || element.type === "button";
  }
  return false;
}

function elementLooksBusy(element: HTMLElement): boolean {
  if (element.getAttribute("aria-busy") === "true") return true;
  // Disabled alone is not "in progress" — primary save buttons stay disabled while
  // the form is incomplete; treating that as busy left a stuck «جاري الحفظ» toast.
  return false;
}

function dismissFor(
  element: HTMLElement,
  dismissToast: (id: string) => void,
  showSuccessToast?: (message: string) => void,
  options?: { forceSuccess?: boolean },
) {
  const entry = activeToasts.get(element);
  if (!entry) return;

  dismissToast(entry.id);
  entry.observer.disconnect();
  window.clearInterval(entry.pollTimer);
  activeToasts.delete(element);

  if (
    showSuccessToast &&
    (entry.sawBusy || options?.forceSuccess)
  ) {
    showSuccessToast(successMessageForActionLabel(entry.label));
  }
}

function watchActionElement(
  element: HTMLElement,
  toastId: string,
  label: string,
  dismissToast: (id: string) => void,
  showSuccessToast?: (message: string) => void,
) {
  let sawBusy = elementLooksBusy(element);
  const startedAt = Date.now();

  const observer = new MutationObserver(() => {
    const busy = elementLooksBusy(element);
    if (busy) sawBusy = true;
    if (sawBusy && !busy) {
      const entry = activeToasts.get(element);
      if (entry) entry.sawBusy = true;
      dismissFor(element, dismissToast, showSuccessToast);
    }
  });

  observer.observe(element, {
    attributes: true,
    attributeFilter: ["aria-busy", "disabled", "class"],
  });

  const pollTimer = window.setInterval(() => {
    if (!document.contains(element)) {
      dismissFor(element, dismissToast, showSuccessToast);
      return;
    }
    // Permanently-busy button: the toast already auto-dismissed — stop watching.
    if (Date.now() - startedAt >= WATCH_TIMEOUT_MS) {
      dismissFor(element, dismissToast);
      return;
    }
    const busy = elementLooksBusy(element);
    if (busy) sawBusy = true;
    const entry = activeToasts.get(element);
    if (entry) entry.sawBusy = sawBusy;
    if (sawBusy && !busy) {
      dismissFor(element, dismissToast, showSuccessToast);
    }
  }, 200);

  activeToasts.set(element, {
    id: toastId,
    label,
    sawBusy,
    observer,
    pollTimer,
  });
}

const SYNC_ACTION_DISMISS_MS = 50;

/** Dismiss orphaned progress toasts when the button never entered a busy state. */
function scheduleSyncActionDismiss(
  element: HTMLElement,
  dismissToast: (id: string) => void,
) {
  window.setTimeout(() => {
    const entry = activeToasts.get(element);
    if (!entry || entry.sawBusy) return;
    dismissFor(element, dismissToast);
  }, SYNC_ACTION_DISMISS_MS);
}

export function bindGlobalActionToast(
  showProgressToast: (message: string) => string,
  dismissToast: (id: string) => void,
  showSuccessToast?: (message: string) => void,
): () => void {
  function onPointerDown(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const element = target.closest(
      "button, input[type='submit'], input[type='button']",
    ) as HTMLElement | null;
    if (!isActionTrigger(element)) return;

    const label = labelFromActionElement(element);
    if (!shouldShowGlobalActionToast(element, label)) return;

    // Already disabled without aria-busy = incomplete form / not started — no progress toast.
    if (
      "disabled" in element &&
      (element as HTMLButtonElement).disabled &&
      element.getAttribute("aria-busy") !== "true"
    ) {
      return;
    }

    dismissFor(element, dismissToast, showSuccessToast);
    const toastId = showProgressToast(progressMessageForActionLabel(label));
    watchActionElement(element, toastId, label, dismissToast, showSuccessToast);
    scheduleSyncActionDismiss(element, dismissToast);
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  return () => document.removeEventListener("pointerdown", onPointerDown, true);
}

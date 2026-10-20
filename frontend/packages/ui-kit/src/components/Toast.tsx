"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  progressMessageForActionLabel,
  successMessageForActionLabel,
  UPLOAD_PROGRESS_MESSAGE,
  UPLOAD_SUCCESS_MESSAGE,
  UPLOAD_FAILURE_MESSAGE,
} from "../lib/action-progress-message";
import { bindGlobalActionToast } from "../lib/action-toast-listener";

export type ToastTone = "success" | "error" | "info" | "progress";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
  persistent?: boolean;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
  showProgressToast: (message: string) => string;
  dismissToast: (id: string) => void;
  runWithActionToast: (
    actionLabel: string,
    action: () => void | Promise<void>,
  ) => Promise<void>;
  runWithUploadToast: (
    action: () => boolean | void | Promise<boolean | void>,
  ) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Matches Case Study.html showToast (~2.6s + fade). */
const TOAST_DURATION_MS = 2800;

const GENERIC_ACTION_ERROR = "تعذّر تنفيذ العملية — حاول مرة أخرى";

function actionToastErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return GENERIC_ACTION_ERROR;
  }
  const message = error.message.trim();
  if (
    message === "save-failed" ||
    message.startsWith("createFailure failed:")
  ) {
    return GENERIC_ACTION_ERROR;
  }
  return message;
}

function newToastId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "error") {
    return (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#f0a8a0"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9 9 15M9 9l6 6" />
      </svg>
    );
  }
  if (tone === "progress") {
    return (
      <span className="inline-flex shrink-0 animate-spin" aria-hidden>
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--gold-2)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      </span>
    );
  }
  if (tone === "info") {
    return (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--gold-2)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6M12 7h.01" />
      </svg>
    );
  }
  /* success — Case Study.html check */
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#8fd0a5"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = newToastId();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, TOAST_DURATION_MS);
  }, [dismissToast]);

  const showProgressToast = useCallback((message: string) => {
    const id = newToastId();
    setToasts((current) => [
      ...current,
      { id, message, tone: "progress", persistent: true },
    ]);
    window.setTimeout(() => {
      dismissToast(id);
    }, 15000);
    return id;
  }, [dismissToast]);

  const runWithActionToast = useCallback(
    async (actionLabel: string, action: () => void | Promise<void>) => {
      const progressId = showProgressToast(
        progressMessageForActionLabel(actionLabel),
      );
      try {
        await action();
        dismissToast(progressId);
        showToast(successMessageForActionLabel(actionLabel), "success");
      } catch (error) {
        dismissToast(progressId);
        showToast(actionToastErrorMessage(error), "error");
        throw error;
      }
    },
    [dismissToast, showProgressToast, showToast],
  );

  const runWithUploadToast = useCallback(
    async (action: () => boolean | void | Promise<boolean | void>) => {
      const progressId = showProgressToast(UPLOAD_PROGRESS_MESSAGE);
      try {
        const result = await action();
        dismissToast(progressId);
        if (result !== false) {
          showToast(UPLOAD_SUCCESS_MESSAGE, "success");
          return true;
        }
        showToast(UPLOAD_FAILURE_MESSAGE, "error");
        return false;
      } catch (error) {
        dismissToast(progressId);
        showToast(actionToastErrorMessage(error), "error");
        return false;
      }
    },
    [dismissToast, showProgressToast, showToast],
  );

  const value = useMemo(
    () => ({
      showToast,
      showProgressToast,
      dismissToast,
      runWithActionToast,
      runWithUploadToast,
    }),
    [dismissToast, runWithActionToast, runWithUploadToast, showProgressToast, showToast],
  );

  useEffect(() => {
    return bindGlobalActionToast(showProgressToast, dismissToast, (message) => {
      showToast(message, "success");
    });
  }, [dismissToast, showProgressToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-[max(1.25rem,env(safe-area-inset-top))] z-[var(--z-toast)] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex max-w-[min(420px,calc(100vw-2rem))] items-center gap-2.5 ui-animate-toast-in"
            style={{
              background: "var(--ink)",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 12px 30px -8px rgba(18,43,78,.5)",
              maxWidth: "100%",
            }}
          >
            <ToastIcon tone={toast.tone} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function useOptionalToast(): ToastContextValue | null {
  return use(ToastContext);
}

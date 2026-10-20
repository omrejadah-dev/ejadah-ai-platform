"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { AppModal } from "./AppModal";
import { Button } from "./Button";
import { Textarea } from "./Textarea";

/**
 * The product's own replacement for `window.confirm` / `window.prompt` / `window.alert`: the same beige
 * `AppModal` everywhere, callable from any handler (React or not) as a promise. One `ActionDialogHost` is
 * mounted at the app root; dialogs queue and show one at a time. Without a host (tests, SSR) the calls
 * fall back to the browser's own dialogs so nothing is silently skipped.
 */

export type ConfirmActionRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type PromptActionRequest = {
  title: string;
  /** Explains what is asked (shown above the field). */
  message?: string;
  /** Field label; defaults to the title. */
  label?: string;
  placeholder?: string;
  initialValue?: string;
  /** An empty answer is refused with a message instead of closing. */
  required?: boolean;
  /** Minimum trimmed length (implies a non-empty answer). */
  minLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type AlertActionRequest = {
  title: string;
  message: string;
  okLabel?: string;
};

type Pending = { id: number } & (
  | { kind: "confirm"; request: ConfirmActionRequest; resolve: (ok: boolean) => void }
  | { kind: "prompt"; request: PromptActionRequest; resolve: (value: string | null) => void }
  | { kind: "alert"; request: AlertActionRequest; resolve: () => void }
);

let nextId = 0;

const listeners = new Set<() => void>();
let queue: Pending[] = [];
let hosts = 0;

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const current = () => queue[0] ?? null;

function enqueue(item: Omit<Pending, "id"> & { kind: Pending["kind"] }) {
  queue = [...queue, { ...item, id: nextId++ } as Pending];
  emit();
}

function finish(item: Pending) {
  queue = queue.filter((q) => q !== item);
  emit();
}

const hasHost = () => hosts > 0 && typeof window !== "undefined";

/** Ask the user to confirm. Resolves `true` on confirm, `false` on cancel / Escape. */
export function confirmAction(request: ConfirmActionRequest): Promise<boolean> {
  if (!hasHost()) {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(request.message) : false);
  }
  return new Promise((resolve) => enqueue({ kind: "confirm", request, resolve }));
}

/** Ask for a line of text (a reason, a note). Resolves the trimmed text, or `null` when cancelled. */
export function promptAction(request: PromptActionRequest): Promise<string | null> {
  if (!hasHost()) {
    const value = typeof window !== "undefined" ? window.prompt(request.message ?? request.title, request.initialValue ?? "") : null;
    if (value == null) return Promise.resolve(null);
    // The same rule the dialog enforces: an unacceptable answer is refused, never passed on.
    const problem = promptValidationMessage(request, value);
    if (problem) {
      window.alert(problem);
      return Promise.resolve(null);
    }
    return Promise.resolve(value.trim());
  }
  return new Promise((resolve) => enqueue({ kind: "prompt", request, resolve }));
}

/** Tell the user something and wait for them to dismiss it. */
export function alertAction(request: AlertActionRequest): Promise<void> {
  if (!hasHost()) {
    if (typeof window !== "undefined") window.alert(request.message);
    return Promise.resolve();
  }
  return new Promise((resolve) => enqueue({ kind: "alert", request, resolve }));
}

/** The error a prompt shows for an answer that is too short — pure so it can be tested. */
export function promptValidationMessage(request: PromptActionRequest, value: string): string | null {
  const trimmed = value.trim();
  const min = request.minLength ?? 0;
  if (min > 0 && trimmed.length < min) return `اكتب ${min} أحرف على الأقل`;
  if (request.required && trimmed.length === 0) return "هذا الحقل مطلوب";
  return null;
}

function PromptBody({
  item,
  onDone,
}: {
  item: Extract<Pending, { kind: "prompt" }>;
  onDone: (value: string | null) => void;
}) {
  const { request } = item;
  const [value, setValue] = useState(request.initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  const submit = () => {
    const problem = promptValidationMessage(request, value);
    if (problem) {
      setError(problem);
      return;
    }
    onDone(value.trim());
  };

  return (
    <AppModal
      open
      title={request.title}
      onClose={() => onDone(null)}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onDone(null)}>
            {request.cancelLabel ?? "إلغاء"}
          </Button>
          <Button type="button" variant={request.danger ? "danger" : "primary"} onClick={submit}>
            {request.confirmLabel ?? "تأكيد"}
          </Button>
        </>
      }
    >
      {request.message ? <p className="m-0 mb-3 whitespace-pre-line text-[13px] leading-6 text-text-2">{request.message}</p> : null}
      <label htmlFor={fieldId} className="mb-1 block text-[12px] font-semibold text-text-2">
        {request.label ?? request.title}
        {request.required || request.minLength ? <span className="text-danger-text"> *</span> : null}
      </label>
      <Textarea
        id={fieldId}
        autoFocus
        rows={3}
        value={value}
        placeholder={request.placeholder}
        hasError={Boolean(error)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {error ? (
        <p className="m-0 mt-1 text-[12px] text-danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </AppModal>
  );
}

/** Mount once at the app root, inside the providers the modals need. */
export function ActionDialogHost() {
  const item = useSyncExternalStore(subscribe, current, () => null);

  useEffect(() => {
    hosts += 1;
    return () => {
      hosts -= 1;
    };
  }, []);

  if (!item) return null;

  if (item.kind === "confirm") {
    const { request } = item;
    const done = (ok: boolean) => {
      finish(item);
      item.resolve(ok);
    };
    return (
      <AppModal
        open
        title={request.title}
        onClose={() => done(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => done(false)}>
              {request.cancelLabel ?? "إلغاء"}
            </Button>
            <Button type="button" variant={request.danger ? "danger" : "primary"} onClick={() => done(true)}>
              {request.confirmLabel ?? "تأكيد"}
            </Button>
          </>
        }
      >
        <p className="m-0 whitespace-pre-line text-[13px] leading-6 text-text-2">{request.message}</p>
      </AppModal>
    );
  }

  if (item.kind === "alert") {
    const { request } = item;
    const done = () => {
      finish(item);
      item.resolve();
    };
    return (
      <AppModal
        open
        title={request.title}
        onClose={done}
        footer={
          <Button type="button" variant="primary" onClick={done}>
            {request.okLabel ?? "حسناً"}
          </Button>
        }
      >
        <p className="m-0 whitespace-pre-line text-[13px] leading-6 text-text-2">{request.message}</p>
      </AppModal>
    );
  }

  return (
    <PromptBody
      key={item.id}
      item={item}
      onDone={(value) => {
        finish(item);
        item.resolve(value);
      }}
    />
  );
}

/** Test seam: drops queued dialogs and the host count. */
export function resetActionDialogsForTests() {
  queue = [];
  hosts = 0;
  emit();
}

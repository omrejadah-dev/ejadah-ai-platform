"use client";

import type { FocusEvent, HTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { Label } from "./Label";

export type FormGroupProps = HTMLAttributes<HTMLDivElement> & {
  hasError?: boolean;
  /**
   * Field label — when given, `FormGroup` renders the label/hint/error stack
   * itself (13px/`font-medium`, gold-d asterisk via `required`). Omit it to
   * keep composing your own label/hint/error as plain `children`.
   */
  label?: ReactNode;
  /** `id` of the wrapped control, for the label's `htmlFor`. */
  htmlFor?: string;
  required?: boolean;
  /** Shown under the field in `text-3` — stays visible after input, unlike `error`. */
  hint?: ReactNode;
  /**
   * Shown under the field in `--red-text` with `role="alert"` — only once
   * the wrapped control has been blurred at least once, never eagerly on
   * submit. Never render a page-level error banner instead of this.
   */
  error?: string;
};

/** Label + control + hint/error stack — wraps one field. */
export function FormGroup({
  className,
  hasError,
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  onBlur,
  ...props
}: FormGroupProps) {
  const [touched, setTouched] = useState(false);
  const showError = touched && !!error;

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    setTouched(true);
    onBlur?.(e);
  }

  return (
    <div
      className={cn(
        "mb-3.5 flex min-w-0 flex-col gap-1.5",
        (hasError || showError) && "has-error",
        className,
      )}
      onBlur={label ? handleBlur : onBlur}
      {...props}
    >
      {label ? (
        <Label size="field" htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {hint ? <span className="text-[12px] text-text-3">{hint}</span> : null}
      {showError ? (
        <span role="alert" className="text-[12px] text-red-text">
          {error}
        </span>
      ) : null}
    </div>
  );
}

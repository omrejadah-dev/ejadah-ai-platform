"use client";

import { cn, formControlClassName } from "@platform/ui-kit";
import { useFormFlow } from "../lib/form-density";
import { useState } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/** Floating label on the field edge — matches Enfaz field styling. */
function InfathFloatLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="pointer-events-none absolute inset-inline-start-2.5 top-0 z-[1] -translate-y-1/2 bg-surface px-1 text-[12px] font-medium leading-none text-text-2"
    >
      {children}
      {required ? <span className="text-gold-d">*</span> : null}
    </label>
  );
}

const fieldShell =
  "relative min-w-0 rounded-lg border border-border-md bg-surface transition focus-within:border-info focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--blue)_18%,transparent)]";

const controlClass =
  "h-[38px] w-full border-0 bg-transparent px-3 text-[13px] text-text outline-none shadow-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60";

export type InfathTextFieldProps = {
  id: string;
  /** Floating label on the field edge. */
  label: string;
  required?: boolean;
  /** Error text shown under the field, border turns danger-red — only once the field has been blurred, never eagerly. */
  error?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

/** Enfaz-styled text field with a floating edge label — matches the Enfaz platform's intake forms. */
export function InfathTextField({
  id,
  label,
  required,
  error,
  className,
  onBlur,
  ...props
}: InfathTextFieldProps) {
  const [touched, setTouched] = useState(false);
  const showError = touched && !!error;
  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          fieldShell,
          "mt-2.5",
          showError && "border-red focus-within:border-red",
        )}
      >
        <InfathFloatLabel htmlFor={id} required={required}>
          {label}
        </InfathFloatLabel>
        <input
          id={id}
          className={cn(controlClass, "tabular-nums")}
          onBlur={(e) => {
            setTouched(true);
            onBlur?.(e);
          }}
          {...props}
        />
      </div>
      {showError ? (
        <span role="alert" className="mt-1 block text-[12px] text-red-text">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type InfathSelectFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className">;

/** Enfaz-styled `<select>` with a floating edge label — same shell as `InfathTextField`. */
export function InfathSelectField({
  id,
  label,
  required,
  error,
  className,
  children,
  onBlur,
  ...props
}: InfathSelectFieldProps) {
  const [touched, setTouched] = useState(false);
  const showError = touched && !!error;
  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          fieldShell,
          "mt-2.5",
          showError && "border-red focus-within:border-red",
        )}
      >
        <InfathFloatLabel htmlFor={id} required={required}>
          {label}
        </InfathFloatLabel>
        <select
          id={id}
          className={cn(controlClass, "appearance-none pe-8")}
          onBlur={(e) => {
            setTouched(true);
            onBlur?.(e);
          }}
          {...props}
        >
          {children}
        </select>
      </div>
      {showError ? (
        <span role="alert" className="mt-1 block text-[12px] text-red-text">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type InfathTextAreaFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className">;

/** Enfaz-styled `<textarea>` with a floating edge label. */
export function InfathTextAreaField({
  id,
  label,
  required,
  error,
  className,
  onBlur,
  ...props
}: InfathTextAreaFieldProps) {
  const [touched, setTouched] = useState(false);
  const showError = touched && !!error;
  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          fieldShell,
          "mt-2.5",
          showError && "border-red",
        )}
      >
        <InfathFloatLabel htmlFor={id} required={required}>
          {label}
        </InfathFloatLabel>
        <textarea
          id={id}
          className={cn(
            formControlClassName,
            "h-auto min-h-[88px] w-full resize-y rounded-lg border-0 bg-transparent px-3 py-2.5 text-[13px] leading-relaxed shadow-none focus:ring-0",
          )}
          onBlur={(e) => {
            setTouched(true);
            onBlur?.(e);
          }}
          {...props}
        />
      </div>
      {showError ? (
        <span role="alert" className="mt-1 block text-[12px] text-red-text">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type InfathSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

/** Titled group wrapper for a cluster of `InfathTextField`/`InfathSelectField`/`InfathTextAreaField`. */
export function InfathSection({
  title,
  children,
  className,
}: InfathSectionProps) {
  const flows = useFormFlow();
  return (
    <section className={cn(flows ? "contents" : "min-w-0", className)}>
      <h4
        className={cn(
          "m-0 text-[13px] font-bold text-heading",
          // In a flowing grid the title would break the row — keep it for screen readers only.
          flows ? "sr-only" : "mb-3",
        )}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

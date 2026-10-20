import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  formControlClassName,
  formControlErrorClassName,
} from "../lib/form-control-classes";
import {
  applyIsoDateToInput,
  parsePastedDate,
} from "../lib/pasted-date";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

/**
 * 38px text input — pastes a full date straight into a `type="date"` field.
 * `type="date"` gets `lang="ar-SA"`/`dir="ltr"` (Latin digits, LTR field)
 * by default; pass your own `lang`/`dir` to override.
 */
export function Input({ className, hasError, onPaste, type, ...props }: InputProps) {
  const isDate = type === "date";
  return (
    <input
      className={cn(
        formControlClassName,
        "leading-[38px]",
        hasError && formControlErrorClassName,
        className,
      )}
      type={type}
      lang={isDate ? "ar-SA" : undefined}
      dir={isDate ? "ltr" : undefined}
      onPaste={(e) => {
        if (type === "date") {
          const iso = parsePastedDate(e.clipboardData.getData("text"));
          if (iso) {
            e.preventDefault();
            applyIsoDateToInput(e.currentTarget, iso);
            return;
          }
        }
        onPaste?.(e);
      }}
      {...props}
    />
  );
}

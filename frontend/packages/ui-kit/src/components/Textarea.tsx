import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  formControlClassName,
  formControlErrorClassName,
} from "../lib/form-control-classes";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  hasError?: boolean;
};

/** Multi-line text field — same 13px control styling as `Input`. */
export function Textarea({ className, hasError, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        formControlClassName,
        "h-auto min-h-[62px] resize-y py-2 leading-relaxed",
        hasError && formControlErrorClassName,
        className,
      )}
      {...props}
    />
  );
}

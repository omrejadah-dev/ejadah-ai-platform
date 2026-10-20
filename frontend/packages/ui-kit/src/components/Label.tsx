import type { LabelHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const sizeClasses = {
  default: "mb-[7px] block text-[13px] font-medium text-text-2",
  field: "mb-0 block text-[13px] font-medium text-text-2",
} as const;

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  size?: keyof typeof sizeClasses;
  /** Appends a `--gold-d` "*" after the label text. @default false */
  required?: boolean;
};

/** Field label, 13px/`font-medium` — pass `required` for the gold-d asterisk instead of hand-rolling one. */
export function Label({
  className,
  size = "default",
  required,
  children,
  ...props
}: LabelProps) {
  return (
    <label className={cn(sizeClasses[size], className)} {...props}>
      {children}
      {required ? <span className="text-gold-d"> *</span> : null}
    </label>
  );
}

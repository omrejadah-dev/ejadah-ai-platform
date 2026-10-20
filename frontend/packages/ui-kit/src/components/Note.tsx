import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const toneClasses = {
  default: "border-r-text-2 bg-surface-2 text-text-2",
  info: "border-r-ink bg-navy-soft text-heading",
  warn: "border-r-warning bg-warning-bg text-amber-text",
  success: "border-r-success bg-success-bg text-success-text",
  danger: "border-r-danger bg-danger-bg text-danger-text",
} as const;

type NoteTone = keyof typeof toneClasses;

export function Note({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: NoteTone }) {
  return (
    <div
      className={cn(
        "mb-3 rounded-[10px] border-r-[3px] border-solid px-3.5 py-3 text-[12.5px] leading-relaxed",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

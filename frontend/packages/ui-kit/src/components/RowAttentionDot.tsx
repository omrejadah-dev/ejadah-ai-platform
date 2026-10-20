import { cn } from "../lib/cn";

/** Outlook-style "unread" dot for queue rows — lit until the row is opened. */
export function RowAttentionDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "ui-status-dot-live size-2 shrink-0 rounded-full bg-[#2f7de1]",
        className,
      )}
      title="نشاط جديد"
      aria-label="نشاط جديد"
    />
  );
}

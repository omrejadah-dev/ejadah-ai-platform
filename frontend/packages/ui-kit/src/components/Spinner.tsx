import { cn } from "../lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-3 shrink-0 rounded-full border-2 border-current border-e-transparent motion-safe:animate-spin",
        className,
      )}
      aria-hidden
    />
  );
}

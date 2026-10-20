import { cn } from "../lib/cn";

export type FilterChipOption = {
  key: string;
  label: string;
  /** Live count shown in the chip's counter pill. */
  count?: number;
  /** Danger semantics (e.g. "متأخرة عن SLA", "متعذرة") — the counter reads in `--red-text` instead of gold. @default false */
  danger?: boolean;
};

export type FilterChipsProps = {
  /** 4–6 quick filters. */
  options: FilterChipOption[];
  /** The single active chip's `key` — only one chip is ever active. `null` for none. */
  active: string | null;
  onChange: (key: string | null) => void;
  className?: string;
};

/**
 * Row-two quick filters under a `PageToolbar` — 4–6 single-select pills
 * (`h-8 rounded-full`) with a live count badge. The active chip fills navy
 * (`bg-ink text-on-ink`); clicking the active chip again clears it. Pair
 * with `FilterTag` for filters applied from a side sheet.
 */
export function FilterChips({ options, active, onChange, className }: FilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="تصفية سريعة"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {options.map((opt) => {
        const isActive = opt.key === active;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? null : opt.key)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors",
              isActive
                ? "border-ink bg-ink text-on-ink"
                : "border-border-md bg-surface text-text-2 hover:bg-row-hover",
            )}
          >
            {opt.label}
            {opt.count != null ? (
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-soft px-1.5 text-xs font-semibold tabular-nums",
                  opt.danger ? "text-red-text" : "text-gold-d",
                )}
              >
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type FilterTagProps = {
  label: string;
  onRemove: () => void;
  className?: string;
};

/** A removable "applied from the side sheet" tag — sits at the end of the `FilterChips` row. */
export function FilterTag({ label, onRemove, className }: FilterTagProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border border-border-md bg-surface-2 ps-3 pe-1.5 text-[12.5px] font-medium text-text-2",
        className,
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`إزالة ${label}`}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-text-3 outline-none transition-colors hover:bg-row-hover hover:text-heading"
      >
        ×
      </button>
    </span>
  );
}

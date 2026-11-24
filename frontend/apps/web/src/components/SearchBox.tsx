import { cn } from "@platform/ui-kit";

/** A list's search box: icon, text, and (once something is typed) a clear button. */
export function SearchBox({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <div className={cn("flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 focus-within:border-gold sm:max-w-[360px]", className)}>
      <i className="ti ti-search text-lg text-text-3" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-3" />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="مسح البحث" className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-row-hover hover:text-ink">
          <i className="ti ti-x" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

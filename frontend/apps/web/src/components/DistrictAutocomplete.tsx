"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@platform/ui-kit";
import { api, type Place } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useDebounced } from "@/hooks/useDebounced";

const LIMIT = 12;

/** "الصفا، جدة": a district is only unambiguous with its city. */
const label = (d: Place) => `${d.name}، ${d.city}`;

/** The district name with the typed text in bold gold, so it is clear why it matched. */
function Marked({ name, typed }: { name: string; typed: string }) {
  const at = typed ? name.indexOf(typed) : -1;
  if (at < 0) return <b className="text-text">{name}</b>;
  return <b className="text-text">{name.slice(0, at)}<span className="text-gold-d">{name.slice(at, at + typed.length)}</span>{name.slice(at + typed.length)}</b>;
}

/**
 * Type-ahead district search across every enabled city (GET /api/districts; WAI-ARIA combobox: ↑/↓ move, Enter picks,
 * Escape closes, Enter alone takes the first). Options show the city and region, so «الصفا» in Jeddah and in Riyadh can
 * be told apart. An empty box, once focused, suggests the busiest districts of the busiest cities. Large search box with
 * a clear button. Give it a new `key` (a reset counter) to start again with an empty box.
 */
export function DistrictAutocomplete({ value, onChange, id, placeholder = "ابحث عن حي", showCounts = false }: {
  value: Place | null;
  onChange: (d: Place | null) => void;
  id?: string;
  placeholder?: string;
  /** Show each district's market-deal count in the list. */
  showCounts?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(value ? label(value) : "");
  const [active, setActive] = useState(-1);
  // closed until the box is focused or typed in; this also keeps the suggestions from loading before they are wanted
  const [dismissed, setDismissed] = useState(true);
  const q = useDebounced(text.trim());

  const districts = useQuery({
    queryKey: ["districts", q],
    queryFn: () => api<Place[]>(`/api/districts?q=${encodeURIComponent(q)}&limit=${LIMIT}`),
    enabled: !value && !dismissed,
    staleTime: 10 * 60_000,
  });
  const options = districts.data ?? [];
  const typed = text.trim();
  const settled = districts.isSuccess && !districts.isFetching && q === typed;
  const open = !value && !dismissed && (options.length > 0 || (typed !== "" && settled));

  function pick(d: Place) {
    onChange(d);
    setText(label(d));
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length || value) return;
      e.preventDefault();
      setDismissed(false);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Enter" && open && options.length) {
      e.preventDefault();
      pick(options[Math.max(0, active)]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setDismissed(true);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <div className="flex h-14 items-center gap-3 rounded-xl border-[1.5px] border-border-md bg-surface px-4 transition focus-within:border-gold focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--gold)_18%,transparent)]">
        <i className={cn("ti text-xl", value ? "ti-map-pin text-gold-d" : "ti-search text-text-3")} aria-hidden />
        <input id={id} value={text} placeholder={placeholder} autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { setText(e.target.value); setDismissed(false); setActive(-1); if (value) onChange(null); }}
          onFocus={() => setDismissed(false)}
          onKeyDown={onKeyDown}
          onBlur={() => { setDismissed(true); setActive(-1); }}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-3" />
        {districts.isFetching ? <i className="ti ti-loader-2 animate-spin text-text-3" aria-hidden /> : null}
        {text ? (
          <button type="button" aria-label="مسح الحي" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setText(""); onChange(null); setActive(-1); }}
            className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-row-hover hover:text-ink">
            <i className="ti ti-x" aria-hidden />
          </button>
        ) : null}
      </div>
      <ul id={listId} role="listbox" hidden={!open}
        className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
        {open && !typed ? <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-bold text-text-3">الأكثر صفقات في أكبر المدن</li> : null}
        {open && typed && settled && !options.length ? <li role="presentation" className="px-3 py-3 text-sm text-text-3">لا يوجد حي بهذا الاسم فيه صفقات. جرّب جزءاً من الاسم</li> : null}
        {open ? options.map((d, i) => (
          <li key={d.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            // mousedown, not click: picking must happen before the input's blur closes the list
            onMouseDown={(e) => { e.preventDefault(); pick(d); }}
            onMouseEnter={() => setActive(i)}
            className={cn("flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-start text-sm", i === active && "bg-row-hover")}>
            <span className="min-w-0 truncate"><Marked name={d.name} typed={q} /><span className="text-text-3"> · {d.city} · منطقة {d.region}</span></span>
            {showCounts ? <span className="shrink-0 text-xs text-text-3 tabular-nums" title="صفقات السوق في آخر 12 شهراً">{fmt(d.nMarketDeals)} صفقة</span> : null}
          </li>
        )) : null}
      </ul>
    </div>
  );
}

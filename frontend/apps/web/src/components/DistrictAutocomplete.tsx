"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn, Input } from "@platform/ui-kit";
import { api, type District } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useDebounced } from "@/hooks/useDebounced";

const LIMIT = 12;

/**
 * Type-ahead district search within one city (WAI-ARIA combobox: ↑/↓ move, Enter picks, Escape closes).
 * Give it `key={cityId}` so a new city starts with an empty field.
 */
export function DistrictAutocomplete({
  cityId, value, onChange, id, placeholder = "ابحث عن حي", showCounts = false,
}: {
  cityId: number | null;
  value: District | null;
  onChange: (d: District | null) => void;
  id?: string;
  placeholder?: string;
  /** Show each district's market-deal count in the list. */
  showCounts?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const q = useDebounced(text.trim());

  const districts = useQuery({
    queryKey: ["districts", cityId, q],
    queryFn: () => api<District[]>(`/api/cities/${cityId}/districts?q=${encodeURIComponent(q)}&limit=${LIMIT}`),
    enabled: cityId != null && q.length > 0,
  });
  const options = districts.data ?? [];
  const open = !value && !dismissed && text.trim() !== "" && options.length > 0;

  function pick(d: District) {
    onChange(d);
    setText(d.name);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length || value) return;
      e.preventDefault();
      setDismissed(false);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setDismissed(true);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <Input id={id} value={text} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { setText(e.target.value); setDismissed(false); setActive(-1); if (value) onChange(null); }}
        onKeyDown={onKeyDown}
        onBlur={() => { setDismissed(true); setActive(-1); }} />
      <ul id={listId} role="listbox" hidden={!open}
        className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
        {open ? options.map((d, i) => (
          <li key={d.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            // mousedown, not click: picking must happen before the input's blur closes the list
            onMouseDown={(e) => { e.preventDefault(); pick(d); }}
            onMouseEnter={() => setActive(i)}
            className={cn("flex w-full cursor-pointer items-center justify-between px-3 py-2 text-start text-sm", i === active && "bg-row-hover")}>
            <span>{d.name}</span>
            {showCounts ? <span className="text-xs text-text-3">{fmt(d.nMarketDeals)}</span> : null}
          </li>
        )) : null}
      </ul>
    </div>
  );
}

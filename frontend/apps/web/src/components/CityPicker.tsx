"use client";

import { FormGroup, Select } from "@platform/ui-kit";
import type { City } from "@/lib/api";

export type PickerCity = { id: number; name: string; deals: number; /** districts with a map shape, shown next to the name when known */ districts?: number };
export type PickerRegion = { region: string; cities: PickerCity[] };

/** /api/cities (flat) → regions, busiest region first, each with its cities busiest first. */
export function groupCities(cities: City[] | undefined): PickerRegion[] {
  const m = new Map<string, PickerCity[]>();
  for (const c of cities ?? []) m.set(c.region, [...(m.get(c.region) ?? []), c]);
  const total = (list: PickerCity[]) => list.reduce((s, c) => s + c.deals, 0);
  return [...m]
    .map(([region, list]) => ({ region, cities: [...list].sort((a, b) => b.deals - a.deals) }))
    .sort((a, b) => total(b.cities) - total(a.cities));
}

/** The one default every screen uses until the user picks: the city with the most deals. */
export function busiestCityId(regions: PickerRegion[] | undefined): number | null {
  let best: PickerCity | null = null;
  for (const r of regions ?? []) for (const c of r.cities) if (!best || c.deals > best.deals) best = c;
  return best?.id ?? null;
}

/**
 * Region → city, as two selects. The region is not state of its own: it is the chosen city's region,
 * and choosing a region moves to its busiest city. `variant="form"` renders labelled `FormGroup`s for
 * a form grid; `"toolbar"` renders compact selects for a bar.
 */
export function CityPicker({
  regions, cityId, onChange, variant = "form", required, idPrefix = "city-picker",
}: {
  regions: PickerRegion[];
  cityId: number | null;
  /** `regionChanged` is true when the user switched region (and so the city with it). */
  onChange: (cityId: number, regionChanged: boolean) => void;
  variant?: "form" | "toolbar";
  required?: boolean;
  idPrefix?: string;
}) {
  const region = regions.find((r) => r.cities.some((c) => c.id === cityId));
  const pickRegion = (name: string) => {
    const r = regions.find((x) => x.region === name);
    if (r?.cities[0]) onChange(r.cities[0].id, true);
  };

  const regionSelect = (
    <Select id={`${idPrefix}-region`} className={variant === "toolbar" ? "!w-auto" : undefined} aria-label={variant === "toolbar" ? "المنطقة" : undefined}
      value={region?.region ?? ""} onChange={(e) => pickRegion(e.target.value)}>
      {regions.map((r) => <option key={r.region} value={r.region}>منطقة {r.region}</option>)}
    </Select>
  );
  const citySelect = (
    <Select id={`${idPrefix}-city`} className={variant === "toolbar" ? "!w-auto" : undefined} aria-label={variant === "toolbar" ? "المدينة" : undefined}
      value={cityId ?? ""} onChange={(e) => onChange(Number(e.target.value), false)}>
      {region?.cities.map((c) => (
        <option key={c.id} value={c.id}>{c.districts != null ? `${c.name} (${c.districts} حياً)` : c.name}</option>
      ))}
    </Select>
  );

  if (variant === "toolbar") return <>{regionSelect}{citySelect}</>;
  return (
    <>
      <FormGroup label="المنطقة" htmlFor={`${idPrefix}-region`} required={required}>{regionSelect}</FormGroup>
      <FormGroup label="المدينة" htmlFor={`${idPrefix}-city`} required={required}>{citySelect}</FormGroup>
    </>
  );
}

// Colour scale and value/tooltip helpers shared by the map and its legend (kept out of DistrictMap so the legend never pulls Leaflet into SSR).
import { fmt } from "@/lib/format";

export const PALETTE = ["#f1ece2", "#ddd0b6", "#c2ab84", "#8f8a86", "#4d6488", "#102b4e"]; // cream → gold → navy
const EMPTY = "#e9e6df";

export type Metric = "ppm" | "n12";
/** One year, or "recent" = the last 24 months. */
export type Period = "recent" | number;

export function breaks(values: number[], bins = PALETTE.length): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  return Array.from({ length: bins - 1 }, (_, i) => v[Math.floor(((i + 1) * v.length) / bins)]);
}

export function colorFor(value: number | null | undefined, b: number[]): string {
  if (!value || !b.length) return EMPTY;
  let i = 0;
  while (i < b.length && value > b[i]) i++;
  return PALETTE[i];
}

/** What a district or a region carries: recent median price and count, and per year [median price or null, deal count]. */
type Valued = { ppm: number | null; n12: number; y?: Record<string, [number | null, number]> };

/** The shown number for a district or region in the chosen period and metric. */
export function valueFor(p: Valued, period: Period, metric: Metric): number | null {
  if (period === "recent") return metric === "ppm" ? p.ppm : p.n12;
  const y = p.y?.[String(period)];
  return y ? (metric === "ppm" ? y[0] : y[1]) : null;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Leaflet tooltip HTML: name, the value, and an optional muted note. Names come from data, so they are escaped. */
export function tooltipHtml(name: string, v: number | null, metric: Metric, note?: string): string {
  const line = metric === "ppm" ? (v ? `${fmt(v)} ريال/م²` : "لا صفقات كافية") : `${fmt(v ?? 0)} صفقة`;
  const tail = note ? `<br/><span style="color:var(--text-3)">${escapeHtml(note)}</span>` : "";
  return `<div dir="rtl" style="font-family:inherit"><b>${escapeHtml(name)}</b><br/>${line}${tail}</div>`;
}

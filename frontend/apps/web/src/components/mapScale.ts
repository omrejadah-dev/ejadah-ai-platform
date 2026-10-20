// Colour scale shared by the map and its legend (kept out of DistrictMap so the legend never pulls Leaflet into SSR).
export const PALETTE = ["#f1ece2", "#ddd0b6", "#c2ab84", "#8f8a86", "#4d6488", "#102b4e"]; // cream → gold → navy
export const EMPTY = "#e9e6df";

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

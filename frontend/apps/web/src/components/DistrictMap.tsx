"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { colorFor } from "./mapScale";

export type DistrictProps = {
  id: number; name: string; center: [number, number];
  ppm: number | null; n12: number; n24: number; nAll: number;
  /** per year: [median ppm or null, deal count] */
  y: Record<string, [number | null, number]>;
};
export type DistrictCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, DistrictProps> & {
  scale: { ppm: number[]; count: number[]; firstYear: number; lastYear: number };
};
export type Metric = "ppm" | "n12";

type FeatureLayer = L.Path & { feature: GeoJSON.Feature<GeoJSON.Geometry, DistrictProps> };

export function DistrictMap({
  data, valueOf, scale, tooltip, selectedId, onSelect, height = 600,
}: {
  data: DistrictCollection | undefined;
  valueOf: (p: DistrictProps) => number | null;
  scale: number[];
  tooltip: (p: DistrictProps) => string;
  selectedId: number | null;
  onSelect: (p: DistrictProps) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);
  const cb = useRef({ onSelect, valueOf, tooltip, scale, selectedId });
  cb.current = { onSelect, valueOf, tooltip, scale, selectedId };

  function restyle(path: L.Path, p: DistrictProps) {
    const v = cb.current.valueOf(p);
    const sel = p.id === cb.current.selectedId;
    path.setStyle({ color: sel ? "#a4906f" : "#ffffff", weight: sel ? 3 : 1, fillColor: colorFor(v, cb.current.scale), fillOpacity: v ? 0.74 : 0.3 });
  }
  const restyleAll = () => layer.current?.eachLayer((l) => restyle(l as FeatureLayer, (l as FeatureLayer).feature.properties));

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 }).setView([21.55, 39.2], 10.5);
    // OSM standard tiles: fine for development; switch to a hosted tile provider (or self-hosted) before production traffic.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 18 }).addTo(map.current);
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current?.remove(); map.current = null; };
  }, []);

  // geometry: rebuilt only when the dataset (city/type) changes
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    layer.current?.remove();
    layer.current = L.geoJSON(data, {
      onEachFeature: (f, lyr) => {
        const p = f.properties as DistrictProps;
        lyr.bindTooltip(() => cb.current.tooltip(p), { sticky: true, direction: "top" });
        lyr.on({
          click: () => cb.current.onSelect(p),
          mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2.5, color: "#a4906f" }),
          mouseout: (e) => restyle(e.target as L.Path, p),
        });
      },
    }).addTo(m);
    restyleAll();

    // centre on the deal-weighted middle of the city; Jeddah is ~100 km long, so a fixed zoom reads better than fitBounds
    const pts = data.features.filter((f) => f.properties.n24 > 0);
    const wt = (f: (typeof pts)[number]) => Math.sqrt(f.properties.n24);
    const w = pts.reduce((t, f) => t + wt(f), 0) || 1;
    const lat = pts.reduce((t, f) => t + f.properties.center[0] * wt(f), 0) / w;
    const lng = pts.reduce((t, f) => t + f.properties.center[1] * wt(f), 0) / w;
    const t = setTimeout(() => { m.invalidateSize(); m.setView([lat || 21.55, lng || 39.2], m.getSize().x < 640 ? 10 : 10.5); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // colours only: cheap, runs on every year / metric / selection change so the play animation stays smooth
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { restyleAll(); }, [valueOf, scale, selectedId]);

  return <div dir="ltr" ref={el} style={{ height }} className="relative isolate z-0 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2" />;
}

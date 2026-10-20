"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmt } from "@/lib/api";
import { breaks, colorFor } from "./mapScale";

export type DistrictProps = { id: number; name: string; center: [number, number]; ppm: number | null; n12: number; n24: number; nAll: number };
export type DistrictCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, DistrictProps>;
export type Metric = "ppm" | "n12";



export function DistrictMap({
  data, metric, selectedId, onSelect, height = 600,
}: { data: DistrictCollection | undefined; metric: Metric; selectedId: number | null; onSelect: (p: DistrictProps) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, preferCanvas: false, zoomSnap: 0.25 }).setView([21.55, 39.2], 11);
    // OSM standard tiles: fine for development; switch to a hosted tile provider (or self-hosted) before production traffic.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap", maxZoom: 18,
    }).addTo(map.current);
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    layer.current?.remove();
    const values = data.features.map((f) => (metric === "ppm" ? f.properties.ppm ?? 0 : f.properties.n12));
    const b = breaks(values);
    layer.current = L.geoJSON(data, {
      style: (f) => {
        const p = f!.properties as DistrictProps;
        const v = metric === "ppm" ? p.ppm : p.n12;
        const sel = p.id === selectedId;
        return { color: sel ? "#a4906f" : "#ffffff", weight: sel ? 3 : 1, fillColor: colorFor(v, b), fillOpacity: v ? 0.72 : 0.35 };
      },
      onEachFeature: (f, lyr) => {
        const p = f.properties as DistrictProps;
        const line = metric === "ppm"
          ? (p.ppm ? `${fmt(p.ppm)} ريال/م²` : "لا صفقات كافية")
          : `${fmt(p.n12)} صفقة في 12 شهراً`;
        lyr.bindTooltip(`<div dir="rtl" style="font-family:inherit"><b>${p.name}</b><br/>${line}</div>`, { sticky: true, direction: "top" });
        lyr.on({
          click: () => onSelectRef.current(p),
          mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2.5, color: "#a4906f" }),
          mouseout: (e) => layer.current?.resetStyle(e.target as L.Path),
        });
      },
    }).addTo(m);
  }, [data, metric, selectedId]);

  // fit to the city once per dataset, after the container has its real size
  const fitted = useRef<DistrictCollection | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !data?.features.length || fitted.current === data) return;
    fitted.current = data;
    const t = setTimeout(() => {
      m.invalidateSize();
      // centre on the deal-weighted middle of the city; Jeddah is ~100 km long, so a fixed zoom reads better than fitBounds
      const pts = data.features.filter((f) => f.properties.n24 > 0);
      const wt = (f: (typeof pts)[number]) => Math.sqrt(f.properties.n24);   // damp the dense north so the core stays centred
      const w = pts.reduce((t, f) => t + wt(f), 0) || 1;
      const lat = pts.reduce((t, f) => t + f.properties.center[0] * wt(f), 0) / w;
      const lng = pts.reduce((t, f) => t + f.properties.center[1] * wt(f), 0) / w;
      m.setView([lat || 21.55, lng || 39.2], m.getSize().x < 640 ? 10 : 10.5);
    }, 50);
    return () => clearTimeout(t);
  }, [data]);

  return <div dir="ltr" ref={el} style={{ height }} className="relative isolate z-0 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2" />;
}

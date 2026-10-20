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
export type RegionProps = { region: string; name: string; center: [number, number]; cityId: number | null; ppm: number | null; n12: number; y: Record<string, [number | null, number]> };
export type RegionCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, RegionProps> & { scale: { ppm: number[]; count: number[] } };
type RegionLayer = L.Path & { feature: GeoJSON.Feature<GeoJSON.Geometry, RegionProps> };
export type Metric = "ppm" | "n12";

type FeatureLayer = L.Path & { feature: GeoJSON.Feature<GeoJSON.Geometry, DistrictProps> };

/** Below this zoom the map shows the 13 regions (Kingdom view); at or above it, the districts of the selected city. */
const CITY_ZOOM = 9;
const KINGDOM: [L.LatLngExpression, number] = [[24.2, 44.6], 5.75];

export function DistrictMap({
  data, valueOf, scale, tooltip, selectedId, onSelect, height = 600,
  regions, regionValue, regionScale, regionTooltip, currentRegion, onRegion, onLevel,
}: {
  data: DistrictCollection | undefined;
  valueOf: (p: DistrictProps) => number | null;
  scale: number[];
  tooltip: (p: DistrictProps) => string;
  selectedId: number | null;
  onSelect: (p: DistrictProps) => void;
  height?: number;
  regions?: RegionCollection;
  regionValue: (r: RegionProps) => number | null;
  regionScale: number[];
  regionTooltip: (r: RegionProps) => string;
  currentRegion: string;
  onRegion: (r: RegionProps) => void;
  onLevel?: (kingdom: boolean) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);
  const cityLayer = useRef<L.GeoJSON | null>(null);
  const cb = useRef({ onSelect, valueOf, tooltip, scale, selectedId, regionValue, regionScale, regionTooltip, currentRegion, onRegion, regions, onLevel });
  cb.current = { onSelect, valueOf, tooltip, scale, selectedId, regionValue, regionScale, regionTooltip, currentRegion, onRegion, regions, onLevel };

  function restyle(path: L.Path, p: DistrictProps) {
    const v = cb.current.valueOf(p);
    const sel = p.id === cb.current.selectedId;
    path.setStyle({ color: sel ? "#a4906f" : "#ffffff", weight: sel ? 3 : 1, fillColor: colorFor(v, cb.current.scale), fillOpacity: v ? 0.74 : 0.3 });
  }
  const restyleAll = () => layer.current?.eachLayer((l) => restyle(l as FeatureLayer, (l as FeatureLayer).feature.properties));

  // which level is visible depends only on zoom
  function applyLevel() {
    const m = map.current;
    if (!m) return;
    const kingdom = m.getZoom() < CITY_ZOOM;
    cb.current.onLevel?.(kingdom);
    for (const [lyr, show] of [[cityLayer.current, kingdom], [layer.current, !kingdom]] as const) {
      if (!lyr) continue;
      if (show && !m.hasLayer(lyr)) lyr.addTo(m);
      if (!show && m.hasLayer(lyr)) m.removeLayer(lyr);
    }
  }

  function styleRegion(path: L.Path, r: RegionProps) {
    const v = cb.current.regionValue(r);
    const cur = r.region === cb.current.currentRegion;
    path.setStyle({ color: cur ? "#a4906f" : "#ffffff", weight: cur ? 3 : 1.2, fillColor: colorFor(v, cb.current.regionScale), fillOpacity: v ? 0.74 : 0.3 });
  }
  const restyleRegions = () => cityLayer.current?.eachLayer((l) => styleRegion(l as RegionLayer, (l as RegionLayer).feature.properties));

  function drawRegions() {
    const m = map.current;
    const fc = cb.current.regions;
    if (!m || !fc) return;
    cityLayer.current?.remove();
    cityLayer.current = L.geoJSON(fc, {
      onEachFeature: (f, lyr) => {
        const r = f.properties as RegionProps;
        lyr.bindTooltip(() => cb.current.regionTooltip(r), { sticky: true, direction: "top" });
        lyr.on({
          click: () => cb.current.onRegion(r),
          mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, color: "#a4906f" }),
          mouseout: (e) => styleRegion(e.target as L.Path, r),
        });
      },
    });
    restyleRegions();
    applyLevel();
  }

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 }).setView([21.55, 39.2], 10.5);
    map.current = m;
    // OSM standard tiles: fine for development; switch to a hosted tile provider (or self-hosted) before production traffic.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 18 }).addTo(m);
    m.on("zoomend", applyLevel);

    // "Kingdom" button under the zoom control
    const Kingdom = L.Control.extend({
      onAdd: () => {
        const b = L.DomUtil.create("button", "leaflet-bar");
        b.type = "button";
        b.title = "عرض المملكة";
        b.innerHTML = '<i class="ti ti-world" style="font-size:17px;line-height:30px"></i>';
        Object.assign(b.style, { width: "34px", height: "34px", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#102b4e" });
        L.DomEvent.on(b, "click", (e) => { L.DomEvent.stop(e); m.flyTo(KINGDOM[0], KINGDOM[1], { duration: 0.8 }); });
        return b;
      },
    });
    new Kingdom({ position: "topleft" }).addTo(m);

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // districts of the current city: rebuilt only when the dataset (city/type) changes
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
    });
    restyleAll();

    // frame the busier half of the city's districts (outlying polygons would zoom a long city like Jeddah out too far)
    const busy = [...data.features].sort((a, b) => b.properties.n24 - a.properties.n24).slice(0, Math.max(5, Math.ceil(data.features.length / 2)));
    const target = busy.length ? L.geoJSON({ type: "FeatureCollection", features: busy } as GeoJSON.FeatureCollection).getBounds() : null;
    const t = setTimeout(() => {
      m.invalidateSize();
      if (target?.isValid()) {
        const raw = m.getBoundsZoom(target, false, L.point(16, 16));
        const z = Number.isFinite(raw) ? Math.min(13, Math.max(CITY_ZOOM + 0.5, raw)) : 11;
        m.flyTo(target.getCenter(), z, { duration: m.getZoom() < CITY_ZOOM ? 0.9 : 0.01 });
      }
      applyLevel();
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // regions: geometry once per dataset, colours on every period / metric change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { drawRegions(); }, [regions]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { restyleRegions(); }, [regionValue, regionScale, currentRegion]);

  // district colours only: cheap, runs on every year / metric / selection change so the play animation stays smooth
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { restyleAll(); }, [valueOf, scale, selectedId]);

  return <div dir="ltr" ref={el} style={{ height }} className="relative isolate z-0 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2" />;
}

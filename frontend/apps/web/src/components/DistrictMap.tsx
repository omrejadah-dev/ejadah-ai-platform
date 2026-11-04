"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@platform/ui-kit";
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

/** Below this zoom the map shows the 13 regions (Kingdom view); at or above it, the districts of the selected city. */
const CITY_ZOOM = 9;
/** First view before any data arrives: Jeddah. */
const START_VIEW: [L.LatLngExpression, number] = [[21.55, 39.2], 10.5];
/** The whole Kingdom, for the "عرض المملكة" button. */
const KINGDOM_VIEW: [L.LatLngExpression, number] = [[24.2, 44.6], 5.75];

/** Leaflet writes colours into SVG attributes, where CSS variables do not resolve: read the design tokens once. */
let tokens: { gold: string; surface: string } | null = null;
function colors() {
  if (!tokens) {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    tokens = { gold: v("--gold", "#a4906f"), surface: v("--surface", "#ffffff") };
  }
  return tokens;
}

/** Fill by value; a gold outline when highlighted (selected district / current region). */
function paint(path: L.Path, value: number | null, scale: number[], highlighted: boolean, weight: number) {
  const c = colors();
  path.setStyle({ color: highlighted ? c.gold : c.surface, weight: highlighted ? 3 : weight, fillColor: colorFor(value, scale), fillOpacity: value ? 0.74 : 0.3 });
}

type Layer<P> = L.Path & { feature: GeoJSON.Feature<GeoJSON.Geometry, P> };
const eachFeature = <P,>(layer: L.GeoJSON | null, fn: (path: L.Path, p: P) => void) =>
  layer?.eachLayer((l) => fn(l as Layer<P>, (l as Layer<P>).feature.properties));

/** A clickable GeoJSON layer: tooltip, click, gold outline on hover, back to its own style on leave. */
function interactiveLayer<P>(fc: GeoJSON.FeatureCollection, h: { tooltip: (p: P) => string; click: (p: P) => void; restyle: (path: L.Path, p: P) => void; hoverWeight: number }) {
  return L.geoJSON(fc, {
    onEachFeature: (f, lyr) => {
      const p = f.properties as P;
      lyr.bindTooltip(() => h.tooltip(p), { sticky: true, direction: "top" });
      lyr.on({
        click: () => h.click(p),
        mouseover: (e) => (e.target as L.Path).setStyle({ weight: h.hoverWeight, color: colors().gold }),
        mouseout: (e) => h.restyle(e.target as L.Path, p),
      });
    },
  });
}

export function DistrictMap({
  data, valueOf, scale, tooltip, selectedId, onSelect, className,
  regions, regionValue, regionScale, regionTooltip, currentRegion, onRegion, onLevel,
}: {
  data: DistrictCollection | undefined;
  valueOf: (p: DistrictProps) => number | null;
  scale: number[];
  tooltip: (p: DistrictProps) => string;
  selectedId: number | null;
  onSelect: (p: DistrictProps) => void;
  /** Height (default "h-[600px]"); responsive classes work, e.g. "h-[440px] sm:h-[600px]". */
  className?: string;
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
  // latest props for Leaflet's handlers; a layout effect runs after render and before every effect below
  useLayoutEffect(() => {
    cb.current = { onSelect, valueOf, tooltip, scale, selectedId, regionValue, regionScale, regionTooltip, currentRegion, onRegion, regions, onLevel };
  });

  const restyle = (path: L.Path, p: DistrictProps) => paint(path, cb.current.valueOf(p), cb.current.scale, p.id === cb.current.selectedId, 1);
  const styleRegion = (path: L.Path, r: RegionProps) => paint(path, cb.current.regionValue(r), cb.current.regionScale, r.region === cb.current.currentRegion, 1.2);
  const restyleAll = () => eachFeature(layer.current, restyle);
  const restyleRegions = () => eachFeature(cityLayer.current, styleRegion);

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

  function drawRegions() {
    const m = map.current;
    const fc = cb.current.regions;
    if (!m || !fc) return;
    cityLayer.current?.remove();
    cityLayer.current = interactiveLayer<RegionProps>(fc, {
      tooltip: (r) => cb.current.regionTooltip(r), click: (r) => cb.current.onRegion(r), restyle: styleRegion, hoverWeight: 3,
    });
    restyleRegions();
    applyLevel();
  }

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 }).setView(...START_VIEW);
    map.current = m;
    // Base tiles: OSM standard for development. Production sets NEXT_PUBLIC_TILE_URL (+ _ATTRIBUTION) to a hosted provider
    // (MapTiler, Stadia…) or self-hosted tiles: OSM's policy does not allow production traffic. The districts draw without it.
    L.tileLayer(process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || "&copy; OpenStreetMap", maxZoom: 18,
    }).addTo(m);
    m.on("zoomend", applyLevel);

    // "Kingdom" button under the zoom control
    const Kingdom = L.Control.extend({
      onAdd: () => {
        const b = L.DomUtil.create("button", "leaflet-bar");
        b.type = "button";
        b.title = "عرض المملكة";
        b.setAttribute("aria-label", "عرض المملكة");
        b.innerHTML = '<i class="ti ti-world" style="font-size:17px;line-height:30px" aria-hidden="true"></i>';
        Object.assign(b.style, { width: "34px", height: "34px", background: "var(--surface)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--ink)" });
        L.DomEvent.on(b, "click", (e) => { L.DomEvent.stop(e); m.flyTo(KINGDOM_VIEW[0], KINGDOM_VIEW[1], { duration: 0.8 }); });
        return b;
      },
    });
    new Kingdom({ position: "topleft" }).addTo(m);

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // districts of the current city: rebuilt only when the dataset (city/type) changes
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    layer.current?.remove();
    layer.current = interactiveLayer<DistrictProps>(data, {
      tooltip: (p) => cb.current.tooltip(p), click: (p) => cb.current.onSelect(p), restyle, hoverWeight: 2.5,
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

  return <div dir="ltr" ref={el} className={cn("relative isolate z-0 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2", className ?? "h-[600px]")} />;
}

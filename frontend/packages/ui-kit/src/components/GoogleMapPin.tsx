"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import {
  googleMapsApiKey,
  loadGoogleMapsApi,
  reverseGeocodeLocation,
} from "../lib/google-maps-loader";

const PIN_ZOOM = 16;
const OVERVIEW_ZOOM = 6;
const SAUDI_CENTER = { lat: 24.2, lng: 45.0 };

export type GoogleMapContextPin = {
  lat: number;
  lng: number;
  title?: string;
  /** Short label shown in the marker tooltip / info window. */
  label?: string;
};

export type GoogleMapLocationDetail = {
  lat: number;
  lng: number;
  formattedAddress?: string;
  city?: string;
  district?: string;
};

function parsePin(
  lat?: number | null,
  lng?: number | null,
): { lat: number; lng: number } | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GoogleMapLocationDetail> {
  return reverseGeocodeLocation(lat, lng);
}

/** Google Maps needs the network — the offline stand-in when no hint is given. */
const MAP_OFFLINE_MESSAGE =
  "الخريطة تحتاج اتصالاً بالشبكة — تظهر تلقائياً عند عودة الاتصال.";

export function GoogleMapPin({
  lat,
  lng,
  className,
  title = "خريطة موقع العقار",
  interactive = false,
  disabled = false,
  mapTypeControl = false,
  pinLabel,
  contextPins,
  initialCenter,
  viewCenter,
  viewEpoch = 0,
  resolvePlace = false,
  onCoordsChange,
  onLocationDetail,
  offlineHint,
}: {
  lat?: number | null;
  lng?: number | null;
  className?: string;
  title?: string;
  /** Click the map or drag the pin to choose coordinates. */
  interactive?: boolean;
  disabled?: boolean;
  /** Show satellite / roadmap switcher. */
  mapTypeControl?: boolean;
  /** Caption for the primary pin (info window). */
  pinLabel?: string;
  /** Other pins shown for context (not draggable). */
  contextPins?: GoogleMapContextPin[];
  /** Map center when the primary pin is not placed yet. */
  initialCenter?: { lat: number; lng: number } | null;
  /** Pan here without moving the primary pin (e.g. return to the subject). */
  viewCenter?: { lat: number; lng: number } | null;
  viewEpoch?: number;
  /** Reverse-geocode after pick / when coords change and call onLocationDetail. */
  resolvePlace?: boolean;
  onCoordsChange?: (lat: number, lng: number) => void;
  onLocationDetail?: (detail: GoogleMapLocationDetail) => void;
  /**
   * Shown instead of the map while the device is offline (Google Maps needs the
   * network) — e.g. point the user to a GPS capture that works without it. The map
   * loads by itself once the connection returns.
   */
  offlineHint?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const contextMarkersRef = useRef<google.maps.Marker[]>([]);
  const picking = Boolean(interactive && !disabled && onCoordsChange);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const onCoordsChangeRef = useRef(onCoordsChange);
  onCoordsChangeRef.current = onCoordsChange;
  const onLocationDetailRef = useRef(onLocationDetail);
  onLocationDetailRef.current = onLocationDetail;
  const resolvePlaceRef = useRef(resolvePlace);
  resolvePlaceRef.current = resolvePlace;
  const pinLabelRef = useRef(pinLabel);
  pinLabelRef.current = pinLabel;
  const coordsRef = useRef({ lat, lng });
  coordsRef.current = { lat, lng };
  const initialCenterRef = useRef(initialCenter);
  initialCenterRef.current = initialCenter;
  const [mapReady, setMapReady] = useState(false);
  /** Bumped when the network returns after an offline failure — reloads the map. */
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [waitingForNetwork, setWaitingForNetwork] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    googleMapsApiKey()
      ? null
      : "أضف NEXT_PUBLIC_GOOGLE_MAPS_API_KEY لتفعيل خريطة Google.",
  );

  const emitPick = (latVal: number, lngVal: number) => {
    onCoordsChangeRef.current?.(latVal, lngVal);
    if (!resolvePlaceRef.current) return;
    void reverseGeocode(latVal, lngVal).then((detail) => {
      onLocationDetailRef.current?.(detail);
    });
  };

  const openPrimaryInfo = (g: typeof google, position: google.maps.LatLngLiteral) => {
    const label = pinLabelRef.current?.trim();
    if (!label) {
      infoRef.current?.close();
      return;
    }
    if (!infoRef.current) {
      infoRef.current = new g.maps.InfoWindow();
    }
    infoRef.current.setContent(
      `<div style="font:600 12px/1.4 Tajawal,system-ui,sans-serif;max-width:220px;color:#12284C">${label.replace(/</g, "&lt;")}</div>`,
    );
    infoRef.current.setPosition(position);
    if (mapRef.current) {
      infoRef.current.open({
        map: mapRef.current,
        shouldFocus: false,
      });
    }
  };

  useEffect(() => {
    if (!googleMapsApiKey()) return;

    let cancelled = false;
    loadGoogleMapsApi()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const pin = parsePin(coordsRef.current.lat, coordsRef.current.lng);
        const seed = parsePin(
          initialCenterRef.current?.lat,
          initialCenterRef.current?.lng,
        );
        const center = pin ?? seed ?? SAUDI_CENTER;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom: pin || seed ? PIN_ZOOM : OVERVIEW_ZOOM,
          mapTypeId: "hybrid",
          mapTypeControl,
          mapTypeControlOptions: mapTypeControl
            ? {
                style: g.maps.MapTypeControlStyle.DROPDOWN_MENU,
                mapTypeIds: ["roadmap", "hybrid", "satellite", "terrain"],
              }
            : undefined,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          scaleControl: true,
          gestureHandling: pickingRef.current ? "greedy" : "cooperative",
        });
        mapRef.current = map;
        const marker = new g.maps.Marker({
          map: pin ? map : undefined,
          position: pin ?? undefined,
          draggable: pickingRef.current,
          title: title,
          zIndex: 1000,
        });
        markerRef.current = marker;

        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (!pickingRef.current) return;
          const pos = event.latLng;
          if (!pos) return;
          marker.setMap(map);
          marker.setPosition(pos);
          map.panTo(pos);
          if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM);
          const latVal = pos.lat();
          const lngVal = pos.lng();
          openPrimaryInfo(g, { lat: latVal, lng: lngVal });
          emitPick(latVal, lngVal);
        });

        marker.addListener("dragend", () => {
          if (!pickingRef.current) return;
          const pos = marker.getPosition();
          if (!pos) return;
          openPrimaryInfo(g, { lat: pos.lat(), lng: pos.lng() });
          emitPick(pos.lat(), pos.lng());
        });

        marker.addListener("click", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          openPrimaryInfo(g, { lat: pos.lat(), lng: pos.lng() });
        });

        if (pin && pinLabelRef.current?.trim()) {
          openPrimaryInfo(g, pin);
        }

        if (pin && resolvePlaceRef.current) {
          void reverseGeocode(pin.lat, pin.lng).then((detail) => {
            if (!cancelled) onLocationDetailRef.current?.(detail);
          });
        }

        if (!cancelled) {
          setError(null);
          setMapReady(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Offline is not a setup problem: say what works now and retry on reconnect.
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setWaitingForNetwork(true);
          setError(offlineHint ?? MAP_OFFLINE_MESSAGE);
          return;
        }
        setError(
          "تعذّر تحميل خريطة Google — تحقق من مفتاح API وإعادة تشغيل الواجهة.",
        );
      });

    return () => {
      cancelled = true;
      setMapReady(false);
      infoRef.current?.close();
      infoRef.current = null;
      for (const m of contextMarkersRef.current) m.setMap(null);
      contextMarkersRef.current = [];
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
    // mapTypeControl / title are setup-time options
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);

  useEffect(() => {
    if (!waitingForNetwork) return;
    const onOnline = () => {
      setWaitingForNetwork(false);
      setError(null);
      setLoadAttempt((n) => n + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [waitingForNetwork]);

  useEffect(() => {
    markerRef.current?.setDraggable(picking);
  }, [picking]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const pin = parsePin(lat, lng);
    if (!pin) {
      marker.setMap(null);
      infoRef.current?.close();
      return;
    }
    marker.setMap(map);
    marker.setPosition(pin);
    map.panTo(pin);
    if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM);
  }, [lat, lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewEpoch || !viewCenter) return;
    if (!Number.isFinite(viewCenter.lat) || !Number.isFinite(viewCenter.lng)) {
      return;
    }
    map.panTo(viewCenter);
    if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM);
  }, [viewEpoch, viewCenter, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    const g = window.google;
    for (const m of contextMarkersRef.current) m.setMap(null);
    contextMarkersRef.current = [];
    const pins = contextPins ?? [];
    for (const p of pins) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const m = new g.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: p.title ?? p.label ?? "مقارن في البنك",
        opacity: 0.72,
        zIndex: 100,
        label: p.label
          ? {
              text: p.label.slice(0, 2),
              color: "#fff",
              fontSize: "10px",
              fontWeight: "700",
            }
          : undefined,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#378add",
          fillOpacity: 0.95,
          strokeColor: "#fff",
          strokeWeight: 1.5,
        },
      });
      if (p.title || p.label) {
        const iw = new g.maps.InfoWindow({
          content: `<div style="font:600 11px/1.4 Tajawal,system-ui,sans-serif;max-width:200px;color:#12284C">${(p.title ?? p.label ?? "").replace(/</g, "&lt;")}</div>`,
        });
        m.addListener("click", () => iw.open({ map, anchor: m }));
      }
      contextMarkersRef.current.push(m);
    }
  }, [contextPins, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !window.google?.maps) return;
    const pos = marker.getPosition();
    const label = pinLabel?.trim();
    if (!pos || !label) {
      infoRef.current?.close();
      return;
    }
    // Update caption only — do not reopen the info window (would steal input focus).
    if (!infoRef.current) {
      infoRef.current = new window.google.maps.InfoWindow();
    }
    infoRef.current.setContent(
      `<div style="font:600 12px/1.4 Tajawal,system-ui,sans-serif;max-width:220px;color:#12284C">${label.replace(/</g, "&lt;")}</div>`,
    );
    infoRef.current.setPosition({ lat: pos.lat(), lng: pos.lng() });
  }, [pinLabel]);

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-surface-2 px-4 text-center text-[12px] text-text-3",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role={picking ? "application" : "img"}
      aria-label={
        picking ? `${title} — اضغط على الخريطة لتحديد الموقع` : title
      }
      className={cn("h-full w-full", picking && "cursor-crosshair", className)}
    />
  );
}

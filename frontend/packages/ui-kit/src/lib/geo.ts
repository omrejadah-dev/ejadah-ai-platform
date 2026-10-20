import { toLatinDigits } from "./arabic-digits";

/** A point on earth in decimal degrees. */
export type LatLng = { lat: number; lng: number };

/** Which half of a pair a single value is — sets the allowed range. */
export type CoordinateAxis = "lat" | "lng";

const AXIS_LIMIT: Record<CoordinateAxis, number> = { lat: 90, lng: 180 };

/** One decimal number: optional sign, digits, optional fraction. Nothing else. */
const DECIMAL = /^[-+]?\d+(?:\.\d+)?$/;

/** Pair separator: «،» or "," (with optional spaces around it), or whitespace alone. */
const PAIR_SEPARATOR = /\s*[,،]\s*|\s+/;

const EARTH_RADIUS_KM = 6371;

/** Latin digits, «٫» → ".", U+2212 minus → "-", bidi marks dropped, trimmed. */
function normalizeCoordinateText(text: string): string {
  return toLatinDigits(text)
    .replace(/[\u200E\u200F\u061C\u202A-\u202E]/g, "")
    .replace(/٫/g, ".")
    .replace(/\u2212/g, "-")
    .trim();
}

/**
 * One coordinate typed, pasted or stored as text/number. Accepts Arabic/Persian digits and «٫» or "."
 * as the decimal point. Any other character ("21.5abc", "21,5") → null. Out of range → null
 * (lat ±90, lng ±180; without an axis the wider ±180 applies).
 */
export function parseCoordinate(
  value: string | number | null | undefined,
  axis?: CoordinateAxis,
): number | null {
  if (value == null) return null;
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else {
    const text = normalizeCoordinateText(value);
    if (!DECIMAL.test(text)) return null;
    n = Number(text);
  }
  if (!Number.isFinite(n)) return null;
  const limit = AXIS_LIMIT[axis ?? "lng"];
  return Math.abs(n) <= limit ? n : null;
}

/** Latitude + longitude held in two fields. 0,0 (an unset default) counts as missing. */
export function parseLatLng(
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): LatLng | null {
  const lat = parseCoordinate(latitude, "lat");
  const lng = parseCoordinate(longitude, "lng");
  if (lat == null || lng == null) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * «lat, lng» in one text (Google Maps copies "24.7136, 46.6753"). Separator: «،», "," or whitespace.
 * Exactly two numbers, each read by {@link parseCoordinate}; 0,0 → null.
 */
export function parseCoordinatePair(text: string | null | undefined): LatLng | null {
  const normalized = normalizeCoordinateText(text ?? "");
  if (!normalized) return null;
  const parts = normalized.split(PAIR_SEPARATOR);
  if (parts.length !== 2) return null;
  return parseLatLng(parts[0], parts[1]);
}

/** Great-circle distance in kilometres (mean earth radius 6371 km). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** {@link haversineKm} in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

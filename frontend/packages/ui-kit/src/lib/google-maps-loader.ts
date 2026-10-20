let loadPromise: Promise<typeof google> | null = null;

export function googleMapsApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

export function googleMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export type ReverseGeocodeDetail = {
  lat: number;
  lng: number;
  formattedAddress?: string;
  city?: string;
  district?: string;
};

type ReverseGeocodePayload = {
  locality?: string;
  city?: string;
  countryName?: string;
  principalSubdivision?: string;
  plusCode?: string;
  localityInfo?: {
    administrative?: Array<{ name?: string; adminLevel?: number }>;
    informative?: Array<{ name?: string; description?: string }>;
  };
};

const HAYY_PREFIX = /^حي\s+/;
const SKIP_PLACE_PREFIX =
  /^(بلدية|أمانة|محافظة|منطقة|قارة|بحر|محيط|دولة)/;

function cleanPlaceName(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(HAYY_PREFIX, "").trim();
}

function isUsableDistrict(
  name: string,
  city: string,
  region: string,
  country: string,
): boolean {
  if (!name) return false;
  if (name === city || name === region || name === country) return false;
  if (SKIP_PLACE_PREFIX.test(name)) return false;
  if (name.includes("/")) return false;
  return true;
}

/** Pick city + neighbourhood from BigDataCloud (or similar) reverse-geocode JSON. */
export function placeFromReverseGeocodePayload(data: ReverseGeocodePayload): {
  city?: string;
  district?: string;
  formattedAddress?: string;
} {
  const admin = data.localityInfo?.administrative ?? [];
  const byLevel = (level: number) =>
    cleanPlaceName(admin.find((a) => a.adminLevel === level)?.name);

  const region = cleanPlaceName(data.principalSubdivision);
  const country = cleanPlaceName(data.countryName);
  const city =
    cleanPlaceName(data.city) ||
    byLevel(8) ||
    byLevel(6) ||
    region ||
    "";

  const district =
    [...admin]
      .map((a) => ({
        name: cleanPlaceName(a.name),
        level: a.adminLevel ?? 0,
      }))
      .filter(
        (a) =>
          a.level >= 9 && isUsableDistrict(a.name, city, region, country),
      )
      .sort((a, b) => b.level - a.level)[0]?.name ||
    (isUsableDistrict(cleanPlaceName(data.locality), city, region, country)
      ? cleanPlaceName(data.locality)
      : "");

  const formattedAddress = [district, city, region]
    .filter((p, i, arr) => p && arr.indexOf(p) === i)
    .join("، ");

  return {
    city: city || undefined,
    district: district || undefined,
    formattedAddress: formattedAddress || data.plusCode || undefined,
  };
}

/**
 * Client-side reverse geocode (no Google Geocoding API — avoids requiring that
 * billed/enabled product on the Maps key). Uses BigDataCloud's free client endpoint.
 */
export async function reverseGeocodeLocation(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeDetail> {
  const base: ReverseGeocodeDetail = { lat, lng };
  try {
    const url = new URL(
      "https://api.bigdatacloud.net/data/reverse-geocode-client",
    );
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("localityLanguage", "ar");
    const res = await fetch(url.toString());
    if (!res.ok) return base;
    const data = (await res.json()) as ReverseGeocodePayload;
    const place = placeFromReverseGeocodePayload(data);
    return { ...base, ...place };
  } catch {
    return base;
  }
}

export function loadGoogleMapsApi(): Promise<typeof google> {
  const key = googleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
  }

  if (typeof window !== "undefined" && window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const callbackName = `__ejadaGmapsInit_${Date.now()}`;
      const script = document.createElement("script");
      // `loading=async` is required by Google's current loader guidance.
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${callbackName}`;
      script.async = true;
      script.defer = true;

      const finishOk = () => {
        if (window.google?.maps) {
          resolve(window.google);
        } else {
          loadPromise = null;
          reject(new Error("Google Maps failed to load"));
        }
      };

      (window as unknown as Record<string, unknown>)[callbackName] = () => {
        delete (window as unknown as Record<string, unknown>)[callbackName];
        finishOk();
      };

      script.onerror = () => {
        delete (window as unknown as Record<string, unknown>)[callbackName];
        // Drop the failed tag so a retry (e.g. after reconnecting) starts clean.
        script.remove();
        loadPromise = null;
        reject(new Error("Google Maps script error"));
      };
      document.head.appendChild(script);
    });
  }

  return loadPromise;
}

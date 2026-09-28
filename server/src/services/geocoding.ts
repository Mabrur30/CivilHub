import { findDistrict } from "../utils/bdLocations";

/**
 * Address search and reverse lookup through OpenStreetMap's Nominatim, kept
 * on the server so the browser never calls it directly. Nominatim's usage
 * policy asks for at most one request a second, a real User-Agent and
 * caching, so every call goes through one queue and a day-long cache.
 */

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  /** One of the 64 districts, when the address names one we recognise. */
  district: string | null;
  area: string | null;
}

interface NominatimAddress {
  state_district?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  quarter?: string;
  road?: string;
}

interface NominatimPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
}

interface GeocodingError extends Error {
  statusCode: number;
}

const geocodingError = (message: string, statusCode: number): GeocodingError => {
  const error = new Error(message) as GeocodingError;
  error.statusCode = statusCode;
  return error;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 500;
const MIN_GAP_MS = 1100;

const cache = new Map<string, { expires: number; value: unknown }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const baseUrl = (): string =>
  (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");

const userAgent = (): string =>
  `CivilHub/1.0 (${process.env.NOMINATIM_CONTACT || "support@civilhub.app"})`;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches one Nominatim path, spaced at least a second from the last call. */
const fetchNominatim = async (path: string): Promise<unknown> => {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.value;

  const run = async (): Promise<unknown> => {
    const gap = lastRequestAt + MIN_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    lastRequestAt = Date.now();
    let response: Response;
    try {
      response = await fetch(`${baseUrl()}${path}`, {
        headers: { "User-Agent": userAgent(), Accept: "application/json" },
      });
    } catch {
      throw geocodingError("Map search is unavailable right now.", 502);
    }
    if (!response.ok) {
      throw geocodingError("Map search is unavailable right now.", 502);
    }
    return response.json();
  };

  const result = queue.then(run, run);
  // A failed lookup must not stall the ones queued behind it.
  queue = result.catch(() => undefined);
  const value = await result;

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(path, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
};

export const toGeocodeResult = (place: NominatimPlace): GeocodeResult | null => {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = place.address ?? {};
  const district =
    findDistrict(address.state_district) ??
    findDistrict(address.county) ??
    findDistrict(address.city);
  const area =
    address.suburb ??
    address.neighbourhood ??
    address.quarter ??
    address.city_district ??
    address.town ??
    address.village ??
    null;
  return {
    label: place.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat,
    lng,
    district: district?.name ?? null,
    area,
  };
};

export const searchPlaces = async (query: string): Promise<GeocodeResult[]> => {
  const q = query.trim();
  if (q.length < 3) return [];
  if (q.length > 200) throw geocodingError("Search is too long.", 400);
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "bd",
    limit: "6",
    "accept-language": "en",
  });
  const body = await fetchNominatim(`/search?${params.toString()}`);
  if (!Array.isArray(body)) return [];
  return body
    .map((place) => toGeocodeResult(place as NominatimPlace))
    .filter((place): place is GeocodeResult => place !== null);
};

export const reverseGeocode = async (
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw geocodingError("Invalid coordinates.", 400);
  }
  // Rounded to about 10 m so nearby taps share a cache entry.
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lng.toFixed(4),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "16",
    "accept-language": "en",
  });
  const body = await fetchNominatim(`/reverse?${params.toString()}`);
  if (typeof body !== "object" || body === null || "error" in body) return null;
  return toGeocodeResult(body as NominatimPlace);
};

/** Test hook: forget cached answers and the rate-limit clock. */
export const resetGeocodingCache = (): void => {
  cache.clear();
  lastRequestAt = 0;
  queue = Promise.resolve();
};

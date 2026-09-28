export interface LatLng {
  lat: number;
  lng: number;
}

/** A brief's site as everyone sees it: an area circle, never the pin. */
export interface PublicSite {
  division: string;
  district: string;
  area: string;
  approx: LatLng;
  radiusM: number;
  vehicleAccess: string | null;
  utilities: string[];
  documentsAvailable: string[];
}

/** What the client and the hired engineer see on top of the public site. */
export interface PrivateSite extends PublicSite {
  exact: LatLng;
  addressLine: string;
  directions: string;
}

export const isPrivateSite = (site: PublicSite | PrivateSite | null): site is PrivateSite =>
  site !== null && "exact" in site;

const isLatLng = (value: unknown): value is LatLng =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as LatLng).lat === "number" &&
  typeof (value as LatLng).lng === "number";

export const toSite = (value: unknown): PublicSite | PrivateSite | null => {
  if (typeof value !== "object" || value === null) return null;
  const site = value as PublicSite;
  if (typeof site.district !== "string" || !isLatLng(site.approx)) return null;
  return site;
};

/** Directions and satellite view, opened in Google Maps. */
export const googleMapsUrl = ({ lat, lng }: LatLng): string =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const siteLabel = (site: Pick<PublicSite, "area" | "district">): string =>
  site.area.toLowerCase().includes(site.district.toLowerCase())
    ? site.area
    : `${site.area}, ${site.district}`;

/** The cost estimator's cities, as districts for the site picker. */
export const COST_ESTIMATOR_DISTRICTS: Record<string, string> = {
  dhaka: "Dhaka",
  chattogram: "Chattogram",
  cumilla: "Cumilla",
  "narayanganj-city": "Narayanganj",
  gazipur: "Gazipur",
};

/** Where a map opens before anything is pinned: central Dhaka. */
export const DEFAULT_MAP_CENTER: LatLng = { lat: 23.7808, lng: 90.3994 };

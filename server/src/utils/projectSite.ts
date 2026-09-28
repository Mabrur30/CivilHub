import { findDistrict } from "./bdLocations";
import { type CriteriaOption } from "./projectCriteria";

/** GeoJSON point: coordinates are [longitude, latitude]. */
export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface ProjectSite {
  division: string;
  district: string;
  area: string;
  /** The real pin. Only the client and the hired engineer see it. */
  point: GeoPoint;
  /** A nearby point, fixed at posting, that the public map circles. */
  approxPoint: GeoPoint;
  addressLine?: string;
  directions?: string;
  vehicleAccess?: string;
  utilities: string[];
  documentsAvailable: string[];
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PublicSiteResponse {
  division: string;
  district: string;
  area: string;
  approx: LatLng;
  /** Metres around `approx` that the public map shades. */
  radiusM: number;
  vehicleAccess: string | null;
  utilities: string[];
  documentsAvailable: string[];
}

export interface PrivateSiteResponse extends PublicSiteResponse {
  exact: LatLng;
  addressLine: string;
  directions: string;
}

export const APPROX_RADIUS_M = 500;
// The public point sits this far from the real one, always inside the circle.
const JITTER_MIN_M = 150;
const JITTER_MAX_M = 400;

// Bangladesh with a little margin for coastal and border sites.
const BD_BOUNDS = { minLat: 20.3, maxLat: 26.8, minLng: 87.9, maxLng: 92.8 };

export const SITE_OPTIONS = {
  vehicleAccess: [
    { value: "yes", label: "Trucks can reach the site" },
    { value: "limited", label: "Small vehicles only" },
    { value: "no", label: "No vehicle access" },
  ],
  utilities: [
    { value: "electricity", label: "Electricity" },
    { value: "water", label: "Water supply" },
    { value: "gas", label: "Gas" },
    { value: "sewer", label: "Sewer" },
  ],
  documentsAvailable: [
    { value: "land_deed", label: "Land deed & mutation" },
    { value: "mouza_map", label: "Mouza map or survey (CS/RS/BS)" },
    { value: "soil_report", label: "Soil test report" },
    { value: "architectural", label: "Architectural drawings" },
    { value: "structural", label: "Structural drawings" },
    { value: "approval_letter", label: "Approval letter" },
  ],
} satisfies Record<string, CriteriaOption[]>;

interface SiteError extends Error {
  statusCode: number;
}

const siteError = (message: string): SiteError => {
  const error = new Error(message) as SiteError;
  error.statusCode = 400;
  return error;
};

const toPoint = ({ lat, lng }: LatLng): GeoPoint => ({
  type: "Point",
  coordinates: [lng, lat],
});

const fromPoint = (point: GeoPoint): LatLng => ({
  lat: point.coordinates[1],
  lng: point.coordinates[0],
});

const round = (value: number, places: number): number =>
  Math.round(value * 10 ** places) / 10 ** places;

const METRES_PER_DEGREE = 111_320;

/**
 * Moves a point 150–400 m in a random direction. Stored once when the brief
 * is posted, so fetching it again and again can't average back to the site.
 */
export const jitterPoint = (
  { lat, lng }: LatLng,
  random: () => number = Math.random,
): LatLng => {
  const distance = JITTER_MIN_M + random() * (JITTER_MAX_M - JITTER_MIN_M);
  const bearing = random() * 2 * Math.PI;
  const dLat = (distance * Math.cos(bearing)) / METRES_PER_DEGREE;
  const dLng =
    (distance * Math.sin(bearing)) /
    (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  return { lat: round(lat + dLat, 4), lng: round(lng + dLng, 4) };
};

/** Great-circle distance in metres, for tests and sanity checks. */
export const distanceM = (a: LatLng, b: LatLng): number => {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

const optionalText = (
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw siteError(`${label} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) {
    throw siteError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return text || undefined;
};

const pickList = (
  value: unknown,
  options: CriteriaOption[],
  label: string,
): string[] => {
  if (value === undefined || value === null) return [];
  const allowed = options.map((option) => option.value);
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string" && allowed.includes(entry))
  ) {
    throw siteError(`Choose valid options for ${label}.`);
  }
  return [...new Set(value as string[])];
};

/** Validates the posted site and fixes its public approximate point. */
export const parseSiteInput = (
  input: unknown,
  random: () => number = Math.random,
): ProjectSite => {
  if (typeof input !== "object" || input === null) {
    throw siteError("Pin the site on the map.");
  }
  const raw = input as Record<string, unknown>;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (
    raw.lat === undefined ||
    raw.lng === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw siteError("Pin the site on the map.");
  }
  if (
    lat < BD_BOUNDS.minLat ||
    lat > BD_BOUNDS.maxLat ||
    lng < BD_BOUNDS.minLng ||
    lng > BD_BOUNDS.maxLng
  ) {
    throw siteError("The pin must be inside Bangladesh.");
  }

  const district = findDistrict(
    typeof raw.district === "string" ? raw.district : null,
  );
  if (!district) throw siteError("Choose the site's district.");

  const area = optionalText(raw.area, "Area", 120);
  if (!area) throw siteError("Add the area, thana or upazila.");

  const vehicleAccess =
    raw.vehicleAccess === undefined || raw.vehicleAccess === null || raw.vehicleAccess === ""
      ? undefined
      : String(raw.vehicleAccess);
  if (
    vehicleAccess !== undefined &&
    !SITE_OPTIONS.vehicleAccess.some((option) => option.value === vehicleAccess)
  ) {
    throw siteError("Choose how vehicles reach the site.");
  }

  const exact = { lat: round(lat, 6), lng: round(lng, 6) };
  return {
    division: district.division,
    district: district.name,
    area,
    point: toPoint(exact),
    approxPoint: toPoint(jitterPoint(exact, random)),
    addressLine: optionalText(raw.addressLine, "Address", 200),
    directions: optionalText(raw.directions, "Directions", 500),
    vehicleAccess,
    utilities: pickList(raw.utilities, SITE_OPTIONS.utilities, "utilities"),
    documentsAvailable: pickList(
      raw.documentsAvailable,
      SITE_OPTIONS.documentsAvailable,
      "documents",
    ),
  };
};

/** "Mirpur, Dhaka": the short location older screens and search still use. */
export const siteLocationLabel = (site: Pick<ProjectSite, "area" | "district">): string =>
  site.area.toLowerCase().includes(site.district.toLowerCase())
    ? site.area
    : `${site.area}, ${site.district}`;

export const toPublicSite = (
  site: ProjectSite | null | undefined,
): PublicSiteResponse | null =>
  site?.approxPoint
    ? {
        division: site.division,
        district: site.district,
        area: site.area,
        approx: fromPoint(site.approxPoint),
        radiusM: APPROX_RADIUS_M,
        vehicleAccess: site.vehicleAccess ?? null,
        utilities: site.utilities ?? [],
        documentsAvailable: site.documentsAvailable ?? [],
      }
    : null;

export const toPrivateSite = (
  site: ProjectSite | null | undefined,
): PrivateSiteResponse | null => {
  const publicSite = toPublicSite(site);
  if (!publicSite || !site?.point) return null;
  return {
    ...publicSite,
    exact: fromPoint(site.point),
    addressLine: site.addressLine ?? "",
    directions: site.directions ?? "",
  };
};

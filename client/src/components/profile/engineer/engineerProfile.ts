import { formatCurrency } from "../../../lib/format";
import { type ProfileListing } from "../shared/profileTypes";
import { type OwnVerificationStatus } from "../../verification/GetVerifiedLink";

import { API_BASE_URL } from "../../../lib/apiBase";
export { API_BASE_URL };

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const CERTIFICATE_TYPES = [...IMAGE_TYPES, "application/pdf"];
export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const CERTIFICATE_LIMIT = 10 * 1024 * 1024;

export type ConnectionStatus =
  | "not_connected"
  | "pending_sent"
  | "pending_received"
  | "connected";

export interface EngineerPortfolioItem {
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: string;
}

export interface EngineerCertificateItem {
  title: string;
  uploadedAt: string;
  /** Anyone signed in can open it; CivilHub doesn't verify it yet. */
  fileUrl?: string;
}

export interface CompletedWorkItem {
  id: string;
  title: string;
  category: string;
  location: string | null;
  completedAt: string;
}

export interface EngineerEducationItem {
  id: string;
  institution: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

export interface EngineerExperienceItem {
  id: string;
  title: string | null;
  organization: string | null;
  startYear: number | null;
  endYear: number | null;
  description: string | null;
}

export interface EngineerPublicProfile {
  userId: string;
  name: string;
  role: "engineer";
  profilePhotoUrl: string | null;
  bio: string;
  rating: number | null;
  reviewCount: number;
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
  /** The viewer has blocked this person. */
  blockedByMe?: boolean;
  /** Either side blocked the other: nothing to connect, message or invite. */
  blockedEitherWay?: boolean;
  connectionsCount: number;
  startingRateMin: number | null;
  startingRateMax: number | null;
  location: string | null;
  education: EngineerEducationItem[];
  experience: EngineerExperienceItem[];
  /** How many bids they've won; amounts stay private. */
  acceptedBidCount: number;
  derivedLocation: string | null;
  completedLocationProjectCount: number;
  portfolio: EngineerPortfolioItem[];
  certificates: EngineerCertificateItem[];
  completedWork: CompletedWorkItem[];
  memberSince?: string;
  /** Verified by CivilHub, and since when. */
  verified?: boolean;
  verifiedAt?: string | null;
  /** Only on the owner's own profile: where their verification request stands. */
  ownVerificationStatus?: OwnVerificationStatus;
  disciplines?: string[];
  equipment?: ProfileListing[];
  /** Which reviews the headline rating comes from. */
  ratingKind?: "project" | "equipment" | null;
}

/** The owner's own copy from /api/engineers/me, with ids for editing. */
export interface OwnEngineerData {
  startingRateMin: number | null;
  startingRateMax: number | null;
  location: string | null;
  education: Array<Omit<EngineerEducationItem, "id"> & { _id: string }>;
  experience: Array<Omit<EngineerExperienceItem, "id"> & { _id: string }>;
  certificates: Array<{ _id: string; title: string; fileUrl: string; uploadedAt: string }>;
  portfolio: Array<{
    _id: string;
    title: string;
    description: string;
    imageUrl: string;
    uploadedAt: string;
  }>;
}

/** A portfolio item as the page shows it; `id` is set only for the owner. */
export interface PortfolioEntry extends EngineerPortfolioItem {
  id: string | null;
}

/** A certificate as the page shows it; `id` is set only for the owner. */
export interface CertificateEntry {
  id: string | null;
  title: string;
  uploadedAt: string;
  fileUrl: string | null;
}

type Guard<T> = (value: unknown) => value is T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isStringOrNull = (value: unknown): boolean =>
  typeof value === "string" || value === null;
const isNumberOrNull = (value: unknown): boolean =>
  typeof value === "number" || value === null;
const isArrayOf = <T>(value: unknown, guard: Guard<T>): value is T[] =>
  Array.isArray(value) && value.every(guard);

const isPortfolioItem: Guard<EngineerPortfolioItem> = (value): value is EngineerPortfolioItem =>
  isRecord(value) &&
  typeof value.title === "string" &&
  typeof value.description === "string" &&
  typeof value.imageUrl === "string" &&
  typeof value.uploadedAt === "string";

const isCertificateItem: Guard<EngineerCertificateItem> = (value): value is EngineerCertificateItem =>
  isRecord(value) && typeof value.title === "string" && typeof value.uploadedAt === "string";

const isCompletedWorkItem: Guard<CompletedWorkItem> = (value): value is CompletedWorkItem =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  typeof value.category === "string" &&
  isStringOrNull(value.location) &&
  typeof value.completedAt === "string";

const hasEducationFields = (value: Record<string, unknown>): boolean =>
  isStringOrNull(value.institution) &&
  isStringOrNull(value.degree) &&
  isStringOrNull(value.fieldOfStudy) &&
  isNumberOrNull(value.graduationYear);

const hasExperienceFields = (value: Record<string, unknown>): boolean =>
  isStringOrNull(value.title) &&
  isStringOrNull(value.organization) &&
  isNumberOrNull(value.startYear) &&
  isNumberOrNull(value.endYear) &&
  isStringOrNull(value.description);

const isEducationItem: Guard<EngineerEducationItem> = (value): value is EngineerEducationItem =>
  isRecord(value) && typeof value.id === "string" && hasEducationFields(value);

const isExperienceItem: Guard<EngineerExperienceItem> = (value): value is EngineerExperienceItem =>
  isRecord(value) && typeof value.id === "string" && hasExperienceFields(value);

/** The engineer-only fields of a public profile, on top of the shared ones. */
export const hasEngineerProfileFields = (profile: Record<string, unknown>): boolean =>
  isNumberOrNull(profile.startingRateMin) &&
  isNumberOrNull(profile.startingRateMax) &&
  isStringOrNull(profile.location) &&
  isArrayOf(profile.education, isEducationItem) &&
  isArrayOf(profile.experience, isExperienceItem) &&
  typeof profile.acceptedBidCount === "number" &&
  isStringOrNull(profile.derivedLocation) &&
  typeof profile.completedLocationProjectCount === "number" &&
  isArrayOf(profile.portfolio, isPortfolioItem) &&
  isArrayOf(profile.certificates, isCertificateItem) &&
  isArrayOf(profile.completedWork, isCompletedWorkItem);

const withId = (value: unknown): value is Record<string, unknown> & { _id: string } =>
  isRecord(value) && typeof value._id === "string";

const isOwnCertificate = (value: unknown): value is OwnEngineerData["certificates"][number] =>
  withId(value) &&
  typeof value.title === "string" &&
  typeof value.fileUrl === "string" &&
  typeof value.uploadedAt === "string";

const isOwnPortfolioItem = (value: unknown): value is OwnEngineerData["portfolio"][number] =>
  withId(value) && isPortfolioItem(value);

/** `{ portfolio: [...] }`, as the portfolio endpoints reply. */
export const isPortfolioResponse = (
  value: unknown,
): value is { portfolio: OwnEngineerData["portfolio"] } =>
  isRecord(value) && isArrayOf(value.portfolio, isOwnPortfolioItem);

/** `{ certificates: [...] }`, as the certificate endpoints reply. */
export const isCertificatesResponse = (
  value: unknown,
): value is { certificates: OwnEngineerData["certificates"] } =>
  isRecord(value) && isArrayOf(value.certificates, isOwnCertificate);

export const isOwnEngineerData = (value: unknown): value is OwnEngineerData =>
  isRecord(value) &&
  isNumberOrNull(value.startingRateMin) &&
  isNumberOrNull(value.startingRateMax) &&
  isStringOrNull(value.location) &&
  Array.isArray(value.education) &&
  value.education.every((entry) => withId(entry) && hasEducationFields(entry)) &&
  Array.isArray(value.experience) &&
  value.experience.every((entry) => withId(entry) && hasExperienceFields(entry)) &&
  isArrayOf(value.certificates, isOwnCertificate) &&
  isArrayOf(value.portfolio, isOwnPortfolioItem);

export const errorMessage = (body: unknown, fallback: string): string =>
  isRecord(body) && typeof body.message === "string" ? body.message : fallback;

export const CONNECTION_ERROR = "Unable to connect to CivilHub. Please try again.";

type ApiResult<T> = { data: T; error: null } | { data: null; error: string };

/** Sends a request and checks the reply's shape; errors come back as text. */
export const requestJson = async <T>(
  path: string,
  init: RequestInit,
  guard: (value: unknown) => value is T,
  fallback: string,
): Promise<ApiResult<T>> => {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...init,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !guard(body)) {
      return { data: null, error: errorMessage(body, fallback) };
    }
    return { data: body, error: null };
  } catch {
    return { data: null, error: CONNECTION_ERROR };
  }
};

export interface EngineerDetailsPayload {
  bio?: string;
  startingRateMin?: number | null;
  startingRateMax?: number | null;
  location?: string | null;
  education?: Array<{
    institution?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: number | null;
  }>;
  experience?: Array<{
    title?: string;
    organization?: string;
    startYear?: number | null;
    endYear?: number | null;
    description?: string;
  }>;
}

/** PATCH /api/engineers/me. Lists are replaced whole, so send every entry. */
export const saveEngineerDetails = (
  payload: EngineerDetailsPayload,
): Promise<ApiResult<OwnEngineerData>> =>
  requestJson(
    "/api/engineers/me",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    isOwnEngineerData,
    "Unable to save your changes.",
  );

export const toPublicEducation = (own: OwnEngineerData["education"]): EngineerEducationItem[] =>
  own.map(({ _id, ...entry }) => ({ id: _id, ...entry }));

export const toPublicExperience = (own: OwnEngineerData["experience"]): EngineerExperienceItem[] =>
  own.map(({ _id, ...entry }) => ({ id: _id, ...entry }));

/** Blank strings become undefined so the server stores nothing for them. */
export const toEducationPayload = (entry: Omit<EngineerEducationItem, "id">) => ({
  institution: entry.institution || undefined,
  degree: entry.degree || undefined,
  fieldOfStudy: entry.fieldOfStudy || undefined,
  graduationYear: entry.graduationYear,
});

export const toExperiencePayload = (entry: Omit<EngineerExperienceItem, "id">) => ({
  title: entry.title || undefined,
  organization: entry.organization || undefined,
  startYear: entry.startYear,
  endYear: entry.endYear,
  description: entry.description || undefined,
});

/** "", or a whole year from 1900 to 2100; anything else is an error. */
export const parseYear = (value: string): number | null | "invalid" => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const year = Number(trimmed);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : "invalid";
};

export const validateFile = (
  file: File | undefined,
  allowedTypes: string[],
  limit: number,
  label: string,
): string => {
  if (!file) return `Choose a file for the ${label.toLowerCase()}.`;
  if (!allowedTypes.includes(file.type)) {
    return `${label} must be a JPG, PNG, WEBP${allowedTypes.includes("application/pdf") ? " or PDF" : ""}.`;
  }
  if (file.size > limit) return `${label} must be ${limit / (1024 * 1024)}MB or smaller.`;
  return "";
};

export const formatRateRange = (min: number | null, max: number | null): string =>
  typeof min === "number" && typeof max === "number"
    ? min === max
      ? formatCurrency(min)
      : `${formatCurrency(min)} to ${formatCurrency(max)}`
    : typeof min === "number"
      ? `From ${formatCurrency(min)}`
      : `Up to ${formatCurrency(max ?? 0)}`;

export const hasStartingRate = (profile: EngineerPublicProfile): boolean =>
  typeof profile.startingRateMin === "number" || typeof profile.startingRateMax === "number";

/** "2019 – Present", "2019 – 2022", "Until 2022", or null when neither is set. */
export const formatYears = (start: number | null, end: number | null): string | null => {
  if (start !== null) return `${start} – ${end ?? "Present"}`;
  if (end !== null) return `Until ${end}`;
  return null;
};

export const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

/** What the profile checklist can ask the owner to add. */
export type EngineerTask =
  | "photo"
  | "speciality"
  | "about"
  | "location"
  | "rate"
  | "experience"
  | "portfolio"
  | "certificate";

/** Asks a section to open its editor; the nonce makes repeat clicks count. */
export interface OpenRequest {
  task: EngineerTask;
  nonce: number;
}

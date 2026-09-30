import { type CompanyService } from "../../../context/AuthContext";
import {
  type DeliveredProject,
  type ProfileListing,
} from "../shared/profileTypes";
import { type OwnVerificationStatus } from "../../verification/GetVerifiedLink";

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

export const serviceLabels: Record<CompanyService, string> = {
  equipment: "Rents out equipment",
  projects: "Takes on projects",
};

type ConnectionStatus =
  | "not_connected"
  | "pending_sent"
  | "pending_received"
  | "connected";

export interface CompanyDetails {
  userId: string;
  name: string;
  services: CompanyService[];
  logoUrl: string | null;
  about: string;
  location: string;
  serviceAreas: string[];
  specialties: string[];
  tradeLicenceNo: string;
  yearFounded: number | null;
  teamSize: TeamSize | null;
  website: string;
  phone: string;
  portfolio: Array<{
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    uploadedAt: string;
  }>;
}

export interface CompanyPublicProfile {
  userId: string;
  name: string;
  role: "organisation";
  memberSince: string;
  /** Verified by CivilHub, and since when. */
  verified?: boolean;
  verifiedAt?: string | null;
  /** Only on the owner's own profile: where their verification request stands. */
  ownVerificationStatus?: OwnVerificationStatus;
  profilePhotoUrl: string | null;
  connectionsCount: number;
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
  /** The viewer has blocked this person. */
  blockedByMe?: boolean;
  /** Either side blocked the other: nothing to connect, message or invite. */
  blockedEitherWay?: boolean;
  rating: number | null;
  reviewCount: number;
  /** Which reviews the headline rating comes from. */
  ratingKind?: "project" | "equipment" | null;
  company: CompanyDetails | null;
  completedWork: DeliveredProject[];
  equipment: ProfileListing[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isService = (value: unknown): value is CompanyService =>
  value === "equipment" || value === "projects";

export const isCompanyDetails = (value: unknown): value is CompanyDetails =>
  isRecord(value) &&
  typeof value.userId === "string" &&
  typeof value.name === "string" &&
  Array.isArray(value.services) &&
  value.services.every(isService) &&
  (typeof value.logoUrl === "string" || value.logoUrl === null) &&
  typeof value.about === "string" &&
  typeof value.location === "string" &&
  isStringList(value.serviceAreas) &&
  isStringList(value.specialties) &&
  typeof value.tradeLicenceNo === "string" &&
  (typeof value.yearFounded === "number" || value.yearFounded === null) &&
  (value.teamSize === null ||
    (TEAM_SIZES as readonly unknown[]).includes(value.teamSize)) &&
  typeof value.website === "string" &&
  typeof value.phone === "string" &&
  Array.isArray(value.portfolio);

export const isCompanyPublicProfile = (
  value: unknown,
): value is CompanyPublicProfile =>
  isRecord(value) &&
  value.role === "organisation" &&
  typeof value.userId === "string" &&
  typeof value.name === "string" &&
  typeof value.memberSince === "string" &&
  typeof value.connectionsCount === "number" &&
  typeof value.connectionStatus === "string" &&
  (value.company === null || isCompanyDetails(value.company)) &&
  Array.isArray(value.completedWork) &&
  Array.isArray(value.equipment);

export const getErrorMessage = (value: unknown, fallback: string): string =>
  isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;

/** Keeps a website clickable whether or not the company typed the scheme. */
export const websiteHref = (website: string): string =>
  /^https?:\/\//i.test(website) ? website : `https://${website}`;

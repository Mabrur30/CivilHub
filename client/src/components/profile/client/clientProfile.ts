export const CLIENT_TYPES = [
  "individual",
  "business",
  "developer",
  "institution",
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const clientTypeLabels: Record<ClientType, string> = {
  individual: "Individual",
  business: "Business",
  developer: "Property developer",
  institution: "Government or NGO",
};

export const clientTypeHints: Record<ClientType, string> = {
  individual: "Building or renovating your own place",
  business: "Premises or facilities for a company",
  developer: "Building to sell or rent",
  institution: "Public works or community projects",
};

export type ConnectionStatus =
  | "not_connected"
  | "pending_sent"
  | "pending_received"
  | "connected";

export type BidStatus = "pending" | "accepted" | "declined";

export interface ClientTrackRecord {
  projectsPosted: number;
  activeProjects: number;
  completedProjects: number;
  openProjects: number;
  hiredProjects: number;
  decidedProjects: number;
  hireRate: number | null;
  phasesDue: number;
  phasesPaid: number;
  budgetMin: number | null;
  budgetMax: number | null;
  topCategories: string[];
}

export interface ClientOpenProject {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  budgetRange: string;
  postedDate: string;
  targetStartDate: string | null;
  bidCount: number;
  myBidStatus: BidStatus | null;
}

export interface ClientCompletedProject {
  id: string;
  title: string;
  category: string;
  location: string | null;
  completedAt: string;
  engineer: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
  } | null;
}

export interface ClientPublicProfile {
  userId: string;
  name: string;
  role: "client";
  profilePhotoUrl: string | null;
  bio: string;
  rating: number | null;
  reviewCount: number;
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
  connectionsCount: number;
  companyName: string;
  clientType: ClientType | null;
  location: string | null;
  memberSince: string;
  completedProjects: number;
  stats: ClientTrackRecord;
  openProjectsList: ClientOpenProject[];
  completedWork: ClientCompletedProject[];
}

/** What only the owner sees and edits; the phone number never leaves /me. */
export interface OwnClientDetails {
  phone: string;
  companyName: string;
  bio: string;
  clientType: ClientType | null;
  location: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringOrNull = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

const isNumberOrNull = (value: unknown): value is number | null =>
  typeof value === "number" || value === null;

export const isClientType = (value: unknown): value is ClientType =>
  typeof value === "string" &&
  (CLIENT_TYPES as readonly string[]).includes(value);

const isTrackRecord = (value: unknown): value is ClientTrackRecord =>
  isRecord(value) &&
  typeof value.projectsPosted === "number" &&
  typeof value.activeProjects === "number" &&
  typeof value.completedProjects === "number" &&
  typeof value.openProjects === "number" &&
  typeof value.hiredProjects === "number" &&
  typeof value.decidedProjects === "number" &&
  isNumberOrNull(value.hireRate) &&
  typeof value.phasesDue === "number" &&
  typeof value.phasesPaid === "number" &&
  isNumberOrNull(value.budgetMin) &&
  isNumberOrNull(value.budgetMax) &&
  Array.isArray(value.topCategories) &&
  value.topCategories.every((item) => typeof item === "string");

const isOpenProject = (value: unknown): value is ClientOpenProject =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  typeof value.description === "string" &&
  typeof value.category === "string" &&
  isStringOrNull(value.location) &&
  typeof value.budgetRange === "string" &&
  typeof value.postedDate === "string" &&
  isStringOrNull(value.targetStartDate) &&
  typeof value.bidCount === "number" &&
  (value.myBidStatus === null ||
    value.myBidStatus === "pending" ||
    value.myBidStatus === "accepted" ||
    value.myBidStatus === "declined");

const isCompletedProject = (value: unknown): value is ClientCompletedProject => {
  if (!isRecord(value)) return false;
  const engineer = value.engineer;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.category === "string" &&
    isStringOrNull(value.location) &&
    typeof value.completedAt === "string" &&
    (engineer === null ||
      (isRecord(engineer) &&
        typeof engineer.id === "string" &&
        typeof engineer.name === "string" &&
        isStringOrNull(engineer.profilePhotoUrl)))
  );
};

/** Checks only the client-specific fields; the page checks the shared ones. */
export const hasClientProfileFields = (
  profile: Record<string, unknown>,
): boolean =>
  typeof profile.companyName === "string" &&
  (profile.clientType === null || isClientType(profile.clientType)) &&
  isStringOrNull(profile.location) &&
  typeof profile.memberSince === "string" &&
  typeof profile.completedProjects === "number" &&
  isTrackRecord(profile.stats) &&
  Array.isArray(profile.openProjectsList) &&
  profile.openProjectsList.every(isOpenProject) &&
  Array.isArray(profile.completedWork) &&
  profile.completedWork.every(isCompletedProject);

export const isOwnClientDetails = (value: unknown): value is OwnClientDetails =>
  isRecord(value) &&
  typeof value.phone === "string" &&
  typeof value.companyName === "string" &&
  typeof value.bio === "string" &&
  (value.clientType === null || isClientType(value.clientType)) &&
  typeof value.location === "string";

/** "Property developer at Padma Homes", "Padma Homes", "Individual", or null. */
export const describeClient = (
  clientType: ClientType | null,
  companyName: string,
): string | null => {
  const company = companyName.trim();
  if (clientType && clientType !== "individual" && company) {
    return `${clientTypeLabels[clientType]} at ${company}`;
  }
  if (company) return company;
  return clientType ? clientTypeLabels[clientType] : null;
};

export const formatMonthYear = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export const getErrorMessage = (value: unknown, fallback: string): string =>
  isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;

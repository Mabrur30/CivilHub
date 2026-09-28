// Shapes shared by the engineer, company and client profiles.

/** A project someone delivered, as their profile shows it (no price). */
export interface DeliveredProject {
  id: string;
  title: string;
  category: string;
  location: string | null;
  completedAt: string;
}

/** A machine someone has up for rent right now. */
export interface ProfileListing {
  id: string;
  title: string;
  category: string;
  dailyRate: number;
  location: string;
  quantity: number;
  photoUrl: string | null;
}

/** What a client or renter said about an engineer or company. */
export interface ProviderReview {
  id: string;
  kind: "project" | "equipment";
  equipmentTitle: string | null;
  client: { id: string; name: string; profilePhotoUrl: string | null };
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

export interface KindSummary {
  averageRating: number;
  totalReviews: number;
}

export interface ProviderReviewsResponse {
  reviews: ProviderReview[];
  averageRating: number;
  totalReviews: number;
  byKind: { project: KindSummary; equipment: KindSummary };
}

/** What an engineer, company or equipment owner said about a client or renter. */
export interface CustomerReview {
  id: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  context: "project" | "rental";
  title: string;
  author: {
    id: string;
    name: string;
    role: string;
    profilePhotoUrl: string | null;
  };
}

export interface CustomerReviewsResponse {
  reviews: CustomerReview[];
  averageRating: number;
  totalReviews: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isKindSummary = (value: unknown): value is KindSummary =>
  isRecord(value) &&
  typeof value.averageRating === "number" &&
  typeof value.totalReviews === "number";

export const isProviderReview = (value: unknown): value is ProviderReview =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.kind === "project" || value.kind === "equipment") &&
  (typeof value.equipmentTitle === "string" || value.equipmentTitle === null) &&
  isRecord(value.client) &&
  typeof value.client.name === "string" &&
  typeof value.rating === "number" &&
  typeof value.reviewText === "string" &&
  typeof value.createdAt === "string";

export const isProviderReviewsResponse = (
  value: unknown,
): value is ProviderReviewsResponse =>
  isRecord(value) &&
  Array.isArray(value.reviews) &&
  value.reviews.every(isProviderReview) &&
  typeof value.averageRating === "number" &&
  typeof value.totalReviews === "number" &&
  isRecord(value.byKind) &&
  isKindSummary(value.byKind.project) &&
  isKindSummary(value.byKind.equipment);

export const isCustomerReview = (value: unknown): value is CustomerReview =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.rating === "number" &&
  typeof value.reviewText === "string" &&
  typeof value.createdAt === "string" &&
  (value.context === "project" || value.context === "rental") &&
  typeof value.title === "string" &&
  isRecord(value.author) &&
  typeof value.author.name === "string";

export const isCustomerReviewsResponse = (
  value: unknown,
): value is CustomerReviewsResponse =>
  isRecord(value) &&
  Array.isArray(value.reviews) &&
  value.reviews.every(isCustomerReview) &&
  typeof value.averageRating === "number" &&
  typeof value.totalReviews === "number";

export const formatMonthYear = (value: string): string =>
  new Date(value).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export const EQUIPMENT_CATEGORIES = [
  "Excavator",
  "Crane",
  "Generator",
  "Scaffolding",
  "Concrete Mixer",
  "Bulldozer",
  "Compactor",
  "Loader",
  "Other",
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export type EquipmentStatus = "active" | "paused";

export interface EquipmentPhoto {
  url: string;
  publicId: string;
}

export interface EquipmentOwner {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

export interface EquipmentListing {
  id: string;
  owner: EquipmentOwner;
  equipmentRating: number | null;
  equipmentReviewCount: number;
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: number;
  securityDeposit: number;
  location: string;
  photos: EquipmentPhoto[];
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentBrowseResponse {
  items: EquipmentListing[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface ErrorResponse {
  message?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isEquipmentPhoto = (value: unknown): value is EquipmentPhoto => {
  if (!isRecord(value)) return false;
  return typeof value.url === "string" && typeof value.publicId === "string";
};

const isEquipmentOwner = (value: unknown): value is EquipmentOwner => {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === "string" &&
    typeof value.name === "string" &&
    (typeof value.profilePhotoUrl === "string" ||
      value.profilePhotoUrl === null) &&
    (typeof value.rating === "number" || value.rating === null) &&
    typeof value.reviewCount === "number"
  );
};

const isEquipmentCategory = (value: unknown): value is EquipmentCategory =>
  typeof value === "string" &&
  (EQUIPMENT_CATEGORIES as readonly string[]).includes(value);

const isEquipmentStatus = (value: unknown): value is EquipmentStatus =>
  value === "active" || value === "paused";

export const isEquipmentListing = (
  value: unknown,
): value is EquipmentListing => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    isEquipmentOwner(value.owner) &&
    (typeof value.equipmentRating === "number" ||
      value.equipmentRating === null) &&
    typeof value.equipmentReviewCount === "number" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    isEquipmentCategory(value.category) &&
    typeof value.dailyRate === "number" &&
    typeof value.securityDeposit === "number" &&
    typeof value.location === "string" &&
    Array.isArray(value.photos) &&
    value.photos.every(isEquipmentPhoto) &&
    isEquipmentStatus(value.status) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
};

export const isEquipmentBrowseResponse = (
  value: unknown,
): value is EquipmentBrowseResponse => {
  if (!isRecord(value)) return false;

  return (
    Array.isArray(value.items) &&
    value.items.every(isEquipmentListing) &&
    typeof value.page === "number" &&
    typeof value.limit === "number" &&
    typeof value.total === "number" &&
    typeof value.hasMore === "boolean"
  );
};

export const getErrorMessage = (value: unknown, fallback: string): string => {
  if (isRecord(value) && typeof value.message === "string") {
    return value.message;
  }
  return fallback;
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const body: unknown = await response.json();
  return body;
};

export const fetchMyEquipmentListings = async (): Promise<
  EquipmentListing[]
> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment/mine`, {
    credentials: "include",
  });
  const body = await parseJsonResponse(response);

  if (!response.ok || !Array.isArray(body) || !body.every(isEquipmentListing)) {
    throw new Error(
      getErrorMessage(body, "Unable to load your equipment listings."),
    );
  }

  return body;
};

export interface BrowseFilters {
  category: "" | EquipmentCategory;
  location: string;
  minPrice: string;
  maxPrice: string;
  search: string;
  page: number;
  limit?: number;
}

export const fetchBrowseEquipmentListings = async (
  filters: BrowseFilters,
): Promise<EquipmentBrowseResponse> => {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.minPrice.trim()) params.set("minPrice", filters.minPrice.trim());
  if (filters.maxPrice.trim()) params.set("maxPrice", filters.maxPrice.trim());
  if (filters.search.trim()) params.set("search", filters.search.trim());
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit ?? 12));

  const response = await fetch(
    `${API_BASE_URL}/api/equipment/browse?${params.toString()}`,
    {
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok || !isEquipmentBrowseResponse(body)) {
    throw new Error(
      getErrorMessage(body, "Unable to browse equipment listings."),
    );
  }

  return body;
};

export const fetchEquipmentById = async (
  equipmentId: string,
): Promise<EquipmentListing> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment/${equipmentId}`, {
    credentials: "include",
  });
  const body = await parseJsonResponse(response);

  if (!response.ok || !isEquipmentListing(body)) {
    throw new Error(
      getErrorMessage(body, "Unable to load this equipment listing."),
    );
  }

  return body;
};

export interface CreateEquipmentPayload {
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: string;
  securityDeposit: string;
  location: string;
  photos: File[];
}

export const createEquipmentListing = async (
  payload: CreateEquipmentPayload,
): Promise<EquipmentListing> => {
  const formData = new FormData();
  formData.append("title", payload.title.trim());
  formData.append("description", payload.description.trim());
  formData.append("category", payload.category);
  formData.append("dailyRate", payload.dailyRate.trim());
  formData.append("securityDeposit", payload.securityDeposit.trim());
  formData.append("location", payload.location.trim());
  payload.photos.forEach((file) => formData.append("photos", file));

  const response = await fetch(`${API_BASE_URL}/api/equipment`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const body = await parseJsonResponse(response);

  if (!response.ok || !isEquipmentListing(body)) {
    throw new Error(
      getErrorMessage(body, "Unable to create equipment listing."),
    );
  }

  return body;
};

export interface UpdateEquipmentPayload {
  title?: string;
  description?: string;
  category?: EquipmentCategory;
  dailyRate?: string;
  securityDeposit?: string;
  location?: string;
  status?: EquipmentStatus;
}

export const updateEquipmentListing = async (
  equipmentId: string,
  payload: UpdateEquipmentPayload,
): Promise<EquipmentListing> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment/${equipmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok || !isEquipmentListing(body)) {
    throw new Error(
      getErrorMessage(body, "Unable to update equipment listing."),
    );
  }

  return body;
};

export const deleteEquipmentListing = async (
  equipmentId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment/${equipmentId}`, {
    method: "DELETE",
    credentials: "include",
  });

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessage(body, "Unable to delete equipment listing."),
    );
  }
};

export interface EquipmentAvailabilityRange {
  startDate: string;
  endDate: string;
}

export interface CreateBookingRequestPayload {
  equipmentId: string;
  startDate: string;
  endDate: string;
}

export type EquipmentBookingStatus =
  | "pending"
  | "approved"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type EquipmentBookingPaymentStatus = "unpaid" | "paid";
export type EquipmentDepositResolution = "pending" | "released" | "claimed";

export interface EquipmentBookingConditionPhoto {
  url: string;
  publicId: string;
}

export interface EquipmentBookingParty {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

export interface EquipmentBookingBase {
  id: string;
  equipment: {
    id: string;
    title: string;
    photoUrl: string | null;
  };
  renter: EquipmentBookingParty;
  owner: EquipmentBookingParty;
  startDate: string;
  endDate: string;
  totalRentalFee: number;
  securityDeposit: number;
  status: EquipmentBookingStatus;
  paymentStatus: EquipmentBookingPaymentStatus;
  paidAt: string | null;
  pickupConditionNotes: string | null;
  pickupConditionPhotos: EquipmentBookingConditionPhoto[];
  pickupConfirmedAt: string | null;
  returnConditionNotes: string | null;
  returnConditionPhotos: EquipmentBookingConditionPhoto[];
  returnConfirmedAt: string | null;
  depositResolution: EquipmentDepositResolution;
  depositClaimNotes: string | null;
  depositClaimAmount: number | null;
  createdAt: string;
}

export interface EquipmentIncomingBooking extends EquipmentBookingBase {
  bucket: EquipmentBookingBucket;
}

export type EquipmentBookingBucket =
  | "pending"
  | "upcoming"
  | "active"
  | "history";

export interface EquipmentMyBooking extends EquipmentBookingBase {
  bucket: EquipmentBookingBucket;
}

export interface EquipmentOwnerBooking extends EquipmentBookingBase {
  bucket: EquipmentBookingBucket;
}

export interface EquipmentReviewClient {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
}

export interface EquipmentReview {
  id: string;
  projectId: string | null;
  equipmentBookingId: string | null;
  equipmentId: string | null;
  client: EquipmentReviewClient;
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

export interface BookingReviewEligibilityResponse {
  canReview: boolean;
  alreadyReviewed: boolean;
  reason?: string;
  review?: EquipmentReview;
}

export interface EquipmentReviewsResponse {
  reviews: EquipmentReview[];
  averageRating: number;
  totalReviews: number;
}

const isAvailabilityRange = (
  value: unknown,
): value is EquipmentAvailabilityRange => {
  if (!isRecord(value)) return false;
  return (
    typeof value.startDate === "string" && typeof value.endDate === "string"
  );
};

const isBookingStatus = (value: unknown): value is EquipmentBookingStatus =>
  value === "pending" ||
  value === "approved" ||
  value === "in_progress" ||
  value === "completed" ||
  value === "declined" ||
  value === "cancelled";

const isBookingPaymentStatus = (
  value: unknown,
): value is EquipmentBookingPaymentStatus =>
  value === "unpaid" || value === "paid";

const isDepositResolution = (
  value: unknown,
): value is EquipmentDepositResolution =>
  value === "pending" || value === "released" || value === "claimed";

const isConditionPhoto = (
  value: unknown,
): value is EquipmentBookingConditionPhoto => {
  if (!isRecord(value)) return false;
  return typeof value.url === "string" && typeof value.publicId === "string";
};

const isBookingParty = (value: unknown): value is EquipmentBookingParty => {
  if (!isRecord(value)) return false;

  return (
    typeof value.userId === "string" &&
    typeof value.name === "string" &&
    (typeof value.profilePhotoUrl === "string" ||
      value.profilePhotoUrl === null) &&
    (typeof value.rating === "number" || value.rating === null) &&
    typeof value.reviewCount === "number"
  );
};

const isBookingBase = (value: unknown): value is EquipmentBookingBase => {
  if (!isRecord(value)) return false;

  const equipment = value.equipment;
  if (!isRecord(equipment)) return false;

  return (
    typeof value.id === "string" &&
    typeof equipment.id === "string" &&
    typeof equipment.title === "string" &&
    (typeof equipment.photoUrl === "string" || equipment.photoUrl === null) &&
    isBookingParty(value.renter) &&
    isBookingParty(value.owner) &&
    typeof value.startDate === "string" &&
    typeof value.endDate === "string" &&
    typeof value.totalRentalFee === "number" &&
    typeof value.securityDeposit === "number" &&
    isBookingStatus(value.status) &&
    isBookingPaymentStatus(value.paymentStatus) &&
    (typeof value.paidAt === "string" || value.paidAt === null) &&
    (typeof value.pickupConditionNotes === "string" ||
      value.pickupConditionNotes === null) &&
    Array.isArray(value.pickupConditionPhotos) &&
    value.pickupConditionPhotos.every(isConditionPhoto) &&
    (typeof value.pickupConfirmedAt === "string" ||
      value.pickupConfirmedAt === null) &&
    (typeof value.returnConditionNotes === "string" ||
      value.returnConditionNotes === null) &&
    Array.isArray(value.returnConditionPhotos) &&
    value.returnConditionPhotos.every(isConditionPhoto) &&
    (typeof value.returnConfirmedAt === "string" ||
      value.returnConfirmedAt === null) &&
    isDepositResolution(value.depositResolution) &&
    (typeof value.depositClaimNotes === "string" ||
      value.depositClaimNotes === null) &&
    (typeof value.depositClaimAmount === "number" ||
      value.depositClaimAmount === null) &&
    typeof value.createdAt === "string"
  );
};

const isBookingBucket = (value: unknown): value is EquipmentBookingBucket =>
  value === "pending" ||
  value === "upcoming" ||
  value === "active" ||
  value === "history";

const isIncomingBooking = (
  value: unknown,
): value is EquipmentIncomingBooking => {
  return isBookingBase(value) && isBookingBucket(value.bucket);
};

const isMyBooking = (value: unknown): value is EquipmentMyBooking => {
  return isBookingBase(value) && isBookingBucket(value.bucket);
};

const isReviewClient = (value: unknown): value is EquipmentReviewClient => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (typeof value.profilePhotoUrl === "string" ||
      value.profilePhotoUrl === null)
  );
};

const isEquipmentReview = (value: unknown): value is EquipmentReview => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (typeof value.projectId === "string" || value.projectId === null) &&
    (typeof value.equipmentBookingId === "string" ||
      value.equipmentBookingId === null) &&
    (typeof value.equipmentId === "string" || value.equipmentId === null) &&
    isReviewClient(value.client) &&
    typeof value.rating === "number" &&
    typeof value.reviewText === "string" &&
    (typeof value.engineerReply === "string" || value.engineerReply === null) &&
    (typeof value.engineerRepliedAt === "string" ||
      value.engineerRepliedAt === null) &&
    typeof value.createdAt === "string"
  );
};

const isBookingReviewEligibility = (
  value: unknown,
): value is BookingReviewEligibilityResponse => {
  if (!isRecord(value)) return false;
  const reasonOk =
    value.reason === undefined || typeof value.reason === "string";
  const reviewOk =
    value.review === undefined || isEquipmentReview(value.review);
  return (
    typeof value.canReview === "boolean" &&
    typeof value.alreadyReviewed === "boolean" &&
    reasonOk &&
    reviewOk
  );
};

const isEquipmentReviewsResponse = (
  value: unknown,
): value is EquipmentReviewsResponse => {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.reviews) &&
    value.reviews.every(isEquipmentReview) &&
    typeof value.averageRating === "number" &&
    typeof value.totalReviews === "number"
  );
};

export const fetchEquipmentAvailability = async (
  equipmentId: string,
  month: number,
  year: number,
): Promise<EquipmentAvailabilityRange[]> => {
  const params = new URLSearchParams();
  params.set("month", String(month));
  params.set("year", String(year));

  const response = await fetch(
    `${API_BASE_URL}/api/equipment/${equipmentId}/availability?${params.toString()}`,
    {
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (
    !response.ok ||
    !Array.isArray(body) ||
    !body.every(isAvailabilityRange)
  ) {
    throw new Error(
      getErrorMessage(body, "Unable to load equipment availability."),
    );
  }

  return body;
};

export const createEquipmentBookingRequest = async (
  payload: CreateBookingRequestPayload,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment-bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Unable to submit booking request."));
  }
};

export const fetchIncomingEquipmentBookings = async (): Promise<
  EquipmentIncomingBooking[]
> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/incoming`,
    {
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok || !Array.isArray(body) || !body.every(isIncomingBooking)) {
    throw new Error(
      getErrorMessage(body, "Unable to load incoming booking requests."),
    );
  }

  return body;
};

export const fetchMyEquipmentBookings = async (): Promise<
  EquipmentMyBooking[]
> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment-bookings/mine`, {
    credentials: "include",
  });
  const body = await parseJsonResponse(response);

  if (!response.ok || !Array.isArray(body) || !body.every(isMyBooking)) {
    throw new Error(getErrorMessage(body, "Unable to load your bookings."));
  }

  return body;
};

export const fetchOwnerEquipmentBookings = async (): Promise<
  EquipmentOwnerBooking[]
> => {
  const response = await fetch(`${API_BASE_URL}/api/equipment-bookings/owner`, {
    credentials: "include",
  });
  const body = await parseJsonResponse(response);

  if (!response.ok || !Array.isArray(body) || !body.every(isMyBooking)) {
    throw new Error(getErrorMessage(body, "Unable to load owner bookings."));
  }

  return body;
};

export const fetchEquipmentBookingById = async (
  bookingId: string,
): Promise<EquipmentMyBooking> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}`,
    {
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok || !isMyBooking(body)) {
    throw new Error(getErrorMessage(body, "Unable to load booking details."));
  }

  return body;
};

export const fetchBookingReviewEligibility = async (
  bookingId: string,
): Promise<BookingReviewEligibilityResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/can-review`,
    {
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok || !isBookingReviewEligibility(body)) {
    throw new Error(
      getErrorMessage(body, "Unable to determine review eligibility."),
    );
  }

  return body;
};

export const createEquipmentReview = async (payload: {
  bookingId: string;
  rating: number;
  reviewText: string;
}): Promise<EquipmentReview> => {
  const response = await fetch(`${API_BASE_URL}/api/reviews/equipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await parseJsonResponse(response);

  const review = isRecord(body) ? body.review : undefined;
  if (!response.ok || !isEquipmentReview(review)) {
    throw new Error(getErrorMessage(body, "Unable to submit review."));
  }

  return review;
};

export const fetchEquipmentReviews = async (
  equipmentId: string,
): Promise<EquipmentReviewsResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment/${equipmentId}/reviews`,
    {
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok || !isEquipmentReviewsResponse(body)) {
    throw new Error(getErrorMessage(body, "Unable to load reviews."));
  }

  return body;
};

export const replyToEquipmentReview = async (
  reviewId: string,
  reply: string,
): Promise<EquipmentReview> => {
  const response = await fetch(
    `${API_BASE_URL}/api/reviews/${reviewId}/reply`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reply }),
    },
  );
  const body = await parseJsonResponse(response);

  const review = isRecord(body) ? body.review : undefined;
  if (!response.ok || !isEquipmentReview(review)) {
    throw new Error(getErrorMessage(body, "Unable to submit reply."));
  }

  return review;
};

export const payEquipmentBooking = async (bookingId: string): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/pay`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Unable to process mock payment."));
  }
};

export const confirmEquipmentPickup = async (
  bookingId: string,
  payload: { conditionNotes?: string; photos?: File[] },
): Promise<void> => {
  const formData = new FormData();
  if (payload.conditionNotes?.trim()) {
    formData.append("conditionNotes", payload.conditionNotes.trim());
  }
  (payload.photos ?? []).forEach((file) => formData.append("photos", file));

  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/pickup`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Unable to confirm pickup."));
  }
};

export const confirmEquipmentReturn = async (
  bookingId: string,
  payload: { conditionNotes?: string; photos?: File[] },
): Promise<void> => {
  const formData = new FormData();
  if (payload.conditionNotes?.trim()) {
    formData.append("conditionNotes", payload.conditionNotes.trim());
  }
  (payload.photos ?? []).forEach((file) => formData.append("photos", file));

  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/return`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Unable to confirm return."));
  }
};

export const resolveEquipmentDeposit = async (
  bookingId: string,
  payload: {
    resolution: "released" | "claimed";
    claimNotes?: string;
    claimAmount?: number;
  },
): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/resolve-deposit`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Unable to resolve deposit."));
  }
};

export const respondToEquipmentBooking = async (
  bookingId: string,
  action: "approve" | "decline",
): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/respond`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action }),
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(body, "Unable to respond to booking request."),
    );
  }
};

export const cancelEquipmentBookingRequest = async (
  bookingId: string,
): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/api/equipment-bookings/${bookingId}/cancel`,
    {
      method: "PATCH",
      credentials: "include",
    },
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Unable to cancel booking request."));
  }
};

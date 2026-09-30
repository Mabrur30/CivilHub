const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

/** An error from the API, with its status so callers can spot a lost session. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let onSignedOut: (() => void) | null = null;

/** The auth provider registers this, so any 401 sends the admin to sign-in. */
export const setSignedOutHandler = (handler: (() => void) | null): void => {
  onSignedOut = handler;
};

/**
 * Calls /api/admin/*. This dashboard never calls any other part of the API,
 * and the admin cookie is only ever sent to /api/admin.
 */
export const adminApi = async <T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/admin${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Can't reach the CivilHub API. Check that the server is running.", 0);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "Something went wrong.";
    if (response.status === 401 && path !== "/auth/login") onSignedOut?.();
    throw new ApiError(message, response.status);
  }
  return body as T;
};

// Shapes the API returns (server/src/controllers/admin.controller.ts).

export type UserRole = "client" | "engineer" | "organisation";
export type AccountStatus = "active" | "suspended" | "banned";
export type ReportTarget = "user" | "post" | "comment";

export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}

export type VerificationStatus = "pending" | "verified" | "rejected" | "lapsed";

export interface Overview {
  users: {
    total: number;
    byRole: Record<UserRole, number>;
    newThisWeek: number;
    restricted: number;
  };
  openReports: number;
  verificationsPending: number;
  projectDisputes: number;
  /** Disputes where a side wrote to CivilHub and hasn't had an answer. */
  disputeReplies: number;
  projects: { openBriefs: number; active: number };
  activeBookings: number;
  money: {
    refundsDue: number;
    refundsDueAmount: number;
    owedToPayees: number;
    payeesOwed: number;
    depositsPending: number;
    depositDisputes: number;
    commissionEarned: number;
    paymentVolume: number;
  };
}

export type PayoutMethod = "bkash" | "nagad" | "rocket" | "bank";

export interface PayoutAccountView {
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  branch: string | null;
  routingNumber: string | null;
  updatedAt: string;
}

export interface PayeeRow {
  payee: { id: string; name: string; email: string; role: UserRole | null };
  released: number;
  onHold: number;
  paidOut: number;
  owed: number;
  hasAccount: boolean;
  lastPayoutAt: string | null;
}

export interface EarningLine {
  paymentId: string;
  kind: "phase" | "advance" | "full_remaining" | "equipment_booking" | "deposit_claim";
  description: string;
  paidAt: string | null;
  amount: number;
  released: number;
  onHold: number;
}

export interface PayeeDetail {
  payee: { id: string; name: string; email: string; role: UserRole };
  earnings: { released: number; onHold: number; paidOut: number; owed: number; lines: EarningLine[] };
  account: PayoutAccountView | null;
  payouts: Array<{
    id: string;
    amount: number;
    account: { method: PayoutMethod; accountName: string; accountNumber: string; bankName?: string; branch?: string };
    reference: string;
    note: string | null;
    adminName: string;
    paidAt: string;
  }>;
}

export interface RefundDue {
  kind: "overpayment" | "deposit" | "cancellation";
  paymentId: string;
  bookingId: string | null;
  payer: { id: string; name: string; email: string } | null;
  amount: number;
  description: string;
  tranId: string | null;
  paidWith: string;
  canUseGateway: boolean;
  since: string;
}

export interface RefundRecord {
  id: string;
  kind: "overpayment" | "deposit" | "cancellation";
  paymentId: string;
  payer: { id: string; name: string } | null;
  amount: number;
  method: "sslcommerz" | "manual";
  status: "processing" | "completed" | "failed";
  reference: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PaymentRow {
  id: string;
  type: "advance" | "phase" | "full_remaining" | "equipment_booking";
  description: string | null;
  amount: number;
  platformFee: number;
  payeeAmount: number;
  depositAmount: number;
  status: "initiated" | "paid" | "failed" | "cancelled" | "expired";
  refundDue: boolean;
  method: string;
  paidWith: string | null;
  tranId: string | null;
  payer: { id: string; name: string } | null;
  payee: { id: string; name: string } | null;
  createdAt: string;
  paidAt: string | null;
}

export interface ReportGroup {
  targetType: ReportTarget;
  targetId: string;
  count: number;
  reasons: string[];
  latest: string;
  target: {
    exists: boolean;
    user: { id: string; name: string; role: UserRole; status: AccountStatus } | null;
    content: string | null;
    imageUrl: string | null;
    postId: string | null;
  };
  reports: Array<{ reason: string; note: string | null; reporterName: string; createdAt: string }>;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  suspendedUntil: string | null;
  createdAt: string;
  openReports: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  suspendedUntil: string | null;
  statusReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
  verificationStatus: VerificationStatus | null;
  activity: Record<
    "posts" | "comments" | "projectsPosted" | "projectsHired" | "bids" | "listings" | "bookings",
    number
  >;
  reports: Array<{
    id: string;
    targetType: ReportTarget;
    targetId: string;
    reason: string;
    note: string | null;
    status: string;
    resolution: string | null;
    reporterName: string;
    createdAt: string;
  }>;
  actions: Array<{ id: string; action: string; reason: string | null; adminName: string; createdAt: string }>;
}

export interface ActionEntry {
  id: string;
  action: string;
  adminName: string;
  subject: { id: string; name: string } | null;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
}

export type DisputeDecision = "upheld" | "reduced" | "rejected";

/** Where an open dispute is: under review, a decision waiting to take effect, or appealed. */
export type DisputeStage = "review" | "awaiting_final" | "appealed";

export interface DisputeAppealView {
  role: string;
  reason: string;
  openedAt: string;
  decision: "upheld" | "changed" | null;
  note: string | null;
  decidedAt: string | null;
}

/** Who made a decision, and whether the admin looking may review an appeal against it. */
export interface DecisionReview {
  decidedByName: string | null;
  isOwnDecision: boolean;
  mayReview: boolean;
}

/** A photo or document offered as evidence, and what CivilHub knows about it. */
export interface EvidenceFileView {
  name?: string;
  url: string;
  isImage: boolean;
  uploadedAt: string | null;
  /** Who uploaded it, e.g. "renter"; filled in by the page showing it. */
  uploadedByLabel?: string;
  takenAt: string | null;
  location: { lat: number; lng: number } | null;
  camera: string | null;
  flags?: string[];
}

export interface CaseMessageView {
  id: string;
  from: "admin" | "party";
  partyRole: string;
  text: string;
  files: Array<EvidenceFileView & { name: string; mimeType: string; size: number }>;
  replyBy: string | null;
  at: string;
}

/** CivilHub's private thread with one side of a dispute. */
export interface CaseThread {
  messages: CaseMessageView[];
  /** A reply CivilHub asked for and hasn't had yet. */
  replyBy: string | null;
}

export interface DepositDisputeRow {
  bookingId: string;
  equipment: string;
  renter: { id: string; name: string; email: string } | null;
  owner: { id: string; name: string; email: string } | null;
  securityDeposit: number;
  claimAmount: number;
  claimNotes: string | null;
  claimedAt: string | null;
  dispute: {
    status: "open" | "decided";
    stage: DisputeStage;
    pendingDecision: {
      decision: DisputeDecision;
      amount: number;
      note: string;
      decidedBy: string;
      decidedAt: string;
      appealDeadline: string;
      acceptedBy: string[];
    } | null;
    appeal: DisputeAppealView | null;
    reason: string;
    openedAt: string;
    decision: DisputeDecision | null;
    originalClaimAmount: number;
    decisionNote: string | null;
    decidedAt: string | null;
  };
  /** A side wrote to CivilHub last. */
  newReply?: boolean;
}

/** A condition photo, with who took it and what its camera data says. */
export type ConditionPhoto = EvidenceFileView & { uploadedByRole: "renter" | "owner" | null };

export interface ConditionRecord {
  at: string | null;
  /** Who confirmed this stage; null on older bookings. */
  by: "renter" | "owner" | null;
  notes: string | null;
  photos: ConditionPhoto[];
}

/** The other side's own record of a pickup or return. */
export interface ConditionReport {
  stage: "pickup" | "return";
  by: "renter" | "owner";
  at: string;
  notes: string | null;
  photos: ConditionPhoto[];
}

export interface DepositDisputeDetail extends DepositDisputeRow {
  startDate: string;
  endDate: string;
  pickup: ConditionRecord;
  return: ConditionRecord;
  counterReports: ConditionReport[];
  payment: { id: string; amount: number; depositAmount: number; tranId: string | null } | null;
  refund: { amount: number; status: string; method: string } | null;
  threads: Record<string, CaseThread>;
  review: DecisionReview | null;
}

export interface VerificationRow {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  kind: "engineer" | "organisation";
  status: VerificationStatus;
  iebNumber: string | null;
  tradeLicenceNo: string | null;
  nameAtSubmission: string;
  submittedAt: string;
  reviewedAt: string | null;
  note: string | null;
  licenceExpiresAt: string | null;
}

export interface VerificationDetail extends VerificationRow {
  joinedAt: string | null;
  verifiedAt: string | null;
  accountStatus: AccountStatus;
  profile: { location: string | null; tradeLicenceNo: string | null; certificateCount: number | null };
  documents: Array<{ kind: "ieb_certificate" | "trade_licence" | "nid"; name: string; isImage: boolean; uploadedAt: string; url: string }>;
  history: Array<{ action: string; reason: string | null; admin: string; at: string }>;
}

export type ProjectDisputeOutcome = "resumed" | "phase_approved" | "cancelled";

export interface ProjectDisputeRow {
  id: string;
  projectId: string;
  projectTitle: string;
  client: { id: string; name: string; email: string; role: string } | null;
  provider: { id: string; name: string; email: string; role: string } | null;
  openedByRole: "client" | "provider";
  reason: string;
  reasonLabel: string;
  description: string;
  status: "open" | "resolved" | "withdrawn";
  stage: DisputeStage;
  openedAt: string;
  decision: {
    outcome: ProjectDisputeOutcome;
    note: string;
    phase: string | null;
    providerAmount: number | null;
    decidedBy: string;
    decidedAt: string;
    appealDeadline: string;
    acceptedBy: string[];
  } | null;
  appeal: DisputeAppealView | null;
  resolution: {
    outcome: ProjectDisputeOutcome;
    note: string;
    providerAmount: number | null;
    refundAmount: number | null;
    decidedAt: string;
  } | null;
  /** A side wrote to CivilHub last. */
  newReply?: boolean;
}

export interface ProjectDisputeDetail extends ProjectDisputeRow {
  project: {
    id: string;
    title: string;
    status: string;
    paused: boolean;
    totalAgreedValue: number | null;
    paymentPlan: "phase_by_phase" | "full_upfront" | null;
    /** Work is funded into CivilHub's hold before it starts. */
    fundsBeforeWork: boolean;
    phasePlanStatus: string;
    advancePaid: boolean;
    cancellation: { by: string; held: number; providerAmount: number; refundAmount: number } | null;
    proposal: { providerAmount: number; note?: string; proposedAt: string } | null;
  };
  held: number | null;
  phases: Array<{
    id: string;
    name: string;
    order: number;
    status: string;
    price: number;
    paymentStatus: "paid" | "unpaid";
    dueDate: string | null;
    completedAt: string | null;
    changeRequest: { note: string; requestedAt: string } | null;
    submissions: Array<{ note: string; submittedAt: string; files: Array<EvidenceFileView & { name: string; mimeType: string }> }>;
    canApproveForClient: boolean;
  }>;
  payments: Array<{
    id: string;
    type: string;
    status: string;
    amount: number;
    payeeAmount: number;
    paidAt: string | null;
    description: string | null;
  }>;
  messages: Array<{
    id: string;
    fromRole: "client" | "provider";
    type: string;
    content: string | null;
    attachmentName: string | null;
    attachmentUrl: string | null;
    aboutThisProject: boolean;
    at: string;
  }>;
  earlierDisputes: Array<{ status: string; reason: string; openedAt: string; outcome: ProjectDisputeOutcome | null }>;
  threads: Record<string, CaseThread>;
  review: DecisionReview | null;
}

export interface ReviewRow {
  id: string;
  kind: "provider" | "customer";
  author: { id: string; name: string; role: string } | null;
  subject: { id: string; name: string; role: string } | null;
  rating: number;
  text: string;
  reply: string | null;
  about: string | null;
  createdAt: string;
}

export interface ListingRow {
  id: string;
  title: string;
  category: string;
  location: string;
  dailyRate: number;
  photoUrl: string | null;
  owner: { id: string; name: string; role: string } | null;
  status: "active" | "paused";
  adminHold: { reason: string; at: string } | null;
  createdAt: string;
}

export interface PlatformSettings {
  commissionRate: number;
  commissionSource: "admin" | "default";
  defaultCommissionRate: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

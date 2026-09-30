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

export interface Overview {
  users: {
    total: number;
    byRole: Record<UserRole, number>;
    newThisWeek: number;
    restricted: number;
  };
  openReports: number;
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
  kind: "overpayment" | "deposit";
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
  kind: "overpayment" | "deposit";
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
    reason: string;
    openedAt: string;
    decision: DisputeDecision | null;
    originalClaimAmount: number;
    decisionNote: string | null;
    decidedAt: string | null;
  };
}

export interface ConditionRecord {
  at: string | null;
  notes: string | null;
  photos: string[];
}

export interface DepositDisputeDetail extends DepositDisputeRow {
  startDate: string;
  endDate: string;
  pickup: ConditionRecord;
  return: ConditionRecord;
  payment: { id: string; amount: number; depositAmount: number; tranId: string | null } | null;
  refund: { amount: number; status: string; method: string } | null;
}

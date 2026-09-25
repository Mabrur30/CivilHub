const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const CONNECTION_ERROR = "Unable to connect to CivilHub. Please try again.";

/** What a checkout is for; the server works out the amount itself. */
export type CheckoutRequest =
  | { purpose: "advance"; projectId: string }
  | { purpose: "full_remaining"; projectId: string }
  | { purpose: "phase"; projectId: string; phaseId: string }
  | { purpose: "equipment_booking"; bookingId: string };

export type PaymentStatus =
  | "initiated"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export interface PaymentResult {
  tranId: string;
  status: PaymentStatus;
  type: "advance" | "phase" | "full_remaining" | "equipment_booking";
  description: string;
  amount: number;
  platformFee: number;
  payeeAmount: number;
  depositAmount: number;
  refundDue: boolean;
  /** e.g. "bKash" or "Visa card"; set once paid. */
  method: string | null;
  failureReason: string | null;
  returnPath: string | null;
  paidAt: string | null;
  createdAt: string;
  viewerRole: "payer" | "payee";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const errorMessage = (value: unknown, fallback: string): string =>
  isRecord(value) && typeof value.message === "string" ? value.message : fallback;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const STATUSES: PaymentStatus[] = ["initiated", "paid", "failed", "cancelled", "expired"];
const TYPES: PaymentResult["type"][] = ["advance", "phase", "full_remaining", "equipment_booking"];

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isPaymentResult = (value: unknown): value is PaymentResult =>
  isRecord(value) &&
  typeof value.tranId === "string" &&
  STATUSES.includes(value.status as PaymentStatus) &&
  TYPES.includes(value.type as PaymentResult["type"]) &&
  typeof value.description === "string" &&
  typeof value.amount === "number" &&
  typeof value.platformFee === "number" &&
  typeof value.payeeAmount === "number" &&
  typeof value.depositAmount === "number" &&
  typeof value.refundDue === "boolean" &&
  isNullableString(value.method) &&
  isNullableString(value.failureReason) &&
  isNullableString(value.returnPath) &&
  isNullableString(value.paidAt) &&
  typeof value.createdAt === "string" &&
  (value.viewerRole === "payer" || value.viewerRole === "payee");

/**
 * Opens an SSLCommerz checkout and sends the browser to it. Resolves only if
 * it couldn't (the page is navigating away otherwise), with the reason.
 */
export const startCheckout = async (request: CheckoutRequest): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/payments/checkout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return CONNECTION_ERROR;
  }
  const body = await readJson(response);
  if (response.ok && isRecord(body) && typeof body.gatewayUrl === "string") {
    window.location.assign(body.gatewayUrl);
    return "";
  }
  return errorMessage(body, "Couldn't open the payment page. Please try again.");
};

export const fetchPaymentResult = async (tranId: string): Promise<PaymentResult> => {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/payments/${encodeURIComponent(tranId)}`,
      { credentials: "include" },
    );
  } catch {
    throw new Error(CONNECTION_ERROR);
  }
  const body = await readJson(response);
  if (!response.ok || !isPaymentResult(body)) {
    throw new Error(errorMessage(body, "We couldn't find that payment."));
  }
  return body;
};

/** "10%" from 0.1, for fee notes. */
export const formatRate = (rate: number): string =>
  `${Math.round(rate * 1000) / 10}%`;

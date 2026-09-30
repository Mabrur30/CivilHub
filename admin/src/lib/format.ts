import { type AccountStatus, type UserRole } from "./api";

export const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (value: string): string =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatTaka = (value: number): string =>
  `৳${Math.round(value).toLocaleString("en-IN")}`;

export const ROLE_LABELS: Record<UserRole, string> = {
  client: "Client",
  engineer: "Engineer",
  organisation: "Company",
};

export const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  scam: "Scam or fraud",
  harassment: "Harassment",
  fake_profile: "Fake profile",
  inappropriate: "Inappropriate",
  other: "Something else",
};

export const ACTION_LABELS: Record<string, string> = {
  "admin.login": "Signed in",
  "report.dismiss": "Dismissed reports",
  "report.action": "Acted on reports",
  "post.remove": "Removed a post",
  "comment.remove": "Removed a comment",
  "user.suspend": "Suspended an account",
  "user.ban": "Banned an account",
  "user.reinstate": "Reinstated an account",
  "payout.record": "Recorded a payout",
  "refund.gateway": "Refunded through SSLCommerz",
  "refund.manual": "Recorded a manual refund",
  "refund.check": "Checked a refund",
  "deposit.decide": "Decided a deposit dispute",
};

export const DECISION_LABELS: Record<string, string> = {
  upheld: "Claim upheld",
  reduced: "Claim reduced",
  rejected: "Claim rejected",
};

export const PAYOUT_METHOD_LABELS: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank: "Bank account",
};

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: "Advance",
  phase: "Phase payment",
  full_remaining: "Full balance",
  equipment_booking: "Rental",
  deposit_claim: "Deposit claim",
};

export const statusLabel = (status: AccountStatus, until: string | null): string =>
  status === "suspended" && until
    ? `Suspended until ${formatDate(until)}`
    : status === "banned"
      ? "Banned"
      : status === "suspended"
        ? "Suspended"
        : "Active";

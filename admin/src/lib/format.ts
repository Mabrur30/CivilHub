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
  "project.dispute_resolve": "Decided a project dispute",
  "review.remove": "Removed a review",
  "review.reply_remove": "Removed a reply to a review",
  "listing.pause": "Paused a listing",
  "listing.unpause": "Reopened a listing",
  "settings.commission": "Changed the commission rate",
  "dispute.message": "Wrote to one side of a dispute",
  "project.dispute_appeal": "Decided an appeal on a project dispute",
  "deposit.appeal": "Decided an appeal on a deposit dispute",
  "verification.approve": "Verified an account",
  "verification.reject": "Rejected a verification",
  "verification.revoke": "Revoked a Verified badge",
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for review",
  verified: "Verified",
  rejected: "Rejected",
  lapsed: "Lapsed",
};

export const DOCUMENT_LABELS: Record<string, string> = {
  ieb_certificate: "IEB certificate",
  trade_licence: "Trade licence",
  nid: "National ID",
};

export const OUTCOME_LABELS: Record<string, string> = {
  resumed: "Resumed",
  phase_approved: "Phase approved for the client",
  cancelled: "Project cancelled",
};

export const PHASE_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Waiting for the client",
  completed: "Approved",
  delayed: "Delayed",
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

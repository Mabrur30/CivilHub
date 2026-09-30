import { Types } from "mongoose";
import { type AccountStatus, User } from "../models/User.model";

/**
 * Admins suspend or ban accounts. A restricted account can't sign in or use
 * the API, and everyone else stops seeing it. Suspensions end by themselves:
 * the first check after `suspendedUntil` lifts it.
 */

export interface AccountStanding {
  status: AccountStatus;
  suspendedUntil: Date | null;
  statusReason: string | null;
}

/** Mongo filter for accounts that are restricted right now. */
const restrictedNow = (): Record<string, unknown> => ({
  $or: [
    { status: "banned" },
    { status: "suspended", suspendedUntil: null },
    { status: "suspended", suspendedUntil: { $gt: new Date() } },
  ],
});

/**
 * The account's standing, lifting a suspension that has run out. Null when
 * the account doesn't exist.
 */
export const getAccountStanding = async (userId: string): Promise<AccountStanding | null> => {
  if (!Types.ObjectId.isValid(userId)) return null;
  const user = await User.findById(userId).select("status suspendedUntil statusReason").lean().exec();
  if (!user) return null;
  const status = user.status ?? "active";
  if (status === "suspended" && user.suspendedUntil && user.suspendedUntil <= new Date()) {
    await User.updateOne(
      { _id: userId, status: "suspended" },
      { $set: { status: "active", suspendedUntil: null, statusReason: null } },
    ).exec();
    return { status: "active", suspendedUntil: null, statusReason: null };
  }
  return {
    status,
    suspendedUntil: user.suspendedUntil ?? null,
    statusReason: user.statusReason ?? null,
  };
};

/** What a restricted person is told when they try to sign in or act. */
export const restrictionMessage = (standing: AccountStanding): string => {
  const reason = standing.statusReason ? ` Reason: ${standing.statusReason}` : "";
  if (standing.status === "banned") {
    return `This account has been closed by CivilHub.${reason}`;
  }
  const until = standing.suspendedUntil
    ? ` until ${standing.suspendedUntil.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : "";
  return `This account is suspended${until}.${reason}`;
};

/** Ids of every account that's restricted right now, to leave out of lists. */
export const restrictedUserIds = async (): Promise<Set<string>> => {
  const rows = await User.find(restrictedNow()).select("_id").lean().exec();
  return new Set(rows.map((row) => row._id.toString()));
};

export const isRestricted = (standing: AccountStanding | null): boolean =>
  standing !== null && standing.status !== "active";

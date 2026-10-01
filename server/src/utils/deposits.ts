import { Equipment } from "../models/Equipment.model";
import { EquipmentBooking, type IEquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { formatTaka } from "./money";

/**
 * How a rental's security deposit settles:
 * - The owner releases it, or claims part of it for damage.
 * - A claim can be disputed by the renter for DEPOSIT_DISPUTE_DAYS; until
 *   then, or until an admin decides the dispute, the claimed money is on hold.
 * - An owner who does nothing has the deposit released for them
 *   DEPOSIT_AUTO_RELEASE_DAYS after the return, with a reminder two days before.
 */

export const DEPOSIT_DISPUTE_DAYS = 3;
export const DEPOSIT_AUTO_RELEASE_DAYS = 7;
export const DEPOSIT_REMINDER_DAYS = DEPOSIT_AUTO_RELEASE_DAYS - 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

type DepositFields = Pick<
  IEquipmentBooking,
  "depositResolution" | "depositClaimedAt" | "depositDispute" | "returnConfirmedAt" | "updatedAt" | "status" | "counterReports"
>;

/**
 * The last moment the renter can dispute a claim, or null if there's no open
 * window. If the owner added their own return photos after claiming, the
 * renter gets the full window from then, to answer them.
 */
export const disputeDeadline = (booking: Partial<DepositFields>): Date | null => {
  if (booking.depositResolution !== "claimed" || !booking.depositClaimedAt) return null;
  const ownerReport = (booking.counterReports ?? []).find((report) => report.stage === "return" && report.role === "owner");
  const from =
    ownerReport && ownerReport.at.getTime() > booking.depositClaimedAt.getTime() ? ownerReport.at : booking.depositClaimedAt;
  return addDays(from, DEPOSIT_DISPUTE_DAYS);
};

/**
 * Whether a claim is final: its dispute window passed unused, or an admin
 * decided the dispute. Claims made before disputes existed have no date and
 * count as final.
 */
export const isClaimSettled = (booking: Partial<DepositFields>, now: Date = new Date()): boolean => {
  if (booking.depositResolution !== "claimed") return true;
  if (booking.depositDispute) return booking.depositDispute.status === "decided";
  const deadline = disputeDeadline(booking);
  return !deadline || deadline <= now;
};

/** When an unsettled deposit will be released by itself, or null if it won't. */
export const autoReleaseAt = (booking: Partial<DepositFields>): Date | null => {
  if (booking.status !== "completed" || booking.depositResolution !== "pending") return null;
  const returnedAt = booking.returnConfirmedAt ?? booking.updatedAt;
  return returnedAt ? addDays(returnedAt, DEPOSIT_AUTO_RELEASE_DAYS) : null;
};

const titleOf = async (equipmentId: unknown): Promise<string> => {
  const equipment = await Equipment.findById(equipmentId).select("title").lean().exec();
  return equipment?.title ?? "your rental";
};

// Completed, paid rentals with a deposit the owner hasn't settled, returned
// before `cutoff`. Older bookings have no return date, so fall back to updatedAt.
const unsettledReturnedBefore = (cutoff: Date): Record<string, unknown> => ({
  status: "completed",
  paymentStatus: "paid",
  securityDeposit: { $gt: 0 },
  depositResolution: "pending",
  $or: [
    { returnConfirmedAt: { $lte: cutoff } },
    { returnConfirmedAt: { $exists: false }, updatedAt: { $lte: cutoff } },
  ],
});

/**
 * Reminds owners whose deposit is about to release itself, then releases the
 * ones past the deadline. Each booking is updated only if it's still in the
 * state it was found in, so running this twice, or on two servers at once,
 * never notifies anyone twice.
 */
export const settleDueDeposits = async (now: Date = new Date()): Promise<{ reminded: number; released: number }> => {
  let reminded = 0;
  let released = 0;

  // A rental with no deposit has nothing to settle. Older ones were left
  // pending, which kept both sides from reviewing.
  await EquipmentBooking.updateMany(
    {
      status: "completed",
      depositResolution: "pending",
      $or: [{ securityDeposit: { $lte: 0 } }, { securityDeposit: { $exists: false } }],
    },
    { $set: { depositResolution: "released" } },
  ).exec();

  const toRelease =await EquipmentBooking.find(unsettledReturnedBefore(addDays(now, -DEPOSIT_AUTO_RELEASE_DAYS)))
    .select("_id")
    .lean()
    .exec();
  for (const { _id } of toRelease) {
    const booking = await EquipmentBooking.findOneAndUpdate(
      { _id, depositResolution: "pending" },
      { $set: { depositResolution: "released" }, $unset: { depositClaimNotes: 1, depositClaimAmount: 1 } },
      { returnDocument: "after" },
    ).exec();
    if (!booking) continue;
    released += 1;
    const title = await titleOf(booking.equipment);
    const deposit = formatTaka(booking.securityDeposit);
    await Notification.insertMany([
      {
        recipient: booking.renter,
        type: "equipment_deposit_released",
        message: `Your ${deposit} deposit for ${title} was released in full, as the owner didn't settle it within ${DEPOSIT_AUTO_RELEASE_DAYS} days. CivilHub will refund it.`,
        equipment: booking.equipment,
        equipmentBooking: booking._id,
      },
      {
        recipient: booking.owner,
        type: "equipment_deposit_released",
        message: `The ${deposit} deposit for ${title} was released to the renter, as it wasn't settled within ${DEPOSIT_AUTO_RELEASE_DAYS} days of the return.`,
        equipment: booking.equipment,
        equipmentBooking: booking._id,
      },
    ]);
  }

  const toRemind = await EquipmentBooking.find({
    ...unsettledReturnedBefore(addDays(now, -DEPOSIT_REMINDER_DAYS)),
    depositReminderSentAt: { $exists: false },
  })
    .select("_id")
    .lean()
    .exec();
  for (const { _id } of toRemind) {
    const booking = await EquipmentBooking.findOneAndUpdate(
      { _id, depositResolution: "pending", depositReminderSentAt: { $exists: false } },
      { $set: { depositReminderSentAt: now } },
      { returnDocument: "after" },
    ).exec();
    if (!booking) continue;
    reminded += 1;
    const releaseAt = autoReleaseAt(booking);
    const when = releaseAt
      ? releaseAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "soon";
    await Notification.create({
      recipient: booking.owner,
      type: "equipment_deposit_reminder",
      message: `Release or claim the deposit for ${await titleOf(booking.equipment)} by ${when}. After that it's released to the renter in full.`,
      equipment: booking.equipment,
      equipmentBooking: booking._id,
    });
  }

  return { reminded, released };
};

/** Runs the sweep and logs, rather than throws, if it fails; for timers. */
export const settleDueDepositsQuietly = (): void => {
  settleDueDeposits().catch((error: unknown) => {
    console.error("Deposit settlement sweep failed", error);
  });
};

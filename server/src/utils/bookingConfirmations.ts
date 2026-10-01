import { Equipment } from "../models/Equipment.model";
import {
  EquipmentBooking,
  type EquipmentBookingStatus,
  type IEquipmentBooking,
} from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";

/**
 * Who confirms each step of a rental. The renter confirms the pickup (they
 * have the machine) and the owner confirms the return (they have it back).
 * The other side can mark a step done first; it then completes when the
 * right side confirms, or by itself after CONFIRMATION_WAIT_HOURS.
 */

export type BookingStage = "pickup" | "return";

export const STAGE_CONFIRMER: Record<BookingStage, "renter" | "owner"> = {
  pickup: "renter",
  return: "owner",
};

export const CONFIRMATION_WAIT_HOURS = 48;
const WAIT_MS = CONFIRMATION_WAIT_HOURS * 60 * 60 * 1000;

export const STAGE_STATUSES: Record<BookingStage, { from: EquipmentBookingStatus; to: EquipmentBookingStatus }> = {
  pickup: { from: "approved", to: "in_progress" },
  return: { from: "in_progress", to: "completed" },
};

/** When a step marked done by the other side confirms itself, or null. */
export const autoConfirmAt = (awaitingSince: Date | null | undefined): Date | null =>
  awaitingSince ? new Date(awaitingSince.getTime() + WAIT_MS) : null;

/**
 * The fields that complete a step. A rental with no deposit has nothing to
 * settle once it's back, so its deposit counts as released.
 */
export const completeStageFields = (
  stage: BookingStage,
  booking: Pick<IEquipmentBooking, "securityDeposit">,
  now: Date,
): Record<string, unknown> => ({
  [`${stage}ConfirmedAt`]: now,
  [`${stage}AwaitingSince`]: null,
  status: STAGE_STATUSES[stage].to,
  ...(stage === "return" && !(booking.securityDeposit > 0) ? { depositResolution: "released" } : {}),
});

const stageNoun = (stage: BookingStage): string => (stage === "pickup" ? "pickup" : "return");

/**
 * Confirms the steps the right side hasn't answered within the wait. Each
 * booking is updated only if it's still waiting, so running this twice never
 * confirms or notifies twice.
 */
export const settleDueConfirmations = async (now: Date = new Date()): Promise<number> => {
  let confirmed = 0;
  const cutoff = new Date(now.getTime() - WAIT_MS);
  for (const stage of ["pickup", "return"] as const) {
    const { from } = STAGE_STATUSES[stage];
    const due = await EquipmentBooking.find({
      status: from,
      [`${stage}ConfirmedAt`]: null,
      [`${stage}AwaitingSince`]: { $lte: cutoff },
    })
      .select("_id securityDeposit")
      .lean()
      .exec();
    for (const row of due) {
      const booking = await EquipmentBooking.findOneAndUpdate(
        { _id: row._id, status: from, [`${stage}ConfirmedAt`]: null, [`${stage}AwaitingSince`]: { $lte: cutoff } },
        { $set: completeStageFields(stage, row, now) },
        { returnDocument: "after" },
      ).exec();
      if (!booking) continue;
      confirmed += 1;
      const equipment = await Equipment.findById(booking.equipment).select("title").lean().exec();
      const title = equipment?.title ?? "your rental";
      const message = `The ${stageNoun(stage)} of ${title} was confirmed automatically, as the ${STAGE_CONFIRMER[stage]} didn't respond within ${CONFIRMATION_WAIT_HOURS} hours.`;
      await Notification.insertMany(
        [booking.renter, booking.owner].map((recipient) => ({
          recipient,
          type: stage === "pickup" ? "equipment_pickup_confirmed" : "equipment_return_confirmed",
          message,
          equipment: booking.equipment,
          equipmentBooking: booking._id,
        })),
      );
    }
  }
  return confirmed;
};

import { type NextFunction, type Response } from "express";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import {
  type DepositDisputeDecision,
  EquipmentBooking,
  type IEquipmentBooking,
} from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { type IPayment, Payment } from "../models/Payment.model";
import { type IRefund, Refund } from "../models/Refund.model";
import { formatTaka } from "../utils/money";
import { PAGE_SIZE, logAction, objectId, pageOf, requireReason } from "./admin.controller";

/**
 * Deposit disputes: a renter objected to the owner's damage claim, and an
 * admin decides whether the claim stands, is reduced, or is rejected.
 * The decision settles the claim, so the owner's share and the renter's
 * refund both follow from it (see utils/earnings.ts and utils/refunds.ts).
 */

interface Party {
  id: string;
  name: string;
  email: string;
}

const toParty = (value: unknown): Party | null => {
  if (!value || typeof value !== "object" || !("name" in value)) return null;
  const user = value as { _id: { toString(): string }; name: string; email?: string };
  return { id: user._id.toString(), name: user.name, email: user.email ?? "" };
};

const titleOf = (booking: IEquipmentBooking): string => {
  const equipment = booking.equipment as unknown as { title?: string } | null;
  return equipment && typeof equipment === "object" && equipment.title ? equipment.title : "Equipment rental";
};

const toSummary = (booking: IEquipmentBooking) => {
  const dispute = booking.depositDispute!;
  return {
    bookingId: booking._id.toString(),
    equipment: titleOf(booking),
    renter: toParty(booking.renter),
    owner: toParty(booking.owner),
    securityDeposit: booking.securityDeposit,
    claimAmount: booking.depositClaimAmount ?? 0,
    claimNotes: booking.depositClaimNotes ?? null,
    claimedAt: booking.depositClaimedAt?.toISOString() ?? null,
    dispute: {
      status: dispute.status,
      reason: dispute.reason,
      openedAt: dispute.openedAt.toISOString(),
      decision: dispute.decision ?? null,
      originalClaimAmount: dispute.originalClaimAmount,
      decisionNote: dispute.decisionNote ?? null,
      decidedAt: dispute.decidedAt?.toISOString() ?? null,
    },
  };
};

const findDisputed = (bookingId: string | undefined) =>
  EquipmentBooking.findOne({
    _id: objectId(bookingId, "Booking"),
    "depositDispute.status": { $exists: true },
  })
    .populate("equipment", "title")
    .populate("renter", "name email")
    .populate("owner", "name email");

export const listDeposits = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status: "open" | "decided" = req.query.status === "decided" ? "decided" : "open";
    const page = pageOf(req.query.page);
    const filter = { "depositDispute.status": status };
    const [rows, total] = await Promise.all([
      EquipmentBooking.find(filter)
        // Oldest open dispute first, as it's waited longest; newest decision first.
        .sort(status === "open" ? { "depositDispute.openedAt": 1 } : { "depositDispute.decidedAt": -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("equipment", "title")
        .populate("renter", "name email")
        .populate("owner", "name email")
        .exec(),
      EquipmentBooking.countDocuments(filter).exec(),
    ]);
    res.json({ items: rows.map(toSummary), page, pageSize: PAGE_SIZE, total });
  } catch (error: unknown) {
    next(error);
  }
};

export const getDeposit = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const booking = await findDisputed(req.params.bookingId).exec();
    if (!booking) throw adminError("Deposit dispute not found", 404);

    const payment = await Payment.findOne({
      equipmentBooking: booking._id,
      type: "equipment_booking",
      status: "paid",
      refundDue: { $ne: true },
    })
      .lean<IPayment>()
      .exec();
    const refund = payment
      ? await Refund.findOne({ payment: payment._id, kind: "deposit" }).sort({ createdAt: -1 }).lean<IRefund>().exec()
      : null;

    const photos = (list: Array<{ url: string }>): string[] => list.map((photo) => photo.url);
    res.json({
      ...toSummary(booking),
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
      pickup: {
        at: booking.pickupConfirmedAt?.toISOString() ?? null,
        notes: booking.pickupConditionNotes ?? null,
        photos: photos(booking.pickupConditionPhotos),
      },
      return: {
        at: booking.returnConfirmedAt?.toISOString() ?? null,
        notes: booking.returnConditionNotes ?? null,
        photos: photos(booking.returnConditionPhotos),
      },
      payment: payment
        ? { id: payment._id.toString(), amount: payment.amount, depositAmount: payment.depositAmount, tranId: payment.tranId ?? null }
        : null,
      refund: refund ? { amount: refund.amount, status: refund.status, method: refund.method } : null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

const DECISIONS: DepositDisputeDecision[] = ["upheld", "reduced", "rejected"];

export const decideDeposit = async (
  req: AdminRequest<{ decision?: unknown; amount?: unknown; note?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const decision = req.body.decision as DepositDisputeDecision;
    if (!DECISIONS.includes(decision)) throw adminError("Choose uphold, reduce or reject.", 400);
    const note = requireReason(req.body.note);

    const booking = await findDisputed(req.params.bookingId).exec();
    if (!booking?.depositDispute) throw adminError("Deposit dispute not found", 404);
    if (booking.depositDispute.status !== "open") throw adminError("This dispute has already been decided.", 409);

    const claimed = booking.depositClaimAmount ?? 0;
    let finalClaim = claimed;
    if (decision === "reduced") {
      const amount = Math.round(Number(req.body.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0 || amount >= claimed) {
        throw adminError(`The reduced claim must be more than 0 and less than ${formatTaka(claimed)}.`, 400);
      }
      finalClaim = amount;
    } else if (decision === "rejected") {
      finalClaim = 0;
    }

    // Only one admin's decision can land, even if two submit at once.
    const decidedAt = new Date();
    const update =
      decision === "rejected"
        ? {
            $set: {
              depositResolution: "released",
              "depositDispute.status": "decided",
              "depositDispute.decision": decision,
              "depositDispute.decisionNote": note,
              "depositDispute.decidedBy": req.admin.id,
              "depositDispute.decidedAt": decidedAt,
            },
            $unset: { depositClaimAmount: 1 },
          }
        : {
            $set: {
              depositClaimAmount: finalClaim,
              "depositDispute.status": "decided",
              "depositDispute.decision": decision,
              "depositDispute.decisionNote": note,
              "depositDispute.decidedBy": req.admin.id,
              "depositDispute.decidedAt": decidedAt,
            },
          };
    const updated = await EquipmentBooking.findOneAndUpdate(
      { _id: booking._id, "depositDispute.status": "open" },
      update,
      { returnDocument: "after" },
    ).exec();
    if (!updated) throw adminError("This dispute has already been decided.", 409);

    const title = titleOf(booking);
    const refundBack = booking.securityDeposit - finalClaim;
    const outcome =
      decision === "upheld"
        ? `CivilHub upheld the ${formatTaka(claimed)} deposit claim for ${title}.`
        : decision === "reduced"
          ? `CivilHub reduced the deposit claim for ${title} from ${formatTaka(claimed)} to ${formatTaka(finalClaim)}.`
          : `CivilHub rejected the ${formatTaka(claimed)} deposit claim for ${title}.`;
    const common = { type: "equipment_deposit_decided" as const, equipment: updated.equipment, equipmentBooking: updated._id };
    await Notification.insertMany([
      {
        ...common,
        recipient: updated.renter,
        message:
          refundBack > 0
            ? `${outcome} CivilHub will refund you ${formatTaka(refundBack)}. Note from CivilHub: ${note}`
            : `${outcome} Note from CivilHub: ${note}`,
      },
      {
        ...common,
        recipient: updated.owner,
        message:
          finalClaim > 0
            ? `${outcome} ${formatTaka(finalClaim)} will be paid to you with your earnings. Note from CivilHub: ${note}`
            : `${outcome} Note from CivilHub: ${note}`,
      },
    ]);

    await logAction(req, "deposit.decide", {
      targetType: "booking",
      targetId: updated._id,
      subjectUser: updated.owner,
      reason: note,
      meta: { decision, claimed, finalClaim, deposit: booking.securityDeposit, renter: updated.renter.toString() },
    });

    res.json(toSummary(await findDisputed(updated._id.toString()).exec() as IEquipmentBooking));
  } catch (error: unknown) {
    next(error);
  }
};

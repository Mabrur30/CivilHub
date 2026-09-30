import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import {
  type BookingConditionPhoto,
  type DepositDisputeDecision,
  EquipmentBooking,
  type IEquipmentBooking,
} from "../models/EquipmentBooking.model";
import { type IPayment, Payment } from "../models/Payment.model";
import { type IRefund, Refund } from "../models/Refund.model";
import { casesAwaitingAdmin, loadCase, threadsForAdmin } from "../utils/disputeCases";
import { type EvidenceContext, evidenceView } from "../utils/evidence";
import {
  announcePendingDecision,
  appealDeadlineFrom,
  assertCanReviewAppeal,
  checkDepositOutcome,
  decisionReview,
  describeDepositOutcome,
  finalizeDepositDispute,
  finalizeDueDecisions,
} from "../utils/disputeDecisions";
import { PAGE_SIZE, logAction, objectId, pageOf, requireReason } from "./admin.controller";
import { sendAdminCaseMessage } from "./caseMessage.controller";

/**
 * Deposit disputes: a renter objected to the owner's damage claim, and an
 * admin decides whether the claim stands, is reduced, or is rejected.
 * The decision waits out an appeal window, then settles the claim, so the
 * owner's share and the renter's refund both follow from it (see
 * utils/disputeDecisions.ts, utils/earnings.ts and utils/refunds.ts).
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
      stage: dispute.stage ?? "review",
      pendingDecision: dispute.pendingDecision
        ? {
            decision: dispute.pendingDecision.decision,
            amount: dispute.pendingDecision.amount,
            note: dispute.pendingDecision.note,
            decidedBy: dispute.pendingDecision.decidedBy.toString(),
            decidedAt: dispute.pendingDecision.decidedAt.toISOString(),
            appealDeadline: dispute.pendingDecision.appealDeadline.toISOString(),
            acceptedBy: dispute.pendingDecision.acceptedBy.map((id) =>
              id.toString() === ((booking.renter as unknown as { _id?: unknown })?._id ?? booking.renter)?.toString()
                ? "renter"
                : "owner",
            ),
          }
        : null,
      appeal: dispute.appeal
        ? {
            role: dispute.appeal.role,
            reason: dispute.appeal.reason,
            openedAt: dispute.appeal.openedAt.toISOString(),
            decision: dispute.appeal.decision ?? null,
            note: dispute.appeal.note ?? null,
            decidedAt: dispute.appeal.decidedAt?.toISOString() ?? null,
          }
        : null,
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
    await finalizeDueDecisions();
    const status: "open" | "appealed" | "decided" =
      req.query.status === "decided" ? "decided" : req.query.status === "appealed" ? "appealed" : "open";
    const page = pageOf(req.query.page);
    const filter: Record<string, unknown> =
      status === "decided"
        ? { "depositDispute.status": "decided" }
        : status === "appealed"
          ? { "depositDispute.status": "open", "depositDispute.stage": "appealed" }
          : { "depositDispute.status": "open", "depositDispute.stage": { $ne: "appealed" } };
    const [rows, total] = await Promise.all([
      EquipmentBooking.find(filter)
        // Oldest open dispute first, as it's waited longest; newest decision first.
        .sort(status === "decided" ? { "depositDispute.decidedAt": -1 } : { "depositDispute.openedAt": 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("equipment", "title")
        .populate("renter", "name email")
        .populate("owner", "name email")
        .exec(),
      EquipmentBooking.countDocuments(filter).exec(),
    ]);
    const waiting = await casesAwaitingAdmin("deposit", rows.map((row) => row._id));
    res.json({
      items: rows.map((row) => ({ ...toSummary(row), newReply: waiting.has(row._id.toString()) })),
      page,
      pageSize: PAGE_SIZE,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getDeposit = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await finalizeDueDecisions();
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

    const info = await loadCase("deposit", booking._id);
    // Photos are checked against when the rental began and, for the return, the pickup.
    const rentalStart = { at: booking.startDate, flag: "Taken before the rental started." };
    const pickupContext: EvidenceContext = { notBefore: [rentalStart] };
    const returnContext: EvidenceContext = {
      notBefore: [
        rentalStart,
        ...(booking.pickupConfirmedAt ? [{ at: booking.pickupConfirmedAt, flag: "Return photo taken before the pickup." }] : []),
      ],
    };
    const renterId = ((booking.renter as unknown as { _id?: Types.ObjectId })?._id ?? booking.renter).toString();
    const roleOf = (id: Types.ObjectId | null | undefined): "renter" | "owner" | null =>
      id ? (id.toString() === renterId ? "renter" : "owner") : null;
    const photos = (list: BookingConditionPhoto[], context: EvidenceContext) =>
      list.map((photo) => ({
        url: photo.url,
        isImage: true,
        uploadedByRole: roleOf(photo.uploadedBy),
        // Named fields: spreading a Mongoose subdocument doesn't copy them.
        ...evidenceView(
          {
            uploadedAt: photo.uploadedAt,
            takenAt: photo.takenAt,
            location: photo.location,
            camera: photo.camera,
            resourceType: "image",
          },
          context,
        ),
      }));
    res.json({
      ...toSummary(booking),
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
      pickup: {
        at: booking.pickupConfirmedAt?.toISOString() ?? null,
        by: roleOf(booking.pickupConfirmedBy),
        notes: booking.pickupConditionNotes ?? null,
        photos: photos(booking.pickupConditionPhotos, pickupContext),
      },
      return: {
        at: booking.returnConfirmedAt?.toISOString() ?? null,
        by: roleOf(booking.returnConfirmedBy),
        notes: booking.returnConditionNotes ?? null,
        photos: photos(booking.returnConditionPhotos, returnContext),
      },
      // The other side's own records of the pickup or return.
      counterReports: (booking.counterReports ?? []).map((report) => ({
        stage: report.stage,
        by: report.role,
        at: report.at.toISOString(),
        notes: report.notes ?? null,
        photos: photos(report.photos, report.stage === "pickup" ? pickupContext : returnContext),
      })),
      payment: payment
        ? { id: payment._id.toString(), amount: payment.amount, depositAmount: payment.depositAmount, tranId: payment.tranId ?? null }
        : null,
      refund: refund ? { amount: refund.amount, status: refund.status, method: refund.method } : null,
      // CivilHub's private threads with the renter and the owner.
      threads: info ? await threadsForAdmin(info) : {},
      review: await decisionReview(req.admin.id, booking.depositDispute?.pendingDecision?.decidedBy),
    });
  } catch (error: unknown) {
    next(error);
  }
};

/** Writes to the renter or the owner in their private thread. */
export const messageDepositParty = async (
  req: AdminRequest<{ to?: unknown; text?: unknown; replyByDays?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { message } = await sendAdminCaseMessage(req, "deposit", req.params.bookingId);
    res.status(201).json(message);
  } catch (error: unknown) {
    next(error);
  }
};

const DECISIONS: DepositDisputeDecision[] = ["upheld", "reduced", "rejected"];

const pickDecision = (value: unknown): DepositDisputeDecision => {
  const decision = DECISIONS.find((item) => item === value);
  if (!decision) throw adminError("Choose uphold, reduce or reject.", 400);
  return decision;
};

/**
 * An admin decides a disputed claim. The decision waits APPEAL_DAYS for an
 * appeal, with the claimed money still on hold, unless both sides accept it.
 */
export const decideDeposit = async (
  req: AdminRequest<{ decision?: unknown; amount?: unknown; note?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const decision = pickDecision(req.body.decision);
    const note = requireReason(req.body.note);

    const booking = await findDisputed(req.params.bookingId).exec();
    if (!booking?.depositDispute) throw adminError("Deposit dispute not found", 404);
    if (booking.depositDispute.status !== "open") throw adminError("This dispute has already been decided.", 409);
    if ((booking.depositDispute.stage ?? "review") !== "review") throw adminError("This dispute already has a decision.", 409);

    const claimed = booking.depositClaimAmount ?? 0;
    const amount = checkDepositOutcome(claimed, decision, req.body.amount);
    const now = new Date();
    const appealDeadline = appealDeadlineFrom(now);
    // Only one admin's decision can land, even if two submit at once.
    const filter: Record<string, unknown> = {
      _id: booking._id,
      "depositDispute.status": "open",
      "depositDispute.stage": { $in: ["review", null] },
    };
    const updated = await EquipmentBooking.findOneAndUpdate(
      filter,
      {
        $set: {
          "depositDispute.stage": "awaiting_final",
          "depositDispute.pendingDecision": {
            decision,
            amount,
            note,
            decidedBy: req.admin.id,
            decidedAt: now,
            appealDeadline,
            acceptedBy: [],
          },
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (!updated) throw adminError("This dispute already has a decision.", 409);

    await announcePendingDecision(
      [updated.renter, updated.owner],
      { equipment: updated.equipment, equipmentBooking: updated._id },
      describeDepositOutcome(titleOf(booking), claimed, { decision, amount }),
      note,
      appealDeadline,
    );
    await logAction(req, "deposit.decide", {
      targetType: "booking",
      targetId: updated._id,
      subjectUser: updated.owner,
      reason: note,
      meta: {
        decision,
        claimed,
        finalClaim: amount,
        deposit: booking.securityDeposit,
        renter: updated.renter.toString(),
        takesEffect: appealDeadline,
      },
    });

    res.json(toSummary((await findDisputed(updated._id.toString()).exec()) as IEquipmentBooking));
  } catch (error: unknown) {
    next(error);
  }
};

/** Another admin upholds or changes an appealed decision; it takes effect at once. */
export const decideDepositAppeal = async (
  req: AdminRequest<{ decision?: unknown; note?: unknown; newDecision?: unknown; amount?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const choice = req.body.decision === "uphold" || req.body.decision === "change" ? req.body.decision : null;
    if (!choice) throw adminError("Choose to uphold the decision or change it.", 400);
    const note = requireReason(req.body.note);
    const booking = await findDisputed(req.params.bookingId).exec();
    const dispute = booking?.depositDispute;
    if (!booking || !dispute || dispute.status !== "open" || dispute.stage !== "appealed" || !dispute.pendingDecision || !dispute.appeal) {
      throw adminError("There's no appeal waiting on this dispute.", 409);
    }
    await assertCanReviewAppeal(req.admin.id, dispute.pendingDecision.decidedBy);

    const claimed = booking.depositClaimAmount ?? 0;
    const decision = choice === "uphold" ? dispute.pendingDecision.decision : pickDecision(req.body.newDecision);
    const amount = choice === "uphold" ? dispute.pendingDecision.amount : checkDepositOutcome(claimed, decision, req.body.amount);
    const now = new Date();

    const recorded = await EquipmentBooking.updateOne(
      { _id: booking._id, "depositDispute.stage": "appealed", "depositDispute.appeal.decision": null },
      {
        $set: {
          "depositDispute.appeal.decision": choice === "uphold" ? "upheld" : "changed",
          "depositDispute.appeal.note": note,
          "depositDispute.appeal.decidedBy": req.admin.id,
          "depositDispute.appeal.decidedAt": now,
        },
      },
    ).exec();
    if (recorded.modifiedCount !== 1) throw adminError("This appeal has already been decided.", 409);

    const finalized = await finalizeDepositDispute(
      booking._id,
      { decision, amount, note, decidedBy: new Types.ObjectId(req.admin.id), decidedAt: now },
      ["appealed"],
      choice === "uphold"
        ? "CivilHub reviewed the appeal and upheld its decision."
        : "CivilHub reviewed the appeal and changed its decision.",
      "dispute_appeal_decided",
    );
    if (!finalized) throw adminError("This dispute has already been decided.", 409);

    await logAction(req, "deposit.appeal", {
      targetType: "booking",
      targetId: booking._id,
      subjectUser: dispute.appeal.by,
      reason: note,
      meta: { decision: choice, outcome: decision, finalClaim: amount, claimed },
    });
    res.json(toSummary((await findDisputed(booking._id.toString()).exec()) as IEquipmentBooking));
  } catch (error: unknown) {
    next(error);
  }
};

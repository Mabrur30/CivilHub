import { Types } from "mongoose";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { type IPayment, Payment } from "../models/Payment.model";
import { Payout } from "../models/Payout.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { isClaimSettled } from "./deposits";

/**
 * What each payee has earned, and how much of it CivilHub can pay out.
 *
 * Money is released only once the work is accepted:
 * - a phase payment when it's paid, since the client pays as they approve;
 * - the advance and an upfront balance pro rata as phases are completed,
 *   and in full when the project completes;
 * - a rental when the booking is completed, plus any deposit the owner
 *   claimed for damage once the renter can no longer dispute it (or an
 *   admin has decided the dispute).
 * Everything else is on hold. Owed = released − already paid out.
 */

export interface EarningLine {
  paymentId: string;
  kind: "phase" | "advance" | "full_remaining" | "equipment_booking" | "deposit_claim";
  description: string;
  paidAt: string | null;
  /** The payee's share after CivilHub's fee. */
  amount: number;
  released: number;
  onHold: number;
}

export interface PayeeEarnings {
  released: number;
  onHold: number;
  paidOut: number;
  owed: number;
  lines: EarningLine[];
}

const toPaisa = (amount: number): number => Math.round(amount * 100);
const fromPaisa = (paisa: number): number => paisa / 100;

const emptyEarnings = (): PayeeEarnings => ({ released: 0, onHold: 0, paidOut: 0, owed: 0, lines: [] });

/** Share of a project's work accepted so far, from 0 to 1. */
const acceptedShareByProject = async (projectIds: Types.ObjectId[]): Promise<Map<string, number>> => {
  if (projectIds.length === 0) return new Map();
  const [projects, phases] = await Promise.all([
    Project.find({ _id: { $in: projectIds } }).select("status").lean().exec(),
    ProjectPhase.find({ project: { $in: projectIds } }).select("project price status").lean().exec(),
  ]);
  const totals = new Map<string, { all: number; done: number }>();
  for (const phase of phases) {
    const key = phase.project.toString();
    const entry = totals.get(key) ?? { all: 0, done: 0 };
    entry.all += toPaisa(phase.price);
    if (phase.status === "completed") entry.done += toPaisa(phase.price);
    totals.set(key, entry);
  }
  const shares = new Map<string, number>();
  for (const project of projects) {
    const key = project._id.toString();
    const entry = totals.get(key);
    shares.set(
      key,
      project.status === "completed" ? 1 : entry && entry.all > 0 ? entry.done / entry.all : 0,
    );
  }
  return shares;
};

/** Earnings for the given payees, or for everyone who has been paid through CivilHub. */
export const getEarnings = async (payeeIds?: string[]): Promise<Map<string, PayeeEarnings>> => {
  const payeeFilter = payeeIds
    ? { payee: { $in: payeeIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } }
    : { payee: { $exists: true, $ne: null } };
  // A payment waiting to be refunded was never earned.
  const payments = await Payment.find({ status: "paid", refundDue: { $ne: true }, ...payeeFilter })
    .select("type project equipmentBooking payee payeeAmount description paidAt createdAt")
    .sort({ paidAt: -1, createdAt: -1 })
    .lean<IPayment[]>()
    .exec();

  const projectIds = [
    ...new Map(
      payments
        .filter((payment) => payment.project && payment.type !== "phase")
        .map((payment) => [payment.project!.toString(), payment.project as Types.ObjectId]),
    ).values(),
  ];
  const bookingIds = payments
    .filter((payment) => payment.equipmentBooking)
    .map((payment) => payment.equipmentBooking as Types.ObjectId);

  const [shares, bookings, payoutRows] = await Promise.all([
    acceptedShareByProject(projectIds),
    bookingIds.length
      ? EquipmentBooking.find({ _id: { $in: bookingIds } })
          .select("status depositResolution depositClaimAmount depositClaimedAt depositDispute")
          .lean()
          .exec()
      : Promise.resolve([]),
    Payout.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: payeeIds ? { payee: payeeFilter.payee } : {} },
      { $group: { _id: "$payee", total: { $sum: "$amount" } } },
    ]).exec(),
  ]);
  const bookingById = new Map(bookings.map((booking) => [booking._id.toString(), booking]));

  const result = new Map<string, PayeeEarnings>();
  for (const id of payeeIds ?? []) result.set(id, emptyEarnings());
  const forPayee = (id: string): PayeeEarnings => {
    const existing = result.get(id);
    if (existing) return existing;
    const created = emptyEarnings();
    result.set(id, created);
    return created;
  };

  for (const payment of payments) {
    if (!payment.payee) continue;
    const earnings = forPayee(payment.payee.toString());
    const amountPaisa = toPaisa(payment.payeeAmount ?? 0);
    let releasedPaisa = 0;

    if (payment.type === "phase") {
      releasedPaisa = amountPaisa;
    } else if (payment.type === "equipment_booking") {
      const booking = payment.equipmentBooking
        ? bookingById.get(payment.equipmentBooking.toString())
        : undefined;
      releasedPaisa = booking?.status === "completed" ? amountPaisa : 0;
      // A deposit the owner claimed for damage is theirs; it carries no fee.
      // It's on hold while the renter can still dispute it.
      if (booking?.depositResolution === "claimed" && (booking.depositClaimAmount ?? 0) > 0) {
        const claim = booking.depositClaimAmount as number;
        const settled = isClaimSettled(booking);
        earnings.lines.push({
          paymentId: payment._id.toString(),
          kind: "deposit_claim",
          description: `Deposit claimed: ${payment.description ?? "equipment rental"}`,
          paidAt: payment.paidAt?.toISOString() ?? null,
          amount: claim,
          released: settled ? claim : 0,
          onHold: settled ? 0 : claim,
        });
      }
    } else {
      const share = payment.project ? (shares.get(payment.project.toString()) ?? 0) : 0;
      releasedPaisa = Math.round(amountPaisa * share);
    }

    earnings.lines.push({
      paymentId: payment._id.toString(),
      kind: payment.type,
      description: payment.description ?? "Payment",
      paidAt: payment.paidAt?.toISOString() ?? null,
      amount: fromPaisa(amountPaisa),
      released: fromPaisa(releasedPaisa),
      onHold: fromPaisa(amountPaisa - releasedPaisa),
    });
  }

  const paidOutById = new Map(payoutRows.map((row) => [row._id.toString(), row.total]));
  for (const [id, earnings] of result) {
    const released = earnings.lines.reduce((sum, line) => sum + toPaisa(line.released), 0);
    const onHold = earnings.lines.reduce((sum, line) => sum + toPaisa(line.onHold), 0);
    const paidOut = toPaisa(paidOutById.get(id) ?? 0);
    earnings.released = fromPaisa(released);
    earnings.onHold = fromPaisa(onHold);
    earnings.paidOut = fromPaisa(paidOut);
    earnings.owed = fromPaisa(Math.max(0, released - paidOut));
  }
  return result;
};

export const getPayeeEarnings = async (payeeId: string): Promise<PayeeEarnings> =>
  (await getEarnings([payeeId])).get(payeeId) ?? emptyEarnings();

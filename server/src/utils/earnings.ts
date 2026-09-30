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
 * - a phase payment when its phase is approved. Clients now fund a phase
 *   before work starts, so the money is held until then; under the older rule
 *   they paid as they approved, which is the same moment;
 * - the advance and an upfront balance pro rata as phases are completed,
 *   and in full when the project completes;
 * - a rental when the booking is completed, plus any deposit the owner
 *   claimed for damage once the renter can no longer dispute it (or an
 *   admin has decided the dispute).
 * On a cancelled project, the unreleased part of the advance or upfront
 * balance, and any funded phase that wasn't approved, is split as agreed or decided: the provider's award is released and
 * the rest is refunded to the client (see utils/projectMoney.ts).
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
  /** Refunded to the client when the project was cancelled; never theirs. */
  refunded?: number;
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
export const acceptedShareByProject = async (projectIds: Types.ObjectId[]): Promise<Map<string, number>> => {
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
    .select("type project phase equipmentBooking payee payeeAmount description paidAt createdAt")
    .sort({ paidAt: -1, createdAt: -1 })
    .lean<IPayment[]>()
    .exec();

  const projectIds = [
    ...new Map(
      payments
        .filter((payment) => payment.project)
        .map((payment) => [payment.project!.toString(), payment.project as Types.ObjectId]),
    ).values(),
  ];
  const phaseIds = payments
    .filter((payment) => payment.type === "phase" && payment.phase)
    .map((payment) => payment.phase as Types.ObjectId);
  const bookingIds = payments
    .filter((payment) => payment.equipmentBooking)
    .map((payment) => payment.equipmentBooking as Types.ObjectId);

  const [shares, cancelledRows, bookings, payoutRows, phaseRows] = await Promise.all([
    acceptedShareByProject(projectIds),
    projectIds.length
      ? Project.find({ _id: { $in: projectIds }, status: "cancelled" }).select("cancellation").lean().exec()
      : Promise.resolve([]),
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
    phaseIds.length
      ? ProjectPhase.find({ _id: { $in: phaseIds } }).select("status").lean().exec()
      : Promise.resolve([]),
  ]);
  const completedPhases = new Set(
    phaseRows.filter((phase) => phase.status === "completed").map((phase) => phase._id.toString()),
  );
  const bookingById = new Map(bookings.map((booking) => [booking._id.toString(), booking]));
  // For each cancelled project, the fraction of held money the provider kept.
  const awardByProject = new Map(
    cancelledRows.map((project) => {
      const cancellation = project.cancellation;
      const fraction =
        cancellation && cancellation.held > 0
          ? Math.min(1, Math.max(0, cancellation.providerAmount / cancellation.held))
          : 0;
      return [project._id.toString(), fraction];
    }),
  );

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
    let refundedPaisa = 0;

    if (payment.type === "phase") {
      // Old phase payments may not name their phase; they were paid on approval.
      const approved = !payment.phase || completedPhases.has(payment.phase.toString());
      releasedPaisa = approved ? amountPaisa : 0;
      const award = awardByProject.get(payment.project?.toString() ?? "");
      if (!approved && award !== undefined) {
        releasedPaisa = Math.round(amountPaisa * award);
        refundedPaisa = amountPaisa - releasedPaisa;
      }
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
      const projectKey = payment.project?.toString() ?? "";
      const share = shares.get(projectKey) ?? 0;
      releasedPaisa = Math.round(amountPaisa * share);
      const award = awardByProject.get(projectKey);
      if (award !== undefined) {
        const heldPaisa = amountPaisa - releasedPaisa;
        const awardPaisa = Math.round(heldPaisa * award);
        releasedPaisa += awardPaisa;
        refundedPaisa = heldPaisa - awardPaisa;
      }
    }

    earnings.lines.push({
      paymentId: payment._id.toString(),
      kind: payment.type,
      description: payment.description ?? "Payment",
      paidAt: payment.paidAt?.toISOString() ?? null,
      amount: fromPaisa(amountPaisa),
      released: fromPaisa(releasedPaisa),
      onHold: fromPaisa(amountPaisa - releasedPaisa - refundedPaisa),
      ...(refundedPaisa > 0 ? { refunded: fromPaisa(refundedPaisa) } : {}),
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

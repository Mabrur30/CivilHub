import { Types } from "mongoose";
import { Payment } from "../models/Payment.model";
import { type IProject } from "../models/Project.model";
import { type IProjectPhase } from "../models/ProjectPhase.model";

/** Share of the agreed value the client pays up front, on either payment plan. */
export const ADVANCE_SHARE = 0.2;

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;

export const getAdvanceAmount = (project: IProject): number =>
  typeof project.advanceRequiredAmount === "number"
    ? project.advanceRequiredAmount
    : fromCents(Math.round(toCents(project.totalAgreedValue ?? 0) * ADVANCE_SHARE));

/** What is left after the advance: paid phase by phase, or in one go on full upfront. */
export const getRemainingBalance = (project: IProject): number =>
  fromCents(
    toCents(project.totalAgreedValue ?? 0) - toCents(getAdvanceAmount(project)),
  );

/**
 * What the client pays when approving each phase on the phase-by-phase plan.
 *
 * The advance already covers part of every phase, so each phase is charged its
 * share of the remaining balance rather than its full price. Amounts are
 * worked out in cents and the last phase takes the rounding difference, so the
 * advance plus every phase adds up to exactly the agreed value.
 */
export const getPhaseAmountsDue = (
  project: IProject,
  phases: IProjectPhase[],
): Map<string, number> => {
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  const remainingCents = toCents(getRemainingBalance(project));
  const priceCents = ordered.map((phase) => toCents(phase.price));
  const priceTotalCents = priceCents.reduce((sum, cents) => sum + cents, 0);

  const amounts = new Map<string, number>();
  if (ordered.length === 0) return amounts;

  let allocatedCents = 0;
  ordered.forEach((phase, index) => {
    const isLast = index === ordered.length - 1;
    const cents = isLast
      ? remainingCents - allocatedCents
      : priceTotalCents === 0
        ? 0
        : Math.round((priceCents[index] * remainingCents) / priceTotalCents);
    allocatedCents += cents;
    amounts.set(phase._id.toString(), fromCents(cents));
  });
  return amounts;
};

/** What was actually charged per phase, including phases paid under older rules. */
export const getAmountsPaidByPhase = async (
  projectId: Types.ObjectId,
): Promise<Map<string, number>> => {
  const rows = await Payment.aggregate<{ _id: Types.ObjectId; total: number }>([
    {
      $match: {
        project: projectId,
        type: "phase",
        phase: { $ne: null },
        status: "paid",
      },
    },
    { $group: { _id: "$phase", total: { $sum: "$amount" } } },
  ]).exec();
  return new Map(rows.map((row) => [row._id.toString(), row.total]));
};

import { Types } from "mongoose";
import { Notification, type NotificationType } from "../models/Notification.model";
import { type IPayment, Payment } from "../models/Payment.model";
import { type IProject, Project } from "../models/Project.model";
import { type IProjectPhase, ProjectPhase } from "../models/ProjectPhase.model";
import { acceptedShareByProject } from "./earnings";
import { isPhaseFunded } from "./phasePayments";
import { formatTaka } from "./money";

/**
 * Money CivilHub holds on a project, and ending a project early.
 *
 * A phase payment is released when its phase is approved (clients fund a
 * phase before work on it starts), and the advance or upfront balance is
 * released as phases are completed. What's released stays with the
 * provider. The rest is "held": when a project is cancelled it's
 * split, the provider keeping `providerAmount` (less CivilHub's usual fee)
 * and the client being refunded the rest in full.
 */

export const APPROVAL_REMINDER_DAYS = 5;
export const NO_RESPONSE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const toPaisa = (amount: number): number => Math.round(amount * 100);
const fromPaisa = (paisa: number): number => paisa / 100;

export interface HeldPayment {
  payment: IPayment;
  /** Of what the client paid, the part not yet released. */
  heldGross: number;
  /** Of the provider's share, the part not yet released. */
  heldPayee: number;
}

export interface HeldMoney {
  held: number;
  payments: HeldPayment[];
}

/** Advance and upfront payments whose release follows the project's progress. */
const progressPayments = (projectId: Types.ObjectId | string): Promise<IPayment[]> =>
  Payment.find({
    project: projectId,
    type: { $in: ["advance", "full_remaining"] },
    status: "paid",
    refundDue: { $ne: true },
  })
    .sort({ paidAt: 1, createdAt: 1 })
    .lean<IPayment[]>()
    .exec();

/** Phase funding paid in before work, for phases not yet approved. */
const fundedPhasePayments = async (projectId: Types.ObjectId): Promise<IPayment[]> => {
  const open = await ProjectPhase.find({ project: projectId, status: { $ne: "completed" } })
    .select("_id")
    .lean()
    .exec();
  if (open.length === 0) return [];
  return Payment.find({
    project: projectId,
    type: "phase",
    phase: { $in: open.map((phase) => phase._id) },
    status: "paid",
    refundDue: { $ne: true },
  })
    .sort({ paidAt: 1, createdAt: 1 })
    .lean<IPayment[]>()
    .exec();
};

export const getHeldMoney = async (projectId: Types.ObjectId | string): Promise<HeldMoney> => {
  const id = new Types.ObjectId(projectId.toString());
  const [payments, funded, shares] = await Promise.all([
    progressPayments(id),
    fundedPhasePayments(id),
    acceptedShareByProject([id]),
  ]);
  const share = shares.get(id.toString()) ?? 0;
  const held = [
    ...payments.map((payment) => ({
      payment,
      heldGross: fromPaisa(Math.round(toPaisa(payment.amount) * (1 - share))),
      heldPayee: fromPaisa(Math.round(toPaisa(payment.payeeAmount ?? 0) * (1 - share))),
    })),
    // Nothing of an unapproved phase's funding has been released.
    ...funded.map((payment) => ({ payment, heldGross: payment.amount, heldPayee: payment.payeeAmount ?? 0 })),
  ];
  return {
    held: fromPaisa(held.reduce((sum, row) => sum + toPaisa(row.heldGross), 0)),
    payments: held,
  };
};

/** The part of the held money a cancelled project's provider was given, 0 to 1. */
export const awardedFraction = (project: Pick<IProject, "cancellation">): number => {
  const cancellation = project.cancellation;
  if (!cancellation || cancellation.held <= 0) return 0;
  return Math.min(1, Math.max(0, cancellation.providerAmount / cancellation.held));
};

/**
 * What a cancelled project owes its client back, one amount per payment so
 * each can be refunded through the gateway by its own transaction.
 */
export const cancellationRefunds = async (
  project: Pick<IProject, "_id" | "cancellation">,
): Promise<Array<{ payment: IPayment; amount: number }>> => {
  const { payments } = await getHeldMoney(project._id as Types.ObjectId);
  const keep = awardedFraction(project);
  return payments
    .map(({ payment, heldGross }) => ({
      payment,
      amount: fromPaisa(Math.round(toPaisa(heldGross) * (1 - keep))),
    }))
    .filter((row) => row.amount > 0);
};

const notify = (recipient: Types.ObjectId | string | undefined | null, type: NotificationType, message: string, project: Types.ObjectId) =>
  recipient ? Notification.create({ recipient, type, message, project }) : Promise.resolve(null);

export const projectTitle = (project: Pick<IProject, "title" | "name">): string =>
  project.title?.trim() || project.name?.trim() || "your project";

/**
 * Ends an in-progress project and splits the held money. Returns null if the
 * project isn't in progress any more, or the held amount no longer covers
 * `providerAmount` (it can shrink if a phase is completed meanwhile).
 */
export const cancelProject = async (
  projectId: Types.ObjectId | string,
  providerAmount: number,
  by: "agreement" | "admin",
  explanation: string,
): Promise<IProject | null> => {
  const { held } = await getHeldMoney(projectId);
  const provider = fromPaisa(toPaisa(providerAmount));
  if (!Number.isFinite(provider) || provider < 0 || provider > held) return null;
  const refund = fromPaisa(toPaisa(held) - toPaisa(provider));

  const project = await Project.findOneAndUpdate(
    { _id: projectId, status: "in-progress" },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellation: { by, held, providerAmount: provider, refundAmount: refund },
        cancellationProposal: null,
        disputeOpen: false,
      },
    },
    { returnDocument: "after" },
  ).exec();
  if (!project) return null;

  const title = projectTitle(project);
  const split =
    held > 0
      ? ` Of the ${formatTaka(held)} CivilHub was holding, ${formatTaka(provider)} goes to the provider and ${formatTaka(refund)} is refunded to the client.`
      : "";
  await Promise.all([
    notify(project.client, "project_cancelled", `${title} was cancelled ${explanation}.${split}`, project._id as Types.ObjectId),
    notify(project.assignedEngineer, "project_cancelled", `${title} was cancelled ${explanation}.${split}`, project._id as Types.ObjectId),
  ]);
  return project;
};

/** When the phase was last handed over, or null if it never was. */
export const lastHandOver = (phase: { submissions?: Array<{ submittedAt: Date }> }): Date | null => {
  const submissions = phase.submissions ?? [];
  return submissions.length > 0 ? submissions[submissions.length - 1].submittedAt : null;
};

/**
 * A handed-over phase the client hasn't answered: remind them after
 * APPROVAL_REMINDER_DAYS, and tell the provider after NO_RESPONSE_DAYS that
 * they can ask CivilHub to step in. Each is sent once per hand-over.
 */
export const settleApprovalReminders = async (
  now: Date = new Date(),
): Promise<{ reminded: number; escalated: number }> => {
  let reminded = 0;
  let escalated = 0;
  const reminderCutoff = new Date(now.getTime() - APPROVAL_REMINDER_DAYS * DAY_MS);
  const escalateCutoff = new Date(now.getTime() - NO_RESPONSE_DAYS * DAY_MS);

  const waiting = await ProjectPhase.find({
    status: "awaiting_approval",
    $or: [{ approvalReminderSentAt: null }, { escalationNoticeSentAt: null }],
  })
    .select("project name submissions approvalReminderSentAt escalationNoticeSentAt")
    .lean()
    .exec();
  if (waiting.length === 0) return { reminded, escalated };

  const projects = new Map(
    (
      await Project.find({
        _id: { $in: waiting.map((phase) => phase.project) },
        status: "in-progress",
        disputeOpen: { $ne: true },
      })
        .select("title name client assignedEngineer")
        .lean()
        .exec()
    ).map((project) => [project._id.toString(), project]),
  );

  for (const phase of waiting) {
    const project = projects.get(phase.project.toString());
    const handedOver = lastHandOver(phase);
    if (!project || !handedOver) continue;
    const projectId = project._id as Types.ObjectId;

    if (!phase.approvalReminderSentAt && handedOver <= reminderCutoff) {
      const updated = await ProjectPhase.updateOne(
        { _id: phase._id, status: "awaiting_approval", approvalReminderSentAt: null },
        { $set: { approvalReminderSentAt: now } },
      ).exec();
      if (updated.modifiedCount === 1) {
        reminded += 1;
        await notify(
          project.client,
          "phase_approval_reminder",
          `${phase.name} on ${projectTitle(project)} was handed over ${APPROVAL_REMINDER_DAYS} days ago and is waiting for you. Approve it or ask for changes.`,
          projectId,
        );
      }
    }

    if (!phase.escalationNoticeSentAt && handedOver <= escalateCutoff) {
      const updated = await ProjectPhase.updateOne(
        { _id: phase._id, status: "awaiting_approval", escalationNoticeSentAt: null },
        { $set: { escalationNoticeSentAt: now } },
      ).exec();
      if (updated.modifiedCount === 1) {
        escalated += 1;
        await notify(
          project.assignedEngineer,
          "phase_approval_reminder",
          `The client hasn't answered your hand-over of ${phase.name} for ${NO_RESPONSE_DAYS} days. You can ask CivilHub to step in from the project page.`,
          projectId,
        );
      }
    }
  }
  return { reminded, escalated };
};

type FundingProject = Pick<
  IProject,
  | "status"
  | "fundingRule"
  | "paymentPlan"
  | "fullPaymentPaid"
  | "advancePaid"
  | "advancePaidAt"
  | "advanceRequiredAmount"
  | "totalAgreedValue"
>;
type FundingPhase = Pick<IProjectPhase, "_id" | "name" | "order" | "price" | "status" | "paymentStatus" | "completedAt">;

/**
 * The phase whose funding the provider is waiting on, and since when: the
 * next phase once the one before it is approved (or the advance paid, for the
 * first), or on the full upfront plan the whole balance. Null when work isn't
 * blocked on money.
 */
export const fundingWait = (
  project: FundingProject,
  phases: FundingPhase[],
): { phase: FundingPhase; since: Date } | null => {
  if (project.fundingRule !== "before_work" || project.status !== "in-progress") return null;
  if (!project.advancePaid) return null;
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  const next = ordered.find((phase) => phase.status !== "completed");
  if (!next || next.status !== "not_started") return null;
  if (isPhaseFunded(project, next, ordered)) return null;
  const previous = ordered.filter((phase) => phase.order < next.order).pop();
  const since = previous?.completedAt ?? project.advancePaidAt;
  return since ? { phase: next, since } : null;
};

/**
 * Work that can't start because the client hasn't funded it: remind the
 * client after APPROVAL_REMINDER_DAYS, and tell the provider after
 * NO_RESPONSE_DAYS that they can ask CivilHub to step in. Once per phase.
 */
export const settleFundingReminders = async (
  now: Date = new Date(),
): Promise<{ reminded: number; escalated: number }> => {
  let reminded = 0;
  let escalated = 0;
  const projects = await Project.find({
    status: "in-progress",
    fundingRule: "before_work",
    advancePaid: true,
    disputeOpen: { $ne: true },
  })
    .select("title name client assignedEngineer status fundingRule paymentPlan fullPaymentPaid advancePaid advancePaidAt advanceRequiredAmount totalAgreedValue")
    .lean()
    .exec();
  if (projects.length === 0) return { reminded, escalated };
  const phases = await ProjectPhase.find({ project: { $in: projects.map((project) => project._id) } })
    .select("project name order price status paymentStatus completedAt fundingReminderSentAt fundingEscalationSentAt")
    .lean()
    .exec();

  for (const project of projects) {
    const wait = fundingWait(
      project,
      phases.filter((phase) => phase.project.toString() === project._id.toString()),
    );
    if (!wait) continue;
    const phase = wait.phase as (typeof phases)[number];
    const waited = now.getTime() - wait.since.getTime();
    const projectId = project._id as Types.ObjectId;
    const what =
      project.paymentPlan === "full_upfront" ? "the remaining balance" : `${phase.name}`;

    if (!phase.fundingReminderSentAt && waited >= APPROVAL_REMINDER_DAYS * DAY_MS) {
      const updated = await ProjectPhase.updateOne(
        { _id: phase._id, fundingReminderSentAt: null },
        { $set: { fundingReminderSentAt: now } },
      ).exec();
      if (updated.modifiedCount === 1) {
        reminded += 1;
        await notify(
          project.client,
          "phase_funding_reminder",
          `Work on ${projectTitle(project)} is waiting for you to fund ${what}. The money is held by CivilHub until you approve the work.`,
          projectId,
        );
      }
    }
    if (!phase.fundingEscalationSentAt && waited >= NO_RESPONSE_DAYS * DAY_MS) {
      const updated = await ProjectPhase.updateOne(
        { _id: phase._id, fundingEscalationSentAt: null },
        { $set: { fundingEscalationSentAt: now } },
      ).exec();
      if (updated.modifiedCount === 1) {
        escalated += 1;
        await notify(
          project.assignedEngineer,
          "phase_funding_reminder",
          `The client hasn't funded ${what} on ${projectTitle(project)} for ${NO_RESPONSE_DAYS} days. You can ask CivilHub to step in from the project page.`,
          projectId,
        );
      }
    }
  }
  return { reminded, escalated };
};

/**
 * Why nobody may change this project right now, or null if they may: it's
 * paused for a dispute, or it has been cancelled.
 */
export const projectLockReason = (project: Pick<IProject, "status" | "disputeOpen">): string | null => {
  if (project.status === "cancelled") return "This project was cancelled.";
  if (project.disputeOpen) return "This project is paused while CivilHub reviews a dispute.";
  return null;
};

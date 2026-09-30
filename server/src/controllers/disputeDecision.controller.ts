import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { ProjectDispute } from "../models/ProjectDispute.model";
import { User } from "../models/User.model";
import { caseError, isCaseType, loadCase, notifyAboutCase, partyOf } from "../utils/disputeCases";
import {
  finalizeDepositDispute,
  finalizeDueDecisions,
  finalizeProjectDispute,
  formatDecisionDay,
} from "../utils/disputeDecisions";

/**
 * A side's answer to a decision waiting out its appeal window: accept it (once
 * both have, it takes effect at once), or appeal it, once, before the deadline.
 */

const APPEAL_MIN = 20;
const APPEAL_MAX = 2000;
const BOTH_ACCEPTED = "You both accepted CivilHub's decision, so it has taken effect.";

const loadAsCaseParty = async (req: AuthenticatedRequest) => {
  const { caseType, caseId } = req.params as { caseType?: string; caseId?: string };
  if (!isCaseType(caseType) || !caseId) throw caseError("Dispute not found", 404);
  await finalizeDueDecisions();
  const info = await loadCase(caseType, caseId);
  if (!info) throw caseError("Dispute not found", 404);
  const party = partyOf(info, req.user.userId);
  if (!party) throw caseError("This dispute isn't yours.", 403);
  return { info, party, other: info.parties.find((item) => item !== party)! };
};

const noDecision = (): Error => caseError("There's no decision waiting for an answer.", 409);

export const acceptCaseDecision = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { info, party, other } = await loadAsCaseParty(req);
    const userId = new Types.ObjectId(req.user.userId);

    if (info.caseType === "project") {
      const dispute = await ProjectDispute.findOneAndUpdate(
        { _id: info.caseId, status: "open", stage: "awaiting_final" },
        { $addToSet: { "decision.acceptedBy": userId } },
        { returnDocument: "after" },
      ).exec();
      if (!dispute?.decision) throw noDecision();
      const accepted = dispute.decision.acceptedBy.map((id) => id.toString());
      if (accepted.includes(other.user.toString())) {
        const decision = dispute.decision;
        await finalizeProjectDispute(
          dispute._id as Types.ObjectId,
          {
            outcome: decision.outcome,
            note: decision.note,
            phase: decision.phase ?? null,
            providerAmount: decision.providerAmount ?? null,
            decidedBy: decision.decidedBy,
            decidedAt: decision.decidedAt,
          },
          ["awaiting_final"],
          BOTH_ACCEPTED,
        );
      }
    } else {
      const filter: Record<string, unknown> = {
        _id: info.caseId,
        "depositDispute.status": "open",
        "depositDispute.stage": "awaiting_final",
      };
      const booking = await EquipmentBooking.findOneAndUpdate(
        filter,
        { $addToSet: { "depositDispute.pendingDecision.acceptedBy": userId } },
        { returnDocument: "after" },
      ).exec();
      const pending = booking?.depositDispute?.pendingDecision;
      if (!booking || !pending) throw noDecision();
      if (pending.acceptedBy.some((id) => id.toString() === other.user.toString())) {
        await finalizeDepositDispute(booking._id, pending, ["awaiting_final"], BOTH_ACCEPTED);
      }
    }
    res.json({ accepted: true, role: party.role });
  } catch (error: unknown) {
    next(error);
  }
};

export const appealCaseDecision = async (
  req: AuthenticatedRequest<{ reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { info, party, other } = await loadAsCaseParty(req);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < APPEAL_MIN) {
      throw caseError("Explain in a few sentences why the decision is wrong, so another admin can look at it.", 400);
    }
    if (reason.length > APPEAL_MAX) throw caseError(`Keep it under ${APPEAL_MAX} characters.`, 400);
    const now = new Date();
    const appeal = { by: new Types.ObjectId(req.user.userId), role: party.role, reason, openedAt: now };

    let deadline: Date | null = null;
    if (info.caseType === "project") {
      const current = await ProjectDispute.findById(info.caseId).select("stage decision appeal").lean().exec();
      if (current?.appeal) throw caseError("This decision has already been appealed; each dispute can be appealed once.", 409);
      const updated = await ProjectDispute.findOneAndUpdate(
        { _id: info.caseId, status: "open", stage: "awaiting_final", appeal: null, "decision.appealDeadline": { $gt: now } },
        { $set: { stage: "appealed", appeal } },
        { returnDocument: "after" },
      ).exec();
      if (!updated) throw caseError("This decision can't be appealed any more.", 409);
      deadline = updated.decision?.appealDeadline ?? null;
    } else {
      const current = await EquipmentBooking.findById(info.caseId).select("depositDispute").lean().exec();
      if (current?.depositDispute?.appeal) {
        throw caseError("This decision has already been appealed; each dispute can be appealed once.", 409);
      }
      const filter: Record<string, unknown> = {
        _id: info.caseId,
        "depositDispute.status": "open",
        "depositDispute.stage": "awaiting_final",
        "depositDispute.appeal": null,
        "depositDispute.pendingDecision.appealDeadline": { $gt: now },
      };
      const updated = await EquipmentBooking.findOneAndUpdate(
        filter,
        { $set: { "depositDispute.stage": "appealed", "depositDispute.appeal": appeal } },
        { returnDocument: "after" },
      ).exec();
      if (!updated) throw caseError("This decision can't be appealed any more.", 409);
      deadline = updated.depositDispute?.pendingDecision?.appealDeadline ?? null;
    }

    const who = await User.findById(req.user.userId).select("name").lean().exec();
    await notifyAboutCase(
      info,
      other.user,
      "dispute_appealed",
      `${who?.name ?? "The other side"} appealed CivilHub's decision about ${info.title}. Another admin will review it; nothing changes until then.`,
    );
    res.status(201).json({ appealed: true, deadline: deadline ? formatDecisionDay(deadline) : null });
  } catch (error: unknown) {
    next(error);
  }
};

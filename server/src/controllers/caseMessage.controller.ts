import { type NextFunction, type Response } from "express";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { CaseMessage, type CaseType } from "../models/CaseMessage.model";
import {
  type CaseInfo,
  caseError,
  checkCaseFiles,
  checkCaseText,
  cleanCaseText,
  formatCaseDay,
  isCaseType,
  loadCase,
  notifyAboutCase,
  partyByRole,
  partyOf,
  pendingReplyBy,
  threadFor,
  toCaseMessageView,
  uploadCaseFile,
} from "../utils/disputeCases";
import { logAction } from "./admin.controller";
import { deletePrivateAsset, uploadAllOrNone } from "../utils/cloudinaryUpload";

/**
 * Messages between CivilHub and each side of a dispute. A user reads and
 * writes only their own thread; admins read both and write to either.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const REPLY_DAYS_MIN = 1;
const REPLY_DAYS_MAX = 7;

const filesOf = (req: { files?: unknown }): Express.Multer.File[] =>
  Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

const loadCaseForUser = async (req: AuthenticatedRequest) => {
  const { caseType, caseId } = req.params as { caseType?: string; caseId?: string };
  if (!isCaseType(caseType) || !caseId) throw caseError("Dispute not found", 404);
  const info = await loadCase(caseType, caseId);
  if (!info) throw caseError("Dispute not found", 404);
  const party = partyOf(info, req.user.userId);
  if (!party) throw caseError("This dispute isn't yours.", 403);
  return { info, party };
};

/** The caller's own thread with CivilHub. */
export const getMyCaseThread = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { info, party } = await loadCaseForUser(req);
    const messages = await threadFor(info, party.user);
    res.json({
      role: party.role,
      active: info.active,
      messages: messages.map((message) => toCaseMessageView(message)),
      replyBy: pendingReplyBy(messages)?.toISOString() ?? null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

/** A party writes to CivilHub, with text, files as evidence, or both. */
export const postMyCaseMessage = async (
  req: AuthenticatedRequest<{ text?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { info, party } = await loadCaseForUser(req);
    if (!info.active) throw caseError("This dispute is closed.", 409);
    const text = cleanCaseText(req.body.text);
    const files = filesOf(req);
    checkCaseText(text, files.length === 0);
    checkCaseFiles(files);

    let uploaded;
    try {
      uploaded = await uploadAllOrNone(
        files,
        (file) => uploadCaseFile(file, party.user),
        (file) => deletePrivateAsset(file.publicId, file.resourceType),
      );
    } catch {
      throw caseError("Your files couldn't be uploaded. Try again.", 422);
    }
    const message = await CaseMessage.create({
      caseType: info.caseType,
      caseId: info.caseId,
      party: party.user,
      partyRole: party.role,
      from: "party",
      text,
      files: uploaded,
    }).catch(async (error: unknown) => {
      // Not saved, so the files it carried are deleted again.
      await Promise.allSettled(uploaded.map((file) => deletePrivateAsset(file.publicId, file.resourceType)));
      throw error;
    });
    res.status(201).json(toCaseMessageView(message));
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * An admin writes to one side of a case, optionally asking for a reply by a
 * date. The side is told, and the message is logged.
 */
export const sendAdminCaseMessage = async (
  req: AdminRequest<{ to?: unknown; text?: unknown; replyByDays?: unknown }>,
  caseType: CaseType,
  caseId: string | undefined,
): Promise<{ info: CaseInfo; message: ReturnType<typeof toCaseMessageView> }> => {
  const info = caseId ? await loadCase(caseType, caseId) : null;
  if (!info) throw adminError("Dispute not found", 404);
  if (!info.active) throw adminError("This dispute is closed.", 409);
  const party = partyByRole(info, req.body.to);
  if (!party) throw adminError(`Choose who to write to: ${info.parties.map((item) => item.role).join(" or ")}.`, 400);
  const text = cleanCaseText(req.body.text);
  checkCaseText(text, true);

  let replyBy: Date | null = null;
  if (req.body.replyByDays !== undefined && req.body.replyByDays !== null && req.body.replyByDays !== "") {
    const days = Number(req.body.replyByDays);
    if (!Number.isInteger(days) || days < REPLY_DAYS_MIN || days > REPLY_DAYS_MAX) {
      throw adminError(`Ask for a reply within ${REPLY_DAYS_MIN} to ${REPLY_DAYS_MAX} days.`, 400);
    }
    replyBy = new Date(Date.now() + days * DAY_MS);
  }

  const message = await CaseMessage.create({
    caseType,
    caseId: info.caseId,
    party: party.user,
    partyRole: party.role,
    from: "admin",
    admin: req.admin.id,
    text,
    replyBy,
  });
  await notifyAboutCase(
    info,
    party.user,
    "dispute_message",
    replyBy
      ? `CivilHub has a question about ${info.title}. Please reply by ${formatCaseDay(replyBy)}.`
      : `CivilHub sent you a message about ${info.title}.`,
  );
  await logAction(req, "dispute.message", {
    targetType: caseType === "project" ? "project" : "booking",
    targetId: info.links.project ?? info.caseId,
    subjectUser: party.user,
    meta: { caseType, caseId: info.caseId.toString(), to: party.role, text, replyBy },
  });
  return { info, message: toCaseMessageView(message) };
};

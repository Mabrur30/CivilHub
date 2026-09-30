import { type NextFunction, type Response } from "express";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import { AdminAction } from "../models/AdminAction.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { Organisation } from "../models/Organisation.model";
import { User } from "../models/User.model";
import { type IVerification, type VerificationStatus, Verification } from "../models/Verification.model";
import { clearBadge, markVerified, settleVerificationExpiries, signedDocumentUrl } from "../utils/verification";
import { PAGE_SIZE, logAction, objectId, pageOf, requireReason } from "./admin.controller";

/**
 * The verification queue: an admin reads an engineer's IEB number and NID,
 * or a company's trade licence and NID, and approves, rejects or later
 * revokes the Verified badge.
 */

const STATUSES: VerificationStatus[] = ["pending", "verified", "rejected", "lapsed"];

const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Ends the admin's reason with a full stop so the notice reads as sentences. */
const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

interface PopulatedUser {
  _id: { toString(): string };
  name: string;
  email: string;
  role: string;
}

const toRow = (verification: IVerification) => {
  const user = verification.user as unknown as PopulatedUser | null;
  return {
    userId: user?._id.toString() ?? verification.user.toString(),
    name: user?.name ?? verification.nameAtSubmission,
    email: user?.email ?? "",
    role: user?.role ?? verification.kind,
    kind: verification.kind,
    status: verification.status,
    iebNumber: verification.iebNumber ?? null,
    tradeLicenceNo: verification.tradeLicenceNo ?? null,
    nameAtSubmission: verification.nameAtSubmission,
    submittedAt: verification.submittedAt.toISOString(),
    reviewedAt: verification.reviewedAt?.toISOString() ?? null,
    note: verification.note ?? null,
    licenceExpiresAt: verification.licenceExpiresAt?.toISOString() ?? null,
  };
};

export const listVerifications = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await settleVerificationExpiries();
    const status = STATUSES.find((value) => value === req.query.status) ?? "pending";
    const page = pageOf(req.query.page);
    const [rows, total] = await Promise.all([
      Verification.find({ status })
        // The longest-waiting request first; otherwise the latest change first.
        .sort(status === "pending" ? { submittedAt: 1 } : { updatedAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name email role")
        .exec(),
      Verification.countDocuments({ status }).exec(),
    ]);
    res.json({ items: rows.map(toRow), page, pageSize: PAGE_SIZE, total });
  } catch (error: unknown) {
    next(error);
  }
};

const findVerification = async (userIdParam: string | undefined): Promise<IVerification> => {
  const verification = await Verification.findOne({ user: objectId(userIdParam, "Verification request") })
    .populate("user", "name email role")
    .exec();
  if (!verification) throw adminError("Verification request not found", 404);
  return verification;
};

export const getVerification = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verification = await findVerification(req.params.userId);
    const userId = verification.user._id;
    const [account, engineer, organisation, history] = await Promise.all([
      User.findById(userId).select("createdAt verifiedAt status").lean().exec(),
      verification.kind === "engineer"
        ? Engineer.findOne({ user: userId }).select("location certificates").lean().exec()
        : Promise.resolve(null),
      verification.kind === "organisation"
        ? Organisation.findOne({ user: userId }).select("location tradeLicenceNo").lean().exec()
        : Promise.resolve(null),
      AdminAction.find({ subjectUser: userId, action: { $regex: /^verification\./ } })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("admin", "name")
        .lean()
        .exec(),
    ]);

    res.json({
      ...toRow(verification),
      joinedAt: account?.createdAt?.toISOString() ?? null,
      verifiedAt: account?.verifiedAt?.toISOString() ?? null,
      accountStatus: account?.status ?? "active",
      profile: {
        location: engineer?.location ?? organisation?.location ?? null,
        tradeLicenceNo: organisation?.tradeLicenceNo ?? null,
        certificateCount: engineer?.certificates?.length ?? null,
      },
      // Signed links that stop working after ten minutes; reload for fresh ones.
      documents: verification.documents.map((doc) => ({
        kind: doc.kind,
        name: doc.originalName,
        isImage: doc.resourceType === "image",
        uploadedAt: doc.uploadedAt.toISOString(),
        url: signedDocumentUrl(doc),
      })),
      history: history.map((entry) => ({
        action: entry.action,
        reason: entry.reason ?? null,
        admin: (entry.admin as unknown as { name?: string } | null)?.name ?? "Admin",
        at: entry.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

const parseExpiry = (value: unknown): Date => {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw adminError("Enter the date the trade licence expires.", 400);
  }
  if (date.getTime() <= Date.now()) {
    throw adminError("That licence has already expired; ask the company for the renewed one.", 400);
  }
  return date;
};

export const approveVerification = async (
  req: AdminRequest<{ licenceExpiresAt?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const verification = await findVerification(req.params.userId);
    if (verification.status !== "pending") throw adminError("Only a request waiting for review can be approved.", 409);
    const expiresAt = verification.kind === "organisation" ? parseExpiry(req.body.licenceExpiresAt) : undefined;
    const now = new Date();
    const userId = verification.user._id;

    const updated = await Verification.findOneAndUpdate(
      { _id: verification._id, status: "pending" },
      {
        $set: {
          status: "verified",
          reviewedBy: req.admin.id,
          reviewedAt: now,
          ...(expiresAt ? { licenceExpiresAt: expiresAt } : {}),
        },
        $unset: { note: 1, expiryReminderSentAt: 1, ...(expiresAt ? {} : { licenceExpiresAt: 1 }) },
      },
      { returnDocument: "after" },
    ).exec();
    if (!updated) throw adminError("Only a request waiting for review can be approved.", 409);

    await markVerified(userId, now);
    await Notification.create({
      recipient: userId,
      type: "verification_approved",
      message: expiresAt
        ? `CivilHub verified your company. The Verified badge now shows on your profile, in search and on your bids, until your trade licence expires on ${formatDay(expiresAt)}.`
        : "CivilHub verified you. The Verified badge now shows on your profile, in search and on your bids.",
    });
    await logAction(req, "verification.approve", {
      targetType: "user",
      targetId: userId,
      subjectUser: userId,
      meta: {
        kind: verification.kind,
        iebNumber: verification.iebNumber,
        tradeLicenceNo: verification.tradeLicenceNo,
        licenceExpiresAt: expiresAt?.toISOString(),
      },
    });
    res.json(toRow(await findVerification(userId.toString())));
  } catch (error: unknown) {
    next(error);
  }
};

const closeVerification = async (
  req: AdminRequest<{ reason?: unknown }>,
  res: Response,
  from: VerificationStatus,
  action: "verification.reject" | "verification.revoke",
): Promise<void> => {
  const reason = requireReason(req.body.reason);
  const verification = await findVerification(req.params.userId);
  if (verification.status !== from) {
    throw adminError(
      from === "pending" ? "Only a request waiting for review can be rejected." : "Only a verified account can have its badge revoked.",
      409,
    );
  }
  const userId = verification.user._id;
  const updated = await Verification.findOneAndUpdate(
    { _id: verification._id, status: from },
    { $set: { status: "rejected", note: reason, reviewedBy: req.admin.id, reviewedAt: new Date() } },
    { returnDocument: "after" },
  ).exec();
  if (!updated) throw adminError("This request changed while you were looking at it. Reload and try again.", 409);

  await clearBadge(userId);
  await Notification.create({
    recipient: userId,
    type: "verification_rejected",
    message:
      from === "pending"
        ? `CivilHub couldn't verify you: ${asSentence(reason)} You can send your details again in Settings.`
        : `CivilHub removed your Verified badge: ${asSentence(reason)} You can send your details again in Settings.`,
  });
  await logAction(req, action, { targetType: "user", targetId: userId, subjectUser: userId, reason });
  res.json(toRow(await findVerification(userId.toString())));
};

export const rejectVerification = async (
  req: AdminRequest<{ reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await closeVerification(req, res, "pending", "verification.reject");
  } catch (error: unknown) {
    next(error);
  }
};

export const revokeVerification = async (
  req: AdminRequest<{ reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await closeVerification(req, res, "verified", "verification.revoke");
  } catch (error: unknown) {
    next(error);
  }
};

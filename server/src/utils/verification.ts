import { Types } from "mongoose";
import { Notification, type NotificationType } from "../models/Notification.model";
import { Organisation } from "../models/Organisation.model";
import { User } from "../models/User.model";
import { type IVerification, type VerificationDocument, Verification } from "../models/Verification.model";
import { deletePrivateAsset, privateDownloadUrl } from "./cloudinaryUpload";

/**
 * Verification of engineers and companies, and the badge that goes with it.
 * The badge is `User.verifiedAt`; only this file sets or clears it, so it
 * always matches a `verified` Verification record.
 *
 * - Engineers are checked on their IEB membership and NID; companies on their
 *   trade licence and the account holder's NID.
 * - Changing the account name or the licence number sends a verified account
 *   back for review, so a verified name can't be taken over.
 * - A company's badge lapses when its trade licence expires, with a reminder
 *   EXPIRY_REMINDER_DAYS before.
 */

export const EXPIRY_REMINDER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const notify = (userId: Types.ObjectId | string, type: NotificationType, message: string) =>
  Notification.create({ recipient: userId, type, message });

export const markVerified = async (userId: Types.ObjectId | string, at: Date): Promise<void> => {
  await User.updateOne({ _id: userId }, { $set: { verifiedAt: at } }).exec();
};

export const clearBadge = async (userId: Types.ObjectId | string): Promise<void> => {
  await User.updateOne({ _id: userId }, { $set: { verifiedAt: null } }).exec();
};

/** Deletes files that were replaced or are no longer needed; never throws. */
export const deleteDocuments = async (documents: VerificationDocument[]): Promise<void> => {
  await Promise.all(
    documents.map((doc) =>
      deletePrivateAsset(doc.publicId, doc.resourceType).catch((error: unknown) => {
        console.error("Couldn't delete a verification document", doc.publicId, error);
      }),
    ),
  );
};

/** A link to one document that stops working after ten minutes. Admin API only. */
export const signedDocumentUrl = (doc: VerificationDocument): string =>
  privateDownloadUrl(doc.publicId, doc.resourceType, doc.format);

/**
 * The account's name or licence number changed. A verified account loses its
 * badge and goes back into the queue with the new details; a pending one just
 * has its details brought up to date.
 */
export const requeueForReview = async (userId: Types.ObjectId | string, why: string): Promise<void> => {
  const verification = await Verification.findOne({ user: userId, status: { $in: ["pending", "verified"] } }).exec();
  if (!verification) return;
  const [user, organisation] = await Promise.all([
    User.findById(userId).select("name").lean().exec(),
    verification.kind === "organisation"
      ? Organisation.findOne({ user: userId }).select("tradeLicenceNo").lean().exec()
      : Promise.resolve(null),
  ]);
  const wasVerified = verification.status === "verified";

  verification.nameAtSubmission = user?.name ?? verification.nameAtSubmission;
  if (verification.kind === "organisation") verification.tradeLicenceNo = organisation?.tradeLicenceNo ?? undefined;
  if (wasVerified) {
    verification.status = "pending";
    verification.submittedAt = new Date();
    verification.note = why;
    verification.licenceExpiresAt = undefined;
    verification.expiryReminderSentAt = undefined;
  }
  await verification.save();

  if (wasVerified) {
    await clearBadge(userId);
    await notify(
      userId,
      "verification_lapsed",
      `${why}, so your Verified badge is paused while CivilHub checks your details again. You don't need to do anything.`,
    );
  }
};

/**
 * Reminds companies whose licence expires within EXPIRY_REMINDER_DAYS, then
 * lapses the ones past their expiry. Each record changes only if it's still
 * in the state it was found in, so a second run notifies nobody twice.
 */
export const settleVerificationExpiries = async (
  now: Date = new Date(),
): Promise<{ reminded: number; lapsed: number }> => {
  let reminded = 0;
  let lapsed = 0;

  const expired = await Verification.find({ status: "verified", licenceExpiresAt: { $lte: now } })
    .select("_id")
    .lean()
    .exec();
  for (const { _id } of expired) {
    const verification = await Verification.findOneAndUpdate(
      { _id, status: "verified", licenceExpiresAt: { $lte: now } },
      { $set: { status: "lapsed", note: "Your trade licence expired" } },
      { returnDocument: "after" },
    ).exec();
    if (!verification) continue;
    lapsed += 1;
    await clearBadge(verification.user);
    await notify(
      verification.user,
      "verification_lapsed",
      "Your trade licence has expired, so your Verified badge was removed. Upload your renewed licence in Settings to get it back.",
    );
  }

  const soon = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * DAY_MS);
  const expiring = await Verification.find({
    status: "verified",
    licenceExpiresAt: { $gt: now, $lte: soon },
    expiryReminderSentAt: { $exists: false },
  })
    .select("_id")
    .lean()
    .exec();
  for (const { _id } of expiring) {
    const verification = await Verification.findOneAndUpdate(
      { _id, status: "verified", expiryReminderSentAt: { $exists: false } },
      { $set: { expiryReminderSentAt: now } },
      { returnDocument: "after" },
    ).exec();
    if (!verification?.licenceExpiresAt) continue;
    reminded += 1;
    await notify(
      verification.user,
      "verification_expiring",
      `Your trade licence expires on ${formatDay(verification.licenceExpiresAt)}. Once it's renewed, upload it in Settings to keep your Verified badge.`,
    );
  }

  return { reminded, lapsed };
};

/** What the account holder sees about their own request: no file links. */
export const toOwnVerificationView = (verification: IVerification | null) =>
  verification
    ? {
        status: verification.status,
        iebNumber: verification.iebNumber ?? null,
        tradeLicenceNo: verification.tradeLicenceNo ?? null,
        submittedAt: verification.submittedAt.toISOString(),
        reviewedAt: verification.reviewedAt?.toISOString() ?? null,
        note: verification.note ?? null,
        licenceExpiresAt: verification.licenceExpiresAt?.toISOString() ?? null,
        documents: verification.documents.map((doc) => ({
          kind: doc.kind,
          name: doc.originalName,
          uploadedAt: doc.uploadedAt.toISOString(),
        })),
      }
    : null;

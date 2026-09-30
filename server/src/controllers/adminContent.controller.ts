import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import { CustomerReview } from "../models/CustomerReview.model";
import { Equipment } from "../models/Equipment.model";
import { Notification } from "../models/Notification.model";
import { PlatformSetting } from "../models/PlatformSetting.model";
import { Review } from "../models/Review.model";
import { User } from "../models/User.model";
import { getPaymentConfig } from "../config/payments";
import { getCommissionRate } from "../utils/platformSettings";
import { PAGE_SIZE, escapeRegex, logAction, objectId, pageOf, requireReason } from "./admin.controller";

/**
 * Content an admin can take down outside the reports queue: reviews (and
 * providers' replies to them) and equipment listings. Plus platform
 * settings, for now just the commission rate.
 */

const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

interface NamedUser {
  _id: Types.ObjectId;
  name: string;
  role?: string;
}

const named = (value: unknown) => {
  const user = value as NamedUser | null;
  return user && typeof user === "object" && "name" in user
    ? { id: user._id.toString(), name: user.name, role: user.role ?? "" }
    : null;
};

/** Ids of accounts whose name matches the search, or null for no search. */
const matchingUserIds = async (q: unknown): Promise<Types.ObjectId[] | null> => {
  const text = typeof q === "string" ? q.trim() : "";
  if (!text) return null;
  const users = await User.find({ name: { $regex: escapeRegex(text), $options: "i" } })
    .select("_id")
    .limit(200)
    .lean()
    .exec();
  return users.map((user) => user._id as Types.ObjectId);
};

// ---------------------------------------------------------------- reviews

type ReviewKind = "provider" | "customer";

/**
 * provider: a client's (or renter's) review of an engineer or company, which
 *   may carry the provider's reply. customer: a provider's review of the
 *   client or renter they worked with.
 */
export const listReviews = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kind: ReviewKind = req.query.kind === "customer" ? "customer" : "provider";
    const page = pageOf(req.query.page);
    const ids = await matchingUserIds(req.query.q);

    if (kind === "provider") {
      const filter = ids ? { $or: [{ client: { $in: ids } }, { engineer: { $in: ids } }] } : {};
      const [rows, total] = await Promise.all([
        Review.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .populate("client", "name role")
          .populate("engineer", "name role")
          .populate("project", "title name")
          .lean()
          .exec(),
        Review.countDocuments(filter).exec(),
      ]);
      res.json({
        page,
        pageSize: PAGE_SIZE,
        total,
        items: rows.map((row) => {
          const project = row.project as unknown as { title?: string; name?: string } | null;
          return {
            id: row._id.toString(),
            kind,
            author: named(row.client),
            subject: named(row.engineer),
            rating: row.rating,
            text: row.reviewText,
            reply: row.engineerReply ?? null,
            about: project ? `Project: ${project.title ?? project.name ?? "untitled"}` : row.equipmentBooking ? "Equipment rental" : null,
            createdAt: row.createdAt.toISOString(),
          };
        }),
      });
      return;
    }

    const filter = ids ? { $or: [{ author: { $in: ids } }, { subject: { $in: ids } }] } : {};
    const [rows, total] = await Promise.all([
      CustomerReview.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("author", "name role")
        .populate("subject", "name role")
        .populate("project", "title name")
        .lean()
        .exec(),
      CustomerReview.countDocuments(filter).exec(),
    ]);
    res.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((row) => {
        const project = row.project as unknown as { title?: string; name?: string } | null;
        return {
          id: row._id.toString(),
          kind,
          author: named(row.author),
          subject: named(row.subject),
          rating: row.rating,
          text: row.reviewText,
          reply: null,
          about: project ? `Project: ${project.title ?? project.name ?? "untitled"}` : row.equipmentBooking ? "Equipment rental" : null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Removes a review, or only the provider's reply to one. The removed text is
 * kept in the admin log. Removing a review lets its author write a new one.
 */
export const removeReview = async (
  req: AdminRequest<{ reason?: unknown; part?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const kind = req.params.kind === "customer" ? "customer" : req.params.kind === "provider" ? "provider" : null;
    if (!kind) throw adminError("Review not found", 404);
    const reviewId = objectId(req.params.reviewId, "Review");
    const reason = requireReason(req.body.reason);
    const replyOnly = req.body.part === "reply";

    if (kind === "provider") {
      const review = await Review.findById(reviewId).populate("engineer", "name").lean().exec();
      if (!review) throw adminError("This review was already removed", 404);
      const subjectName = named(review.engineer)?.name ?? "a provider";
      const engineerId = (review.engineer as unknown as NamedUser)._id ?? review.engineer;

      if (replyOnly) {
        if (!review.engineerReply) throw adminError("This review has no reply to remove", 409);
        await Review.updateOne({ _id: reviewId }, { $unset: { engineerReply: 1, engineerRepliedAt: 1 } }).exec();
        await Notification.create({
          recipient: engineerId,
          type: "moderation_notice",
          message: `CivilHub removed your reply to a review: ${asSentence(reason)} You can reply again within the community rules.`,
        });
        await logAction(req, "review.reply_remove", {
          targetType: "review",
          targetId: reviewId,
          subjectUser: engineerId,
          reason,
          meta: { kind, reply: review.engineerReply },
        });
        res.json({ removed: "reply" });
        return;
      }

      await Review.deleteOne({ _id: reviewId }).exec();
      await Notification.create({
        recipient: review.client,
        type: "moderation_notice",
        message: `CivilHub removed your review of ${subjectName}: ${asSentence(reason)} You can write a new one within the community rules.`,
      });
      await logAction(req, "review.remove", {
        targetType: "review",
        targetId: reviewId,
        subjectUser: review.client,
        reason,
        meta: { kind, rating: review.rating, text: review.reviewText, reply: review.engineerReply ?? null, about: engineerId.toString() },
      });
      res.json({ removed: "review" });
      return;
    }

    if (replyOnly) throw adminError("Reviews of clients don't have replies", 400);
    const review = await CustomerReview.findById(reviewId).populate("subject", "name").lean().exec();
    if (!review) throw adminError("This review was already removed", 404);
    await CustomerReview.deleteOne({ _id: reviewId }).exec();
    await Notification.create({
      recipient: review.author,
      type: "moderation_notice",
      message: `CivilHub removed your review of ${named(review.subject)?.name ?? "a client"}: ${asSentence(reason)} You can write a new one within the community rules.`,
    });
    await logAction(req, "review.remove", {
      targetType: "review",
      targetId: reviewId,
      subjectUser: review.author,
      reason,
      meta: { kind, rating: review.rating, text: review.reviewText },
    });
    res.json({ removed: "review" });
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- listings

export const listListings = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = pageOf(req.query.page);
    const text = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const ownerIds = await matchingUserIds(text);
    const filter: Record<string, unknown> = {};
    if (text) {
      filter.$or = [{ title: { $regex: escapeRegex(text), $options: "i" } }, { owner: { $in: ownerIds ?? [] } }];
    }
    if (req.query.status === "held") filter.adminHold = { $ne: null };
    else if (req.query.status === "active" || req.query.status === "paused") filter.status = req.query.status;

    const [rows, total] = await Promise.all([
      Equipment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("owner", "name role")
        .lean()
        .exec(),
      Equipment.countDocuments(filter).exec(),
    ]);
    res.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((row) => ({
        id: row._id.toString(),
        title: row.title,
        category: row.category,
        location: row.location,
        dailyRate: row.dailyRate,
        photoUrl: row.photos[0]?.url ?? null,
        owner: named(row.owner),
        status: row.status,
        adminHold: row.adminHold ? { reason: row.adminHold.reason, at: row.adminHold.at.toISOString() } : null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Takes a listing out of browsing and booking. Bookings already made carry
 * on; the owner can't reopen it until an admin lifts the hold.
 */
export const pauseListing = async (
  req: AdminRequest<{ reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const listingId = objectId(req.params.listingId, "Listing");
    const reason = requireReason(req.body.reason);
    const listing = await Equipment.findOneAndUpdate(
      { _id: listingId, adminHold: null },
      { $set: { status: "paused", adminHold: { reason, at: new Date() } } },
      { returnDocument: "after" },
    ).exec();
    if (!listing) {
      const exists = await Equipment.exists({ _id: listingId });
      throw adminError(exists ? "CivilHub has already paused this listing" : "Listing not found", exists ? 409 : 404);
    }
    await Notification.create({
      recipient: listing.owner,
      type: "moderation_notice",
      message: `CivilHub paused your listing ${listing.title}: ${asSentence(reason)} It no longer shows in search and can't be booked; bookings already made carry on.`,
      equipment: listing._id,
    });
    await logAction(req, "listing.pause", { targetType: "equipment", targetId: listing._id, subjectUser: listing.owner, reason });
    res.json({ id: listing._id.toString(), status: listing.status, adminHold: listing.adminHold });
  } catch (error: unknown) {
    next(error);
  }
};

export const unpauseListing = async (
  req: AdminRequest<{ reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const listingId = objectId(req.params.listingId, "Listing");
    const reason = requireReason(req.body.reason);
    const listing = await Equipment.findOneAndUpdate(
      { _id: listingId, adminHold: { $ne: null } },
      { $set: { status: "active", adminHold: null } },
      { returnDocument: "after" },
    ).exec();
    if (!listing) throw adminError("This listing isn't paused by CivilHub", 409);
    await Notification.create({
      recipient: listing.owner,
      type: "moderation_notice",
      message: `CivilHub reopened your listing ${listing.title}. It shows in search and can be booked again.`,
      equipment: listing._id,
    });
    await logAction(req, "listing.unpause", { targetType: "equipment", targetId: listing._id, subjectUser: listing.owner, reason });
    res.json({ id: listing._id.toString(), status: listing.status, adminHold: null });
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- settings

const MAX_COMMISSION_PERCENT = 50;

export const getSettings = async (_req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const setting = await PlatformSetting.findOne({ key: "platform" }).populate("updatedBy", "name").lean().exec();
    res.json({
      commissionRate: await getCommissionRate(),
      commissionSource: typeof setting?.commissionRate === "number" ? "admin" : "default",
      defaultCommissionRate: getPaymentConfig().commissionRate,
      updatedAt: setting?.updatedAt?.toISOString() ?? null,
      updatedBy: (setting?.updatedBy as unknown as { name?: string } | null)?.name ?? null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

/** Sets the commission on new payments. Payments already made keep their fee. */
export const setCommission = async (
  req: AdminRequest<{ percent?: unknown; reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const percent = Number(req.body.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > MAX_COMMISSION_PERCENT) {
      throw adminError(`The commission must be between 0% and ${MAX_COMMISSION_PERCENT}%.`, 400);
    }
    // Two decimal places of a percent, e.g. 7.5% → 0.075.
    const rate = Math.round(percent * 100) / 10000;
    const reason = requireReason(req.body.reason);
    const previous = await getCommissionRate();
    await PlatformSetting.findOneAndUpdate(
      { key: "platform" },
      { $set: { commissionRate: rate, updatedBy: req.admin.id } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).exec();
    await logAction(req, "settings.commission", { reason, meta: { from: previous, to: rate } });
    res.json({ commissionRate: rate, previous });
  } catch (error: unknown) {
    next(error);
  }
};

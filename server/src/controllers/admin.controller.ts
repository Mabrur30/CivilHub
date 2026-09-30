import bcrypt from "bcryptjs";
import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import {
  ADMIN_COOKIE,
  type AdminRequest,
  adminCookieOptions,
  adminError,
  signAdminSession,
} from "../middleware/adminAuth.middleware";
import { Admin } from "../models/Admin.model";
import { AdminAction, type AdminActionType, type IAdminAction } from "../models/AdminAction.model";
import { Bid } from "../models/Bid.model";
import { Comment } from "../models/Comment.model";
import { Equipment } from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Post } from "../models/Post.model";
import { Project } from "../models/Project.model";
import { REPORT_TARGETS, Report, type ReportTarget } from "../models/Report.model";
import { type AccountStatus, User, type UserRole } from "../models/User.model";
import { getAccountStanding } from "../utils/accountStatus";
import { settleDueDeposits } from "../utils/deposits";
import { settleVerificationExpiries } from "../utils/verification";
import { Verification } from "../models/Verification.model";
import { getEarnings } from "../utils/earnings";
import { getRefundsDue } from "../utils/refunds";
import { removePost } from "./post.controller";

// Compared against when the email is unknown, so a wrong email takes as long
// as a wrong password and the response can't be used to find admin emails.
const DUMMY_HASH = bcrypt.hashSync("civilhub-admin-timing-guard", 10);

const REASON_LIMIT = 500;
export const PAGE_SIZE = 25;

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const requireReason = (value: unknown): string => {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason) throw adminError("Give a reason; it goes in the log.", 400);
  if (reason.length > REASON_LIMIT) {
    throw adminError(`Keep the reason under ${REASON_LIMIT} characters.`, 400);
  }
  return reason;
};

const parseDays = (value: unknown): number => {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw adminError("A suspension lasts from 1 to 365 days.", 400);
  }
  return days;
};

export const pageOf = (value: unknown): number =>
  Math.max(1, Number.parseInt(String(value ?? "1"), 10) || 1);

export const objectId = (value: string | undefined, label: string): Types.ObjectId => {
  if (!value || !Types.ObjectId.isValid(value)) throw adminError(`${label} not found`, 404);
  return new Types.ObjectId(value);
};

export const logAction = (
  req: AdminRequest,
  action: AdminActionType,
  details: {
    targetType?: IAdminAction["targetType"];
    targetId?: Types.ObjectId | string;
    subjectUser?: Types.ObjectId | string | null;
    reason?: string;
    meta?: Record<string, unknown>;
  } = {},
): Promise<unknown> =>
  AdminAction.create({
    admin: req.admin.id,
    action,
    targetType: details.targetType,
    targetId: details.targetId,
    subjectUser: details.subjectUser ?? undefined,
    reason: details.reason,
    meta: details.meta,
  });

const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------- sign-in

export const adminLogin = async (
  req: AdminRequest<{ email?: unknown; password?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) throw adminError("Enter your email and password.", 400);

    const admin = await Admin.findOne({ email }).select("+passwordHash").exec();
    const matches = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    // One message for every failure, so it doesn't say which part was wrong.
    if (!admin || !matches || !admin.isActive) {
      throw adminError("Those details don't match an active admin account.", 401);
    }

    admin.lastLoginAt = new Date();
    await admin.save();
    res.cookie(ADMIN_COOKIE, signAdminSession(admin._id.toString()), adminCookieOptions());
    await AdminAction.create({ admin: admin._id, action: "admin.login" });
    res.status(200).json({ id: admin._id.toString(), name: admin.name, email: admin.email });
  } catch (error: unknown) {
    next(error);
  }
};

export const adminLogout = (_req: AdminRequest, res: Response): void => {
  const { maxAge: _maxAge, ...options } = adminCookieOptions();
  res.clearCookie(ADMIN_COOKIE, options);
  res.status(200).json({ success: true });
};

export const adminMe = (req: AdminRequest, res: Response): void => {
  res.status(200).json(req.admin);
};

// ---------------------------------------------------------------- overview

export const getOverview = async (
  _req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await Promise.all([settleDueDeposits(), settleVerificationExpiries()]);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      roleRows,
      newUsers,
      restrictedUsers,
      openReportTargets,
      openBriefs,
      activeProjects,
      activeBookings,
      refundsDue,
      depositsPending,
      depositDisputes,
      verificationsPending,
      feeRows,
      earnings,
    ] = await Promise.all([
      User.aggregate<{ _id: UserRole; count: number }>([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]).exec(),
      User.countDocuments({ createdAt: { $gte: weekAgo } }).exec(),
      User.countDocuments({ status: { $in: ["suspended", "banned"] } }).exec(),
      Report.aggregate<{ count: number }>([
        { $match: { status: "open" } },
        { $group: { _id: { type: "$targetType", id: "$targetId" } } },
        { $count: "count" },
      ]).exec(),
      Project.countDocuments({ status: "open_for_bids" }).exec(),
      Project.countDocuments({ status: { $in: ["active", "in-progress"] } }).exec(),
      EquipmentBooking.countDocuments({ status: { $in: ["approved", "in_progress"] } }).exec(),
      getRefundsDue(),
      // Rentals finished, but the owner hasn't released or claimed the deposit.
      EquipmentBooking.countDocuments({
        status: "completed",
        paymentStatus: "paid",
        securityDeposit: { $gt: 0 },
        depositResolution: "pending",
      }).exec(),
      EquipmentBooking.countDocuments({ "depositDispute.status": "open" }).exec(),
      Verification.countDocuments({ status: "pending" }).exec(),
      Payment.aggregate<{ fees: number; volume: number }>([
        { $match: { status: "paid", refundDue: { $ne: true } } },
        { $group: { _id: null, fees: { $sum: "$platformFee" }, volume: { $sum: "$amount" } } },
      ]).exec(),
      getEarnings(),
    ]);
    let owedPaisa = 0;
    let payeesOwed = 0;
    for (const entry of earnings.values()) {
      owedPaisa += Math.round(entry.owed * 100);
      if (entry.owed > 0) payeesOwed += 1;
    }

    const byRole = { client: 0, engineer: 0, organisation: 0 } as Record<UserRole, number>;
    for (const row of roleRows) byRole[row._id] = row.count;

    res.status(200).json({
      users: {
        total: byRole.client + byRole.engineer + byRole.organisation,
        byRole,
        newThisWeek: newUsers,
        restricted: restrictedUsers,
      },
      openReports: openReportTargets[0]?.count ?? 0,
      verificationsPending,
      projects: { openBriefs, active: activeProjects },
      activeBookings,
      money: {
        refundsDue: refundsDue.length,
        refundsDueAmount: refundsDue.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100,
        owedToPayees: owedPaisa / 100,
        payeesOwed,
        depositsPending,
        depositDisputes,
        commissionEarned: feeRows[0]?.fees ?? 0,
        paymentVolume: feeRows[0]?.volume ?? 0,
      },
    });
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- reports

interface TargetPreview {
  exists: boolean;
  /** The account behind the target: the user, or the post or comment author. */
  user: { id: string; name: string; role: UserRole; status: AccountStatus } | null;
  content: string | null;
  imageUrl: string | null;
  postId: string | null;
}

type PopulatedAuthor = { _id: Types.ObjectId; name: string; role: UserRole; status?: AccountStatus };

const toPreviewUser = (author: PopulatedAuthor | null | undefined): TargetPreview["user"] =>
  author
    ? {
        id: author._id.toString(),
        name: author.name,
        role: author.role,
        status: author.status ?? "active",
      }
    : null;

const previewTarget = async (targetType: ReportTarget, targetId: Types.ObjectId): Promise<TargetPreview> => {
  const missing: TargetPreview = { exists: false, user: null, content: null, imageUrl: null, postId: null };
  if (targetType === "user") {
    const user = await User.findById(targetId).select("name role status").lean().exec();
    return user ? { ...missing, exists: true, user: toPreviewUser(user as PopulatedAuthor) } : missing;
  }
  if (targetType === "post") {
    const post = await Post.findById(targetId).populate("author", "name role status").lean().exec();
    if (!post) return missing;
    return {
      exists: true,
      user: toPreviewUser(post.author as unknown as PopulatedAuthor),
      content: post.content,
      imageUrl: post.imageUrl ?? null,
      postId: post._id.toString(),
    };
  }
  const comment = await Comment.findById(targetId).populate("author", "name role status").lean().exec();
  if (!comment) return missing;
  return {
    exists: true,
    user: toPreviewUser(comment.author as unknown as PopulatedAuthor),
    content: comment.content,
    imageUrl: null,
    postId: comment.post.toString(),
  };
};

const parseTarget = (req: AdminRequest): { targetType: ReportTarget; targetId: Types.ObjectId } => {
  const { targetType, targetId } = req.params;
  if (!REPORT_TARGETS.includes(targetType as ReportTarget)) {
    throw adminError("Unknown report target", 404);
  }
  return { targetType: targetType as ReportTarget, targetId: objectId(targetId, "Report target") };
};

/** Open reports, one entry per reported thing, most-reported first. */
export const listReports = async (
  _req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groups = await Report.aggregate<{
      _id: { targetType: ReportTarget; targetId: Types.ObjectId };
      count: number;
      reasons: string[];
      latest: Date;
      reports: Array<{ reason: string; note?: string; reporter: Types.ObjectId; createdAt: Date }>;
    }>([
      { $match: { status: "open" } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { targetType: "$targetType", targetId: "$targetId" },
          count: { $sum: 1 },
          reasons: { $addToSet: "$reason" },
          latest: { $max: "$createdAt" },
          reports: {
            $push: { reason: "$reason", note: "$note", reporter: "$reporter", createdAt: "$createdAt" },
          },
        },
      },
      { $sort: { count: -1, latest: -1 } },
      { $limit: 100 },
    ]).exec();

    const reporterIds = [...new Set(groups.flatMap((group) => group.reports.map((r) => r.reporter.toString())))];
    const reporters = new Map(
      (await User.find({ _id: { $in: reporterIds } }).select("name").lean().exec()).map((user) => [
        user._id.toString(),
        user.name,
      ]),
    );

    const items = await Promise.all(
      groups.map(async (group) => ({
        targetType: group._id.targetType,
        targetId: group._id.targetId.toString(),
        count: group.count,
        reasons: group.reasons,
        latest: group.latest.toISOString(),
        target: await previewTarget(group._id.targetType, group._id.targetId),
        reports: group.reports.map((report) => ({
          reason: report.reason,
          note: report.note ?? null,
          reporterName: reporters.get(report.reporter.toString()) ?? "Deleted account",
          createdAt: report.createdAt.toISOString(),
        })),
      })),
    );
    res.status(200).json({ items });
  } catch (error: unknown) {
    next(error);
  }
};

const closeReports = (
  req: AdminRequest,
  targetType: ReportTarget,
  targetId: Types.ObjectId,
  status: "dismissed" | "actioned",
  resolution: string,
) =>
  Report.updateMany(
    { targetType, targetId, status: "open" },
    { $set: { status, reviewedBy: req.admin.id, reviewedAt: new Date(), resolution } },
  ).exec();

export const dismissReports = async (
  req: AdminRequest<{ reason?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { targetType, targetId } = parseTarget(req);
    const reason = requireReason(req.body.reason);
    const result = await closeReports(req, targetType, targetId, "dismissed", reason);
    if (result.modifiedCount === 0) throw adminError("No open reports on this", 404);
    const preview = await previewTarget(targetType, targetId);
    await logAction(req, "report.dismiss", {
      targetType,
      targetId,
      subjectUser: preview.user?.id,
      reason,
      meta: { reports: result.modifiedCount },
    });
    res.status(200).json({ closed: result.modifiedCount });
  } catch (error: unknown) {
    next(error);
  }
};

/** Applies a status to an account and records it. Shared by reports and users. */
const applyAccountStatus = async (
  req: AdminRequest,
  userId: string,
  status: AccountStatus,
  reason: string,
  days?: number,
): Promise<{ suspendedUntil: Date | null }> => {
  const user = await User.findById(userId).exec();
  if (!user) throw adminError("User not found", 404);
  const suspendedUntil =
    status === "suspended" && days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  user.status = status;
  user.suspendedUntil = suspendedUntil;
  user.statusReason = status === "active" ? null : reason;
  await user.save();

  const action: AdminActionType =
    status === "active" ? "user.reinstate" : status === "banned" ? "user.ban" : "user.suspend";
  await logAction(req, action, {
    targetType: "user",
    targetId: user._id,
    subjectUser: user._id,
    reason,
    meta: suspendedUntil ? { days, suspendedUntil } : undefined,
  });
  // A restricted person can't read notifications; they're told at sign-in.
  if (status === "active") {
    await Notification.create({
      recipient: user._id,
      type: "moderation_notice",
      message: "Your account is active again. Thanks for your patience.",
    });
  }
  return { suspendedUntil };
};

const removeContent = async (
  targetType: ReportTarget,
  targetId: Types.ObjectId,
  authorId: string | null,
): Promise<void> => {
  if (targetType === "post") {
    const post = await Post.findById(targetId).exec();
    if (!post) throw adminError("This post was already deleted", 404);
    await removePost(post);
  } else if (targetType === "comment") {
    const comment = await Comment.findById(targetId).exec();
    if (!comment) throw adminError("This comment was already deleted", 404);
    // Like an author's own delete: the text goes, the thread stays intact.
    comment.content = "[removed by CivilHub]";
    await comment.save();
  } else {
    throw adminError("Only posts and comments can be removed", 400);
  }
  if (authorId) {
    await Notification.create({
      recipient: authorId,
      type: "moderation_notice",
      message: `CivilHub removed your ${targetType} because it broke the community rules.`,
    });
  }
};

export const actionReports = async (
  req: AdminRequest<{ action?: unknown; reason?: unknown; days?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { targetType, targetId } = parseTarget(req);
    const reason = requireReason(req.body.reason);
    const action = req.body.action;
    if (action !== "remove_content" && action !== "suspend_user" && action !== "ban_user") {
      throw adminError("Choose remove_content, suspend_user or ban_user", 400);
    }
    const openCount = await Report.countDocuments({ targetType, targetId, status: "open" }).exec();
    if (openCount === 0) throw adminError("No open reports on this", 404);

    const preview = await previewTarget(targetType, targetId);
    const accountId = preview.user?.id ?? null;
    let resolution: string;

    if (action === "remove_content") {
      await removeContent(targetType, targetId, accountId);
      await logAction(req, targetType === "post" ? "post.remove" : "comment.remove", {
        targetType,
        targetId,
        subjectUser: accountId,
        reason,
        meta: { content: preview.content?.slice(0, 280) ?? null },
      });
      resolution = `Removed the ${targetType}: ${reason}`;
    } else {
      if (!accountId) throw adminError("The account behind this no longer exists", 404);
      const days = action === "suspend_user" ? parseDays(req.body.days) : undefined;
      const { suspendedUntil } = await applyAccountStatus(
        req,
        accountId,
        action === "ban_user" ? "banned" : "suspended",
        reason,
        days,
      );
      resolution =
        action === "ban_user"
          ? `Banned the account: ${reason}`
          : `Suspended the account until ${formatDay(suspendedUntil as Date)}: ${reason}`;
    }

    const result = await closeReports(req, targetType, targetId, "actioned", resolution);
    await logAction(req, "report.action", {
      targetType,
      targetId,
      subjectUser: accountId,
      reason,
      meta: { action, reports: result.modifiedCount },
    });
    res.status(200).json({ closed: result.modifiedCount, resolution });
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- accounts

const USER_ROLES: UserRole[] = ["client", "engineer", "organisation"];
const STATUSES: AccountStatus[] = ["active", "suspended", "banned"];

export const listUsers = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    const q = query.q?.trim();
    if (q) {
      const pattern = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ name: pattern }, { email: pattern }];
    }
    if (query.role && USER_ROLES.includes(query.role as UserRole)) filter.role = query.role;
    if (query.status === "active") filter.status = { $nin: ["suspended", "banned"] };
    else if (query.status === "restricted") filter.status = { $in: ["suspended", "banned"] };
    else if (query.status && STATUSES.includes(query.status as AccountStatus)) filter.status = query.status;

    const page = pageOf(query.page);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name email role status suspendedUntil createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean()
        .exec(),
      User.countDocuments(filter).exec(),
    ]);
    const reportCounts = new Map(
      (
        await Report.aggregate<{ _id: Types.ObjectId; count: number }>([
          { $match: { status: "open", targetType: "user", targetId: { $in: users.map((u) => u._id) } } },
          { $group: { _id: "$targetId", count: { $sum: 1 } } },
        ]).exec()
      ).map((row) => [row._id.toString(), row.count]),
    );

    res.status(200).json({
      items: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status ?? "active",
        suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        openReports: reportCounts.get(user._id.toString()) ?? 0,
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getUserDetail = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = objectId(req.params.userId, "User");
    // Reading the standing first lifts a suspension that has run out.
    await getAccountStanding(userId.toString());
    const user = await User.findById(userId)
      .select("name email role status suspendedUntil statusReason createdAt verifiedAt")
      .lean()
      .exec();
    if (!user) throw adminError("User not found", 404);

    const [postIds, commentIds] = await Promise.all([
      Post.find({ author: userId }).distinct("_id").exec(),
      Comment.find({ author: userId }).distinct("_id").exec(),
    ]);
    const [
      posts,
      comments,
      projectsPosted,
      projectsHired,
      bids,
      listings,
      bookings,
      reports,
      actions,
      verification,
    ] = await Promise.all([
      Promise.resolve(postIds.length),
      Promise.resolve(commentIds.length),
      Project.countDocuments({ client: userId }).exec(),
      Project.countDocuments({ assignedEngineer: userId }).exec(),
      Bid.countDocuments({ engineer: userId }).exec(),
      Equipment.countDocuments({ owner: userId }).exec(),
      EquipmentBooking.countDocuments({ $or: [{ renter: userId }, { owner: userId }] }).exec(),
      Report.find({
        $or: [
          { targetType: "user", targetId: userId },
          { targetType: "post", targetId: { $in: postIds } },
          { targetType: "comment", targetId: { $in: commentIds } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("reporter", "name")
        .lean()
        .exec(),
      AdminAction.find({ subjectUser: userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("admin", "name")
        .lean()
        .exec(),
      Verification.findOne({ user: userId }).select("status").lean().exec(),
    ]);

    res.status(200).json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status ?? "active",
      suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
      statusReason: user.statusReason ?? null,
      createdAt: user.createdAt.toISOString(),
      verifiedAt: user.verifiedAt?.toISOString() ?? null,
      verificationStatus: verification?.status ?? null,
      activity: { posts, comments, projectsPosted, projectsHired, bids, listings, bookings },
      reports: reports.map((report) => ({
        id: report._id.toString(),
        targetType: report.targetType,
        targetId: report.targetId.toString(),
        reason: report.reason,
        note: report.note ?? null,
        status: report.status,
        resolution: report.resolution ?? null,
        reporterName: (report.reporter as unknown as { name?: string } | null)?.name ?? "Deleted account",
        createdAt: report.createdAt.toISOString(),
      })),
      actions: actions.map((entry) => ({
        id: entry._id.toString(),
        action: entry.action,
        reason: entry.reason ?? null,
        adminName: (entry.admin as unknown as { name?: string } | null)?.name ?? "Admin",
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const setUserStatus = async (
  req: AdminRequest<{ status?: unknown; reason?: unknown; days?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = objectId(req.params.userId, "User").toString();
    const status = req.body.status;
    if (!STATUSES.includes(status as AccountStatus)) {
      throw adminError("Status must be active, suspended or banned", 400);
    }
    const reason = requireReason(req.body.reason);
    const days = status === "suspended" ? parseDays(req.body.days) : undefined;
    const { suspendedUntil } = await applyAccountStatus(
      req,
      userId,
      status as AccountStatus,
      reason,
      days,
    );
    res.status(200).json({ status, suspendedUntil: suspendedUntil?.toISOString() ?? null });
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- log

export const listActions = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = pageOf((req.query as Record<string, string | undefined>).page);
    const [entries, total] = await Promise.all([
      AdminAction.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("admin", "name")
        .populate("subjectUser", "name")
        .lean()
        .exec(),
      AdminAction.countDocuments().exec(),
    ]);
    res.status(200).json({
      items: entries.map((entry) => {
        const subject = entry.subjectUser as unknown as { _id: Types.ObjectId; name: string } | null;
        return {
          id: entry._id.toString(),
          action: entry.action,
          adminName: (entry.admin as unknown as { name?: string } | null)?.name ?? "Admin",
          subject: subject ? { id: subject._id.toString(), name: subject.name } : null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId?.toString() ?? null,
          reason: entry.reason ?? null,
          createdAt: entry.createdAt.toISOString(),
        };
      }),
      page,
      pageSize: PAGE_SIZE,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

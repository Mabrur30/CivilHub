import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import { Notification } from "../models/Notification.model";
import { PAYMENT_STATUSES, type IPayment, Payment } from "../models/Payment.model";
import { Payout } from "../models/Payout.model";
import { PayoutAccount } from "../models/PayoutAccount.model";
import { type IRefund, Refund, type RefundKind } from "../models/Refund.model";
import { User } from "../models/User.model";
import { describePaymentMethod } from "../services/payments";
import { GatewayError, queryRefund, requestRefund } from "../services/sslcommerz";
import { settleDueDeposits } from "../utils/deposits";
import { getEarnings, getPayeeEarnings } from "../utils/earnings";
import { formatTaka } from "../utils/money";
import { findRefundDue, getRefundsDue } from "../utils/refunds";
import { PAGE_SIZE, escapeRegex, logAction, objectId, pageOf } from "./admin.controller";

const toPaisa = (amount: number): number => Math.round(amount * 100);

/** How long a payout may hold its payee's lock if the request dies midway. */
const PAYOUT_LOCK_MS = 30 * 1000;

const requireText = (value: unknown, label: string, max: number): string => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw adminError(`${label} is required.`, 400);
  if (text.length > max) throw adminError(`${label} must be ${max} characters or fewer.`, 400);
  return text;
};

const optionalText = (value: unknown, max: number): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
};

type AccountView = {
  method: string;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  branch: string | null;
  routingNumber: string | null;
  updatedAt: string;
};

const toAccountView = (account: {
  method: string;
  accountName: string;
  accountNumber: string;
  bankName?: string;
  branch?: string;
  routingNumber?: string;
  updatedAt: Date;
} | null): AccountView | null =>
  account
    ? {
        method: account.method,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        bankName: account.bankName ?? null,
        branch: account.branch ?? null,
        routingNumber: account.routingNumber ?? null,
        updatedAt: account.updatedAt.toISOString(),
      }
    : null;

// ---------------------------------------------------------------- payouts

/** Everyone who has earned through CivilHub, most owed first. */
export const listPayees = async (
  _req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await settleDueDeposits();
    const earnings = await getEarnings();
    const ids = [...earnings.keys()];
    const [users, accounts, lastPayouts] = await Promise.all([
      User.find({ _id: { $in: ids } }).select("name email role").lean().exec(),
      PayoutAccount.find({ user: { $in: ids } }).lean().exec(),
      Payout.aggregate<{ _id: Types.ObjectId; last: Date }>([
        { $match: { payee: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
        { $group: { _id: "$payee", last: { $max: "$paidAt" } } },
      ]).exec(),
    ]);
    const userById = new Map(users.map((user) => [user._id.toString(), user]));
    const accountById = new Map(accounts.map((account) => [account.user.toString(), account]));
    const lastById = new Map(lastPayouts.map((row) => [row._id.toString(), row.last]));

    const items = ids
      .map((id) => {
        const user = userById.get(id);
        const entry = earnings.get(id)!;
        return {
          payee: user
            ? { id, name: user.name, email: user.email, role: user.role }
            : { id, name: "Deleted account", email: "", role: null },
          released: entry.released,
          onHold: entry.onHold,
          paidOut: entry.paidOut,
          owed: entry.owed,
          hasAccount: accountById.has(id),
          lastPayoutAt: lastById.get(id)?.toISOString() ?? null,
        };
      })
      .sort((a, b) => b.owed - a.owed || b.onHold - a.onHold);

    res.status(200).json({
      items,
      totals: {
        owed: items.reduce((sum, item) => sum + toPaisa(item.owed), 0) / 100,
        onHold: items.reduce((sum, item) => sum + toPaisa(item.onHold), 0) / 100,
        paidOut: items.reduce((sum, item) => sum + toPaisa(item.paidOut), 0) / 100,
      },
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getPayee = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const payeeId = objectId(req.params.userId, "Payee");
    await settleDueDeposits();
    const user = await User.findById(payeeId).select("name email role").lean().exec();
    if (!user) throw adminError("Payee not found", 404);
    const [earnings, account, payouts] = await Promise.all([
      getPayeeEarnings(payeeId.toString()),
      PayoutAccount.findOne({ user: payeeId }).lean().exec(),
      Payout.find({ payee: payeeId }).sort({ paidAt: -1 }).populate("admin", "name").lean().exec(),
    ]);
    res.status(200).json({
      payee: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
      earnings,
      account: toAccountView(account),
      payouts: payouts.map((payout) => ({
        id: payout._id.toString(),
        amount: payout.amount,
        account: payout.account,
        reference: payout.reference,
        note: payout.note ?? null,
        adminName: (payout.admin as unknown as { name?: string } | null)?.name ?? "Admin",
        paidAt: payout.paidAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

/** Records money an admin has already sent to the payee's account. */
export const recordPayout = async (
  req: AdminRequest<{ amount?: unknown; reference?: unknown; note?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const payeeId = objectId(req.params.userId, "Payee");
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw adminError("Enter the amount you sent.", 400);
    }
    const reference = requireText(req.body.reference, "The transaction reference", 120);
    const note = optionalText(req.body.note, 500);

    if (!(await PayoutAccount.exists({ user: payeeId }))) {
      throw adminError("This payee hasn't added a payout account yet.", 409);
    }
    // One payout per payee at a time, so two can't both pass the "owed" check.
    const now = new Date();
    const account = await PayoutAccount.findOneAndUpdate(
      { user: payeeId, $or: [{ payoutLockUntil: null }, { payoutLockUntil: { $lte: now } }] },
      { $set: { payoutLockUntil: new Date(now.getTime() + PAYOUT_LOCK_MS) } },
      { returnDocument: "after", timestamps: false },
    )
      .lean()
      .exec();
    if (!account) {
      throw adminError("Another payout to this payee is being recorded. Try again in a moment.", 409);
    }

    let payout;
    let earnings;
    try {
      earnings = await getPayeeEarnings(payeeId.toString());
      if (toPaisa(amount) > toPaisa(earnings.owed)) {
        throw adminError(
          `That's more than they're owed right now (${formatTaka(earnings.owed)}).`,
          409,
        );
      }

      payout = await Payout.create({
        payee: payeeId,
        amount: Math.round(amount * 100) / 100,
        account: {
          method: account.method,
          accountName: account.accountName,
          accountNumber: account.accountNumber,
          bankName: account.bankName,
          branch: account.branch,
        },
        reference,
        note,
        admin: req.admin.id,
        paidAt: new Date(),
      });
    } finally {
      await PayoutAccount.updateOne(
        { user: payeeId },
        { $set: { payoutLockUntil: null } },
        { timestamps: false },
      ).exec();
    }
    await Notification.create({
      recipient: payeeId,
      type: "payout_sent",
      message: `CivilHub sent you ${formatTaka(payout.amount)} to your ${account.method === "bank" ? "bank account" : account.method} (ref ${reference}).`,
    });
    await logAction(req, "payout.record", {
      targetType: "payout",
      targetId: payout._id,
      subjectUser: payeeId,
      reason: note,
      meta: { amount: payout.amount, reference },
    });
    res.status(201).json({ id: payout._id.toString(), owed: (toPaisa(earnings.owed) - toPaisa(payout.amount)) / 100 });
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- refunds

const toRefundView = (refund: IRefund & { payer?: unknown }) => {
  const payer = refund.payer as unknown as { _id?: Types.ObjectId; name?: string } | null;
  return {
    id: refund._id.toString(),
    kind: refund.kind,
    paymentId: refund.payment.toString(),
    payer: payer && payer._id ? { id: payer._id.toString(), name: payer.name ?? "" } : null,
    amount: refund.amount,
    method: refund.method,
    status: refund.status,
    reference: refund.reference ?? refund.gatewayRefundId ?? null,
    failureReason: refund.failureReason ?? null,
    createdAt: refund.createdAt.toISOString(),
    completedAt: refund.completedAt?.toISOString() ?? null,
  };
};

export const listRefunds = async (
  _req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await settleDueDeposits();
    const [due, processing, recent] = await Promise.all([
      getRefundsDue(),
      Refund.find({ status: "processing" }).sort({ createdAt: -1 }).populate("payer", "name").lean<IRefund[]>().exec(),
      Refund.find({ status: { $in: ["completed", "failed"] } })
        .sort({ updatedAt: -1 })
        .limit(20)
        .populate("payer", "name")
        .lean<IRefund[]>()
        .exec(),
    ]);
    res.status(200).json({
      due: due.map((item) => ({ ...item, paidWith: describePaymentMethod(item.cardType) })),
      processing: processing.map(toRefundView),
      recent: recent.map(toRefundView),
    });
  } catch (error: unknown) {
    next(error);
  }
};

const notifyRefund = (refund: IRefund, description: string): Promise<unknown> =>
  Notification.create({
    recipient: refund.payer,
    type: "refund_issued",
    message:
      refund.method === "sslcommerz"
        ? `CivilHub refunded ${formatTaka(refund.amount)} for ${description} to the card or wallet you paid with. It can take a few working days to show.`
        : `CivilHub refunded ${formatTaka(refund.amount)} for ${description}${refund.reference ? ` (ref ${refund.reference})` : ""}.`,
    ...(refund.equipmentBooking ? { equipmentBooking: refund.equipmentBooking } : {}),
  });

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

/** Creates the refund record, or refuses if this money is already being refunded. */
const claimRefund = async (fields: Record<string, unknown>): Promise<IRefund> => {
  try {
    return await Refund.create(fields);
  } catch (error: unknown) {
    if (isDuplicateKey(error)) {
      throw adminError("This is already being refunded. Refresh the queue.", 409);
    }
    throw error;
  }
};

const markRefundFailed = async (refund: IRefund, reason: string): Promise<void> => {
  await Refund.updateOne(
    { _id: refund._id },
    { $set: { status: "failed", failureReason: reason.slice(0, 500) }, $unset: { openKey: 1 } },
  ).exec();
};

/**
 * Refunds one item from the queue, through SSLCommerz or by recording a
 * refund the admin already sent. The amount always comes from the queue,
 * never from the request, so it can't be over-refunded.
 */
export const issueRefund = async (
  req: AdminRequest<{ paymentId?: unknown; kind?: unknown; method?: unknown; reference?: unknown; note?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const paymentId = objectId(typeof req.body.paymentId === "string" ? req.body.paymentId : undefined, "Payment").toString();
    const rawKind = req.body.kind;
    if (rawKind !== "overpayment" && rawKind !== "deposit" && rawKind !== "cancellation") {
      throw adminError("Choose overpayment, deposit or cancellation.", 400);
    }
    const kind: RefundKind = rawKind;
    const method = req.body.method;
    if (method !== "sslcommerz" && method !== "manual") throw adminError("Choose sslcommerz or manual.", 400);

    const due = await findRefundDue(paymentId, kind);
    if (!due) throw adminError("Nothing is owed back on this payment, or it's already being refunded.", 409);
    const payment = await Payment.findById(paymentId).lean<IPayment>().exec();
    if (!payment) throw adminError("Payment not found", 404);
    const note = optionalText(req.body.note, 500);

    const base = {
      payment: payment._id,
      payer: payment.paidBy,
      kind,
      equipmentBooking: payment.equipmentBooking,
      amount: due.amount,
      admin: req.admin.id,
      openKey: `${kind}:${paymentId}`,
    };

    if (method === "manual") {
      const reference = requireText(req.body.reference, "The transaction reference", 120);
      const refund = await claimRefund({
        ...base,
        method: "manual",
        status: "completed",
        reference,
        completedAt: new Date(),
      });
      await notifyRefund(refund, due.description);
      await logAction(req, "refund.manual", {
        targetType: "refund",
        targetId: refund._id,
        subjectUser: payment.paidBy,
        reason: note,
        meta: { amount: refund.amount, kind, reference },
      });
      res.status(201).json(toRefundView(refund));
      return;
    }

    if (!due.canUseGateway || !payment.bankTranId) {
      throw adminError("SSLCommerz can't refund this payment automatically. Send it by hand and record the reference.", 409);
    }
    // Claimed before asking the gateway, so a double-click can't send two.
    const refund = await claimRefund({ ...base, method: "sslcommerz", status: "processing" });
    let result;
    try {
      result = await requestRefund({
        bankTranId: payment.bankTranId,
        // Fixed per refund, so the gateway itself ignores a repeated request.
        refundTransId: `RF${refund._id.toString()}`,
        amount: due.amount,
        remarks: kind === "deposit" ? "CivilHub rental deposit refund" : "CivilHub refund of a duplicate payment",
      });
    } catch (error: unknown) {
      await markRefundFailed(refund, error instanceof Error ? error.message : "Couldn't reach SSLCommerz.");
      if (error instanceof GatewayError) throw adminError(error.message, 422);
      throw error;
    }

    refund.status = result.status === "success" ? "completed" : result.status;
    refund.gatewayRefundId = result.refundRefId;
    if (result.status === "success") refund.completedAt = new Date();
    if (result.status === "failed") {
      refund.failureReason = result.reason ?? "SSLCommerz refused the refund.";
      refund.openKey = undefined;
    }
    await refund.save();
    await logAction(req, "refund.gateway", {
      targetType: "refund",
      targetId: refund._id,
      subjectUser: payment.paidBy,
      reason: note,
      meta: { amount: refund.amount, kind, gatewayStatus: result.status, refundRefId: result.refundRefId },
    });
    if (refund.status === "failed") {
      throw adminError(
        `SSLCommerz refused the refund: ${refund.failureReason}. You can send it by hand and record the reference.`,
        // Not 5xx: those messages are hidden, and the admin needs the reason.
        422,
      );
    }
    if (refund.status === "completed") await notifyRefund(refund, due.description);
    res.status(201).json(toRefundView(refund));
  } catch (error: unknown) {
    next(error);
  }
};

/** Asks SSLCommerz whether a processing refund has finished. */
export const checkRefund = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const refund = await Refund.findById(objectId(req.params.refundId, "Refund")).exec();
    if (!refund) throw adminError("Refund not found", 404);
    if (refund.status !== "processing" || !refund.gatewayRefundId) {
      res.status(200).json(toRefundView(refund));
      return;
    }
    let result;
    try {
      result = await queryRefund(refund.gatewayRefundId);
    } catch (error: unknown) {
      if (error instanceof GatewayError) throw adminError(error.message, 422);
      throw error;
    }
    if (result.status !== "processing") {
      refund.status = result.status === "success" ? "completed" : "failed";
      if (refund.status === "completed") refund.completedAt = new Date();
      else {
        refund.failureReason = result.reason ?? "SSLCommerz cancelled the refund.";
        // Back on the queue to try again.
        refund.openKey = undefined;
      }
      await refund.save();
      await logAction(req, "refund.check", {
        targetType: "refund",
        targetId: refund._id,
        subjectUser: refund.payer,
        meta: { status: refund.status },
      });
      if (refund.status === "completed") {
        const payment = await Payment.findById(refund.payment).select("description").lean().exec();
        await notifyRefund(refund, payment?.description ?? "your payment");
      }
    }
    res.status(200).json(toRefundView(refund));
  } catch (error: unknown) {
    next(error);
  }
};

// ---------------------------------------------------------------- ledger

/** Every payment through CivilHub, newest first, searchable. */
export const listPayments = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (query.status && PAYMENT_STATUSES.includes(query.status as never)) filter.status = query.status;
    if (query.type && ["advance", "phase", "full_remaining", "equipment_booking"].includes(query.type)) {
      filter.type = query.type;
    }
    const q = query.q?.trim();
    if (q) {
      const pattern = { $regex: escapeRegex(q), $options: "i" };
      const people = await User.find({ $or: [{ name: pattern }, { email: pattern }] }).distinct("_id").exec();
      filter.$or = [
        { tranId: pattern },
        { bankTranId: pattern },
        { description: pattern },
        { paidBy: { $in: people } },
        { payee: { $in: people } },
      ];
    }
    const page = pageOf(query.page);
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("paidBy", "name")
        .populate("payee", "name")
        .lean()
        .exec(),
      Payment.countDocuments(filter).exec(),
    ]);
    const nameOf = (value: unknown): { id: string; name: string } | null => {
      const user = value as { _id?: Types.ObjectId; name?: string } | null;
      return user && user._id ? { id: user._id.toString(), name: user.name ?? "" } : null;
    };
    res.status(200).json({
      items: payments.map((payment) => ({
        id: payment._id.toString(),
        type: payment.type,
        description: payment.description ?? null,
        amount: payment.amount,
        platformFee: payment.platformFee ?? 0,
        payeeAmount: payment.payeeAmount ?? 0,
        depositAmount: payment.depositAmount ?? 0,
        status: payment.status,
        refundDue: Boolean(payment.refundDue),
        method: payment.method,
        paidWith: payment.status === "paid" ? describePaymentMethod(payment.cardType) : null,
        tranId: payment.tranId ?? null,
        payer: nameOf(payment.paidBy),
        payee: nameOf(payment.payee),
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.paidAt?.toISOString() ?? null,
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

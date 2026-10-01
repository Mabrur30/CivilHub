import bcrypt from "bcryptjs";
import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Payout } from "../models/Payout.model";
import { PAYOUT_METHODS, type PayoutMethod, PayoutAccount } from "../models/PayoutAccount.model";
import { Notification } from "../models/Notification.model";
import { User } from "../models/User.model";
import { getPayeeEarnings } from "../utils/earnings";
import { isProviderRole } from "../utils/roles";

/**
 * A payee's own view of getting paid: where CivilHub should send their money,
 * what they've earned, what's still on hold, and what's been sent.
 */

interface StatusError extends Error {
  statusCode: number;
}

const payoutError = (message: string, statusCode: number): StatusError => {
  const error = new Error(message) as StatusError;
  error.statusCode = statusCode;
  return error;
};

const requireProvider = (req: AuthenticatedRequest): string => {
  if (!isProviderRole(req.user.role)) {
    throw payoutError("Only engineers and companies get paid through CivilHub.", 403);
  }
  return req.user.userId;
};

const field = (value: unknown, label: string, max: number, required: boolean): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (required) throw payoutError(`${label} is required.`, 400);
    return undefined;
  }
  if (text.length > max) throw payoutError(`${label} must be ${max} characters or fewer.`, 400);
  return text;
};

const WALLET_NUMBER = /^01[3-9]\d{8}$/;

const toAccountView = (account: {
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  bankName?: string;
  branch?: string;
  routingNumber?: string;
  updatedAt: Date;
}) => ({
  method: account.method,
  accountName: account.accountName,
  accountNumber: account.accountNumber,
  bankName: account.bankName ?? null,
  branch: account.branch ?? null,
  routingNumber: account.routingNumber ?? null,
  updatedAt: account.updatedAt.toISOString(),
});

export const getMyPayouts = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireProvider(req);
    const [earnings, account, payouts] = await Promise.all([
      getPayeeEarnings(userId),
      PayoutAccount.findOne({ user: userId }).lean().exec(),
      Payout.find({ payee: userId }).sort({ paidAt: -1 }).limit(50).lean().exec(),
    ]);
    res.status(200).json({
      released: earnings.released,
      onHold: earnings.onHold,
      paidOut: earnings.paidOut,
      owed: earnings.owed,
      lines: earnings.lines.slice(0, 50),
      account: account ? toAccountView(account) : null,
      payouts: payouts.map((payout) => ({
        id: payout._id.toString(),
        amount: payout.amount,
        method: payout.account.method,
        accountNumber: payout.account.accountNumber,
        reference: payout.reference,
        paidAt: payout.paidAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const saveMyPayoutAccount = async (
  req: AuthenticatedRequest<Record<string, unknown>>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireProvider(req);
    const method = req.body.method;
    if (!PAYOUT_METHODS.includes(method as PayoutMethod)) {
      throw payoutError("Choose bKash, Nagad, Rocket or a bank account.", 400);
    }
    const isBank = method === "bank";
    const accountName = field(req.body.accountName, "The account holder's name", 120, true) as string;
    const accountNumber = (field(req.body.accountNumber, isBank ? "The account number" : "The wallet number", 40, true) as string).replace(/[\s-]/g, "");
    if (!isBank && !WALLET_NUMBER.test(accountNumber)) {
      throw payoutError("Enter the 11-digit mobile number of the wallet, like 01712345678.", 400);
    }
    if (isBank && !/^\d{6,20}$/.test(accountNumber)) {
      throw payoutError("A bank account number is 6 to 20 digits.", 400);
    }
    const bankName = isBank ? field(req.body.bankName, "The bank name", 120, true) : undefined;
    const branch = isBank ? field(req.body.branch, "The branch", 120, true) : undefined;
    const routingNumber = isBank ? field(req.body.routingNumber, "The routing number", 20, false) : undefined;

    // Where the money goes: a stolen session alone mustn't be able to change it.
    const user = await User.findById(userId).select("+passwordHash").exec();
    const password = req.body.currentPassword;
    const passwordMatches =
      Boolean(user) &&
      typeof password === "string" &&
      password.length > 0 &&
      (await bcrypt.compare(password, (user as NonNullable<typeof user>).passwordHash));
    if (!passwordMatches) {
      throw payoutError("Enter your current password to change where you're paid.", 403);
    }

    const account = await PayoutAccount.findOneAndUpdate(
      { user: userId },
      {
        $set: { method, accountName, accountNumber, bankName, branch, routingNumber },
        $setOnInsert: { user: userId },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    )
      .lean()
      .exec();
    await Notification.create({
      recipient: userId,
      type: "payout_account_updated",
      message: `Your payout account was changed to ${method === "bank" ? "a bank account" : method} ending ${accountNumber.slice(-4)}. If this wasn't you, change your password and contact CivilHub.`,
    });
    res.status(200).json(toAccountView(account!));
  } catch (error: unknown) {
    next(error);
  }
};

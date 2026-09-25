import { type NextFunction, type Request, type Response } from "express";
import { Types } from "mongoose";
import {
  getPaymentConfig,
  isPaymentGatewayConfigured,
} from "../config/payments";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Client } from "../models/Client.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import {
  Payment,
  type IPayment,
  type PaymentStatus,
  type PaymentType,
} from "../models/Payment.model";
import { User } from "../models/User.model";
import {
  applyBookingPayment,
  prepareBookingCharge,
} from "./equipmentBooking.controller";
import {
  applyProjectPayment,
  prepareProjectCharge,
} from "./projectProgress.controller";
import {
  CHECKOUT_WINDOW_MS,
  describePaymentMethod,
  newTranId,
  splitPayment,
} from "../services/payments";
import {
  GatewayError,
  initSession,
  isValidFor,
  queryTransaction,
  validateTransaction,
  type GatewayTransaction,
} from "../services/sslcommerz";
import { formatTaka } from "../utils/money";

interface PaymentError extends Error {
  statusCode: number;
}

const createPaymentError = (message: string, statusCode: number): PaymentError => {
  const error = new Error(message) as PaymentError;
  error.statusCode = statusCode;
  return error;
};

/** SSLCommerz won't open a checkout for less than this. */
const GATEWAY_MINIMUM = 10;
/** How long to let the gateway report back on its own before asking it. */
const RECONCILE_AFTER_MS = 60 * 1000;

export type CheckoutPurpose = "advance" | "phase" | "full_remaining" | "equipment_booking";

export interface CheckoutBody {
  purpose?: string;
  projectId?: string;
  phaseId?: string;
  bookingId?: string;
}

interface Charge {
  type: PaymentType;
  amount: number;
  depositAmount: number;
  payee: Types.ObjectId;
  productName: string;
  productCategory: string;
  returnPath: string;
  target: { project?: Types.ObjectId; phase?: Types.ObjectId; equipmentBooking?: Types.ObjectId };
}

const isPurpose = (value: unknown): value is CheckoutPurpose =>
  value === "advance" ||
  value === "phase" ||
  value === "full_remaining" ||
  value === "equipment_booking";

const prepareCharge = async (
  userId: string,
  role: string,
  body: CheckoutBody,
): Promise<Charge> => {
  if (!isPurpose(body.purpose)) {
    throw createPaymentError("Say what you're paying for", 400);
  }

  if (body.purpose === "equipment_booking") {
    const charge = await prepareBookingCharge(userId, role, body.bookingId);
    return {
      type: "equipment_booking",
      amount: charge.amount,
      depositAmount: charge.depositAmount,
      payee: charge.payee,
      productName: charge.productName,
      productCategory: "Equipment rental",
      returnPath: charge.returnPath,
      target: { equipmentBooking: charge.booking._id },
    };
  }

  const charge = await prepareProjectCharge(
    userId,
    role,
    body.purpose,
    body.projectId,
    body.phaseId,
  );
  return {
    type: charge.type,
    amount: charge.amount,
    depositAmount: 0,
    payee: charge.payee,
    productName: charge.productName,
    productCategory: "Engineering services",
    returnPath: charge.returnPath,
    target: {
      project: charge.project._id,
      ...(charge.phase ? { phase: charge.phase._id } : {}),
    },
  };
};

const loadCustomer = async (userId: string, role: string) => {
  const user = await User.findById(userId).select("name email").exec();
  if (!user) throw createPaymentError("Account not found", 404);
  const profile =
    role === "client"
      ? await Client.findOne({ user: userId }).select("phone location").exec()
      : await Engineer.findOne({ user: userId }).select("location").exec();
  const location =
    (profile && "location" in profile && profile.location?.trim()) || "Dhaka";
  const phone =
    (profile && "phone" in profile && typeof profile.phone === "string" && profile.phone.trim()) ||
    "N/A";
  return {
    name: user.name,
    email: user.email,
    phone,
    address: location,
    city: location.split(",").pop()?.trim() || "Dhaka",
  };
};

// ============ Checkout ============

export const startCheckout = async (
  req: AuthenticatedRequest<CheckoutBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) throw createPaymentError("Authentication required", 401);
    const config = getPaymentConfig();
    if (!isPaymentGatewayConfigured(config)) {
      throw createPaymentError("Payments aren't configured on this server yet", 503);
    }

    const { userId, role } = req.user;
    const charge = await prepareCharge(userId, role, req.body ?? {});
    if (charge.amount < GATEWAY_MINIMUM) {
      throw createPaymentError(
        `Online payments must be at least ${formatTaka(GATEWAY_MINIMUM)}`,
        409,
      );
    }

    const payment = await Payment.create({
      ...charge.target,
      type: charge.type,
      amount: charge.amount,
      paidBy: userId,
      payee: charge.payee,
      method: "sslcommerz",
      status: "initiated",
      tranId: newTranId(),
      description: charge.productName.slice(0, 300),
      returnPath: charge.returnPath,
      ...splitPayment(charge.amount, charge.depositAmount, config.commissionRate),
    });
    const tranId = payment.tranId as string;

    const callback = (kind: string): string =>
      `${config.serverUrl}/api/payments/sslcommerz/${kind}`;
    try {
      const gatewayUrl = await initSession({
        tranId,
        amount: charge.amount,
        productName: charge.productName,
        productCategory: charge.productCategory,
        customer: await loadCustomer(userId, role),
        reference: payment._id.toString(),
        urls: {
          success: callback("success"),
          fail: callback("fail"),
          cancel: callback("cancel"),
          ipn: callback("ipn"),
        },
      });
      res.status(201).json({ tranId, gatewayUrl });
    } catch (error: unknown) {
      const reason =
        error instanceof GatewayError ? error.message : "Couldn't start the payment";
      await Payment.updateOne(
        { _id: payment._id, status: "initiated" },
        { $set: { status: "failed", failureReason: reason.slice(0, 300) } },
      ).exec();
      // The error handler hides 5xx messages; this one is safe and useful to show.
      res.status(502).json({ message: reason });
    }
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Settling ============

const notifyRefundDue = async (payment: IPayment): Promise<void> => {
  await Notification.create({
    recipient: payment.paidBy,
    type: "payment_refund_due",
    message: `We received ${formatTaka(payment.amount)} for ${payment.description ?? "a payment"}, but it had already been paid or was no longer due. CivilHub will refund it.`,
    ...(payment.project ? { project: payment.project } : {}),
    ...(payment.equipmentBooking ? { equipmentBooking: payment.equipmentBooking } : {}),
  });
};

/**
 * Records a transaction SSLCommerz confirmed, once, and applies it. Replays
 * (the success redirect and the IPN both arrive) are no-ops. A payment we'd
 * marked failed or cancelled still settles: money received beats a hint.
 */
const settlePayment = async (
  payment: IPayment,
  transaction: GatewayTransaction,
): Promise<void> => {
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: "paid" } },
    {
      $set: {
        status: "paid",
        paidAt: new Date(),
        valId: transaction.val_id,
        bankTranId: transaction.bank_tran_id,
        cardType: transaction.card_type,
      },
      $unset: { failureReason: 1 },
    },
    { returnDocument: "after" },
  ).exec();
  if (!claimed) return;

  const applied =
    claimed.type === "equipment_booking"
      ? await applyBookingPayment(claimed)
      : await applyProjectPayment(claimed);
  if (!applied) {
    await Payment.updateOne({ _id: claimed._id }, { $set: { refundDue: true } }).exec();
    await notifyRefundDue(claimed);
  }
};

const markUnpaid = async (
  payment: IPayment,
  status: Extract<PaymentStatus, "failed" | "cancelled" | "expired">,
  reason: string,
): Promise<void> => {
  await Payment.updateOne(
    { _id: payment._id, status: "initiated" },
    { $set: { status, failureReason: reason.slice(0, 300) } },
  ).exec();
};

/** Confirms a posted val_id with SSLCommerz and settles the payment if it checks out. */
const verifyAndSettle = async (payment: IPayment, valId: unknown): Promise<void> => {
  if (typeof valId !== "string" || !valId) {
    await markUnpaid(payment, "failed", "SSLCommerz didn't confirm the payment");
    return;
  }
  // Network trouble leaves the payment initiated; reconciliation retries later.
  const transaction = await validateTransaction(valId);
  if (transaction && isValidFor(payment, transaction)) {
    await settlePayment(payment, transaction);
    return;
  }
  await markUnpaid(
    payment,
    "failed",
    transaction && transaction.tran_id === payment.tranId && transaction.status.startsWith("VALID")
      ? "The amount SSLCommerz reported didn't match"
      : "SSLCommerz couldn't confirm the payment",
  );
};

const fieldOf = (req: Request, key: string): unknown =>
  (req.body as Record<string, unknown> | undefined)?.[key] ??
  (req.query as Record<string, unknown>)[key];

const findByTranId = async (value: unknown): Promise<IPayment | null> =>
  typeof value === "string" && value
    ? Payment.findOne({ tranId: value }).exec()
    : null;

const resultUrl = (tranId: unknown): string => {
  const { clientUrl } = getPaymentConfig();
  const tran = typeof tranId === "string" ? encodeURIComponent(tranId) : "";
  return `${clientUrl}/payments/result?tran=${tran}`;
};

/**
 * SSLCommerz sends the customer's browser here after checkout. The login
 * cookie doesn't come along on this cross-site POST, and the posted fields
 * could be forged, so only SSLCommerz's validation API is trusted.
 */
export const gatewayReturn =
  (outcome: "success" | "fail" | "cancel") =>
  async (req: Request, res: Response): Promise<void> => {
    const tranId = fieldOf(req, "tran_id");
    try {
      const payment = await findByTranId(tranId);
      if (payment) {
        if (outcome === "success") {
          await verifyAndSettle(payment, fieldOf(req, "val_id"));
        } else {
          const error = fieldOf(req, "error");
          await markUnpaid(
            payment,
            outcome === "cancel" ? "cancelled" : "failed",
            typeof error === "string" && error
              ? error
              : outcome === "cancel"
                ? "You cancelled the payment"
                : "The payment didn't go through",
          );
        }
      }
    } catch (error: unknown) {
      console.error("SSLCommerz return failed:", error);
    }
    res.redirect(303, resultUrl(tranId));
  };

/** Server-to-server notice from SSLCommerz; settles even if the customer closed the tab. */
export const gatewayIpn = async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await findByTranId(fieldOf(req, "tran_id"));
    const status = fieldOf(req, "status");
    if (payment && (status === "VALID" || status === "VALIDATED")) {
      await verifyAndSettle(payment, fieldOf(req, "val_id"));
    } else if (payment && (status === "FAILED" || status === "CANCELLED")) {
      await markUnpaid(
        payment,
        status === "CANCELLED" ? "cancelled" : "failed",
        "The payment didn't go through",
      );
    }
    res.status(200).json({ received: true });
  } catch (error: unknown) {
    console.error("SSLCommerz IPN failed:", error);
    res.status(500).json({ received: false });
  }
};

/**
 * When nothing came back (tab closed, IPN can't reach a local server), ask
 * SSLCommerz directly. Past the checkout window, give up and expire it.
 */
const reconcile = async (payment: IPayment): Promise<IPayment> => {
  const age = Date.now() - payment.createdAt.getTime();
  if (payment.status !== "initiated" || age < RECONCILE_AFTER_MS) return payment;
  try {
    const transactions = await queryTransaction(payment.tranId as string);
    const valid = transactions.find((item) => isValidFor(payment, item));
    if (valid) {
      await settlePayment(payment, valid);
    } else if (age > CHECKOUT_WINDOW_MS) {
      await markUnpaid(payment, "expired", "The checkout timed out");
    }
  } catch (error: unknown) {
    console.error("SSLCommerz reconciliation failed:", error);
  }
  return (await Payment.findById(payment._id).exec()) ?? payment;
};

// ============ Reading ============

export interface PaymentView {
  tranId: string;
  status: PaymentStatus;
  type: PaymentType;
  description: string;
  amount: number;
  platformFee: number;
  payeeAmount: number;
  depositAmount: number;
  refundDue: boolean;
  method: string | null;
  failureReason: string | null;
  returnPath: string | null;
  paidAt: string | null;
  createdAt: string;
  viewerRole: "payer" | "payee";
}

export const toPaymentView = (payment: IPayment, viewerId: string): PaymentView => ({
  tranId: payment.tranId ?? "",
  status: payment.status,
  type: payment.type,
  description: payment.description ?? "",
  amount: payment.amount,
  platformFee: payment.platformFee,
  payeeAmount: payment.payeeAmount,
  depositAmount: payment.depositAmount,
  refundDue: payment.refundDue,
  method: payment.status === "paid" ? describePaymentMethod(payment.cardType) : null,
  failureReason: payment.failureReason ?? null,
  returnPath: payment.returnPath ?? null,
  paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
  createdAt: payment.createdAt.toISOString(),
  viewerRole: payment.paidBy.toString() === viewerId ? "payer" : "payee",
});

export const getPayment = async (
  req: AuthenticatedRequest,
  res: Response<PaymentView>,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) throw createPaymentError("Authentication required", 401);
    const { tranId } = req.params as unknown as { tranId?: string };
    const found = await findByTranId(tranId);
    const viewerId = req.user.userId;
    if (
      !found ||
      (found.paidBy.toString() !== viewerId && found.payee?.toString() !== viewerId)
    ) {
      throw createPaymentError("Payment not found", 404);
    }
    const payment = await reconcile(found);
    res.status(200).json(toPaymentView(payment, viewerId));
  } catch (error: unknown) {
    next(error);
  }
};

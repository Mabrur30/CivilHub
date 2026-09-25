import { Types } from "mongoose";
import { getPaymentConfig } from "../config/payments";
import { Payment } from "../models/Payment.model";
import { formatTaka } from "../utils/money";

/** How long a checkout may stay open before we stop waiting for it. */
export const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
/** A checkout this recent is probably still on the gateway page. */
export const CHECKOUT_IN_FLIGHT_MS = 15 * 60 * 1000;

const toPaisa = (amount: number): number => Math.round(amount * 100);
const fromPaisa = (paisa: number): number => paisa / 100;

export interface FeeSplit {
  platformFee: number;
  payeeAmount: number;
  depositAmount: number;
}

/**
 * Splits a charge between CivilHub and the payee. The commission comes out of
 * the payee's share; a held deposit is neither earned nor commissioned.
 */
export const splitPayment = (
  amount: number,
  depositAmount = 0,
  rate = getPaymentConfig().commissionRate,
): FeeSplit => {
  const earnedPaisa = Math.max(0, toPaisa(amount) - toPaisa(depositAmount));
  const feePaisa = Math.round(earnedPaisa * rate);
  return {
    platformFee: fromPaisa(feePaisa),
    payeeAmount: fromPaisa(earnedPaisa - feePaisa),
    depositAmount: fromPaisa(toPaisa(depositAmount)),
  };
};

/** A short, gateway-safe transaction id (SSLCommerz allows up to 30 chars). */
export const newTranId = (): string =>
  `CH${Date.now().toString(36)}${new Types.ObjectId().toString().slice(-8)}`.toUpperCase();

/** "BKASH-BKash" → "bKash", "VISA-Dutch Bangla" → "Visa card". */
export const describePaymentMethod = (cardType?: string | null): string => {
  const code = (cardType ?? "").split("-")[0].trim().toUpperCase();
  if (!code) return "SSLCommerz";
  const wallets: Record<string, string> = {
    BKASH: "bKash",
    NAGAD: "Nagad",
    ROCKET: "Rocket",
    DBBLMOBILEB: "Rocket",
    UPAY: "Upay",
    TAP: "Tap",
  };
  if (wallets[code]) return wallets[code];
  if (code.startsWith("VISA")) return "Visa card";
  if (code.startsWith("MASTER")) return "Mastercard";
  if (code.startsWith("AMEX")) return "Amex card";
  if (code.includes("NETBANK") || code.includes("IBANK")) return "internet banking";
  return cardType?.split("-").slice(-1)[0]?.trim() || "SSLCommerz";
};

/** The line payees see in their notification about what they'll receive. */
export const payeeShareNote = (payment: {
  payeeAmount: number;
  platformFee: number;
}): string =>
  payment.platformFee > 0
    ? ` You'll receive ${formatTaka(payment.payeeAmount)} after the ${formatTaka(payment.platformFee)} CivilHub fee.`
    : "";

/** True while the payer is probably still at the gateway for this target. */
export const hasCheckoutInFlight = async (
  target: { phase?: Types.ObjectId; equipmentBooking?: Types.ObjectId },
): Promise<boolean> => {
  const since = new Date(Date.now() - CHECKOUT_IN_FLIGHT_MS);
  const found = await Payment.exists({
    ...target,
    status: "initiated",
    createdAt: { $gte: since },
  }).exec();
  return Boolean(found);
};

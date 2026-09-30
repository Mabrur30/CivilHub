import { Types } from "mongoose";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { type IPayment, Payment } from "../models/Payment.model";
import { Refund, type RefundKind } from "../models/Refund.model";
import { User } from "../models/User.model";
import { isClaimSettled } from "./deposits";

/**
 * Money CivilHub owes back to payers:
 * - overpayments: payments that arrived for something already paid or
 *   withdrawn (Payment.refundDue). The payer was told CivilHub would refund it.
 * - deposits: a completed rental's security deposit once the owner has
 *   released it, less anything they claimed. A claim the renter can still
 *   dispute, or has disputed and is waiting on an admin, holds the whole
 *   refund back so it's paid once, at the final amount.
 * A refund that's done or still processing takes the item off the list; a
 * failed one leaves it there to try again.
 */

export interface RefundDue {
  kind: RefundKind;
  paymentId: string;
  bookingId: string | null;
  payer: { id: string; name: string; email: string } | null;
  amount: number;
  description: string;
  tranId: string | null;
  /** How they paid, as SSLCommerz reported it (e.g. "BKASH-BKash"). */
  cardType: string | null;
  /** True when SSLCommerz can be asked to refund it automatically. */
  canUseGateway: boolean;
  since: string;
}

const openRefundKeys = async (paymentIds: Types.ObjectId[]): Promise<Set<string>> => {
  if (paymentIds.length === 0) return new Set();
  const refunds = await Refund.find({
    payment: { $in: paymentIds },
    status: { $in: ["processing", "completed"] },
  })
    .select("payment kind")
    .lean()
    .exec();
  return new Set(refunds.map((refund) => `${refund.kind}:${refund.payment.toString()}`));
};

const gatewayUsable = (payment: IPayment): boolean =>
  payment.method === "sslcommerz" && Boolean(payment.bankTranId);

export const getRefundsDue = async (): Promise<RefundDue[]> => {
  const [overpaid, bookings] = await Promise.all([
    Payment.find({ status: "paid", refundDue: true }).lean<IPayment[]>().exec(),
    EquipmentBooking.find({
      status: "completed",
      paymentStatus: "paid",
      securityDeposit: { $gt: 0 },
      depositResolution: { $in: ["released", "claimed"] },
    })
      .select("_id securityDeposit depositResolution depositClaimAmount depositClaimedAt depositDispute updatedAt")
      .lean()
      .exec(),
  ]);

  const bookingPayments = bookings.length
    ? await Payment.find({
        equipmentBooking: { $in: bookings.map((booking) => booking._id) },
        type: "equipment_booking",
        status: "paid",
        refundDue: { $ne: true },
        depositAmount: { $gt: 0 },
      })
        .lean<IPayment[]>()
        .exec()
    : [];
  const paymentByBooking = new Map(
    bookingPayments.map((payment) => [payment.equipmentBooking!.toString(), payment]),
  );

  const done = await openRefundKeys([
    ...overpaid.map((payment) => payment._id as Types.ObjectId),
    ...bookingPayments.map((payment) => payment._id as Types.ObjectId),
  ]);

  const payerIds = [
    ...new Set([...overpaid, ...bookingPayments].map((payment) => payment.paidBy.toString())),
  ];
  const payers = new Map(
    (await User.find({ _id: { $in: payerIds } }).select("name email").lean().exec()).map((user) => [
      user._id.toString(),
      { id: user._id.toString(), name: user.name, email: user.email },
    ]),
  );

  const items: RefundDue[] = [];
  for (const payment of overpaid) {
    if (done.has(`overpayment:${payment._id.toString()}`)) continue;
    items.push({
      kind: "overpayment",
      paymentId: payment._id.toString(),
      bookingId: payment.equipmentBooking?.toString() ?? null,
      payer: payers.get(payment.paidBy.toString()) ?? null,
      amount: payment.amount,
      description: payment.description ?? "Payment",
      tranId: payment.tranId ?? null,
      cardType: payment.cardType ?? null,
      canUseGateway: gatewayUsable(payment),
      since: (payment.paidAt ?? payment.createdAt).toISOString(),
    });
  }
  for (const booking of bookings) {
    const payment = paymentByBooking.get(booking._id.toString());
    if (!payment || done.has(`deposit:${payment._id.toString()}`)) continue;
    if (!isClaimSettled(booking)) continue;
    const claimed = booking.depositResolution === "claimed" ? (booking.depositClaimAmount ?? 0) : 0;
    const amount = Math.round((payment.depositAmount - claimed) * 100) / 100;
    if (amount <= 0) continue;
    items.push({
      kind: "deposit",
      paymentId: payment._id.toString(),
      bookingId: booking._id.toString(),
      payer: payers.get(payment.paidBy.toString()) ?? null,
      amount,
      description:
        claimed > 0
          ? `Deposit for ${payment.description ?? "a rental"}, less ${claimed} claimed by the owner`
          : `Deposit for ${payment.description ?? "a rental"}`,
      tranId: payment.tranId ?? null,
      cardType: payment.cardType ?? null,
      canUseGateway: gatewayUsable(payment),
      since: booking.updatedAt.toISOString(),
    });
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
};

/** The one item due for this payment and kind, or null if nothing is owed. */
export const findRefundDue = async (paymentId: string, kind: RefundKind): Promise<RefundDue | null> =>
  (await getRefundsDue()).find((item) => item.paymentId === paymentId && item.kind === kind) ?? null;

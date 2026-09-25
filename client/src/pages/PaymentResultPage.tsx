import {
  CheckCircleIcon,
  ClockCountdownIcon,
  HourglassIcon,
  ProhibitIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  panelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { useAuth } from "../context/AuthContext";
import { formatCurrency } from "../lib/format";
import {
  fetchPaymentResult,
  type PaymentResult,
  type PaymentStatus,
} from "../lib/payments";

/** SSLCommerz usually confirms within seconds; stop asking after about half a minute. */
const POLL_INTERVAL_MS = 4000;
const POLL_LIMIT = 8;

const statusCopy: Record<
  PaymentStatus,
  { title: string; icon: typeof CheckCircleIcon; tone: string }
> = {
  paid: {
    title: "Payment received",
    icon: CheckCircleIcon,
    tone: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  },
  initiated: {
    title: "Waiting for confirmation",
    icon: HourglassIcon,
    tone: "border-violet-300/30 bg-violet-300/10 text-violet-200",
  },
  failed: {
    title: "The payment didn't go through",
    icon: XCircleIcon,
    tone: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  },
  cancelled: {
    title: "Payment cancelled",
    icon: ProhibitIcon,
    tone: "border-white/15 bg-white/5 text-white/70",
  },
  expired: {
    title: "Checkout timed out",
    icon: ClockCountdownIcon,
    tone: "border-white/15 bg-white/5 text-white/70",
  },
};

const formatWhen = (value: string): string =>
  new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const summaryFor = (payment: PaymentResult): string => {
  const amount = formatCurrency(payment.amount);
  switch (payment.status) {
    case "paid":
      if (payment.refundDue) {
        return `We received ${amount}, but this had already been paid or was no longer due. CivilHub will refund it to you.`;
      }
      return payment.viewerRole === "payer"
        ? `You paid ${amount}${payment.method ? ` with ${payment.method}` : ""}. ${
            payment.type === "equipment_booking"
              ? "The owner has been notified."
              : "Your engineer has been notified."
          }`
        : `${payment.type === "equipment_booking" ? "The renter" : "The client"} paid ${amount}${payment.method ? ` with ${payment.method}` : ""}.`;
    case "initiated":
      return "SSLCommerz hasn't confirmed this payment yet. This page checks again on its own; you haven't been charged twice.";
    case "failed":
      return `${(payment.failureReason ?? "The payment was declined").replace(/\.+$/, "")}. Nothing was charged. You can try again.`;
    case "cancelled":
      return "You left the payment page before paying. Nothing was charged.";
    case "expired":
      return "The payment page was left open too long. Nothing was charged. Start again when you're ready.";
  }
};

function ReceiptRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 sm:px-5">
      <dt className="text-sm text-white/55">{label}</dt>
      <dd
        className={`text-right tabular-nums ${strong ? "text-base font-semibold text-white" : "text-sm text-white/85"} break-all`}
      >
        {value}
      </dd>
    </div>
  );
}

export function PaymentResultPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const tranId = searchParams.get("tran") ?? "";
  const { currentUser } = useAuth();
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [error, setError] = useState<string>("");
  const [polls, setPolls] = useState<number>(0);

  const load = useCallback(async (): Promise<void> => {
    if (!tranId) {
      setError("This link doesn't name a payment.");
      return;
    }
    try {
      setPayment(await fetchPaymentResult(tranId));
      setError("");
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error ? loadError.message : "We couldn't load this payment.",
      );
    }
  }, [tranId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep asking while SSLCommerz is still confirming.
  useEffect(() => {
    if (payment?.status !== "initiated" || polls >= POLL_LIMIT) return;
    const timer = window.setTimeout(() => {
      setPolls((count) => count + 1);
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [payment, polls, load]);

  const fallbackPath =
    currentUser?.role === "client" ? "/dashboard/client" : "/dashboard/engineer";
  const backPath = payment?.returnPath ?? fallbackPath;
  const backLabel =
    payment?.type === "equipment_booking" ? "Back to the booking" : "Back to the project";

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <ErrorPanel message={error} onRetry={() => void load()} />
        <Link to={fallbackPath} className={secondaryButtonClassName}>
          Go to your dashboard
        </Link>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" aria-busy="true">
        <div className="h-14 w-14 animate-pulse rounded-full bg-white/10" />
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-white/10" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
      </div>
    );
  }

  const copy = statusCopy[payment.status];
  const Icon = copy.icon;
  const isPaid = payment.status === "paid";
  const canRetry =
    payment.viewerRole === "payer" &&
    (payment.status === "failed" ||
      payment.status === "cancelled" ||
      payment.status === "expired");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <span
          className={`inline-flex h-14 w-14 items-center justify-center rounded-full border ${copy.tone}`}
        >
          <Icon className="h-7 w-7" weight="duotone" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-heading text-4xl font-bold text-white sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-xl text-white/60" role="status">
          {summaryFor(payment)}
        </p>
      </header>

      <section className={panelClassName} aria-labelledby="receipt-heading">
        <h2
          id="receipt-heading"
          className="px-4 pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-white/45 sm:px-5"
        >
          {isPaid ? "Receipt" : "Payment details"}
        </h2>
        <dl className="mt-2 divide-y divide-white/10">
          <ReceiptRow label="For" value={payment.description || "CivilHub payment"} />
          <ReceiptRow label="Amount" value={formatCurrency(payment.amount)} strong />
          {payment.depositAmount > 0 ? (
            <ReceiptRow
              label="Includes refundable deposit"
              value={formatCurrency(payment.depositAmount)}
            />
          ) : null}
          {isPaid && payment.viewerRole === "payee" && payment.platformFee > 0 ? (
            <>
              <ReceiptRow
                label="CivilHub fee"
                value={`−${formatCurrency(payment.platformFee)}`}
              />
              <ReceiptRow
                label="You receive"
                value={formatCurrency(payment.payeeAmount)}
                strong
              />
            </>
          ) : null}
          {payment.method ? <ReceiptRow label="Paid with" value={payment.method} /> : null}
          <ReceiptRow
            label={isPaid ? "Paid" : "Started"}
            value={formatWhen(payment.paidAt ?? payment.createdAt)}
          />
          <ReceiptRow label="Transaction ID" value={payment.tranId} />
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to={backPath} className={primaryButtonClassName}>
          {canRetry ? "Try again" : backLabel}
        </Link>
        {payment.status === "initiated" && polls >= POLL_LIMIT ? (
          <button
            type="button"
            onClick={() => {
              setPolls(0);
              void load();
            }}
            className={secondaryButtonClassName}
          >
            Check again
          </button>
        ) : null}
      </div>
    </div>
  );
}

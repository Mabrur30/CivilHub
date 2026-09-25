import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../../lib/format";
import { toIsoDate } from "../../../lib/timeline";
import {
  createEquipmentBookingRequest,
  type EquipmentFulfilment,
  type EquipmentListing,
  type EquipmentQuote,
  fetchEquipmentQuote,
} from "../../../pages/equipment.api";
import { EquipmentCalendar, type SelectedRange } from "../../EquipmentCalendar";
import { inputClassName } from "../ui/buttonStyles";
import { useEquipmentPaths } from "./paths";

interface BookingPanelProps {
  item: EquipmentListing;
}

const formatDay = (value: Date): string =>
  value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const stepButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/75 transition-colors hover:border-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-white/15";

function Line({
  label,
  detail,
  amount,
}: {
  label: string;
  detail?: string;
  amount: string;
}): ReactElement {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt>
        <span className="text-white/80">{label}</span>
        {detail ? (
          <span className="block text-xs text-white/50">{detail}</span>
        ) : null}
      </dt>
      <dd className="shrink-0 tabular-nums text-white/90">{amount}</dd>
    </div>
  );
}

/**
 * Units, operator, pickup or delivery, dates, then a live quote from the server.
 * The quote comes from the same pricing the booking is stored with, so the
 * total here is the total the owner sees.
 */
export function BookingPanel({ item }: BookingPanelProps): ReactElement {
  const paths = useEquipmentPaths();
  const [units, setUnits] = useState<number>(1);
  const [withOperator, setWithOperator] = useState<boolean>(false);
  const [fulfilment, setFulfilment] = useState<EquipmentFulfilment>(
    item.transport === "delivery" ? "delivery" : "pickup",
  );
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [range, setRange] = useState<SelectedRange | null>(null);
  const [calendarKey, setCalendarKey] = useState<number>(0);
  const [quote, setQuote] = useState<EquipmentQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [sentMessage, setSentMessage] = useState<string>("");

  useEffect(() => {
    if (!range) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetchEquipmentQuote(
        item.id,
        {
          startDate: toIsoDate(range.start),
          endDate: toIsoDate(range.end),
          units,
          withOperator,
          fulfilment,
        },
        controller.signal,
      )
        .then((result) => {
          setQuote(result);
          setQuoteError("");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          setQuoteError(
            error instanceof Error
              ? error.message
              : "Unable to price these dates.",
          );
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [item.id, range, units, withOperator, fulfilment]);

  const needsAddress = fulfilment === "delivery";
  const addressMissing = needsAddress && deliveryAddress.trim().length < 5;
  const canSubmit = Boolean(
    range && quote?.fits && !addressMissing && !isSubmitting,
  );

  const submit = async (): Promise<void> => {
    if (!range || !canSubmit) return;
    setIsSubmitting(true);
    setSubmitError("");
    setSentMessage("");
    try {
      await createEquipmentBookingRequest({
        equipmentId: item.id,
        startDate: toIsoDate(range.start),
        endDate: toIsoDate(range.end),
        units,
        withOperator,
        fulfilment,
        ...(needsAddress ? { deliveryAddress: deliveryAddress.trim() } : {}),
      });
      setSentMessage("Request sent. The owner will approve or decline it.");
      setRange(null);
      setCalendarKey((key) => key + 1);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to send the request.";
      setSubmitError(message);
      if (/available|free/i.test(message)) setCalendarKey((key) => key + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const rateNote =
    quote && quote.appliedRates.includes("monthly")
      ? "Monthly rate applied"
      : quote && quote.appliedRates.includes("weekly")
        ? "Weekly rate applied"
        : undefined;

  return (
    <div className="space-y-4">
      {item.quantity > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Units</p>
            <p className="text-xs text-white/50">{item.quantity} available</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setUnits((value) => Math.max(1, value - 1))}
              disabled={units <= 1}
              className={stepButton}
              aria-label="One unit fewer"
            >
              <MinusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <span
              className="w-6 text-center text-lg font-semibold tabular-nums text-white"
              aria-live="polite"
            >
              {units}
            </span>
            <button
              type="button"
              onClick={() =>
                setUnits((value) => Math.min(item.quantity, value + 1))
              }
              disabled={units >= item.quantity}
              className={stepButton}
              aria-label="One unit more"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {item.operator === "optional" && item.operatorDailyRate ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 has-checked:border-primary/60 has-checked:bg-primary/10">
          <input
            type="checkbox"
            checked={withOperator}
            onChange={(event) => setWithOperator(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-semibold text-white">
              Add an operator
            </span>
            <span className="block text-xs text-white/55">
              {formatCurrency(item.operatorDailyRate)} a day
              {item.quantity > 1 ? " per unit" : ""}
            </span>
          </span>
        </label>
      ) : null}

      {item.transport === "both" ? (
        <fieldset>
          <legend className="text-sm font-semibold text-white">
            Getting it to site
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["pickup", "delivery"] as const).map((option) => (
              <label
                key={option}
                className="flex cursor-pointer flex-col rounded-xl border border-white/15 px-3 py-2.5 has-checked:border-primary/60 has-checked:bg-primary/10"
              >
                <input
                  type="radio"
                  name={`fulfilment-${item.id}`}
                  value={option}
                  checked={fulfilment === option}
                  onChange={() => setFulfilment(option)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-white">
                  {option === "pickup" ? "I'll collect" : "Deliver it"}
                </span>
                <span className="text-xs text-white/55">
                  {option === "pickup"
                    ? `From ${item.location}`
                    : item.deliveryFee
                      ? `${formatCurrency(item.deliveryFee)} flat`
                      : "Free delivery"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {needsAddress ? (
        <div className="grid gap-1.5">
          <label
            htmlFor={`site-address-${item.id}`}
            className="text-sm font-semibold text-white"
          >
            Site address
          </label>
          <textarea
            id={`site-address-${item.id}`}
            rows={2}
            value={deliveryAddress}
            onChange={(event) => setDeliveryAddress(event.target.value)}
            placeholder="House, road, area, city"
            className={`${inputClassName} resize-none`}
          />
          {item.transport === "delivery" ? (
            <p className="text-xs text-white/50">
              The owner delivers this equipment
              {item.deliveryFee
                ? ` for ${formatCurrency(item.deliveryFee)}`
                : " for free"}
              .
            </p>
          ) : null}
        </div>
      ) : null}

      <EquipmentCalendar
        key={`${item.id}-${calendarKey}`}
        equipmentId={item.id}
        units={units}
        onRangeChange={(next) => {
          setRange(next);
          setSubmitError("");
          setSentMessage("");
        }}
      />
      {item.minRentalDays > 1 ? (
        <p className="text-xs text-white/50">
          Minimum rental is {item.minRentalDays} days.
        </p>
      ) : null}

      {range ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-sm font-semibold text-white">
            {formatDay(range.start)}
            {range.end.getTime() !== range.start.getTime()
              ? ` to ${formatDay(range.end)}`
              : ""}
          </p>

          {quoteError ? (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {quoteError}
            </p>
          ) : !quote ? (
            <p className="mt-2 text-sm text-white/55">Working out the price…</p>
          ) : (
            <>
              <dl className="mt-3 space-y-2 text-sm">
                <Line
                  label="Rental"
                  detail={[
                    `${quote.rentalDays} day${quote.rentalDays === 1 ? "" : "s"}`,
                    quote.units > 1 ? `${quote.units} units` : null,
                    rateNote,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  amount={formatCurrency(quote.rentalFee)}
                />
                {quote.operatorFee > 0 ? (
                  <Line
                    label="Operator"
                    amount={formatCurrency(quote.operatorFee)}
                  />
                ) : null}
                {fulfilment === "delivery" ? (
                  <Line
                    label="Delivery"
                    amount={
                      quote.deliveryFee > 0
                        ? formatCurrency(quote.deliveryFee)
                        : "Free"
                    }
                  />
                ) : null}
                <Line
                  label="Security deposit"
                  detail="Returned after the equipment comes back"
                  amount={formatCurrency(quote.securityDeposit)}
                />
                <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2 text-base font-bold text-white">
                  <dt>Total due</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(quote.totalDue)}
                  </dd>
                </div>
              </dl>
              {!quote.fits ? (
                <p role="alert" className="mt-2 text-sm text-rose-300">
                  {units > 1
                    ? `${units} units aren't free on all of these dates.`
                    : "These dates are no longer available."}
                </p>
              ) : null}
            </>
          )}

          {addressMissing ? (
            <p className="mt-2 text-xs text-white/60">
              Add the site address to send the request.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="mt-3 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-glow disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            {isSubmitting ? "Sending request…" : "Request to book"}
          </button>
        </div>
      ) : null}

      {sentMessage ? (
        <p role="status" className="text-sm text-emerald-300">
          {sentMessage}{" "}
          <Link
            to={paths.bookings}
            className="font-semibold underline underline-offset-4"
          >
            See my bookings
          </Link>
        </p>
      ) : null}
      {submitError ? (
        <p role="alert" className="text-sm text-rose-300">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}

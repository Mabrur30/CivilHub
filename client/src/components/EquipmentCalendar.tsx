import { type ReactElement, useEffect, useMemo, useState } from "react";
import {
  fetchEquipmentAvailability,
  type EquipmentAvailability,
} from "../pages/equipment.api";
import { toIsoDate } from "../lib/timeline";

export interface SelectedRange {
  start: Date;
  end: Date;
}

interface EquipmentCalendarProps {
  equipmentId: string;
  /** Units the renter wants; a day is unavailable when that many aren't free. */
  units: number;
  onRangeChange: (range: SelectedRange | null) => void;
}

interface DayCell {
  date: Date;
  inCurrentMonth: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDayStart = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

// Day keys are the local calendar date, the same "YYYY-MM-DD" the API uses.
const toDateKey = toIsoDate;

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getMonthLabel = (value: Date): string =>
  value.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const buildMonthGrid = (monthAnchor: Date): DayCell[] => {
  const firstOfMonth = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
  );
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      inCurrentMonth: date.getMonth() === monthAnchor.getMonth(),
    };
  });
};

const eachDay = (start: Date, end: Date): Date[] => {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const blockedStripes =
  "bg-[repeating-linear-gradient(135deg,rgba(242,106,27,0.18),rgba(242,106,27,0.18)_4px,rgba(0,0,0,0)_4px,rgba(0,0,0,0)_8px)]";

export function EquipmentCalendar({
  equipmentId,
  units,
  onRangeChange,
}: EquipmentCalendarProps): ReactElement {
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [availability, setAvailability] = useState<EquipmentAvailability>({
    quantity: 1,
    unitsBookedByDate: new Map(),
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectionError, setSelectionError] = useState<string>("");

  const today = useMemo(() => toDayStart(new Date()), []);

  useEffect(() => {
    let isCancelled = false;
    const loadAvailability = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError("");
      try {
        const result = await fetchEquipmentAvailability(
          equipmentId,
          visibleMonth.getMonth() + 1,
          visibleMonth.getFullYear(),
        );
        if (!isCancelled) setAvailability(result);
      } catch (error: unknown) {
        if (isCancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load availability calendar.",
        );
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void loadAvailability();
    return () => {
      isCancelled = true;
    };
  }, [equipmentId, visibleMonth]);

  const unitsFree = (day: Date): number =>
    availability.quantity -
    (availability.unitsBookedByDate.get(toDateKey(day)) ?? 0);

  const isBlocked = (day: Date): boolean => unitsFree(day) < units;

  // Asking for more units can make an existing selection impossible.
  useEffect(() => {
    if (!startDate || !endDate) return;
    if (eachDay(startDate, endDate).some(isBlocked)) {
      setStartDate(null);
      setEndDate(null);
      setSelectionError(
        `${units} units aren't free on all of those dates. Pick new dates.`,
      );
      onRangeChange(null);
    }
    // Only re-check when the requested units or the loaded availability change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, availability]);

  const dayCells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const onDateClick = (clickedDate: Date): void => {
    const day = toDayStart(clickedDate);
    if (day < today || isBlocked(day)) return;

    // First click, or starting over after a finished range.
    if (!startDate || endDate) {
      setStartDate(day);
      setEndDate(null);
      setSelectionError("");
      onRangeChange(null);
      return;
    }

    if (day.getTime() < startDate.getTime()) {
      setStartDate(day);
      setSelectionError("");
      return;
    }

    // Same day twice is a one-day hire.
    if (eachDay(startDate, day).some(isBlocked)) {
      setSelectionError(
        "Some days in that range aren't available. Choose a different range.",
      );
      return;
    }

    setEndDate(day);
    setSelectionError("");
    onRangeChange({ start: startDate, end: day });
  };

  const selectionEnd = endDate ?? startDate;

  return (
    <div className="rounded-xl border border-white/10 bg-void/45 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setVisibleMonth(
              (current) =>
                new Date(current.getFullYear(), current.getMonth() - 1, 1),
            )
          }
          className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/75 transition-colors hover:border-primary hover:text-white"
          aria-label="Previous month"
        >
          ←
        </button>

        <p className="text-sm font-semibold text-white">
          {getMonthLabel(visibleMonth)}
        </p>

        <button
          type="button"
          onClick={() =>
            setVisibleMonth(
              (current) =>
                new Date(current.getFullYear(), current.getMonth() + 1, 1),
            )
          }
          className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/75 transition-colors hover:border-primary hover:text-white"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-3 grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, index) => (
            <div
              key={`calendar-skeleton-${index}`}
              className="aspect-square animate-pulse rounded-lg bg-white/10"
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-7 gap-1">
          {dayCells.map((cell) => {
            const day = toDayStart(cell.date);
            const key = toDateKey(day);
            const isPast = day.getTime() < today.getTime();
            const blocked = isBlocked(day);
            const free = unitsFree(day);
            const showLeft =
              !isPast &&
              !blocked &&
              availability.quantity > 1 &&
              free < availability.quantity;
            const isStart = Boolean(startDate && isSameDay(day, startDate));
            const isEnd = Boolean(endDate && isSameDay(day, endDate));
            const isInRange = Boolean(
              startDate &&
              selectionEnd &&
              day >= startDate &&
              day <= selectionEnd,
            );
            const disabled = isPast || blocked;

            return (
              <button
                key={`${key}-${cell.inCurrentMonth ? "current" : "adjacent"}`}
                type="button"
                disabled={disabled}
                onClick={() => onDateClick(day)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                  // One branch per state, so the endpoint fill never competes
                  // with the in-range tint for the same property.
                  isStart || isEnd
                    ? "border-primary bg-primary font-semibold text-on-primary"
                    : !cell.inCurrentMonth
                      ? "border-transparent text-white/25"
                      : disabled
                        ? "border-white/5 text-white/35"
                        : isInRange
                          ? "border-primary/30 bg-primary/20 text-white"
                          : "border-white/10 text-white hover:border-primary/60"
                }`}
                aria-label={`${day.toDateString()}${
                  blocked
                    ? ", unavailable"
                    : showLeft
                      ? `, ${free} of ${availability.quantity} free`
                      : ""
                }`}
              >
                <span className="relative z-10 leading-none">
                  {day.getDate()}
                </span>
                {showLeft && cell.inCurrentMonth ? (
                  <span className="relative z-10 mt-0.5 text-[9px] leading-none opacity-70">
                    {free} left
                  </span>
                ) : null}

                {isSameDay(day, today) ? (
                  <span className="pointer-events-none absolute inset-1 rounded-md border border-cyan-300/70" />
                ) : null}

                {blocked && !isPast ? (
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-lg ${blockedStripes}`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/55">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/20" /> Selected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-cyan-300/70" />{" "}
          Today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${blockedStripes}`} />{" "}
          {availability.quantity > 1 ? "Not enough units" : "Unavailable"}
        </span>
      </div>

      <p className="mt-2 text-xs text-white/45">
        {startDate && !endDate
          ? "Now tap the last day. Tap the same day again for a one-day hire."
          : "Tap the first day, then the last day."}
      </p>

      {loadError ? (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {loadError}
        </p>
      ) : null}

      {selectionError ? (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {selectionError}
        </p>
      ) : null}
    </div>
  );
}

import { type ReactElement, useEffect, useMemo, useState } from "react";
import {
  fetchEquipmentAvailability,
  type EquipmentAvailabilityRange,
} from "../pages/equipment.api";

interface EquipmentCalendarProps {
  equipmentId: string;
  onRangeSelect: (start: Date, end: Date) => void;
}

interface DayCell {
  date: Date;
  inCurrentMonth: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDayStart = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const toDateKey = (value: Date): string => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isWithinRangeInclusive = (date: Date, start: Date, end: Date): boolean =>
  date.getTime() >= start.getTime() && date.getTime() <= end.getTime();

const getMonthLabel = (value: Date): string =>
  value.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const buildMonthGrid = (monthAnchor: Date): DayCell[] => {
  const firstOfMonth = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
  );
  const firstWeekday = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      inCurrentMonth: date.getMonth() === monthAnchor.getMonth(),
    };
  });
};

const rangeOverlapsBlocked = (
  start: Date,
  end: Date,
  blockedRanges: Array<{ start: Date; end: Date }>,
): boolean =>
  blockedRanges.some(
    (range) =>
      range.start.getTime() <= end.getTime() &&
      range.end.getTime() >= start.getTime(),
  );

export function EquipmentCalendar({
  equipmentId,
  onRangeSelect,
}: EquipmentCalendarProps): ReactElement {
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [blockedRangesRaw, setBlockedRangesRaw] = useState<
    EquipmentAvailabilityRange[]
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectionError, setSelectionError] = useState<string>("");

  const today = useMemo(() => toDayStart(new Date()), []);

  useEffect(() => {
    const loadAvailability = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError("");
      try {
        const month = visibleMonth.getMonth() + 1;
        const year = visibleMonth.getFullYear();
        const ranges = await fetchEquipmentAvailability(
          equipmentId,
          month,
          year,
        );
        setBlockedRangesRaw(ranges);
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load availability calendar.";
        setLoadError(message);
        setBlockedRangesRaw([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAvailability();
  }, [equipmentId, visibleMonth]);

  const blockedRanges = useMemo(
    () =>
      blockedRangesRaw
        .map((range) => {
          const parsedStart = toDayStart(new Date(range.startDate));
          const parsedEnd = toDayStart(new Date(range.endDate));
          if (
            Number.isNaN(parsedStart.getTime()) ||
            Number.isNaN(parsedEnd.getTime())
          ) {
            return null;
          }
          return { start: parsedStart, end: parsedEnd };
        })
        .filter((range): range is { start: Date; end: Date } => range !== null),
    [blockedRangesRaw],
  );

  const blockedDateKeys = useMemo(() => {
    const keys = new Set<string>();

    blockedRanges.forEach((range) => {
      const cursor = new Date(range.start);
      while (cursor.getTime() <= range.end.getTime()) {
        keys.add(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    return keys;
  }, [blockedRanges]);

  const dayCells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const hasSelection = Boolean(startDate && endDate);

  const onDateClick = (clickedDate: Date): void => {
    const day = toDayStart(clickedDate);
    const dateKey = toDateKey(day);

    if (day < today) return;
    if (blockedDateKeys.has(dateKey)) return;

    if (!startDate || (startDate && endDate)) {
      setStartDate(day);
      setEndDate(null);
      setSelectionError("");
      return;
    }

    if (day.getTime() <= startDate.getTime()) {
      setStartDate(day);
      setEndDate(null);
      setSelectionError("");
      return;
    }

    if (rangeOverlapsBlocked(startDate, day, blockedRanges)) {
      setSelectionError(
        "Selected range includes unavailable dates. Please choose a different range.",
      );
      return;
    }

    setEndDate(day);
    setSelectionError("");
    onRangeSelect(startDate, day);
  };

  const selectionRange =
    startDate && endDate ? { start: startDate, end: endDate } : null;

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
            const isBlocked = blockedDateKeys.has(key);
            const isToday = isSameDay(day, today);
            const isStart = Boolean(startDate && isSameDay(day, startDate));
            const isEnd = Boolean(endDate && isSameDay(day, endDate));
            const isInRange = Boolean(
              selectionRange &&
              isWithinRangeInclusive(
                day,
                selectionRange.start,
                selectionRange.end,
              ),
            );
            const disabled = isPast || isBlocked;

            return (
              <button
                key={`${key}-${cell.inCurrentMonth ? "current" : "adjacent"}`}
                type="button"
                disabled={disabled}
                onClick={() => onDateClick(day)}
                className={`relative aspect-square rounded-lg border text-xs transition-colors ${
                  !cell.inCurrentMonth
                    ? "border-transparent text-white/25"
                    : disabled
                      ? "border-white/5 text-white/35"
                      : "border-white/10 text-white hover:border-primary/60"
                } ${isInRange ? "bg-primary/20" : "bg-transparent"} ${
                  isStart || isEnd ? "border-primary bg-primary text-white" : ""
                }`}
                aria-label={`${day.toDateString()}${isBlocked ? " unavailable" : ""}`}
              >
                <span className="relative z-10">{day.getDate()}</span>

                {isToday ? (
                  <span className="pointer-events-none absolute inset-1 rounded-md border border-cyan-300/70" />
                ) : null}

                {isBlocked ? (
                  <span className="pointer-events-none absolute inset-0 rounded-lg bg-[repeating-linear-gradient(135deg,rgba(225,29,46,0.18),rgba(225,29,46,0.18)_4px,rgba(0,0,0,0)_4px,rgba(0,0,0,0)_8px)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/55">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/20" /> Selected
          range
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-cyan-300/70" />{" "}
          Today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,rgba(225,29,46,0.22),rgba(225,29,46,0.22)_4px,rgba(0,0,0,0)_4px,rgba(0,0,0,0)_8px)]" />{" "}
          Unavailable
        </span>
      </div>

      {loadError ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {loadError}
        </p>
      ) : null}

      {selectionError ? (
        <p role="alert" className="mt-2 text-sm text-amber-200">
          {selectionError}
        </p>
      ) : null}

      {hasSelection ? (
        <p className="mt-2 text-xs text-emerald-300">Date range selected.</p>
      ) : null}
    </div>
  );
}

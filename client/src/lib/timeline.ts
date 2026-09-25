// Dates travel as "YYYY-MM-DD" strings, read and written in local time so a
// chosen day never shifts by one across time zones.
const pad = (value: number): string => String(value).padStart(2, "0");

export const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const addMonths = (date: Date, months: number): Date => {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
};

export const todayIsoDate = (): string => toIsoDate(new Date());

/** "Monday, 12 October 2026": spelled out so day and month can't be swapped. */
export const formatLongDate = (value: string): string => {
  const date = parseIsoDate(value);
  return date
    ? date.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
};

const formatMonthYear = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: "short", year: "numeric" });

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "Oct 2026 - Apr 2027, about 6 months", or null until both dates are set. */
export const describeTimeline = (start: string, finish: string): string | null => {
  const from = parseIsoDate(start);
  const to = parseIsoDate(finish);
  if (!from || !to || to <= from) return null;
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const length =
    days < 45
      ? plural(Math.max(1, Math.round(days / 7)), "week", "weeks")
      : Math.round(days / 30.44) % 12 === 0 && days > 330
        ? plural(Math.round(days / 365.25), "year", "years")
        : plural(Math.round(days / 30.44), "month", "months");
  return `${formatMonthYear(from)} - ${formatMonthYear(to)}, about ${length}`;
};

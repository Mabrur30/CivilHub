import { formatTaka } from "./money";

// Every amount in CivilHub is Taka, shown with lakh/crore grouping.
export const formatCurrency = (amount: number): string => formatTaka(amount);

export const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

export const formatDateRange = (
  startValue: string,
  endValue: string,
): string => {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startValue} - ${endValue}`;
  }

  // The year is only written once when both ends fall in the same year.
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${startText} - ${formatDate(endValue)}`;
};

export const countOf = (
  count: number,
  singular: string,
  plural: string,
): string => `${count} ${count === 1 ? singular : plural}`;

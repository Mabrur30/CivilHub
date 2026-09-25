// Money in CivilHub is Bangladeshi Taka. Amounts are stored as plain numbers;
// these helpers only decide how people type them and how they are shown.

const LAKH = 100_000;
const CRORE = 10_000_000;

const trimZeros = (value: number): string =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** "৳25,00,000": Taka with the lakh/crore grouping Bangladeshi readers expect. */
export const formatTaka = (amount: number): string =>
  `৳${amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/** "2.5 crore", "25 lakh", or null below a lakh, where the full figure is clear enough. */
export const describeTakaInWords = (amount: number): string | null => {
  const absolute = Math.abs(amount);
  if (absolute >= CRORE) return `${trimZeros(amount / CRORE)} crore`;
  if (absolute >= LAKH) return `${trimZeros(amount / LAKH)} lakh`;
  return null;
};

/** "৳2.5 crore" for big figures, "৳45,000" for small ones. */
export const formatTakaShort = (amount: number): string => {
  const words = describeTakaInWords(amount);
  return words ? `৳${words}` : formatTaka(amount);
};

/** "৳40.57 lakh - ৳47.63 lakh" for a brief's budget, or the fallback when either end is missing. */
export const formatBudgetShort = (
  min: number | null,
  max: number | null,
  fallback: string,
): string =>
  min !== null && max !== null
    ? `${formatTakaShort(min)} - ${formatTakaShort(max)}`
    : fallback;

const unitMultipliers: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  l: LAKH,
  lac: LAKH,
  lacs: LAKH,
  lakh: LAKH,
  lakhs: LAKH,
  cr: CRORE,
  crore: CRORE,
  crores: CRORE,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
};

const TERM = /(\d+(?:\.\d+)?)\s*([a-z]+)?/gi;

export interface ParsedMoney {
  value: number | null;
  error: string;
}

export const MONEY_EXAMPLES = "50000, 50k, 25 lakh or 1.5 crore";

/**
 * Reads an amount the way people actually write it: "1500000", "15,00,000",
 * "1.5m", "50k", "15 lakh", "1.5 crore", "1 crore 20 lakh", "৳ 2 lac".
 * Returns null for an empty box, and an error for anything it can't read,
 * rather than guessing.
 */
export const parseMoney = (input: string): ParsedMoney => {
  const cleaned = input
    .toLowerCase()
    .replace(/৳|\btk\b\.?|\btaka\b|\bbdt\b/g, " ")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return { value: null, error: "" };

  let total = 0;
  let consumed = "";
  for (const match of cleaned.matchAll(TERM)) {
    const [whole, digits, unit] = match;
    const multiplier = !unit ? 1 : Object.hasOwn(unitMultipliers, unit) ? unitMultipliers[unit] : undefined;
    if (multiplier === undefined) {
      return { value: null, error: `"${unit}" isn't a unit we know. Try something like ${MONEY_EXAMPLES}.` };
    }
    total += Number(digits) * multiplier;
    consumed += whole;
  }

  // Anything left over (stray letters, symbols) means we didn't understand it.
  if (consumed.replace(/\s/g, "") !== cleaned.replace(/\s/g, "")) {
    return { value: null, error: `Couldn't read that amount. Try something like ${MONEY_EXAMPLES}.` };
  }
  return { value: Math.round(total * 100) / 100, error: "" };
};

/** For forms that keep the raw text: the number to send, or null if unreadable. */
export const moneyValue = (input: string): number | null => parseMoney(input).value;

/** The digits an API expects ("250000"), or "" when the box is empty or unreadable. */
export const toPlainAmount = (input: string): string => {
  const value = moneyValue(input);
  return value === null ? "" : String(value);
};

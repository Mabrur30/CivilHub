// CivilHub amounts are Bangladeshi Taka. Stored values are plain numbers;
// these helpers only decide how they read in messages and labels.

/** "৳25,00,000": Taka with lakh/crore digit grouping. */
export const formatTaka = (amount: number): string =>
  `৳${amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

interface BudgetFields {
  budgetMin?: number;
  budgetMax?: number;
  budgetRange?: string;
}

/**
 * The budget as people should read it, built from the stored numbers so older
 * projects (whose saved label says "$") show in Taka like everything else.
 */
export const budgetLabel = (project: BudgetFields): string => {
  if (typeof project.budgetMin === "number" && typeof project.budgetMax === "number") {
    return `${formatTaka(project.budgetMin)} - ${formatTaka(project.budgetMax)}`;
  }
  return project.budgetRange ?? "Budget to be discussed";
};

import { budgetLabel, formatTaka } from "../utils/money";

describe("Taka formatting", () => {
  test("groups digits in lakhs and crores", () => {
    expect(formatTaka(2500000)).toBe("৳25,00,000");
    expect(formatTaka(15000000)).toBe("৳1,50,00,000");
    expect(formatTaka(45000)).toBe("৳45,000");
    expect(formatTaka(1234.5)).toBe("৳1,234.50");
  });

  test("builds budgets from the stored numbers, so old dollar labels read in Taka", () => {
    expect(budgetLabel({ budgetMin: 2500000, budgetMax: 5000000, budgetRange: "$2,500,000 - $5,000,000" })).toBe(
      "৳25,00,000 - ৳50,00,000",
    );
    expect(budgetLabel({ budgetRange: "Budget to be discussed" })).toBe("Budget to be discussed");
    expect(budgetLabel({})).toBe("Budget to be discussed");
  });
});

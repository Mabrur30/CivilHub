import {
  type ListingPricing,
  PricingError,
  quoteBooking,
  rentalDays,
  unitRentalPrice,
  validateListingPricing,
} from "../utils/equipmentPricing";

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const listing = (overrides: Partial<ListingPricing> = {}): ListingPricing => ({
  dailyRate: 10_000,
  weeklyRate: null,
  monthlyRate: null,
  minRentalDays: 1,
  securityDeposit: 50_000,
  quantity: 1,
  operator: "none",
  operatorDailyRate: null,
  transport: "pickup",
  deliveryFee: null,
  ...overrides,
});

const request = (start: string, end: string, extra = {}) => ({
  startDate: day(start),
  endDate: day(end),
  units: 1,
  withOperator: false,
  fulfilment: "pickup" as const,
  ...extra,
});

describe("rental days", () => {
  test("count both ends, so a same-day hire is one day", () => {
    expect(rentalDays(day("2026-10-05"), day("2026-10-05"))).toBe(1);
    expect(rentalDays(day("2026-10-05"), day("2026-10-07"))).toBe(3);
  });
});

describe("unit rental price", () => {
  const rates = { dailyRate: 10_000, weeklyRate: 55_000, monthlyRate: 180_000 };

  test("charges daily when there is no weekly or monthly rate", () => {
    expect(unitRentalPrice(4, { ...rates, weeklyRate: null, monthlyRate: null }).price).toBe(40_000);
  });

  test("never charges more than a week for six days", () => {
    expect(unitRentalPrice(6, rates).price).toBe(55_000);
    expect(unitRentalPrice(5, rates).price).toBe(50_000);
  });

  test("combines whole weeks with capped extra days", () => {
    // 1 week + 2 days daily
    expect(unitRentalPrice(9, rates).price).toBe(75_000);
  });

  test("uses the monthly rate for whole months and caps the remainder at a month", () => {
    expect(unitRentalPrice(30, rates).price).toBe(180_000);
    // 30 days + 8 days (1 week + 1 day)
    expect(unitRentalPrice(38, rates).price).toBe(180_000 + 65_000);
    // 29 days would be 4 weeks + 1 day = 230,000, capped at the month
    expect(unitRentalPrice(29, rates).price).toBe(180_000);
  });
});

describe("booking quote", () => {
  test("multiplies rent, operator and deposit by units; delivery is flat", () => {
    const quote = quoteBooking(
      listing({
        quantity: 3,
        weeklyRate: 55_000,
        operator: "optional",
        operatorDailyRate: 2_000,
        transport: "both",
        deliveryFee: 8_000,
      }),
      request("2026-10-01", "2026-10-09", {
        units: 2,
        withOperator: true,
        fulfilment: "delivery",
      }),
    );
    expect(quote.rentalDays).toBe(9);
    expect(quote.rentalFee).toBe(75_000 * 2);
    expect(quote.operatorFee).toBe(2_000 * 9 * 2);
    expect(quote.deliveryFee).toBe(8_000);
    expect(quote.securityDeposit).toBe(100_000);
    expect(quote.totalRentalFee).toBe(150_000 + 36_000 + 8_000);
    expect(quote.totalDue).toBe(quote.totalRentalFee + 100_000);
    expect(quote.appliedRates).toEqual(["weekly", "daily"]);
  });

  test.each([
    ["under the minimum", listing({ minRentalDays: 3 }), request("2026-10-01", "2026-10-02")],
    ["more units than listed", listing({ quantity: 2 }), request("2026-10-01", "2026-10-02", { units: 3 })],
    ["an operator the listing doesn't offer", listing(), request("2026-10-01", "2026-10-02", { withOperator: true })],
    ["delivery the listing doesn't offer", listing(), request("2026-10-01", "2026-10-02", { fulfilment: "delivery" })],
    ["pickup on a delivery-only listing", listing({ transport: "delivery", deliveryFee: 5_000 }), request("2026-10-01", "2026-10-02")],
    ["an end before the start", listing(), request("2026-10-05", "2026-10-02")],
  ])("rejects %s", (_label, terms, req) => {
    expect(() => quoteBooking(terms, req)).toThrow(PricingError);
  });
});

describe("listing validation", () => {
  test("accepts a sensible listing", () => {
    expect(validateListingPricing(listing({ weeklyRate: 60_000, monthlyRate: 200_000 }))).toBe("");
  });

  test("rejects discounts that aren't cheaper than daily", () => {
    expect(validateListingPricing(listing({ weeklyRate: 70_000 }))).toMatch(/weekly/i);
    expect(validateListingPricing(listing({ monthlyRate: 300_000 }))).toMatch(/monthly/i);
  });

  test("requires the operator rate and delivery fee when offered", () => {
    expect(validateListingPricing(listing({ operator: "optional" }))).toMatch(/operator/i);
    expect(validateListingPricing(listing({ transport: "delivery" }))).toMatch(/delivery/i);
    expect(validateListingPricing(listing({ transport: "delivery", deliveryFee: 0 }))).toBe("");
  });
});

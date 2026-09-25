import { getPaymentConfig } from "../config/payments";
import { describePaymentMethod, splitPayment } from "../services/payments";
import {
  GatewayError,
  initSession,
  isValidFor,
  type GatewayTransaction,
} from "../services/sslcommerz";

const record = (overrides: Partial<GatewayTransaction> = {}): GatewayTransaction => ({
  status: "VALID",
  tran_id: "CH123",
  amount: "1500.00",
  currency: "BDT",
  currency_type: "BDT",
  currency_amount: "1500.00",
  ...overrides,
});

const sessionInput = {
  tranId: "CH123",
  amount: 1500,
  productName: "Advance for Duplex",
  productCategory: "Engineering services",
  customer: {
    name: "Nusrat",
    email: "n@test.dev",
    phone: "N/A",
    address: "Mirpur, Dhaka",
    city: "Dhaka",
  },
  reference: "abc",
  urls: { success: "s", fail: "f", cancel: "c", ipn: "i" },
};

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

describe("configuration", () => {
  test("sandbox is the default, and live needs an explicit false", () => {
    delete process.env.SSLCOMMERZ_IS_SANDBOX;
    expect(getPaymentConfig().gatewayBaseUrl).toBe("https://sandbox.sslcommerz.com");
    process.env.SSLCOMMERZ_IS_SANDBOX = "false";
    expect(getPaymentConfig().gatewayBaseUrl).toBe("https://securepay.sslcommerz.com");
  });

  test("the commission falls back to 10% when unset or nonsense", () => {
    delete process.env.PLATFORM_COMMISSION_RATE;
    expect(getPaymentConfig().commissionRate).toBe(0.1);
    process.env.PLATFORM_COMMISSION_RATE = "1.5";
    expect(getPaymentConfig().commissionRate).toBe(0.1);
    process.env.PLATFORM_COMMISSION_RATE = "0.12";
    expect(getPaymentConfig().commissionRate).toBe(0.12);
  });
});

describe("initSession", () => {
  test("posts the order as a form and returns the hosted page", async () => {
    process.env.SSLCOMMERZ_STORE_ID = "store";
    process.env.SSLCOMMERZ_STORE_PASSWORD = "secret";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "SUCCESS", GatewayPageURL: "https://pay.test/x" })),
    );

    await expect(initSession(sessionInput)).resolves.toBe("https://pay.test/x");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://sandbox.sslcommerz.com/gwprocess/v4/api.php");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("store_id")).toBe("store");
    expect(form.get("total_amount")).toBe("1500.00");
    expect(form.get("currency")).toBe("BDT");
    expect(form.get("tran_id")).toBe("CH123");
    expect(form.get("value_a")).toBe("abc");
  });

  test("surfaces SSLCommerz's reason when it refuses", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "FAILED", failedreason: "Store Credential Error" })),
    );
    await expect(initSession(sessionInput)).rejects.toThrow("Store Credential Error");
  });

  test("a network failure becomes a gateway error", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(initSession(sessionInput)).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("isValidFor", () => {
  const payment = { tranId: "CH123", amount: 1500 };

  test("accepts a valid BDT transaction for exactly the amount", () => {
    expect(isValidFor(payment, record())).toBe(true);
    expect(isValidFor(payment, record({ status: "VALIDATED" }))).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isValidFor(payment, null)).toBe(false);
    expect(isValidFor(payment, record({ status: "INVALID_TRANSACTION" }))).toBe(false);
    expect(isValidFor(payment, record({ tran_id: "CH999" }))).toBe(false);
    expect(isValidFor(payment, record({ currency_amount: "1499.99", amount: "1499.99" }))).toBe(false);
    expect(isValidFor(payment, record({ currency_type: "USD" }))).toBe(false);
    expect(isValidFor({ amount: 1500 }, record())).toBe(false);
  });
});

describe("fees", () => {
  test("the commission comes out of the payee's share, never the deposit", () => {
    expect(splitPayment(1000, 0, 0.1)).toEqual({ platformFee: 100, payeeAmount: 900, depositAmount: 0 });
    expect(splitPayment(1500, 500, 0.1)).toEqual({ platformFee: 100, payeeAmount: 900, depositAmount: 500 });
    const odd = splitPayment(333.33, 0, 0.1);
    expect(odd.platformFee + odd.payeeAmount).toBeCloseTo(333.33, 2);
  });

  test("payment methods read like people say them", () => {
    expect(describePaymentMethod("BKASH-BKash")).toBe("bKash");
    expect(describePaymentMethod("NAGAD-Nagad")).toBe("Nagad");
    expect(describePaymentMethod("VISA-Dutch Bangla")).toBe("Visa card");
    expect(describePaymentMethod(undefined)).toBe("SSLCommerz");
  });
});

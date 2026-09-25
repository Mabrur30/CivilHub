import { type Express } from "express";
import request from "supertest";
import { Payment } from "../../models/Payment.model";
import { type GatewayTransaction } from "../../services/sslcommerz";

/**
 * Stands in for SSLCommerz in tests: answers the session, validation and
 * transaction-query APIs from memory, so nothing leaves the machine.
 */
export interface FakeGateway {
  /** val_id → what the validation API reports for it. */
  validations: Map<string, Partial<GatewayTransaction>>;
  /** tran_id → what the transaction-query API reports for it. */
  queries: Map<string, Array<Partial<GatewayTransaction>>>;
  /** Form bodies sent to the session API. */
  sessions: URLSearchParams[];
  /** When set, the session API refuses with this reason. */
  failInitWith: string | null;
  restore: () => void;
}

export const TEST_CLIENT_URL = "http://app.test";
export const TEST_SERVER_URL = "http://api.test";

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

export const installFakeGateway = (): FakeGateway => {
  process.env.SSLCOMMERZ_STORE_ID = "civilhubtest";
  process.env.SSLCOMMERZ_STORE_PASSWORD = "civilhubtest@ssl";
  process.env.SSLCOMMERZ_IS_SANDBOX = "true";
  process.env.SERVER_URL = TEST_SERVER_URL;
  process.env.CLIENT_URL = TEST_CLIENT_URL;
  process.env.PLATFORM_COMMISSION_RATE = "0.1";

  const gateway: FakeGateway = {
    validations: new Map(),
    queries: new Map(),
    sessions: [],
    failInitWith: null,
    restore: () => undefined,
  };

  const spy = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname.endsWith("/gwprocess/v4/api.php")) {
        const form = new URLSearchParams(String(init?.body ?? ""));
        gateway.sessions.push(form);
        return gateway.failInitWith
          ? json({ status: "FAILED", failedreason: gateway.failInitWith })
          : json({
              status: "SUCCESS",
              GatewayPageURL: `https://sandbox.sslcommerz.com/EasyCheckOut/${form.get("tran_id")}`,
            });
      }
      if (url.pathname.endsWith("/validationserverAPI.php")) {
        const found = gateway.validations.get(url.searchParams.get("val_id") ?? "");
        return json(found ?? { status: "INVALID_TRANSACTION" });
      }
      if (url.pathname.endsWith("/merchantTransIDvalidationAPI.php")) {
        const found = gateway.queries.get(url.searchParams.get("tran_id") ?? "") ?? [];
        return json({ APIConnect: "DONE", no_of_trans_found: found.length, element: found });
      }
      throw new Error(`Unexpected fetch in test: ${url.toString()}`);
    });

  gateway.restore = () => spy.mockRestore();
  return gateway;
};

export interface GatewayPaymentResult {
  checkout: request.Response;
  callback: request.Response | null;
  tranId: string;
}

/** A successful bKash validation record for this payment. */
export const validRecord = (
  tranId: string,
  amount: number,
  valId: string,
): Partial<GatewayTransaction> => ({
  status: "VALID",
  tran_id: tranId,
  val_id: valId,
  amount: amount.toFixed(2),
  currency: "BDT",
  currency_type: "BDT",
  currency_amount: amount.toFixed(2),
  bank_tran_id: `BANK${tranId}`,
  card_type: "BKASH-BKash",
});

/**
 * Starts a checkout and, if it opened, has "SSLCommerz" send the customer
 * back through the success callback with a valid transaction.
 */
export const payViaGateway = async (
  app: Express,
  gateway: FakeGateway,
  cookie: string,
  body: Record<string, unknown>,
  override: Partial<GatewayTransaction> = {},
): Promise<GatewayPaymentResult> => {
  const checkout = await request(app)
    .post("/api/payments/checkout")
    .set("Cookie", cookie)
    .send(body);
  if (checkout.status !== 201) return { checkout, callback: null, tranId: "" };

  const tranId = checkout.body.tranId as string;
  const payment = await Payment.findOne({ tranId }).exec();
  const valId = `VAL${tranId}`;
  gateway.validations.set(valId, {
    ...validRecord(tranId, payment?.amount ?? 0, valId),
    ...override,
  });
  const callback = await request(app)
    .post("/api/payments/sslcommerz/success")
    .type("form")
    .send({ tran_id: tranId, val_id: valId, status: "VALID" });
  return { checkout, callback, tranId };
};

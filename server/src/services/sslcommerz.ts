import { getPaymentConfig } from "../config/payments";

/**
 * A thin client for the SSLCommerz v4 hosted checkout.
 *
 * The customer pays on SSLCommerz's own page. Whatever is posted back to our
 * callbacks is only a hint: a payment counts as paid once SSLCommerz's
 * validation (or transaction query) API confirms it for the exact amount.
 */

export interface GatewayCustomer {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}

export interface InitSessionInput {
  tranId: string;
  amount: number;
  productName: string;
  productCategory: string;
  customer: GatewayCustomer;
  /** Echoed back by SSLCommerz; we store the payment id here. */
  reference: string;
  urls: { success: string; fail: string; cancel: string; ipn: string };
}

/** The fields we rely on from a validation or transaction-query record. */
export interface GatewayTransaction {
  status: string;
  tran_id: string;
  val_id?: string;
  amount: string;
  currency: string;
  currency_type?: string;
  currency_amount?: string;
  bank_tran_id?: string;
  card_type?: string;
  store_amount?: string;
  risk_level?: string;
}

export class GatewayError extends Error {
  statusCode = 502;
}

const VALID_STATUSES = new Set(["VALID", "VALIDATED"]);

const credentials = (): { store_id: string; store_passwd: string } => {
  const config = getPaymentConfig();
  return { store_id: config.storeId, store_passwd: config.storePassword };
};

const readJson = async (response: Response): Promise<unknown> => {
  if (!response.ok) {
    throw new GatewayError(
      `SSLCommerz responded with ${response.status}. Try again in a moment.`,
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new GatewayError("SSLCommerz sent an unreadable response.");
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toTransaction = (value: unknown): GatewayTransaction | null => {
  if (!isRecord(value) || typeof value.status !== "string") return null;
  const text = (key: string): string | undefined =>
    typeof value[key] === "string" || typeof value[key] === "number"
      ? String(value[key])
      : undefined;
  return {
    status: value.status,
    tran_id: text("tran_id") ?? "",
    val_id: text("val_id"),
    amount: text("amount") ?? "",
    currency: text("currency") ?? "",
    currency_type: text("currency_type"),
    currency_amount: text("currency_amount"),
    bank_tran_id: text("bank_tran_id"),
    card_type: text("card_type"),
    store_amount: text("store_amount"),
    risk_level: text("risk_level"),
  };
};

/** Opens a checkout session and returns the hosted payment page URL. */
export const initSession = async (input: InitSessionInput): Promise<string> => {
  const { gatewayBaseUrl } = getPaymentConfig();
  const form = new URLSearchParams({
    ...credentials(),
    total_amount: input.amount.toFixed(2),
    currency: "BDT",
    tran_id: input.tranId,
    success_url: input.urls.success,
    fail_url: input.urls.fail,
    cancel_url: input.urls.cancel,
    ipn_url: input.urls.ipn,
    product_name: input.productName.slice(0, 250),
    product_category: input.productCategory,
    product_profile: "non-physical-goods",
    shipping_method: "NO",
    num_of_item: "1",
    cus_name: input.customer.name,
    cus_email: input.customer.email,
    cus_phone: input.customer.phone,
    cus_add1: input.customer.address,
    cus_city: input.customer.city,
    cus_country: "Bangladesh",
    value_a: input.reference,
  });

  let body: unknown;
  try {
    const response = await fetch(`${gatewayBaseUrl}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    body = await readJson(response);
  } catch (error: unknown) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError("Couldn't reach SSLCommerz. Check your connection and try again.");
  }

  if (
    isRecord(body) &&
    body.status === "SUCCESS" &&
    typeof body.GatewayPageURL === "string" &&
    body.GatewayPageURL
  ) {
    return body.GatewayPageURL;
  }
  const reason =
    isRecord(body) && typeof body.failedreason === "string" && body.failedreason
      ? body.failedreason
      : "SSLCommerz couldn't start the payment.";
  throw new GatewayError(reason);
};

/** Looks up a completed transaction by the val_id SSLCommerz posted back. */
export const validateTransaction = async (
  valId: string,
): Promise<GatewayTransaction | null> => {
  const { gatewayBaseUrl } = getPaymentConfig();
  const query = new URLSearchParams({ val_id: valId, ...credentials(), format: "json" });
  const response = await fetch(
    `${gatewayBaseUrl}/validator/api/validationserverAPI.php?${query.toString()}`,
  );
  return toTransaction(await readJson(response));
};

/**
 * Asks SSLCommerz what happened to our transaction id. Used when the customer
 * never came back to us (closed the tab) and no IPN reached the server.
 */
export const queryTransaction = async (
  tranId: string,
): Promise<GatewayTransaction[]> => {
  const { gatewayBaseUrl } = getPaymentConfig();
  const query = new URLSearchParams({ tran_id: tranId, ...credentials(), format: "json" });
  const response = await fetch(
    `${gatewayBaseUrl}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`,
  );
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.element)) return [];
  return body.element
    .map(toTransaction)
    .filter((item): item is GatewayTransaction => item !== null);
};

const toPaisa = (value: string | number | undefined): number | null => {
  const amount = Number(value);
  return value === undefined || value === "" || !Number.isFinite(amount)
    ? null
    : Math.round(amount * 100);
};

/** True only for a successful BDT transaction for exactly this payment. */
export const isValidFor = (
  payment: { tranId?: string; amount: number },
  transaction: GatewayTransaction | null,
): boolean => {
  if (!transaction || !VALID_STATUSES.has(transaction.status)) return false;
  if (!payment.tranId || transaction.tran_id !== payment.tranId) return false;

  const currency = transaction.currency_type || transaction.currency;
  if (currency !== "BDT") return false;

  const expected = Math.round(payment.amount * 100);
  const paid = toPaisa(transaction.currency_amount || transaction.amount);
  return paid === expected;
};

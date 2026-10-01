/**
 * Payment settings, read on every call so tests (and a restarted dev server)
 * pick up environment changes without re-importing modules.
 */
export interface PaymentConfig {
  storeId: string;
  storePassword: string;
  isSandbox: boolean;
  gatewayBaseUrl: string;
  /** Public base URL of this API; SSLCommerz sends the customer back here. */
  serverUrl: string;
  clientUrl: string;
  /** Share of each payment (excluding held deposits) CivilHub keeps. */
  commissionRate: number;
}

const DEFAULT_COMMISSION_RATE = 0.1;

const trimSlash = (value: string): string => value.replace(/\/+$/, "");

const parseCommissionRate = (value: string | undefined): number => {
  const rate = Number(value);
  return value !== undefined && value.trim() !== "" && rate >= 0 && rate < 1
    ? rate
    : DEFAULT_COMMISSION_RATE;
};

export const getPaymentConfig = (): PaymentConfig => {
  const isSandbox = process.env.SSLCOMMERZ_IS_SANDBOX?.trim() !== "false";
  return {
    storeId: process.env.SSLCOMMERZ_STORE_ID?.trim() ?? "",
    storePassword: process.env.SSLCOMMERZ_STORE_PASSWORD?.trim() ?? "",
    isSandbox,
    gatewayBaseUrl: isSandbox
      ? "https://sandbox.sslcommerz.com"
      : "https://securepay.sslcommerz.com",
    serverUrl: trimSlash(
      process.env.SERVER_URL?.trim() ||
        `http://localhost:${process.env.PORT || 5000}`,
    ),
    clientUrl: trimSlash(process.env.CLIENT_URL?.trim() || "http://localhost:5173"),
    commissionRate: parseCommissionRate(process.env.PLATFORM_COMMISSION_RATE),
  };
};

/**
 * In production the gateway mode must be chosen on purpose: left unset it
 * would default to sandbox, where test cards "pay" for real bookings.
 */
export const assertPaymentModeChosen = (): void => {
  const mode = process.env.SSLCOMMERZ_IS_SANDBOX?.trim();
  if (process.env.NODE_ENV === "production" && mode !== "true" && mode !== "false") {
    throw new Error(
      'SSLCOMMERZ_IS_SANDBOX must be set to "true" or "false" in production',
    );
  }
};

export const isPaymentGatewayConfigured =(config = getPaymentConfig()): boolean =>
  Boolean(config.storeId && config.storePassword);

import { CHECKOUTGATEWAY_PAYMENT_PROVIDER, CHECKOUTGATEWAY_PROTOCOL_VERSION } from "@ai-music/shared";
import { assertCheckoutgatewayMinorUnits, parseCheckoutgatewayAmountField } from "./checkoutgateway-amount.js";
import { isTrustedCheckoutgatewayCheckoutUrl } from "./checkoutgateway-checkout-url.js";
import type { CheckoutgatewayProviderRuntimeConfig } from "./checkoutgateway-config.js";
import { CheckoutgatewayCheckoutError } from "./checkoutgateway-errors.js";
import {
  CHECKOUTGATEWAY_CHECKOUT_PATH,
  CHECKOUTGATEWAY_ORDER_STATUS_PATH,
  CHECKOUTGATEWAY_REVERSE_PATH,
  buildCheckoutgatewayApiUrl,
} from "./checkoutgateway-paths.js";
import { signCheckoutgatewayParams, verifyCheckoutgatewaySignature } from "./checkoutgateway-signature.js";
import { mapCheckoutgatewayReverseStatus } from "./checkoutgateway-status.js";

export type CheckoutgatewayHttpFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type CheckoutgatewayCheckoutClientOptions = {
  config: CheckoutgatewayProviderRuntimeConfig;
  fetchImpl?: CheckoutgatewayHttpFetch;
};

export type CheckoutgatewayCreateCheckoutInput = {
  orderId: string;
  /** Integer GEL tetri already snapshotted on Purchase. */
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
  callbackUrl: string;
};

export type CheckoutgatewayCheckoutCreated = {
  provider: typeof CHECKOUTGATEWAY_PAYMENT_PROVIDER;
  checkoutUrl: string;
  paymentId: string;
  orderId: string;
  orderStatus: string;
};

export type CheckoutgatewayOrderStatusResult = {
  provider: typeof CHECKOUTGATEWAY_PAYMENT_PROVIDER;
  paymentId: string;
  orderId: string;
  merchantId: string;
  amountMinor: number;
  actualAmountMinor: number | null;
  reversalAmountMinor: number;
  currency: string;
  orderStatus: string;
  responseStatus: string;
};

export type CheckoutgatewayReverseResult = {
  reverseStatus: "approved" | "declined" | "unknown";
  reversalAmountMinor: number | null;
  reverseId: string | null;
};

type CheckoutgatewayResponseObject = Record<string, unknown>;

function asRecord(value: unknown): CheckoutgatewayResponseObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as CheckoutgatewayResponseObject;
}

function unwrapResponse(payload: unknown): CheckoutgatewayResponseObject {
  const root = asRecord(payload);
  if (!root) {
    throw new CheckoutgatewayCheckoutError("Checkoutgateway response is not an object", "protocol", {
      code: "CHECKOUTGATEWAY_RESPONSE_NOT_OBJECT",
    });
  }
  const inner = asRecord(root.response);
  return inner ?? root;
}

function readString(record: CheckoutgatewayResponseObject, key: string): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export class CheckoutgatewayCheckoutClient {
  private readonly config: CheckoutgatewayProviderRuntimeConfig;
  private readonly fetchImpl: CheckoutgatewayHttpFetch;

  constructor(options: CheckoutgatewayCheckoutClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createCheckout(input: CheckoutgatewayCreateCheckoutInput): Promise<CheckoutgatewayCheckoutCreated> {
    if (input.currency.toUpperCase() !== this.config.currency) {
      throw new CheckoutgatewayCheckoutError("Checkout currency does not match Checkoutgateway config", "validation", {
        code: "CHECKOUTGATEWAY_CURRENCY_MISMATCH",
      });
    }

    const amount = assertCheckoutgatewayMinorUnits(input.amountMinor);
    const signed = signCheckoutgatewayParams(this.config.paymentKey, {
      merchant_id: this.config.merchantId,
      order_id: input.orderId,
      amount,
      currency: this.config.currency,
      order_desc: input.description,
      response_url: input.returnUrl,
      server_callback_url: input.callbackUrl,
      version: CHECKOUTGATEWAY_PROTOCOL_VERSION,
    });

    const response = await this.postJson(CHECKOUTGATEWAY_CHECKOUT_PATH, signed);
    const checkoutUrl = readString(response, "checkout_url");
    const paymentId = readString(response, "payment_id");

    if (!checkoutUrl || !isTrustedCheckoutgatewayCheckoutUrl(checkoutUrl)) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway checkout URL is not trusted", "protocol", {
        code: "CHECKOUTGATEWAY_CHECKOUT_URL_UNTRUSTED",
      });
    }

    if (!paymentId) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway checkout did not return payment_id", "protocol", {
        code: "CHECKOUTGATEWAY_PAYMENT_ID_MISSING",
      });
    }

    return {
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
      checkoutUrl,
      paymentId,
      orderId: input.orderId,
      orderStatus: readString(response, "order_status") ?? "created",
    };
  }

  async getOrderStatus(orderId: string): Promise<CheckoutgatewayOrderStatusResult> {
    const signed = signCheckoutgatewayParams(this.config.paymentKey, {
      merchant_id: this.config.merchantId,
      order_id: orderId,
      version: CHECKOUTGATEWAY_PROTOCOL_VERSION,
    });

    const response = await this.postJson(CHECKOUTGATEWAY_ORDER_STATUS_PATH, signed);
    if (!verifyCheckoutgatewaySignature(this.config.paymentKey, response)) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway order status signature mismatch", "protocol", {
        code: "CHECKOUTGATEWAY_STATUS_SIGNATURE_INVALID",
      });
    }

    const orderStatus = readString(response, "order_status");
    const paymentId = readString(response, "payment_id");
    const currency = readString(response, "currency");
    const amountMinor = parseCheckoutgatewayAmountField(response.amount);
    const merchantId = readString(response, "merchant_id");

    if (!orderStatus || !paymentId || !currency || amountMinor === null || !merchantId) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway order status is incomplete", "protocol", {
        code: "CHECKOUTGATEWAY_STATUS_INCOMPLETE",
      });
    }

    return {
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
      paymentId,
      orderId: readString(response, "order_id") ?? orderId,
      merchantId,
      amountMinor,
      actualAmountMinor: parseCheckoutgatewayAmountField(response.actual_amount),
      reversalAmountMinor: parseCheckoutgatewayAmountField(response.reversal_amount) ?? 0,
      currency: currency.toUpperCase(),
      orderStatus,
      responseStatus: readString(response, "response_status") ?? "success",
    };
  }

  async reverseOrder(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
    reverseId: string;
  }): Promise<CheckoutgatewayReverseResult> {
    const signed = signCheckoutgatewayParams(this.config.paymentKey, {
      merchant_id: this.config.merchantId,
      order_id: input.orderId,
      amount: input.amountMinor,
      currency: input.currency.toUpperCase(),
      reverse_id: input.reverseId,
      version: CHECKOUTGATEWAY_PROTOCOL_VERSION,
    });

    const response = await this.postJson(CHECKOUTGATEWAY_REVERSE_PATH, signed);
    if (response.signature && !verifyCheckoutgatewaySignature(this.config.paymentKey, response)) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway reverse signature mismatch", "protocol", {
        code: "CHECKOUTGATEWAY_REVERSE_SIGNATURE_INVALID",
      });
    }

    const reverseStatusRaw = readString(response, "reverse_status") ?? "";
    return {
      reverseStatus: mapCheckoutgatewayReverseStatus(reverseStatusRaw),
      reversalAmountMinor: parseCheckoutgatewayAmountField(response.reversal_amount),
      reverseId: readString(response, "reverse_id"),
    };
  }

  private async postJson(path: string, request: Record<string, unknown>): Promise<CheckoutgatewayResponseObject> {
    const url = buildCheckoutgatewayApiUrl(this.config.apiBaseUrl, path);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
    } catch (error) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway network error", "network", {
        code: "CHECKOUTGATEWAY_NETWORK",
        cause: error,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway response is not JSON", "protocol", {
        code: "CHECKOUTGATEWAY_RESPONSE_NOT_JSON",
        httpStatus: response.status,
        cause: error,
      });
    }

    const inner = unwrapResponse(payload);
    const responseStatus = readString(inner, "response_status");

    if (!response.ok || responseStatus === "failure") {
      const kind =
        response.status >= 500
          ? "provider_5xx"
          : response.status >= 400
            ? "provider_4xx"
            : "protocol";
      throw new CheckoutgatewayCheckoutError("Checkoutgateway request failed", kind, {
        code: readString(inner, "error_code")
          ? `CHECKOUTGATEWAY_ERROR_${readString(inner, "error_code")}`
          : "CHECKOUTGATEWAY_REQUEST_FAILED",
        httpStatus: response.status,
      });
    }

    return inner;
  }
}

import { FLITT_PAYMENT_PROVIDER, FLITT_PROTOCOL_VERSION } from "@ai-music/shared";
import { assertFlittMinorUnits, parseFlittAmountField } from "./flitt-amount.js";
import { isTrustedFlittCheckoutUrl } from "./flitt-checkout-url.js";
import type { FlittProviderRuntimeConfig } from "./flitt-config.js";
import { FlittCheckoutError } from "./flitt-errors.js";
import {
  FLITT_CHECKOUT_PATH,
  FLITT_ORDER_STATUS_PATH,
  FLITT_REVERSE_PATH,
  buildFlittApiUrl,
} from "./flitt-paths.js";
import { signFlittParams, verifyFlittSignature } from "./flitt-signature.js";
import { mapFlittReverseStatus } from "./flitt-status.js";

export type FlittHttpFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type FlittCheckoutClientOptions = {
  config: FlittProviderRuntimeConfig;
  fetchImpl?: FlittHttpFetch;
};

export type FlittCreateCheckoutInput = {
  orderId: string;
  /** Integer GEL tetri already snapshotted on Purchase. */
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
  callbackUrl: string;
};

export type FlittCheckoutCreated = {
  provider: typeof FLITT_PAYMENT_PROVIDER;
  checkoutUrl: string;
  paymentId: string;
  orderId: string;
  orderStatus: string;
};

export type FlittOrderStatusResult = {
  provider: typeof FLITT_PAYMENT_PROVIDER;
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

export type FlittReverseResult = {
  reverseStatus: "approved" | "declined" | "unknown";
  reversalAmountMinor: number | null;
  reverseId: string | null;
};

type FlittResponseObject = Record<string, unknown>;

function asRecord(value: unknown): FlittResponseObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as FlittResponseObject;
}

function unwrapResponse(payload: unknown): FlittResponseObject {
  const root = asRecord(payload);
  if (!root) {
    throw new FlittCheckoutError("Flitt response is not an object", "protocol", {
      code: "FLITT_RESPONSE_NOT_OBJECT",
    });
  }
  const inner = asRecord(root.response);
  return inner ?? root;
}

function readString(record: FlittResponseObject, key: string): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export class FlittCheckoutClient {
  private readonly config: FlittProviderRuntimeConfig;
  private readonly fetchImpl: FlittHttpFetch;

  constructor(options: FlittCheckoutClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createCheckout(input: FlittCreateCheckoutInput): Promise<FlittCheckoutCreated> {
    if (input.currency.toUpperCase() !== this.config.currency) {
      throw new FlittCheckoutError("Checkout currency does not match Flitt config", "validation", {
        code: "FLITT_CURRENCY_MISMATCH",
      });
    }

    const amount = assertFlittMinorUnits(input.amountMinor);
    const signed = signFlittParams(this.config.paymentKey, {
      merchant_id: this.config.merchantId,
      order_id: input.orderId,
      amount,
      currency: this.config.currency,
      order_desc: input.description,
      response_url: input.returnUrl,
      server_callback_url: input.callbackUrl,
      version: FLITT_PROTOCOL_VERSION,
    });

    const response = await this.postJson(FLITT_CHECKOUT_PATH, signed);
    const checkoutUrl = readString(response, "checkout_url");
    const paymentId = readString(response, "payment_id");

    if (!checkoutUrl || !isTrustedFlittCheckoutUrl(checkoutUrl)) {
      throw new FlittCheckoutError("Flitt checkout URL is not trusted", "protocol", {
        code: "FLITT_CHECKOUT_URL_UNTRUSTED",
      });
    }

    if (!paymentId) {
      throw new FlittCheckoutError("Flitt checkout did not return payment_id", "protocol", {
        code: "FLITT_PAYMENT_ID_MISSING",
      });
    }

    return {
      provider: FLITT_PAYMENT_PROVIDER,
      checkoutUrl,
      paymentId,
      orderId: input.orderId,
      orderStatus: readString(response, "order_status") ?? "created",
    };
  }

  async getOrderStatus(orderId: string): Promise<FlittOrderStatusResult> {
    const signed = signFlittParams(this.config.paymentKey, {
      merchant_id: this.config.merchantId,
      order_id: orderId,
      version: FLITT_PROTOCOL_VERSION,
    });

    const response = await this.postJson(FLITT_ORDER_STATUS_PATH, signed);
    if (!verifyFlittSignature(this.config.paymentKey, response)) {
      throw new FlittCheckoutError("Flitt order status signature mismatch", "protocol", {
        code: "FLITT_STATUS_SIGNATURE_INVALID",
      });
    }

    const orderStatus = readString(response, "order_status");
    const paymentId = readString(response, "payment_id");
    const currency = readString(response, "currency");
    const amountMinor = parseFlittAmountField(response.amount);
    const merchantId = readString(response, "merchant_id");

    if (!orderStatus || !paymentId || !currency || amountMinor === null || !merchantId) {
      throw new FlittCheckoutError("Flitt order status is incomplete", "protocol", {
        code: "FLITT_STATUS_INCOMPLETE",
      });
    }

    return {
      provider: FLITT_PAYMENT_PROVIDER,
      paymentId,
      orderId: readString(response, "order_id") ?? orderId,
      merchantId,
      amountMinor,
      actualAmountMinor: parseFlittAmountField(response.actual_amount),
      reversalAmountMinor: parseFlittAmountField(response.reversal_amount) ?? 0,
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
  }): Promise<FlittReverseResult> {
    const signed = signFlittParams(this.config.paymentKey, {
      merchant_id: this.config.merchantId,
      order_id: input.orderId,
      amount: input.amountMinor,
      currency: input.currency.toUpperCase(),
      reverse_id: input.reverseId,
      version: FLITT_PROTOCOL_VERSION,
    });

    const response = await this.postJson(FLITT_REVERSE_PATH, signed);
    if (response.signature && !verifyFlittSignature(this.config.paymentKey, response)) {
      throw new FlittCheckoutError("Flitt reverse signature mismatch", "protocol", {
        code: "FLITT_REVERSE_SIGNATURE_INVALID",
      });
    }

    const reverseStatusRaw = readString(response, "reverse_status") ?? "";
    return {
      reverseStatus: mapFlittReverseStatus(reverseStatusRaw),
      reversalAmountMinor: parseFlittAmountField(response.reversal_amount),
      reverseId: readString(response, "reverse_id"),
    };
  }

  private async postJson(path: string, request: Record<string, unknown>): Promise<FlittResponseObject> {
    const url = buildFlittApiUrl(this.config.apiBaseUrl, path);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
    } catch (error) {
      throw new FlittCheckoutError("Flitt network error", "network", {
        code: "FLITT_NETWORK",
        cause: error,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new FlittCheckoutError("Flitt response is not JSON", "protocol", {
        code: "FLITT_RESPONSE_NOT_JSON",
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
      throw new FlittCheckoutError("Flitt request failed", kind, {
        code: readString(inner, "error_code")
          ? `FLITT_ERROR_${readString(inner, "error_code")}`
          : "FLITT_REQUEST_FAILED",
        httpStatus: response.status,
      });
    }

    return inner;
  }
}

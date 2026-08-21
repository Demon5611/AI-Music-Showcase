import type { TbcCheckoutLanguage } from "@ai-music/shared";
import { TbcCheckoutError } from "./tbc-errors.js";
import {
  buildTbcAccessTokenPath,
  buildTbcPaymentByIdPath,
  buildTbcPaymentCancelPath,
  buildTbcPaymentsPath,
} from "./tbc-paths.js";
import type { TbcCheckoutRuntimeConfig, TbcCreatePaymentInput } from "./tbc-config.js";

export type TbcPaymentLink = {
  uri: string;
  method?: string;
  rel: string;
};

export type TbcPaymentDetails = {
  payId: string;
  status: string;
  currency: string;
  amount: number;
  links: TbcPaymentLink[];
};

export type TbcAccessTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in: number;
};

const TOKEN_SAFETY_MARGIN_MS = 60_000;

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

export type TbcHttpFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type TbcCheckoutClientOptions = {
  config: TbcCheckoutRuntimeConfig;
  fetchImpl?: TbcHttpFetch;
  now?: () => number;
};

/**
 * Isolated TBC Checkout HTTP adapter.
 */
export class TbcCheckoutClient {
  private readonly config: TbcCheckoutRuntimeConfig;
  private readonly fetchImpl: TbcHttpFetch;
  private readonly now: () => number;
  private cachedToken: CachedToken | null = null;
  private tokenInFlight: Promise<string> | null = null;

  constructor(options: TbcCheckoutClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  invalidateAccessToken(): void {
    this.cachedToken = null;
  }

  async getAccessToken(): Promise<string> {
    const existing = this.readValidCachedToken();
    if (existing) {
      return existing;
    }

    if (this.tokenInFlight) {
      return this.tokenInFlight;
    }

    this.tokenInFlight = this.requestAccessToken()
      .then((token) => {
        this.tokenInFlight = null;
        return token;
      })
      .catch((error) => {
        this.tokenInFlight = null;
        throw error;
      });

    return this.tokenInFlight;
  }

  async createPayment(input: TbcCreatePaymentInput): Promise<TbcPaymentDetails> {
    return this.withAuthRetry((accessToken) =>
      this.requestJson<TbcPaymentDetails>(
        "POST",
        buildTbcPaymentsPath(this.config.apiVersion),
        {
          accessToken,
          body: {
            amount: input.amount,
            returnurl: input.returnurl,
            callbackUrl: input.callbackUrl,
            preAuth: false,
            saveCard: false,
            language: input.language,
            merchantPaymentId: input.merchantPaymentId,
            description: input.description,
            expirationMinutes: input.expirationMinutes,
          },
        },
      ),
    );
  }

  async getPayment(payId: string): Promise<TbcPaymentDetails> {
    return this.withAuthRetry((accessToken) =>
      this.requestJson<TbcPaymentDetails>(
        "GET",
        buildTbcPaymentByIdPath(this.config.apiVersion, payId),
        { accessToken },
      ),
    );
  }

  /**
   * Full or partial cancel/refund.
   * Full: omit amount (or pass full remaining — caller decides).
   * Partial: body `{ amount }` must not exceed transaction amount (TBC rule).
   * payId must come from our DB, never from the client.
   */
  async cancelPayment(
    payId: string,
    options?: { amount?: number },
  ): Promise<unknown> {
    return this.withAuthRetry((accessToken) =>
      this.requestJson<unknown>(
        "POST",
        buildTbcPaymentCancelPath(this.config.apiVersion, payId),
        {
          accessToken,
          body:
            options?.amount !== undefined ? { amount: options.amount } : {},
        },
      ),
    );
  }

  private readValidCachedToken(): string | null {
    if (!this.cachedToken) {
      return null;
    }

    if (this.now() >= this.cachedToken.expiresAtMs - TOKEN_SAFETY_MARGIN_MS) {
      this.cachedToken = null;
      return null;
    }

    return this.cachedToken.accessToken;
  }

  private async requestAccessToken(): Promise<string> {
    const path = buildTbcAccessTokenPath(this.config.apiVersion);
    const url = `${this.config.apiBaseUrl}${path}`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          apikey: this.config.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
    } catch (cause) {
      throw new TbcCheckoutError("TBC access token network error", "network", {
        code: "TBC_TOKEN_NETWORK",
        cause,
      });
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, "access-token");
    }

    const payload = (await response.json()) as Partial<TbcAccessTokenResponse>;
    if (!payload.access_token || typeof payload.expires_in !== "number") {
      throw new TbcCheckoutError("TBC access token protocol error", "protocol", {
        code: "TBC_TOKEN_PROTOCOL",
        httpStatus: response.status,
      });
    }

    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAtMs: this.now() + payload.expires_in * 1000,
    };

    return payload.access_token;
  }

  private async withAuthRetry<T>(
    run: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const token = await this.getAccessToken();
    try {
      return await run(token);
    } catch (error) {
      if (!(error instanceof TbcCheckoutError) || error.httpStatus !== 401) {
        throw error;
      }

      this.invalidateAccessToken();
      const refreshed = await this.getAccessToken();
      return run(refreshed);
    }
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    options: { accessToken: string; body?: unknown },
  ): Promise<T> {
    const url = `${this.config.apiBaseUrl}${path}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          apikey: this.config.apiKey,
          Authorization: `Bearer ${options.accessToken}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      throw new TbcCheckoutError("TBC payment network error", "network", {
        code: "TBC_PAYMENT_NETWORK",
        cause,
      });
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, "payment");
    }

    const text = await response.text();
    if (!text.trim()) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  private mapHttpError(status: number, scope: string): TbcCheckoutError {
    if (status === 401 || status === 403) {
      return new TbcCheckoutError(`TBC ${scope} authentication failed`, "authentication", {
        httpStatus: status,
        code: "TBC_AUTH",
      });
    }

    if (status === 400 || status === 422) {
      return new TbcCheckoutError(`TBC ${scope} validation failed`, "validation", {
        httpStatus: status,
        code: "TBC_VALIDATION",
      });
    }

    if (status >= 400 && status < 500) {
      return new TbcCheckoutError(`TBC ${scope} client error`, "provider_4xx", {
        httpStatus: status,
        code: "TBC_PROVIDER_4XX",
      });
    }

    if (status >= 500) {
      return new TbcCheckoutError(`TBC ${scope} server error`, "provider_5xx", {
        httpStatus: status,
        code: "TBC_PROVIDER_5XX",
      });
    }

    return new TbcCheckoutError(`TBC ${scope} unexpected status`, "protocol", {
      httpStatus: status,
      code: "TBC_PROTOCOL",
    });
  }
}

export function extractApprovalUrl(payment: TbcPaymentDetails): string {
  const link = payment.links?.find((item) => item.rel === "approval_url");
  const uri = link?.uri?.trim();

  if (!uri) {
    throw new TbcCheckoutError("TBC createPayment missing approval_url", "protocol", {
      code: "TBC_MISSING_APPROVAL_URL",
    });
  }

  return uri;
}

export type { TbcCheckoutLanguage };

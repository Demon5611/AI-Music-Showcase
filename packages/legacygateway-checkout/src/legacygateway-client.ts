import type { LegacygatewayCheckoutLanguage } from "@ai-music/shared";
import { LegacygatewayCheckoutError } from "./legacygateway-errors.js";
import {
  buildLegacygatewayAccessTokenPath,
  buildLegacygatewayPaymentByIdPath,
  buildLegacygatewayPaymentCancelPath,
  buildLegacygatewayPaymentsPath,
} from "./legacygateway-paths.js";
import type { LegacygatewayCheckoutRuntimeConfig, LegacygatewayCreatePaymentInput } from "./legacygateway-config.js";

export type LegacygatewayPaymentLink = {
  uri: string;
  method?: string;
  rel: string;
};

export type LegacygatewayPaymentDetails = {
  payId: string;
  status: string;
  currency: string;
  amount: number;
  links: LegacygatewayPaymentLink[];
};

export type LegacygatewayAccessTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in: number;
};

const TOKEN_SAFETY_MARGIN_MS = 60_000;

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

export type LegacygatewayHttpFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type LegacygatewayCheckoutClientOptions = {
  config: LegacygatewayCheckoutRuntimeConfig;
  fetchImpl?: LegacygatewayHttpFetch;
  now?: () => number;
};

/**
 * Isolated LEGACYGATEWAY Checkout HTTP adapter.
 */
export class LegacygatewayCheckoutClient {
  private readonly config: LegacygatewayCheckoutRuntimeConfig;
  private readonly fetchImpl: LegacygatewayHttpFetch;
  private readonly now: () => number;
  private cachedToken: CachedToken | null = null;
  private tokenInFlight: Promise<string> | null = null;

  constructor(options: LegacygatewayCheckoutClientOptions) {
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

  async createPayment(input: LegacygatewayCreatePaymentInput): Promise<LegacygatewayPaymentDetails> {
    return this.withAuthRetry((accessToken) =>
      this.requestJson<LegacygatewayPaymentDetails>(
        "POST",
        buildLegacygatewayPaymentsPath(this.config.apiVersion),
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

  async getPayment(payId: string): Promise<LegacygatewayPaymentDetails> {
    return this.withAuthRetry((accessToken) =>
      this.requestJson<LegacygatewayPaymentDetails>(
        "GET",
        buildLegacygatewayPaymentByIdPath(this.config.apiVersion, payId),
        { accessToken },
      ),
    );
  }

  /**
   * Full or partial cancel/refund.
   * Full: omit amount (or pass full remaining — caller decides).
   * Partial: body `{ amount }` must not exceed transaction amount (LEGACYGATEWAY rule).
   * payId must come from our DB, never from the client.
   */
  async cancelPayment(
    payId: string,
    options?: { amount?: number },
  ): Promise<unknown> {
    return this.withAuthRetry((accessToken) =>
      this.requestJson<unknown>(
        "POST",
        buildLegacygatewayPaymentCancelPath(this.config.apiVersion, payId),
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
    const path = buildLegacygatewayAccessTokenPath(this.config.apiVersion);
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
      throw new LegacygatewayCheckoutError("LEGACYGATEWAY access token network error", "network", {
        code: "LEGACYGATEWAY_TOKEN_NETWORK",
        cause,
      });
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, "access-token");
    }

    const payload = (await response.json()) as Partial<LegacygatewayAccessTokenResponse>;
    if (!payload.access_token || typeof payload.expires_in !== "number") {
      throw new LegacygatewayCheckoutError("LEGACYGATEWAY access token protocol error", "protocol", {
        code: "LEGACYGATEWAY_TOKEN_PROTOCOL",
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
      if (!(error instanceof LegacygatewayCheckoutError) || error.httpStatus !== 401) {
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
      throw new LegacygatewayCheckoutError("LEGACYGATEWAY payment network error", "network", {
        code: "LEGACYGATEWAY_PAYMENT_NETWORK",
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

  private mapHttpError(status: number, scope: string): LegacygatewayCheckoutError {
    if (status === 401 || status === 403) {
      return new LegacygatewayCheckoutError(`LEGACYGATEWAY ${scope} authentication failed`, "authentication", {
        httpStatus: status,
        code: "LEGACYGATEWAY_AUTH",
      });
    }

    if (status === 400 || status === 422) {
      return new LegacygatewayCheckoutError(`LEGACYGATEWAY ${scope} validation failed`, "validation", {
        httpStatus: status,
        code: "LEGACYGATEWAY_VALIDATION",
      });
    }

    if (status >= 400 && status < 500) {
      return new LegacygatewayCheckoutError(`LEGACYGATEWAY ${scope} client error`, "provider_4xx", {
        httpStatus: status,
        code: "LEGACYGATEWAY_PROVIDER_4XX",
      });
    }

    if (status >= 500) {
      return new LegacygatewayCheckoutError(`LEGACYGATEWAY ${scope} server error`, "provider_5xx", {
        httpStatus: status,
        code: "LEGACYGATEWAY_PROVIDER_5XX",
      });
    }

    return new LegacygatewayCheckoutError(`LEGACYGATEWAY ${scope} unexpected status`, "protocol", {
      httpStatus: status,
      code: "LEGACYGATEWAY_PROTOCOL",
    });
  }
}

export function extractApprovalUrl(payment: LegacygatewayPaymentDetails): string {
  const link = payment.links?.find((item) => item.rel === "approval_url");
  const uri = link?.uri?.trim();

  if (!uri) {
    throw new LegacygatewayCheckoutError("LEGACYGATEWAY createPayment missing approval_url", "protocol", {
      code: "LEGACYGATEWAY_MISSING_APPROVAL_URL",
    });
  }

  return uri;
}

export type { LegacygatewayCheckoutLanguage };

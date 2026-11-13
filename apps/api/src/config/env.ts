import { z } from "zod";
import { CheckoutgatewayCheckoutError, resolveCheckoutgatewayCheckoutConfig } from "@ai-music/checkoutgateway-checkout/config";
import {
  ResendInboundEnvError,
  resolveResendInboundFromEnv,
} from "@ai-music/shared";

const appEnvSchema = z.enum(["development", "staging", "production"]).default("development");

export type AppEnv = z.infer<typeof appEnvSchema>;

export function isDeployedAppEnv(appEnv: AppEnv): boolean {
  return appEnv === "staging" || appEnv === "production";
}

export function isProductionAppEnv(appEnv: AppEnv): boolean {
  return appEnv === "production";
}

/** Empty string in .env (e.g. R2_PUBLIC_BASE_URL=) must not fail optional URL fields. */
const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().url().optional());

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalEmail = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().email().optional());

const baseSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV: appEnvSchema,
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: optionalString,
  REDIS_URL: z.string().min(1),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_NAME: optionalString,
  R2_PUBLIC_BASE_URL: optionalUrl,
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104857600),
  CLERK_SECRET_KEY: optionalString,
  CLERK_WEBHOOK_SECRET: optionalString,
  AUTH_DEV_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUTH_DEV_USER_EMAIL: optionalEmail,
  AUTH_DEV_USER_NAME: optionalString,
  API_PROVIDER_REFERENCE_SECRET: optionalString,
  SENTRY_DSN: optionalString,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OPS_ADMIN_TOKEN: optionalString,
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  METRICS_BEARER_TOKEN: optionalString,
  MUSIC_PROVIDER: z.string().default("legacyengineapi"),
  MUSIC_DEFAULT_PROVIDER: z.string().optional(),
  AUDIOENGINE_API_KEY: optionalString,
  AUDIOENGINE_BASE_URL: optionalUrl,
  AUDIOENGINE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUDIOENGINE_PERSONAL_VOICE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /** Explicit production rollout gate. Default false — zero prod behavior change until set. */
  AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUDIOENGINE_VOICE_DELETION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUDIOENGINE_MODEL: z.string().default("audioengine-9"),
  // Deprecated: ignored at runtime (product always sends n=1). Kept for deploy compat.
  AUDIOENGINE_SONG_COUNT: z.coerce.number().int().min(1).max(3).default(1),
  AUDIOENGINE_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AUDIOENGINE_PROVIDER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AUDIOENGINE_VOCAL_CLONE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AUDIOENGINE_MP3_PERSIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  AUDIOENGINE_WAV_PERSIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUDIOENGINE_FLAC_PERSIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  LEGACYENGINE_FALLBACK_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  API_REQUIRE_IDEMPOTENCY_KEY: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  LEGACYENGINE_CALLBACK_LEGACY_CUTOFF_AT: optionalString,
  /** Explicit opt-in for unauthenticated legacy Legacyengine callback. Default off (fail-closed). */
  LEGACYENGINE_CALLBACK_LEGACY_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /** @deprecated Prefer LEGACYENGINE_CALLBACK_LEGACY_ENABLED. */
  LEGACYENGINE_CALLBACK_LEGACY_DISABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  LEGACYENGINE_CALLBACK_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(86_400),
  LEGACYENGINE_API_BASE_URL: optionalUrl,
  LEGACYENGINE_MUSIC_API_BASE_URL: optionalUrl,
  LEGACYENGINE_API_KEY: optionalString,
  KITS_API_BASE_URL: optionalUrl,
  KITS_API_KEY: optionalString,
  /**
   * Legacy LEGACYGATEWAY callback/refund only. Does not enable new checkout.
   * Default off; never enable without full config.
   */
  LEGACYGATEWAY_CHECKOUT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  LEGACYGATEWAY_API_BASE_URL: optionalString,
  LEGACYGATEWAY_CHECKOUT_API_VERSION: optionalString,
  LEGACYGATEWAY_API_KEY: optionalString,
  LEGACYGATEWAY_CLIENT_ID: optionalString,
  LEGACYGATEWAY_CLIENT_SECRET: optionalString,
  LEGACYGATEWAY_CHECKOUT_CURRENCY: optionalString,
  LEGACYGATEWAY_CALLBACK_URL: optionalString,
  LEGACYGATEWAY_RETURN_URL: optionalString,
  /** real (default) | mock — mock forbidden in production. */
  LEGACYGATEWAY_REFUND_PROVIDER_MODE: optionalString,
  /**
   * Optional checkout selector. `checkoutgateway` or unset may enable checkout when Checkoutgateway is ready.
   * `legacygateway` and any other value fail closed (checkout disabled). Never auto-fallback.
   */
  PAYMENT_PROVIDER: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().optional()),
  /**
   * USD→GEL quote source for Checkoutgateway checkout. `nbg` = official NBG JSON.
   * Missing / unknown / `unconfigured` fail closed. Never a fake/static env provider.
   */
  FX_USD_GEL_PROVIDER: optionalString,
  /** Checkoutgateway hosted checkout — default off. Never NEXT_PUBLIC_*. Production stays disabled until explicitly enabled with approved GEL prices. */
  CHECKOUTGATEWAY_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  CHECKOUTGATEWAY_API_BASE_URL: optionalString,
  CHECKOUTGATEWAY_MERCHANT_ID: optionalString,
  CHECKOUTGATEWAY_PAYMENT_KEY: optionalString,
  CHECKOUTGATEWAY_CURRENCY: optionalString,
  CHECKOUTGATEWAY_CALLBACK_URL: optionalString,
  CHECKOUTGATEWAY_RETURN_URL: optionalString,
});

export type ApiEnv = z.infer<typeof baseSchema> & {
  isProduction: boolean;
  isDeployed: boolean;
};

function requireTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function collectR2Missing(env: z.infer<typeof baseSchema>): string[] {
  const missing: string[] = [];

  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ] as const) {
    if (!requireTrimmed(env[key])) {
      missing.push(key);
    }
  }

  return missing;
}

/** Legacy LEGACYGATEWAY callback/refund credentials. Does not enable new checkout. */
function validateLegacygatewayCheckoutEnv(env: z.infer<typeof baseSchema>): void {
  if (!env.LEGACYGATEWAY_CHECKOUT_ENABLED) {
    return;
  }

  const missing: string[] = [];
  for (const key of [
    "LEGACYGATEWAY_API_BASE_URL",
    "LEGACYGATEWAY_CHECKOUT_API_VERSION",
    "LEGACYGATEWAY_API_KEY",
    "LEGACYGATEWAY_CLIENT_ID",
    "LEGACYGATEWAY_CLIENT_SECRET",
    "LEGACYGATEWAY_CALLBACK_URL",
    "LEGACYGATEWAY_RETURN_URL",
  ] as const) {
    if (!requireTrimmed(env[key])) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`LEGACYGATEWAY_CHECKOUT_ENABLED=true but missing: ${missing.join(", ")}`);
  }

  for (const key of ["LEGACYGATEWAY_API_BASE_URL", "LEGACYGATEWAY_CALLBACK_URL", "LEGACYGATEWAY_RETURN_URL"] as const) {
    const value = requireTrimmed(env[key])!;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Invalid ${key}`);
    }
    if (parsed.protocol !== "https:") {
      throw new Error(`${key} must be https`);
    }
  }

  const currency = (requireTrimmed(env.LEGACYGATEWAY_CHECKOUT_CURRENCY) ?? "USD").toUpperCase();
  if (currency !== "USD" && currency !== "GEL" && currency !== "EUR") {
    throw new Error(`Unsupported LEGACYGATEWAY_CHECKOUT_CURRENCY: ${currency}`);
  }
}

function validateDeployedEnv(env: z.infer<typeof baseSchema>): void {
  if (!isDeployedAppEnv(env.APP_ENV)) {
    return;
  }

  if (env.AUTH_DEV_MODE) {
    throw new Error("AUTH_DEV_MODE must be false when APP_ENV is staging or production");
  }

  const missing: string[] = [];

  for (const key of [
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "API_PROVIDER_REFERENCE_SECRET",
    "OPS_ADMIN_TOKEN",
    "LEGACYENGINE_API_KEY",
  ] as const) {
    if (!requireTrimmed(env[key])) {
      missing.push(key);
    }
  }

  if (env.STORAGE_DRIVER === "r2" || env.APP_ENV === "staging") {
    missing.push(...collectR2Missing(env));
  }

  if (env.APP_ENV === "production" && env.STORAGE_DRIVER !== "r2") {
    missing.push("STORAGE_DRIVER=r2");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required ${env.APP_ENV} env: ${[...new Set(missing)].join(", ")}`);
  }

  validateAudioengineProductionRollout(env);
}

function validateAudioengineProductionRollout(env: z.infer<typeof baseSchema>): void {
  if (env.APP_ENV !== "production" || !env.AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED) {
    return;
  }

  const missing: string[] = [];
  if (!env.AUDIOENGINE_ENABLED) {
    missing.push("AUDIOENGINE_ENABLED=true");
  }
  if (!env.AUDIOENGINE_PERSONAL_VOICE_ENABLED) {
    missing.push("AUDIOENGINE_PERSONAL_VOICE_ENABLED=true");
  }
  if (!requireTrimmed(env.AUDIOENGINE_API_KEY)) {
    missing.push("AUDIOENGINE_API_KEY");
  }

  const baseUrl = requireTrimmed(env.AUDIOENGINE_BASE_URL);
  if (!baseUrl) {
    missing.push("AUDIOENGINE_BASE_URL");
  } else {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") {
        missing.push("AUDIOENGINE_BASE_URL(https)");
      }
    } catch {
      missing.push("AUDIOENGINE_BASE_URL");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED requires: ${[...new Set(missing)].join(", ")}`,
    );
  }
}

function validateCheckoutgatewayCheckoutEnv(env: z.infer<typeof baseSchema>): void {
  try {
    resolveCheckoutgatewayCheckoutConfig({
      APP_ENV: env.APP_ENV,
      CHECKOUTGATEWAY_ENABLED: env.CHECKOUTGATEWAY_ENABLED,
      CHECKOUTGATEWAY_API_BASE_URL: env.CHECKOUTGATEWAY_API_BASE_URL,
      CHECKOUTGATEWAY_MERCHANT_ID: env.CHECKOUTGATEWAY_MERCHANT_ID,
      CHECKOUTGATEWAY_PAYMENT_KEY: env.CHECKOUTGATEWAY_PAYMENT_KEY,
      CHECKOUTGATEWAY_CURRENCY: env.CHECKOUTGATEWAY_CURRENCY,
      CHECKOUTGATEWAY_CALLBACK_URL: env.CHECKOUTGATEWAY_CALLBACK_URL,
      CHECKOUTGATEWAY_RETURN_URL: env.CHECKOUTGATEWAY_RETURN_URL,
    });
  } catch (error) {
    if (error instanceof CheckoutgatewayCheckoutError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

function validateLegacygatewayRefundProviderMode(env: z.infer<typeof baseSchema>): void {
  const raw = (env.LEGACYGATEWAY_REFUND_PROVIDER_MODE ?? "real").trim().toLowerCase() || "real";
  if (raw !== "real" && raw !== "mock") {
    throw new Error(`Invalid LEGACYGATEWAY_REFUND_PROVIDER_MODE=${raw} (expected real|mock)`);
  }
  if (raw === "mock" && env.APP_ENV === "production") {
    throw new Error("LEGACYGATEWAY_REFUND_PROVIDER_MODE=mock is forbidden when APP_ENV=production");
  }
}

/** Fail closed when Resend inbound env is present but APP_ENV/address mismatch. */
function validateResendInboundEnv(appEnv: AppEnv): void {
  try {
    resolveResendInboundFromEnv({
      ...process.env,
      APP_ENV: appEnv,
    });
  } catch (error) {
    if (error instanceof ResendInboundEnvError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export function loadApiEnv(): ApiEnv {
  const parsed = baseSchema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid API environment: ${message}`);
  }

  validateDeployedEnv(parsed.data);
  validateLegacygatewayCheckoutEnv(parsed.data);
  validateCheckoutgatewayCheckoutEnv(parsed.data);
  validateLegacygatewayRefundProviderMode(parsed.data);
  validateResendInboundEnv(parsed.data.APP_ENV);

  return {
    ...parsed.data,
    isProduction: isProductionAppEnv(parsed.data.APP_ENV),
    isDeployed: isDeployedAppEnv(parsed.data.APP_ENV),
  };
}

let cachedEnv: ApiEnv | null = null;

export function getApiEnv(): ApiEnv {
  if (!cachedEnv) {
    cachedEnv = loadApiEnv();
  }

  return cachedEnv;
}

export function resolveProviderReferenceSecret(): string {
  const env = getApiEnv();

  if (env.API_PROVIDER_REFERENCE_SECRET?.trim()) {
    return env.API_PROVIDER_REFERENCE_SECRET.trim();
  }

  if (env.isDeployed) {
    throw new Error("API_PROVIDER_REFERENCE_SECRET is required in staging and production");
  }

  if (env.CLERK_SECRET_KEY?.trim()) {
    return env.CLERK_SECRET_KEY.trim();
  }

  return "dev-provider-reference-insecure";
}

import { z } from "zod";
import { FlittCheckoutError, resolveFlittProviderConfig } from "@ai-music/flitt-checkout/config";

const appEnvSchema = z.enum(["development", "staging", "production"]).default("development");

function isDeployedAppEnv(appEnv: z.infer<typeof appEnvSchema>): boolean {
  return appEnv === "staging" || appEnv === "production";
}

/** Empty string in .env must not fail optional URL / string fields. */
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

const workerEnvSchema = z.object({
  APP_ENV: appEnvSchema,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_NAME: optionalString,
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  WORKER_PROVIDER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  WORKER_PROVIDER_RECONCILER_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  WORKER_PROVIDER_RECONCILER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_PROVIDER_RECONCILER_BATCH: z.coerce.number().int().positive().default(50),
  WORKER_TRACK_PERSIST_CONCURRENCY: z.coerce.number().int().positive().default(4),
  WORKER_TRACK_PERSIST_RECONCILER_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  WORKER_TRACK_PERSIST_RECONCILER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  WORKER_TRACK_PERSIST_RECONCILER_BATCH: z.coerce.number().int().positive().default(50),
  MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  MUSIC_TRACK_MAX_BYTES: z.coerce.number().int().positive().default(30_000_000),
  MUSIC_TRACK_PERSIST_ATTEMPTS: z.coerce.number().int().positive().default(5),
  MUSIC_TRACK_PERSIST_BACKOFF_MS: z.coerce.number().int().positive().default(5_000),
  MUSIC_TRACK_PERSIST_STALE_MS: z.coerce.number().int().positive().default(120_000),
  SENTRY_DSN: optionalString,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MUSIC_PROVIDER: z.string().default("sunoapi"),
  MUSIC_DEFAULT_PROVIDER: z.string().optional(),
  MUREKA_API_KEY: optionalString,
  MUREKA_BASE_URL: optionalUrl,
  MUREKA_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  MUREKA_PERSONAL_VOICE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /** Explicit production rollout gate. Default false — zero prod behavior change until set. */
  MUREKA_PRODUCTION_ROLLOUT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  MUREKA_MODEL: z.string().default("mureka-9"),
  // Deprecated: ignored at runtime (product always sends n=1). Kept for deploy compat.
  MUREKA_SONG_COUNT: z.coerce.number().int().min(1).max(3).default(1),
  MUREKA_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  MUREKA_PROVIDER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  MUREKA_VOCAL_CLONE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  MUREKA_MP3_PERSIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  MUREKA_WAV_PERSIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  MUREKA_FLAC_PERSIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  SUNO_FALLBACK_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  WORKER_METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  WORKER_METRICS_HOST: z.string().default("0.0.0.0"),
  WORKER_METRICS_PORT: z.coerce.number().int().positive().default(9091),
  METRICS_BEARER_TOKEN: optionalString,
  /** real (default) | mock — mock forbidden in production. */
  TBC_REFUND_PROVIDER_MODE: optionalString,
  FLITT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  FLITT_API_BASE_URL: optionalString,
  FLITT_MERCHANT_ID: optionalString,
  FLITT_PAYMENT_KEY: optionalString,
  FLITT_CURRENCY: optionalString,
  FLITT_CALLBACK_URL: optionalString,
  FLITT_RETURN_URL: optionalString,
  SUNO_API_BASE_URL: optionalUrl,
  SUNO_MUSIC_API_BASE_URL: optionalUrl,
  SUNO_API_KEY: optionalString,
  API_PUBLIC_URL: optionalUrl,
  API_PROVIDER_REFERENCE_SECRET: optionalString,
  SUNO_CALLBACK_SIGNED_URL_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  SUNO_CALLBACK_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(86_400),
  KITS_API_BASE_URL: optionalUrl,
  KITS_API_KEY: optionalString,
});

export type WorkerEnv = z.infer<typeof workerEnvSchema> & {
  isProduction: boolean;
  isDeployed: boolean;
};

function requireTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function collectR2Missing(env: z.infer<typeof workerEnvSchema>): string[] {
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

function validateDeployedEnv(env: z.infer<typeof workerEnvSchema>): void {
  if (!isDeployedAppEnv(env.APP_ENV)) {
    return;
  }

  const missing: string[] = [];

  if (!requireTrimmed(env.SUNO_API_KEY)) {
    missing.push("SUNO_API_KEY");
  }

  if (env.STORAGE_DRIVER === "r2" || env.APP_ENV === "staging") {
    missing.push(...collectR2Missing(env));
  }

  if (env.APP_ENV === "production" && env.STORAGE_DRIVER !== "r2") {
    missing.push("STORAGE_DRIVER=r2");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required worker ${env.APP_ENV} env: ${[...new Set(missing)].join(", ")}`,
    );
  }

  validateMurekaProductionRollout(env);
}

function validateMurekaProductionRollout(env: z.infer<typeof workerEnvSchema>): void {
  if (env.APP_ENV !== "production" || !env.MUREKA_PRODUCTION_ROLLOUT_ENABLED) {
    return;
  }

  const missing: string[] = [];
  if (!env.MUREKA_ENABLED) {
    missing.push("MUREKA_ENABLED=true");
  }
  if (!env.MUREKA_PERSONAL_VOICE_ENABLED) {
    missing.push("MUREKA_PERSONAL_VOICE_ENABLED=true");
  }
  if (!requireTrimmed(env.MUREKA_API_KEY)) {
    missing.push("MUREKA_API_KEY");
  }

  const baseUrl = requireTrimmed(env.MUREKA_BASE_URL);
  if (!baseUrl) {
    missing.push("MUREKA_BASE_URL");
  } else {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") {
        missing.push("MUREKA_BASE_URL(https)");
      }
    } catch {
      missing.push("MUREKA_BASE_URL");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `MUREKA_PRODUCTION_ROLLOUT_ENABLED requires: ${[...new Set(missing)].join(", ")}`,
    );
  }
}

function validateTbcRefundProviderMode(
  env: z.infer<typeof workerEnvSchema>,
): void {
  const raw = (env.TBC_REFUND_PROVIDER_MODE ?? "real").trim().toLowerCase() || "real";
  if (raw !== "real" && raw !== "mock") {
    throw new Error(`Invalid TBC_REFUND_PROVIDER_MODE=${raw} (expected real|mock)`);
  }
  if (raw === "mock" && env.APP_ENV === "production") {
    throw new Error("TBC_REFUND_PROVIDER_MODE=mock is forbidden when APP_ENV=production");
  }
}

function validateFlittCheckoutEnv(env: z.infer<typeof workerEnvSchema>): void {
  try {
    resolveFlittProviderConfig({
      APP_ENV: env.APP_ENV,
      FLITT_ENABLED: env.FLITT_ENABLED,
      FLITT_API_BASE_URL: env.FLITT_API_BASE_URL,
      FLITT_MERCHANT_ID: env.FLITT_MERCHANT_ID,
      FLITT_PAYMENT_KEY: env.FLITT_PAYMENT_KEY,
      FLITT_CURRENCY: env.FLITT_CURRENCY,
    });
  } catch (error) {
    if (error instanceof FlittCheckoutError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export function loadWorkerEnv(): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid worker environment: ${message}`);
  }

  validateDeployedEnv(parsed.data);
  validateTbcRefundProviderMode(parsed.data);
  validateFlittCheckoutEnv(parsed.data);

  return {
    ...parsed.data,
    isProduction: parsed.data.APP_ENV === "production",
    isDeployed: isDeployedAppEnv(parsed.data.APP_ENV),
  };
}

let cachedEnv: WorkerEnv | null = null;

export function getWorkerEnv(): WorkerEnv {
  if (!cachedEnv) {
    cachedEnv = loadWorkerEnv();
  }

  return cachedEnv;
}

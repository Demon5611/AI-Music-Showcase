import { z } from "zod";
import {
  assertLegalEntityReadyForProduction,
  warnLegalEntityPlaceholdersInDevelopment,
} from "@/shared/config/legal";

const publicBooleanSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value === "true");

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().trim().url().default("http://localhost:3001"),
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]).optional(),
  NEXT_PUBLIC_MUREKA_PERSONAL_VOICE_ENABLED: publicBooleanSchema,
  NEXT_PUBLIC_MUREKA_VOICE_DELETION_ENABLED: publicBooleanSchema,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().default(""),
  NEXT_PUBLIC_FORCE_CLERK: z
    .string()
    .trim()
    .optional()
    .transform((value): boolean | undefined => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),
  NEXT_PUBLIC_DEV_AUTH_USER_ID: z.string().trim().default("local-user-1"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().trim().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type WebEnv = z.infer<typeof webEnvSchema> & {
  clerkPublishableKey: string;
  isClerkEnabled: boolean;
};

function hasValidClerkPublishableKey(key: string): boolean {
  return /^pk_(test|live)_/.test(key);
}

/** Direct reads so Next.js inlines NEXT_PUBLIC_* into the client bundle. */
function readWebEnvInput() {
  return {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_MUREKA_PERSONAL_VOICE_ENABLED:
      process.env.NEXT_PUBLIC_MUREKA_PERSONAL_VOICE_ENABLED,
    NEXT_PUBLIC_MUREKA_VOICE_DELETION_ENABLED:
      process.env.NEXT_PUBLIC_MUREKA_VOICE_DELETION_ENABLED,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_FORCE_CLERK: process.env.NEXT_PUBLIC_FORCE_CLERK,
    NEXT_PUBLIC_DEV_AUTH_USER_ID: process.env.NEXT_PUBLIC_DEV_AUTH_USER_ID,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function isShowcaseWebMode(): boolean {
  const raw = (
    process.env.NEXT_PUBLIC_SHOWCASE_MODE ??
    process.env.SHOWCASE_MODE ??
    ""
  )
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function isDeployedWebEnv(
  nodeEnv: z.infer<typeof webEnvSchema>["NODE_ENV"],
  appEnv: z.infer<typeof webEnvSchema>["NEXT_PUBLIC_APP_ENV"],
): boolean {
  if (isShowcaseWebMode()) {
    return false;
  }

  if (appEnv === "staging" || appEnv === "production") {
    return true;
  }

  return nodeEnv === "production" && appEnv !== "development";
}

function parseWebEnv(): WebEnv {
  const parsed = webEnvSchema.safeParse(readWebEnvInput());

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid web environment: ${message}`);
  }

  const clerkPublishableKey = parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim();
  const forceClerk = parsed.data.NEXT_PUBLIC_FORCE_CLERK;
  const showcase = isShowcaseWebMode();
  const deployed = isDeployedWebEnv(parsed.data.NODE_ENV, parsed.data.NEXT_PUBLIC_APP_ENV);

  if (deployed && forceClerk === false) {
    throw new Error("NEXT_PUBLIC_FORCE_CLERK=false is not allowed in staging or production");
  }

  const isClerkEnabled =
    !showcase &&
    hasValidClerkPublishableKey(clerkPublishableKey) &&
    (deployed || parsed.data.NODE_ENV === "production" || forceClerk !== false);

  if (!showcase && deployed && !isClerkEnabled) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required in staging and production");
  }

  if (!showcase && parsed.data.NODE_ENV === "production" && !isClerkEnabled && !deployed) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required in production");
  }

  // Fail-fast only when explicitly marked staging/production (release blocker).
  // Local `next build` without APP_ENV may keep placeholders; warn instead.
  if (
    !showcase &&
    (parsed.data.NEXT_PUBLIC_APP_ENV === "staging" ||
      parsed.data.NEXT_PUBLIC_APP_ENV === "production")
  ) {
    assertLegalEntityReadyForProduction("staging/production web env");
  } else {
    warnLegalEntityPlaceholdersInDevelopment();
  }

  return {
    ...parsed.data,
    clerkPublishableKey,
    isClerkEnabled,
  };
}

const webEnv = parseWebEnv();

export const env = {
  apiUrl: webEnv.NEXT_PUBLIC_API_URL,
  appEnv: webEnv.NEXT_PUBLIC_APP_ENV,
  clerkPublishableKey: webEnv.clerkPublishableKey,
  devAuthUserId: webEnv.NEXT_PUBLIC_DEV_AUTH_USER_ID,
  isClerkEnabled: webEnv.isClerkEnabled,
  murekaPersonalVoiceEnabled:
    webEnv.NEXT_PUBLIC_APP_ENV !== "production" &&
    webEnv.NEXT_PUBLIC_MUREKA_PERSONAL_VOICE_ENABLED,
  murekaVoiceDeletionEnabled:
    webEnv.NEXT_PUBLIC_APP_ENV !== "production" &&
    webEnv.NEXT_PUBLIC_MUREKA_VOICE_DELETION_ENABLED,
  sentryDsn: webEnv.NEXT_PUBLIC_SENTRY_DSN,
};

export function createDevAuthToken(): string {
  return `dev:${env.devAuthUserId}`;
}

/**
 * Env resolution for Resend inbound support forwarding.
 * Secrets stay server-side (API); never expose to apps/web.
 *
 * Invariant: each APP_ENV binds to exactly one public inbound identity.
 * Production and staging must never share the same inbound address.
 */

import { resolveAppRuntimeEnv, type AppRuntimeEnv } from "../runtime-env.js";

export const RESEND_INBOUND_ADDRESS_PRODUCTION = "support@example.com";
export const RESEND_INBOUND_ADDRESS_STAGING = "support-staging@example.com";

function normalizeMailbox(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim().toLowerCase();
}

/** Deployed support aliases — blocked as senders (loop) and mismatched APP_ENV. */
export const RESEND_INBOUND_DEPLOYED_ADDRESSES = [
  RESEND_INBOUND_ADDRESS_PRODUCTION,
  RESEND_INBOUND_ADDRESS_STAGING,
] as const;

export type ResendInboundAppEnv = Extract<AppRuntimeEnv, "staging" | "production"> | "development";

export type ResendInboundEnv = {
  apiKey: string;
  webhookSecret: string;
  inboundAddress: string;
  forwardTo: string;
  fromIdentity: string;
  appEnv: ResendInboundAppEnv;
};

export class ResendInboundEnvError extends Error {
  readonly code = "RESEND_INBOUND_ENV_ISOLATION";

  constructor(message: string) {
    super(message);
    this.name = "ResendInboundEnvError";
  }
}

export function expectedResendInboundAddressForAppEnv(
  appEnv: AppRuntimeEnv,
): string | null {
  if (appEnv === "production") {
    return RESEND_INBOUND_ADDRESS_PRODUCTION;
  }
  if (appEnv === "staging") {
    return RESEND_INBOUND_ADDRESS_STAGING;
  }
  return null;
}

export function defaultResendInboundFromIdentity(
  inboundAddress: string,
  appEnv: ResendInboundAppEnv,
): string {
  const address = normalizeMailbox(inboundAddress);
  if (appEnv === "staging") {
    return `AI Music Staging <${address}>`;
  }
  if (appEnv === "production") {
    return `AI Music <${address}>`;
  }
  return `AI Music Dev <${address}>`;
}

/**
 * Fail-closed address ↔ APP_ENV binding.
 * Throws ResendInboundEnvError when incompatible.
 */
export function assertResendInboundAddressForAppEnv(input: {
  appEnv: string | undefined | null;
  inboundAddress: string;
}): ResendInboundAppEnv {
  const appEnv = resolveAppRuntimeEnv(input.appEnv);
  const address = normalizeMailbox(input.inboundAddress);
  const expected = expectedResendInboundAddressForAppEnv(appEnv);

  if (appEnv === "production" || appEnv === "staging") {
    if (address !== expected) {
      throw new ResendInboundEnvError(
        `APP_ENV=${appEnv} requires RESEND_INBOUND_ADDRESS=${expected}, got ${address}`,
      );
    }
    return appEnv;
  }

  // development / test: never bind a deployed alias via env resolution
  if (
    RESEND_INBOUND_DEPLOYED_ADDRESSES.some(
      (deployed) => normalizeMailbox(deployed) === address,
    )
  ) {
    throw new ResendInboundEnvError(
      `Deployed inbound address ${address} is forbidden when APP_ENV=${appEnv}`,
    );
  }

  return "development";
}

function isInboundConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.RESEND_API_KEY?.trim() ||
      env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ||
      env.RESEND_INBOUND_ADDRESS?.trim() ||
      env.RESEND_INBOUND_FORWARD_TO?.trim() ||
      env.RESEND_INBOUND_FROM?.trim(),
  );
}

function isInboundFullyConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.RESEND_API_KEY?.trim() &&
      env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() &&
      env.RESEND_INBOUND_ADDRESS?.trim() &&
      env.RESEND_INBOUND_FORWARD_TO?.trim(),
  );
}

/**
 * Resolve inbound config from process env.
 * - Fully unset → null (feature off)
 * - Partially set → throw (fail closed)
 * - Fully set with APP_ENV mismatch → throw
 * - Fully set and compatible → config
 *
 * Does not fall back to TRANSACTIONAL_EMAIL_FROM (avoids staging→prod From).
 */
export function resolveResendInboundFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResendInboundEnv | null {
  if (!isInboundConfigured(env)) {
    return null;
  }

  if (!isInboundFullyConfigured(env)) {
    throw new ResendInboundEnvError(
      "Resend inbound is partially configured; set RESEND_API_KEY, RESEND_INBOUND_WEBHOOK_SECRET, RESEND_INBOUND_ADDRESS, RESEND_INBOUND_FORWARD_TO",
    );
  }

  const apiKey = env.RESEND_API_KEY!.trim();
  const webhookSecret = env.RESEND_INBOUND_WEBHOOK_SECRET!.trim();
  const inboundAddress = normalizeMailbox(env.RESEND_INBOUND_ADDRESS!);
  const forwardTo = normalizeMailbox(env.RESEND_INBOUND_FORWARD_TO!);

  const appEnv = assertResendInboundAddressForAppEnv({
    appEnv: env.APP_ENV,
    inboundAddress,
  });

  const fromIdentity =
    env.RESEND_INBOUND_FROM?.trim() ||
    defaultResendInboundFromIdentity(inboundAddress, appEnv);

  // Fail closed: explicit From must still use this environment's inbound mailbox
  const fromMailbox = normalizeMailbox(fromIdentity);
  if (fromMailbox !== inboundAddress) {
    throw new ResendInboundEnvError(
      `RESEND_INBOUND_FROM mailbox must equal RESEND_INBOUND_ADDRESS (${inboundAddress})`,
    );
  }

  return {
    apiKey,
    webhookSecret,
    inboundAddress,
    forwardTo,
    fromIdentity,
    appEnv,
  };
}

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SEC = 86_400;

export type SunoCallbackTokenParts = {
  version: string;
  expiresAtSec: number;
  signatureHex: string;
};

/**
 * Payload HMAC'd for callback auth (never store the resulting URL).
 * Wire token: `{version}.{expiresAtSec}.{signatureHex}`
 */
export function buildSunoCallbackMacPayload(recordId: string, expiresAtSec: number): string {
  return `${TOKEN_VERSION}:suno-callback:${recordId}:${expiresAtSec}`;
}

export function createSunoCallbackToken(
  secret: string,
  recordId: string,
  ttlSec: number = DEFAULT_TTL_SEC,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const expiresAtSec = nowSec + ttlSec;
  const payload = buildSunoCallbackMacPayload(recordId, expiresAtSec);
  const signatureHex = createHmac("sha256", secret).update(payload).digest("hex");
  return `${TOKEN_VERSION}.${expiresAtSec}.${signatureHex}`;
}

export function parseSunoCallbackToken(token: string): SunoCallbackTokenParts | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [version, expPart, signatureHex] = parts;
  const expiresAtSec = Number(expPart);

  if (version !== TOKEN_VERSION || !Number.isFinite(expiresAtSec) || !signatureHex) {
    return null;
  }

  return { version, expiresAtSec, signatureHex };
}

export function verifySunoCallbackToken(
  secret: string,
  recordId: string,
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const parsed = parseSunoCallbackToken(token);

  if (!parsed || parsed.expiresAtSec < nowSec) {
    return false;
  }

  const payload = buildSunoCallbackMacPayload(recordId, parsed.expiresAtSec);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  if (expected.length !== parsed.signatureHex.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parsed.signatureHex));
  } catch {
    return false;
  }
}

export function buildSunoSignedCallbackUrl(
  apiPublicUrl: string,
  recordId: string,
  token: string,
): string {
  const base = apiPublicUrl.replace(/\/$/, "");
  return `${base}/api/music/callback/suno/${encodeURIComponent(recordId)}/${encodeURIComponent(token)}`;
}

export { DEFAULT_TTL_SEC as SUNO_CALLBACK_TOKEN_DEFAULT_TTL_SEC };

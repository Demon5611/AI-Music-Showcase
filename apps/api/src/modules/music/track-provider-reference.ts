import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveProviderReferenceSecret } from "../../config/env.js";

/**
 * Capability URL for provider-side audio fetch (e.g. remix reference).
 * Not a browser/user session endpoint — HMAC token is the auth.
 * Keep TTL short to limit exposure if a URL leaks.
 */
const TOKEN_TTL_SEC = 900;

export function createProviderReferenceToken(trackId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = `${trackId}:${exp}`;
  const signature = createHmac("sha256", resolveProviderReferenceSecret())
    .update(payload)
    .digest("hex");

  return `${exp}.${signature}`;
}

export function verifyProviderReferenceToken(trackId: string, token: string): boolean {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [expPart, signaturePart] = parts;
  const exp = Number(expPart);

  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const payload = `${trackId}:${expPart}`;
  const expected = createHmac("sha256", resolveProviderReferenceSecret())
    .update(payload)
    .digest("hex");

  if (expected.length !== signaturePart.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signaturePart));
}

export function buildProviderReferenceAudioUrl(apiBaseUrl: string, trackId: string): string {
  const token = createProviderReferenceToken(trackId);
  const params = new URLSearchParams({ token });

  return `${apiBaseUrl}/api/music/tracks/${encodeURIComponent(trackId)}/provider-reference?${params.toString()}`;
}

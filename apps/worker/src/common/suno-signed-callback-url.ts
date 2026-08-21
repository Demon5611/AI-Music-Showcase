import { buildSunoSignedCallbackUrl, createSunoCallbackToken } from "@ai-music/shared";
import { getWorkerEnv } from "../config/env.js";

/**
 * Build signed callBackUrl for late-bound GenerationSubmitContext.callBackUrl.
 * Application concern (HMAC + env) — provider only applies the resulting string.
 * Never persist the URL/token in DB, job payload, or providerRequestJson.
 */
export function resolveSignedSunoCallBackUrl(recordId: string): string | undefined {
  const env = getWorkerEnv();

  if (!env.SUNO_CALLBACK_SIGNED_URL_ENABLED) {
    return undefined;
  }

  const secret = env.API_PROVIDER_REFERENCE_SECRET?.trim();
  const apiPublicUrl = env.API_PUBLIC_URL?.trim();

  if (!secret || !apiPublicUrl) {
    return undefined;
  }

  const token = createSunoCallbackToken(secret, recordId, env.SUNO_CALLBACK_TOKEN_TTL_SEC);
  return buildSunoSignedCallbackUrl(apiPublicUrl, recordId, token);
}

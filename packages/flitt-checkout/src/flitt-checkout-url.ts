import { FLITT_API_HOSTS } from "@ai-music/shared";

const TRUSTED_HOSTS = new Set<string>(FLITT_API_HOSTS);

/**
 * Hosted checkout redirect must be https on pay.flitt.com.
 * Rejects open redirects, credentials-in-URL, and non-merchant paths.
 */
export function isTrustedFlittCheckoutUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return false;
  }

  if (!TRUSTED_HOSTS.has(parsed.hostname)) {
    return false;
  }

  if (parsed.port !== "" && parsed.port !== "443") {
    return false;
  }

  return parsed.pathname.startsWith("/merchants/");
}

export function assertTrustedFlittApiBaseUrl(value: string, name: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must be https`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${name} must not include credentials`);
  }
  if (!TRUSTED_HOSTS.has(parsed.hostname)) {
    throw new Error(`${name} host is not a trusted Flitt API host`);
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(`${name} must use https port 443`);
  }
  return parsed;
}

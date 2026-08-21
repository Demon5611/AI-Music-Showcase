/**
 * Strict MUREKA_BASE_URL parsing for Undici-safe absolute HTTPS URLs.
 * Rejects host-only values (`api.mureka.ai`) and broken schemes (`https//…`).
 */

export const MUREKA_DEFAULT_BASE_URL = "https://api.mureka.ai";

export type MurekaBaseUrlParseResult =
  | {
      ok: true;
      /** Normalized absolute HTTPS origin/path without trailing slash. */
      baseUrl: string;
      protocol: "https:";
      hostname: string;
      reason: null;
    }
  | {
      ok: false;
      baseUrl: null;
      protocol: string | null;
      hostname: string | null;
      reason: "invalid_url" | "protocol_not_https" | "missing_hostname";
    };

/**
 * Parse and normalize a Mureka API base URL.
 * Empty / unset → official default `https://api.mureka.ai`.
 */
export function parseMurekaBaseUrl(
  raw: string | undefined | null,
): MurekaBaseUrlParseResult {
  const trimmed = raw?.trim() ?? "";
  return parseAbsoluteHttpsUrl(trimmed.length > 0 ? trimmed : MUREKA_DEFAULT_BASE_URL);
}

function parseAbsoluteHttpsUrl(value: string): MurekaBaseUrlParseResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      baseUrl: null,
      protocol: null,
      hostname: null,
      reason: "invalid_url",
    };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      baseUrl: null,
      protocol: url.protocol || null,
      hostname: url.hostname || null,
      reason: "protocol_not_https",
    };
  }

  if (!url.hostname) {
    return {
      ok: false,
      baseUrl: null,
      protocol: url.protocol,
      hostname: null,
      reason: "missing_hostname",
    };
  }

  const path =
    url.pathname && url.pathname !== "/" ? url.pathname.replace(/\/$/, "") : "";
  const baseUrl = `${url.protocol}//${url.host}${path}`;

  return {
    ok: true,
    baseUrl,
    protocol: "https:",
    hostname: url.hostname,
    reason: null,
  };
}

/** Safe description for startup logs — never includes secrets. */
export function describeMurekaBaseUrl(
  raw: string | undefined | null,
): {
  baseUrlConfigured: boolean;
  baseUrlValid: boolean;
  protocol: string | null;
  hostname: string | null;
} {
  const configured = Boolean(raw?.trim());
  const parsed = parseMurekaBaseUrl(raw);

  return {
    baseUrlConfigured: configured,
    baseUrlValid: parsed.ok,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
  };
}

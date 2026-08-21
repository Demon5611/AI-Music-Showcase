import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS_DEFAULT,
  MUSIC_TRACK_MAX_BYTES_DEFAULT,
} from "@ai-music/shared";

const MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

export type SecureAudioDownloadOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  nowMs?: () => number;
};

export type SecureAudioDownloadResult = {
  buffer: Buffer;
  contentType: string;
  finalHost: string;
  bytes: number;
};

export class SecureAudioDownloadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SecureAudioDownloadError";
  }
}

export async function downloadSecureAudio(
  sourceUrl: string,
  options: SecureAudioDownloadOptions = {},
): Promise<SecureAudioDownloadResult> {
  const timeoutMs = options.timeoutMs ?? MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS_DEFAULT;
  const maxBytes = options.maxBytes ?? MUSIC_TRACK_MAX_BYTES_DEFAULT;
  let currentUrl = sourceUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const parsed = parseHttpUrl(currentUrl);
    await assertPublicHostname(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "audio/*,application/octet-stream" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new SecureAudioDownloadError("Redirect without location", "REDIRECT_INVALID", false);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (response.status === 404 || response.status === 408 || response.status === 429) {
        throw new SecureAudioDownloadError(
          `Provider HTTP ${response.status}`,
          `HTTP_${response.status}`,
          true,
        );
      }

      if (response.status >= 500) {
        throw new SecureAudioDownloadError(
          `Provider HTTP ${response.status}`,
          `HTTP_${response.status}`,
          true,
        );
      }

      if (response.status >= 400) {
        throw new SecureAudioDownloadError(
          `Provider HTTP ${response.status}`,
          `HTTP_${response.status}`,
          false,
        );
      }

      if (!response.ok || !response.body) {
        throw new SecureAudioDownloadError("Empty provider response", "EMPTY_BODY", true);
      }

      const contentType = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";

      assertContentTypeAllowed(contentType);

      const contentLength = Number(response.headers.get("content-length") ?? NaN);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new SecureAudioDownloadError("Content-Length exceeds max", "OVERSIZE", false);
      }

      const buffer = await readBodyLimited(response, maxBytes);
      assertAudioMagic(buffer, contentType);

      return {
        buffer,
        contentType: contentType || "audio/mpeg",
        finalHost: parsed.hostname,
        bytes: buffer.length,
      };
    } catch (error) {
      if (error instanceof SecureAudioDownloadError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new SecureAudioDownloadError("Download timed out", "TIMEOUT", true);
      }

      const message = error instanceof Error ? error.message : "download failed";
      const retryable =
        /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket/i.test(message);
      throw new SecureAudioDownloadError(message, "NETWORK", retryable);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new SecureAudioDownloadError("Too many redirects", "REDIRECT_LIMIT", false);
}

function parseHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SecureAudioDownloadError("Invalid URL", "INVALID_URL", false);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SecureAudioDownloadError("Unsupported URL scheme", "UNSUPPORTED_SCHEME", false);
  }

  return parsed;
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SecureAudioDownloadError("Blocked host", "SSRF_HOST", false);
  }

  if (isIP(host)) {
    assertPublicIp(host);
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new SecureAudioDownloadError("DNS lookup failed", "DNS_FAILED", true);
  }

  if (addresses.length === 0) {
    throw new SecureAudioDownloadError("DNS returned no addresses", "DNS_EMPTY", true);
  }

  for (const entry of addresses) {
    assertPublicIp(entry.address);
  }
}

export function assertPublicIp(ip: string): void {
  if (isPrivateOrMetadataIp(ip)) {
    throw new SecureAudioDownloadError("Blocked private/metadata IP", "SSRF_IP", false);
  }
}

export function isPrivateOrMetadataIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === undefined || b === undefined) {
      return true;
    }
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true; // CGNAT
    }
    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") {
      return true;
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true; // unique local
    }
    if (normalized.startsWith("fe80")) {
      return true; // link-local
    }
    return false;
  }

  return true;
}

export function assertContentTypeAllowed(contentType: string): void {
  if (!contentType) {
    return;
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("html") ||
    contentType.includes("xml")
  ) {
    throw new SecureAudioDownloadError(`Rejected content-type ${contentType}`, "BAD_CONTENT_TYPE", false);
  }

  const allowed =
    contentType === "audio/mpeg" ||
    contentType === "audio/mp3" ||
    contentType === "audio/wav" ||
    contentType === "audio/x-wav" ||
    contentType === "audio/wave" ||
    contentType === "application/octet-stream";

  if (!allowed) {
    throw new SecureAudioDownloadError(`Unsupported content-type ${contentType}`, "BAD_CONTENT_TYPE", false);
  }
}

export function assertAudioMagic(buffer: Buffer, contentType: string): void {
  if (buffer.length < 12) {
    throw new SecureAudioDownloadError("Audio too short", "INVALID_AUDIO", false);
  }

  const looksHtml =
    buffer.subarray(0, 64).toString("utf8").trimStart().startsWith("<") ||
    buffer.subarray(0, 1).toString("utf8") === "{";

  if (looksHtml) {
    throw new SecureAudioDownloadError("HTML/JSON body rejected", "INVALID_AUDIO", false);
  }

  const isWav =
    buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
  const isId3 = buffer.toString("ascii", 0, 3) === "ID3";
  const isMpegFrame = buffer[0] === 0xff && (((buffer[1] ?? 0) & 0xe0) === 0xe0);

  if (contentType.includes("wav")) {
    if (!isWav) {
      throw new SecureAudioDownloadError("WAV magic mismatch", "INVALID_AUDIO", false);
    }
    return;
  }

  if (!isWav && !isId3 && !isMpegFrame) {
    throw new SecureAudioDownloadError("Unrecognized audio magic", "INVALID_AUDIO", false);
  }
}

async function readBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body!.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SecureAudioDownloadError("Body exceeds max bytes", "OVERSIZE", false);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks, total);
}

import { createHash } from "node:crypto";
import type { GenerateSongInput } from "@ai-music/ai-providers";
import {
  getMurekaGenerationOptions,
  getSunoGenerationOptions,
  isInstrumentalMode,
} from "@ai-music/ai-providers";
import { BadRequestError } from "../../common/errors.js";

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const UUID_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Bump when the canonical shape or normalization rules change so that hashes
 * from an older code version never collide with the new semantics.
 * v3 adds provider / model / n / voiceProfileId for multi-provider staging.
 * v4 drops raw vocalId from the canonical hash (voiceProfileId is enough; never log vocal_id).
 */
export const CANONICAL_REQUEST_VERSION = 4;

export interface MusicGenerateCanonicalRequest {
  version: number;
  provider: string;
  model: string | null;
  requestedSongCount: number | null;
  prompt: string;
  style: string | null;
  title: string | null;
  instrumental: boolean;
  customMode: boolean;
  durationSec: number | null;
  referenceAudioUrl: string | null;
  vocalGender: "m" | "f" | null;
  voiceSampleId: string | null;
  voiceProfileId: string | null;
  vocalId: string | null;
  lyricsLanguage: string;
  operationVersion: "v1";
}

export function parseOptionalIdempotencyKey(value: unknown): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return undefined;
  }

  const key = rawValue.trim();

  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !UUID_KEY_PATTERN.test(key)) {
    throw new BadRequestError("Invalid Idempotency-Key", "INVALID_IDEMPOTENCY_KEY");
  }

  return key;
}

export function buildCanonicalMusicGenerateRequest(
  input: GenerateSongInput,
  options: { voiceSampleId?: string; voiceProfileId?: string } = {},
): MusicGenerateCanonicalRequest {
  const providerId = input.providerOptions?.providerId ?? "sunoapi";
  const suno = getSunoGenerationOptions(input) ?? {};
  const mureka = getMurekaGenerationOptions(input) ?? {};

  return {
    version: CANONICAL_REQUEST_VERSION,
    provider: providerId,
    model: mureka.model ?? null,
    requestedSongCount: mureka.n ?? null,
    prompt: input.prompt.trim(),
    style: (mureka.musicPrompt ?? input.style)?.trim() || null,
    title: input.title?.trim() || null,
    instrumental: isInstrumentalMode(input),
    customMode: suno.customMode ?? false,
    durationSec: input.durationSec && input.durationSec > 0 ? input.durationSec : null,
    referenceAudioUrl: suno.referenceAudioUrl?.trim() || null,
    vocalGender: suno.vocalGender ?? null,
    voiceSampleId: options.voiceSampleId?.trim() || null,
    voiceProfileId:
      options.voiceProfileId?.trim() || mureka.voiceProfileId?.trim() || null,
    // Never put provider vocal_id into the hash payload (privacy + client DTO parity).
    vocalId: null,
    lyricsLanguage: input.lyricsLanguage?.trim() || "auto",
    operationVersion: "v1",
  };
}

export function hashCanonicalRequest(value: MusicGenerateCanonicalRequest): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const items = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${items.join(",")}}`;
}

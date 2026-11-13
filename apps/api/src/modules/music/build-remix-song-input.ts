import type { GenerateSongInput } from "@ai-music/ai-providers";
import {
  getAudioengineGenerationOptions,
  getLegacyengineGenerationOptions,
  withLegacyengineGenerationOptions,
} from "@ai-music/ai-providers";
import type { LyricsLanguage } from "@ai-music/shared";

/**
 * AI Remix v1: reference-audio Legacyengine creation-like input only.
 * No personaId, vocalId, or Personal AI Voice injection.
 */
export function buildRemixSongInput(params: {
  prompt: string;
  styleTag: string;
  title: string;
  durationSec: number;
  lyricsLanguage: LyricsLanguage;
  referenceAudioUrl: string;
}): GenerateSongInput {
  return withLegacyengineGenerationOptions(
    {
      prompt: params.prompt,
      style: params.styleTag,
      title: params.title,
      mode: "song",
      durationSec: params.durationSec,
      lyricsLanguage: params.lyricsLanguage,
    },
    {
      customMode: true,
      referenceAudioUrl: params.referenceAudioUrl,
    },
  );
}

export function remixSongInputHasPersona(input: GenerateSongInput): boolean {
  return Boolean(getLegacyengineGenerationOptions(input)?.personaId?.trim());
}

export function remixSongInputHasVocalId(input: GenerateSongInput): boolean {
  return Boolean(getAudioengineGenerationOptions(input)?.vocalId?.trim());
}

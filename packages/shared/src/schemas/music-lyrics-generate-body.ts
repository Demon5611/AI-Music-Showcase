import { z } from "zod";
import { lyricsLanguageSchema } from "../lyrics-language/lyrics-language.js";

/**
 * HTTP body for POST /api/music/lyrics.
 * `lyricsLanguage` defaults to auto after normalize; `multi` is not in the schema.
 */
export const musicLyricsGenerateBodySchema = z
  .object({
    prompt: z.string().min(1),
    durationSec: z.number().positive().optional(),
    lyricsLanguage: lyricsLanguageSchema.optional(),
    uiLocale: z.string().min(2).max(16).optional(),
  })
  .strict();

export type MusicLyricsGenerateBody = z.infer<typeof musicLyricsGenerateBodySchema>;

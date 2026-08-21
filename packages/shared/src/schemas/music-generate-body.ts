import { z } from "zod";
import { lyricsLanguageSchema } from "../lyrics-language/lyrics-language.js";

export const sunoGenerationOptionsSchema = z
  .object({
    customMode: z.boolean().optional(),
    referenceAudioUrl: z.string().min(1).optional(),
    vocalGender: z.enum(["m", "f"]).optional(),
    personaId: z.string().min(1).optional(),
    personaModel: z.enum(["voice_persona", "style_persona"]).optional(),
  })
  .strict();

export const murekaGenerationOptionsSchema = z
  .object({
    vocalId: z.string().min(1).optional(),
    voiceProfileId: z.string().min(1).optional(),
    musicPrompt: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    n: z.number().int().positive().optional(),
  })
  .strict();

export const musicBriefSchema = z
  .object({
    genre: z.string().optional(),
    mood: z.string().optional(),
    tempo: z.string().optional(),
    instruments: z.array(z.string()).optional(),
    arrangement: z.string().optional(),
    vocalPresentation: z.string().optional(),
    vocalRange: z.string().optional(),
    chorusIntensity: z.string().optional(),
    additionalInstructions: z.string().optional(),
  })
  .strict();

export const providerGenerationOptionsSchema = z.discriminatedUnion("providerId", [
  z
    .object({
      providerId: z.literal("sunoapi"),
      options: sunoGenerationOptionsSchema.default({}),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("mureka"),
      options: murekaGenerationOptionsSchema.default({}),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("mock"),
      options: z.object({}).strict().optional(),
    })
    .strict(),
]);

/**
 * HTTP body for POST /api/music/generate.
 * Accepts legacy flat Suno fields and/or typed providerOptions.
 * `lyricsLanguage` is metadata only for customMode (no prompt/style injection).
 */
export const musicGenerateBodySchema = z
  .object({
    prompt: z.string().min(1),
    style: z.string().optional(),
    title: z.string().optional(),
    durationSec: z.number().positive().optional(),
    mode: z.enum(["song", "instrumental"]).optional(),
    instrumental: z.boolean().optional(),
    customMode: z.boolean().optional(),
    referenceAudioUrl: z.string().min(1).optional(),
    vocalGender: z.enum(["m", "f"]).optional(),
    voiceSampleId: z.string().min(1).optional(),
    voiceProfileId: z.string().min(1).optional(),
    usePersonalVoice: z.boolean().optional(),
    musicBrief: musicBriefSchema.optional(),
    lyricsLanguage: lyricsLanguageSchema.optional(),
    providerOptions: providerGenerationOptionsSchema.optional(),
  })
  .strict();

export type MusicGenerateBody = z.infer<typeof musicGenerateBodySchema>;
export type MusicBriefBody = z.infer<typeof musicBriefSchema>;

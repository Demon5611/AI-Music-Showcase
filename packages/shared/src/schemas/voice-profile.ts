import { z } from "zod";

export const createAudioengineVoiceProfileSchema = z
  .object({
    voiceSampleId: z.string().trim().min(1),
    consentConfirmed: z.literal(true),
  })
  .strict();

export type CreateAudioengineVoiceProfileBody = z.infer<
  typeof createAudioengineVoiceProfileSchema
>;

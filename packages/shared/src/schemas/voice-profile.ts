import { z } from "zod";

export const createMurekaVoiceProfileSchema = z
  .object({
    voiceSampleId: z.string().trim().min(1),
    consentConfirmed: z.literal(true),
  })
  .strict();

export type CreateMurekaVoiceProfileBody = z.infer<
  typeof createMurekaVoiceProfileSchema
>;

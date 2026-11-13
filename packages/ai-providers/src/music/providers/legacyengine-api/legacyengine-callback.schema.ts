import { z } from "zod";

/**
 * Vendor-private Legacyengine webhook shape. Do not re-export from music/index.ts.
 */
const legacyengineCallbackTrackSchema = z
  .object({
    id: z.string(),
    audio_url: z.string().optional(),
    audioUrl: z.string().optional(),
    stream_audio_url: z.string().optional(),
    streamAudioUrl: z.string().optional(),
    image_url: z.string().optional(),
    imageUrl: z.string().optional(),
    prompt: z.string().optional(),
    title: z.string().optional(),
    tags: z.string().optional(),
    duration: z.number().optional(),
  })
  .passthrough();

export const legacyengineMusicCallbackSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z
    .object({
      // Accept unknown vendor event names; classifier ignores unmapped values.
      callbackType: z.string().optional(),
      task_id: z.string().optional(),
      taskId: z.string().optional(),
      data: z.array(legacyengineCallbackTrackSchema).nullable().optional(),
    })
    .passthrough()
    .optional(),
});

export type LegacyengineMusicCallbackPayload = z.infer<typeof legacyengineMusicCallbackSchema>;

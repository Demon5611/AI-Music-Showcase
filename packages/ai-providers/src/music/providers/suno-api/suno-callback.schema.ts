import { z } from "zod";

/**
 * Vendor-private Suno webhook shape. Do not re-export from music/index.ts.
 */
const sunoCallbackTrackSchema = z
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

export const sunoMusicCallbackSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z
    .object({
      // Accept unknown vendor event names; classifier ignores unmapped values.
      callbackType: z.string().optional(),
      task_id: z.string().optional(),
      taskId: z.string().optional(),
      data: z.array(sunoCallbackTrackSchema).nullable().optional(),
    })
    .passthrough()
    .optional(),
});

export type SunoMusicCallbackPayload = z.infer<typeof sunoMusicCallbackSchema>;

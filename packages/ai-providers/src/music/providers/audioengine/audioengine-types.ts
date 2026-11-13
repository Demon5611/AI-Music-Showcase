import { z } from "zod";

export const AUDIOENGINE_PROVIDER_ID = "audioengine" as const;

export type AudioengineErrorKind =
  | "validation"
  | "authentication"
  | "permission"
  | "insufficient_balance"
  | "rate_limit"
  | "capacity"
  | "server"
  | "timeout"
  | "network"
  | "configuration"
  | "unknown";

/**
 * Official docs leave the 200 body as a generic object; live responses may use
 * `vocal_id`, `vocalId`, or `id` (sometimes nested under `data`).
 */
export function resolveAudioengineVocalId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const root = raw as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;

  for (const candidate of [
    root.vocal_id,
    root.vocalId,
    root.id,
    nested?.vocal_id,
    nested?.vocalId,
    nested?.id,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export type AudioengineVocalCloneResponse = { vocal_id: string };

/** Loose schema — `resolveAudioengineVocalId` accepts several official field shapes. */
export const audioengineVocalCloneResponseSchema = z
  .object({
    vocal_id: z.string().min(1).optional(),
    vocalId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    data: z
      .object({
        vocal_id: z.string().min(1).optional(),
        vocalId: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .transform((raw, ctx): AudioengineVocalCloneResponse => {
    const vocalId = resolveAudioengineVocalId(raw);
    if (!vocalId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audioengine vocal clone response missing vocal id",
      });
      return z.NEVER;
    }
    return { vocal_id: vocalId };
  });

export const audioengineGenerateSongRequestSchema = z.object({
  lyrics: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  /** AI Music always sends 1; Audioengine API default without `n` is 2. */
  n: z.literal(1),
  vocal_id: z.string().min(1).optional(),
});

export type AudioengineGenerateSongRequest = z.infer<typeof audioengineGenerateSongRequestSchema>;

export const audioengineGenerateSongResponseSchema = z.object({
  id: z.string().min(1).optional(),
  task_id: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
}).passthrough();

export type AudioengineGenerateSongResponse = z.infer<typeof audioengineGenerateSongResponseSchema>;

export function resolveAudioengineTaskId(raw: AudioengineGenerateSongResponse): string | null {
  const candidate = raw.task_id ?? raw.taskId ?? raw.id;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

const audioengineTimedLyricLineSchema = z
  .object({
    start: z.number().optional(),
    end: z.number().optional(),
    text: z.string().optional(),
    start_ms: z.number().optional(),
    end_ms: z.number().optional(),
  })
  .passthrough();

export const audioengineChoiceSchema = z
  .object({
    id: z.string().optional(),
    index: z.number().optional(),
    url: z.string().url().optional(),
    mp3_url: z.string().url().optional(),
    audio_url: z.string().url().optional(),
    wav_url: z.string().url().optional(),
    flac_url: z.string().url().optional(),
    duration: z.number().optional(),
    duration_sec: z.number().optional(),
    title: z.string().optional(),
    lyrics: z.string().optional(),
    lyrics_sections: z.unknown().optional(),
    timed_lyrics: z.array(audioengineTimedLyricLineSchema).optional(),
  })
  .passthrough();

export type AudioengineChoice = z.infer<typeof audioengineChoiceSchema>;

export const audioengineQuerySongResponseSchema = z
  .object({
    id: z.string().optional(),
    task_id: z.string().optional(),
    status: z.string(),
    choices: z.array(audioengineChoiceSchema).optional(),
    data: z
      .object({
        choices: z.array(audioengineChoiceSchema).optional(),
        status: z.string().optional(),
      })
      .passthrough()
      .optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    failed_reason: z.string().optional(),
  })
  .passthrough();

export type AudioengineQuerySongResponse = z.infer<typeof audioengineQuerySongResponseSchema>;

export const audioengineBillingResponseSchema = z
  .object({
    balance: z.number().optional(),
    currency: z.string().optional(),
  })
  .passthrough();

export type AudioengineBillingResponse = z.infer<typeof audioengineBillingResponseSchema>;

/** Official Audioengine song query terminal statuses. */
export const AUDIOENGINE_TERMINAL_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "timeouted",
  "timedout",
  "timeout",
] as const;

export type AudioengineTerminalStatus = (typeof AUDIOENGINE_TERMINAL_STATUSES)[number];

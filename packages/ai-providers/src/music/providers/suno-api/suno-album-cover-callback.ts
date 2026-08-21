import { z } from "zod";

/**
 * Suno /suno/cover/generate webhook shape (distinct from music generate callbacks).
 * @see https://docs.sunoapi.org/suno-api/cover-suno-callbacks
 */
const sunoAlbumCoverCallbackSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z
    .object({
      taskId: z.string().optional(),
      task_id: z.string().optional(),
      images: z.array(z.string()).nullable().optional(),
    })
    .passthrough()
    .optional(),
});

export type NormalizedSunoAlbumCoverCallback =
  | { kind: "completed"; coverTaskId: string; images: string[] }
  | { kind: "failed"; coverTaskId: string; message: string };

/**
 * Returns null when payload is not an album-cover callback (e.g. music generate).
 */
export function tryNormalizeSunoAlbumCoverCallback(
  rawPayload: unknown,
): NormalizedSunoAlbumCoverCallback | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const data = root.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const dataRecord = data as Record<string, unknown>;

  // Music generate callbacks use callbackType + track array in data.data.
  if (typeof dataRecord.callbackType === "string") {
    return null;
  }

  if (!("images" in dataRecord)) {
    return null;
  }

  const parsed = sunoAlbumCoverCallbackSchema.safeParse(rawPayload);
  if (!parsed.success || !parsed.data.data) {
    return null;
  }

  const coverTaskId =
    parsed.data.data.taskId?.trim() || parsed.data.data.task_id?.trim() || "";
  if (!coverTaskId) {
    return null;
  }

  const images = (parsed.data.data.images ?? []).filter(
    (url) => typeof url === "string" && url.trim().length > 0,
  );

  if (parsed.data.code === 200 && images.length > 0) {
    return { kind: "completed", coverTaskId, images };
  }

  return {
    kind: "failed",
    coverTaskId,
    message: parsed.data.msg?.trim() || "Album cover generation failed",
  };
}

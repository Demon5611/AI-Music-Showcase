import { z } from "zod";

/**
 * Client never sends a raw R2 key. Server resolves the storage key from an owned entity.
 * Write mode is intentionally unsupported — uploads go through authenticated API routes.
 */
export const createSignedReadUrlSchema = z.discriminatedUnion("resourceType", [
  z.object({
    resourceType: z.literal("voice_sample"),
    resourceId: z.string().min(1),
    mode: z.literal("read").default("read"),
  }),
  z.object({
    resourceType: z.literal("music_track"),
    resourceId: z.string().min(1),
    mode: z.literal("read").default("read"),
  }),
  z.object({
    resourceType: z.literal("song_audio"),
    resourceId: z.string().min(1),
    mode: z.literal("read").default("read"),
  }),
  z.object({
    resourceType: z.literal("song_stem"),
    resourceId: z.string().min(1),
    stemType: z.string().min(1),
    mode: z.literal("read").default("read"),
  }),
  z.object({
    resourceType: z.literal("song_render"),
    resourceId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    mode: z.literal("read").default("read"),
  }),
  z.object({
    resourceType: z.literal("song_wav"),
    resourceId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    mode: z.literal("read").default("read"),
  }),
]);

export type CreateSignedReadUrlInput = z.infer<typeof createSignedReadUrlSchema>;

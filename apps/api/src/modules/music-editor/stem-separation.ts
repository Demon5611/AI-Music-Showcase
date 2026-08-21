import type { Song } from "@ai-music/db";
import { prisma } from "@ai-music/db";
import { BadRequestError } from "../../common/errors.js";
import { buildSongStemKey, getStorageService } from "../storage/storage.service.js";

export const STEM_SEPARATION_TIMEOUT_MS = 5 * 60 * 1000;

export function isStemSeparationTimedOut(song: Song): boolean {
  if (song.status !== "separating_stems") {
    return false;
  }

  return Date.now() - song.updatedAt.getTime() > STEM_SEPARATION_TIMEOUT_MS;
}

export async function persistOriginalAudioAsStems(
  userId: string,
  song: Song,
  notice: string,
) {
  if (!song.audioStorageKey) {
    throw new BadRequestError("Original audio is not available for editor fallback");
  }

  const storage = getStorageService();
  const buffer = await storage.get(song.audioStorageKey);

  for (const type of ["vocal", "instrumental"] as const) {
    const key = buildSongStemKey(userId, song.id, type);
    await storage.putObject({
      key,
      body: buffer,
      contentType: "audio/mpeg",
      kind: "song_stem",
      userId,
      entityType: "song",
      entityId: song.id,
      visibility: "private",
    });

    await prisma.songStem.upsert({
      where: {
        songId_type: {
          songId: song.id,
          type,
        },
      },
      create: {
        songId: song.id,
        type,
        audioStorageKey: key,
        durationMs: song.durationMs,
      },
      update: {
        audioStorageKey: key,
        durationMs: song.durationMs,
      },
    });
  }

  return prisma.song.update({
    where: { id: song.id },
    data: {
      status: "ready",
      stemSeparationNotice: notice,
    },
  });
}

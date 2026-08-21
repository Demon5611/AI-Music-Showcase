import { prisma } from "@ai-music/db";
import type { Prisma } from "@ai-music/db";

export type MusicRecordStatus = "pending" | "processing" | "completed" | "failed";

const ALLOWED_TRANSITIONS: Record<MusicRecordStatus, readonly MusicRecordStatus[]> = {
  pending: ["pending", "processing", "completed", "failed"],
  processing: ["processing", "completed", "failed"],
  completed: ["completed"],
  failed: ["failed"],
};

export type TransitionResult = "applied" | "noop" | "conflict";

function isMusicRecordStatus(value: string): value is MusicRecordStatus {
  return value === "pending" || value === "processing" || value === "completed" || value === "failed";
}

/**
 * Atomic status transition. Terminal states only accept idempotent self-updates.
 */
export async function applyMusicGenerationTransition(input: {
  id: string;
  toStatus: MusicRecordStatus;
  data?: {
    rawStatus?: string | null;
    errorMessage?: string | null;
    lyricsResult?: Prisma.InputJsonValue;
  };
}): Promise<TransitionResult> {
  const current = await prisma.musicGeneration.findUnique({
    where: { id: input.id },
    select: { status: true },
  });

  if (!current || !isMusicRecordStatus(current.status)) {
    return "conflict";
  }

  const allowed = ALLOWED_TRANSITIONS[current.status];

  if (!allowed.includes(input.toStatus)) {
    return "conflict";
  }

  if (current.status === input.toStatus) {
    if (input.data && Object.values(input.data).some((value) => value !== undefined)) {
      await prisma.musicGeneration.update({
        where: { id: input.id },
        data: {
          rawStatus: input.data.rawStatus,
          errorMessage: input.data.errorMessage,
          lyricsResult: input.data.lyricsResult,
        },
      });
    }

    return "noop";
  }

  const fromStatuses: MusicRecordStatus[] =
    input.toStatus === "completed" || input.toStatus === "failed"
      ? ["pending", "processing"]
      : input.toStatus === "processing"
        ? ["pending"]
        : [current.status];

  const updated = await prisma.musicGeneration.updateMany({
    where: {
      id: input.id,
      status: { in: fromStatuses },
    },
    data: {
      status: input.toStatus,
      rawStatus: input.data?.rawStatus,
      errorMessage: input.data?.errorMessage,
      lyricsResult: input.data?.lyricsResult,
    },
  });

  if (updated.count === 1) {
    return "applied";
  }

  const after = await prisma.musicGeneration.findUnique({
    where: { id: input.id },
    select: { status: true },
  });

  if (after?.status === input.toStatus) {
    return "noop";
  }

  return "conflict";
}

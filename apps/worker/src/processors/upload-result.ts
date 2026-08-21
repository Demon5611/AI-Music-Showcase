import { prisma } from "@ai-music/db";
import { buildTrackAudioKey } from "@ai-music/shared";
import { randomBytes } from "node:crypto";
import type { GenerationJob } from "@ai-music/db";
import { writeStorageObject } from "../common/storage.js";

function buildShareSlug(): string {
  return randomBytes(6).toString("hex");
}

function buildTrackTitle(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

export async function uploadGenerationResult(
  job: GenerationJob,
  audioBuffer: Buffer,
): Promise<string> {
  const track = await prisma.track.create({
    data: {
      userId: job.userId,
      title: buildTrackTitle(job.prompt),
      prompt: job.prompt,
      style: job.style,
      durationSec: job.durationSec,
      audioR2Key: "pending",
      shareSlug: buildShareSlug(),
    },
  });

  const audioKey = buildTrackAudioKey(job.userId, track.id, "mp3");

  try {
    await writeStorageObject(audioKey, audioBuffer, "audio/mpeg", {
      kind: "track_audio",
      userId: job.userId,
      entityType: "track",
      entityId: track.id,
      visibility: "private",
    });

    await prisma.track.update({
      where: { id: track.id },
      data: { audioR2Key: audioKey },
    });

    await prisma.generationJob.update({
      where: { id: job.id },
      data: { trackId: track.id },
    });

    return track.id;
  } catch (error) {
    await prisma.track.delete({ where: { id: track.id } });
    throw error;
  }
}

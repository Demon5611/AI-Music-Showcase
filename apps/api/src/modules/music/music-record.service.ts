import type {
  GenerationStatusResult,
  GenerateSongInput,
  PersistedSongInput,
} from "@ai-music/ai-providers";
import {
  getSunoGenerationOptions,
  isInstrumentalMode,
  toPersistedSongInput,
} from "@ai-music/ai-providers";
import { prisma, Prisma } from "@ai-music/db";
import {
  musicAudioNotReadyTotal,
  recordGenerationTransition,
  type AudioNotReadyReason,
} from "@ai-music/observability";
import {
  logLoadControl,
  MUSIC_TRACK_STORAGE_MISSING_CODE,
  type MusicGenerationType,
} from "@ai-music/shared";
import { isStorageNotFoundError } from "@ai-music/storage";
import { AudioNotReadyError, NotFoundError } from "../../common/errors.js";
import { refundOriginalSpend } from "../credits/service.js";
import { getStorageService } from "../storage/storage.service.js";
import { toMusicGenerationRecordDto } from "./music-record.mapper.js";
import { resolveMusicGenerationErrorDisplay } from "./music-provider-error-display.js";
import {
  getConfiguredStorageBucket,
  loadStorageBucketsByKey,
} from "./music-track-storage-bucket.js";
import { upsertTracksAndEnqueuePersistence } from "./music-track-metadata.js";

interface CreateRecordInput {
  userId: string;
  type: MusicGenerationType;
  providerTaskId: string;
  prompt: string;
  style?: string;
  title?: string;
  customMode?: boolean;
  instrumental?: boolean;
  /** Persisted vendor for this generation — required for affinity on later ops. */
  provider?: string;
  /** Links spend/refund for lyrics (and other flows) without schema migration. */
  clientRequestId?: string;
  /** Flat persistence shape (not neutral GenerateSongInput). */
  providerRequestJson?: PersistedSongInput;
}

export function resolveApiBaseUrl(): string {
  const port = process.env.API_PORT ?? "3001";
  return process.env.API_PUBLIC_URL ?? `http://localhost:${port}`;
}

export async function createMusicGenerationRecord(input: CreateRecordInput) {
  return prisma.musicGeneration.create({
    data: {
      userId: input.userId,
      type: input.type,
      provider: input.provider ?? "sunoapi",
      providerTaskId: input.providerTaskId,
      clientRequestId: input.clientRequestId ?? null,
      prompt: input.prompt,
      style: input.style ?? null,
      title: input.title ?? null,
      customMode: input.customMode ?? false,
      instrumental: input.instrumental ?? false,
      providerRequestJson: input.providerRequestJson
        ? (input.providerRequestJson as unknown as Prisma.InputJsonValue)
        : undefined,
      status: "pending",
    },
    include: { tracks: true },
  });
}

export async function listMusicGenerationHistory(userId: string, limit: number) {
  const records = await prisma.musicGeneration.findMany({
    where: { userId },
    include: { tracks: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const apiBaseUrl = resolveApiBaseUrl();
  const storageBucketsByKey = await loadStorageBucketsByKey(
    records.flatMap((record) => record.tracks.map((track) => track.audioStorageKey)),
  );
  const playback = {
    storageBucketsByKey,
    configuredStorageBucket: getConfiguredStorageBucket(),
  };

  return records.map((record) => toMusicGenerationRecordDto(record, apiBaseUrl, playback));
}

async function markTrackStorageMissing(trackId: string): Promise<void> {
  await prisma.musicGenerationTrack
    .update({
      where: { id: trackId },
      data: {
        persistenceErrorCode: MUSIC_TRACK_STORAGE_MISSING_CODE,
        persistenceErrorMessage: "Track audio file is missing from configured storage",
      },
    })
    .catch(() => undefined);
}

export async function syncMusicGenerationRecord(
  providerTaskId: string,
  status: GenerationStatusResult,
  userId?: string,
) {
  const record = await prisma.musicGeneration.findUnique({
    where: { providerTaskId },
    include: { tracks: true },
  });

  if (!record) {
    return null;
  }

  if (userId && record.userId !== userId) {
    throw new NotFoundError("Music generation not found");
  }

  if (
    status.status !== "pending" &&
    status.status !== "processing" &&
    status.status !== "completed" &&
    status.status !== "failed"
  ) {
    return record;
  }

  const toStatus = status.status;
  const errorDisplay = resolveMusicGenerationErrorDisplay(status.rawStatus, status.errorMessage);
  const lyricsResult = status.lyrics
    ? (status.lyrics as unknown as Prisma.InputJsonValue)
    : undefined;

  const { applyMusicGenerationTransition } = await import("./music-generation-transition.js");
  const { shouldRefundGeneration } = await import("./music-generation-refund.js");

  const transition = await applyMusicGenerationTransition({
    id: record.id,
    toStatus,
    data: {
      rawStatus: errorDisplay.rawStatus,
      errorMessage: errorDisplay.errorMessage,
      lyricsResult,
    },
  });

  if (transition === "applied" && (toStatus === "completed" || toStatus === "failed")) {
    recordGenerationTransition(toStatus);
  }

  if (toStatus === "failed") {
    const latest = await prisma.musicGeneration.findUnique({
      where: { id: record.id },
      select: { status: true, submissionState: true, type: true },
    });

    const allowRefund =
      latest &&
      (await shouldRefundGeneration({
        recordId: record.id,
        userId: record.userId,
        type: latest.type,
        status: latest.status,
        submissionState: latest.submissionState,
        nextStatus: "failed",
      }));

    // Duplicate failed transition still attempts refund (partial recovery).
    if (
      allowRefund ||
      (latest?.status === "failed" && latest.submissionState !== "submit_unknown")
    ) {
      const spend = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: `generation:${record.id}:spend` },
      });

      if (spend && latest?.status !== "completed") {
        await refundOriginalSpend({
          userId: record.userId,
          spendIdempotencyKey: `generation:${record.id}:spend`,
          refundIdempotencyKey: `generation:${record.id}:refund`,
          reason: `music_generate:${record.id}:sync_failed`,
          relatedEntityType: "music_generation",
          relatedEntityId: record.id,
        }).catch(() => undefined);
      }
    }
  }

  if (status.tracks?.length && (toStatus === "processing" || toStatus === "completed")) {
    await upsertTracksAndEnqueuePersistence(record, status.tracks);
  }

  return prisma.musicGeneration.findUnique({
    where: { id: record.id },
    include: { tracks: true },
  });
}

function requireStoredAudioKey(track: {
  id: string;
  audioStorageKey: string | null;
  persistenceState: string;
}): string {
  if (track.audioStorageKey) {
    return track.audioStorageKey;
  }

  if (track.persistenceState === "failed") {
    throwAudioNotReady("persist_failed", track.id, "AUDIO_PERSIST_FAILED");
  }

  throwAudioNotReady("missing_key", track.id, "AUDIO_NOT_READY");
}

function throwAudioNotReady(
  reason: AudioNotReadyReason,
  trackId: string,
  code: "AUDIO_NOT_READY" | "AUDIO_PERSIST_FAILED",
): never {
  musicAudioNotReadyTotal.inc({ reason });
  logLoadControl("audio_not_ready", { reason, trackId, count: 1 });

  if (code === "AUDIO_PERSIST_FAILED") {
    throw new AudioNotReadyError("Track audio persistence failed", code);
  }

  if (reason === "storage_missing") {
    throw new AudioNotReadyError("Track audio file is missing from storage", code);
  }

  throw new AudioNotReadyError();
}

export async function getMusicGenerationTrackAudioById(
  trackId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: trackId },
  });

  if (!track) {
    throw new NotFoundError("Track audio not found");
  }

  const key = requireStoredAudioKey(track);

  if (track.persistenceErrorCode === MUSIC_TRACK_STORAGE_MISSING_CODE) {
    throwAudioNotReady("storage_missing", track.id, "AUDIO_NOT_READY");
  }

  const configuredBucket = getConfiguredStorageBucket();
  if (configuredBucket) {
    const buckets = await loadStorageBucketsByKey([key]);
    const objectBucket = buckets.get(key);

    if (objectBucket && objectBucket !== configuredBucket) {
      await markTrackStorageMissing(track.id);
      throwAudioNotReady("storage_missing", track.id, "AUDIO_NOT_READY");
    }
  }

  try {
    const buffer = await getStorageService().getObject(key);
    return { buffer, contentType: "audio/mpeg" };
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      await markTrackStorageMissing(track.id);
      throwAudioNotReady("storage_missing", track.id, "AUDIO_NOT_READY");
    }

    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT" || code === "NoSuchKey" || code === "NotFound") {
      await markTrackStorageMissing(track.id);
      throwAudioNotReady("storage_missing", track.id, "AUDIO_NOT_READY");
    }
    throw error;
  }
}

export async function getMusicGenerationTrackAudio(
  userId: string,
  trackId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: trackId },
    include: { musicGeneration: true },
  });

  if (!track || track.musicGeneration.userId !== userId) {
    throw new NotFoundError("Track not found");
  }

  requireStoredAudioKey(track);

  return getMusicGenerationTrackAudioById(trackId);
}

export function buildSongRecordInput(
  userId: string,
  input: GenerateSongInput,
  providerTaskId: string,
): CreateRecordInput {
  const suno = getSunoGenerationOptions(input) ?? {};

  return {
    userId,
    type: "song",
    providerTaskId,
    prompt: input.prompt,
    style: input.style,
    title: input.title,
    customMode: suno.customMode ?? false,
    instrumental: isInstrumentalMode(input),
    providerRequestJson: toPersistedSongInput(input),
  };
}

export async function deleteMusicGenerationTrack(userId: string, trackId: string) {
  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: trackId },
    include: { musicGeneration: true },
  });

  if (!track || track.musicGeneration.userId !== userId) {
    throw new NotFoundError("Track not found");
  }

  if (track.audioStorageKey) {
    await getStorageService().delete(track.audioStorageKey);
  }

  await prisma.musicGenerationTrack.delete({
    where: { id: trackId },
  });

  return { deleted: true };
}

export async function deleteMusicGenerations(userId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return { deletedCount: 0 };
  }

  const records = await prisma.musicGeneration.findMany({
    where: { userId, id: { in: uniqueIds } },
    include: { tracks: true },
  });

  if (records.length === 0) {
    throw new NotFoundError("Music generation not found");
  }

  const storage = getStorageService();

  await Promise.all(
    records.flatMap((record) =>
      record.tracks
        .filter((track) => Boolean(track.audioStorageKey))
        .map((track) => storage.delete(track.audioStorageKey!)),
    ),
  );

  await prisma.musicGeneration.deleteMany({
    where: {
      userId,
      id: { in: records.map((record) => record.id) },
    },
  });

  return { deletedCount: records.length };
}

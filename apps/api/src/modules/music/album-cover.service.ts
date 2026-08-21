import { createMusicService } from "@ai-music/ai-providers";
import { prisma, Prisma } from "@ai-music/db";
import {
  isAlbumCoverGenerationReady,
  isZeroCostOperation,
  OPERATION_COST_UNITS,
  parseAlbumCoverImagesJson,
  type AlbumCoverResponseDto,
} from "@ai-music/shared";
import { BadRequestError, NotFoundError, ServiceUnavailableError } from "../../common/errors.js";
import { refundOriginalSpend, spendCredits } from "../credits/service.js";
import { assertFeature } from "../billing/entitlements.service.js";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";

const musicService = createMusicService();

const COVER_POLL_INTERVAL_MS = 3_000;
const COVER_POLL_MAX_ATTEMPTS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveDefaultImageUrl(
  record: Prisma.MusicGenerationGetPayload<{ include: { tracks: true } }>,
): string | null {
  const selected = record.selectedAlbumCoverUrl?.trim();

  if (selected) {
    return selected;
  }

  return record.tracks.find((track) => track.imageSourceUrl)?.imageSourceUrl ?? null;
}

function toAlbumCoverDto(
  record: Prisma.MusicGenerationGetPayload<{ include: { tracks: true } }>,
  cached: boolean,
): AlbumCoverResponseDto {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: record.provider,
    providerTaskId: record.providerTaskId,
  });

  return {
    defaultImageUrl: resolveDefaultImageUrl(record),
    images: parseAlbumCoverImagesJson(record.albumCoverImagesJson) ?? [],
    selectedImageUrl: record.selectedAlbumCoverUrl,
    cached,
    variantsAvailable: strategy.kind === "suno_music_task",
  };
}

async function loadGenerationForUser(userId: string, generationId: string) {
  const record = await prisma.musicGeneration.findUnique({
    where: { id: generationId },
    include: { tracks: true },
  });

  if (!record || record.userId !== userId) {
    throw new NotFoundError("Music generation not found");
  }

  const hasReadyTracks = record.tracks.some(
    (track) =>
      Boolean(track.audioStorageKey?.trim()) || track.persistenceState === "stored",
  );

  if (
    record.type !== "song" ||
    !isAlbumCoverGenerationReady({ status: record.status, hasReadyTracks })
  ) {
    throw new BadRequestError(
      "Обложка доступна только для готовых музыкальных треков",
      "ALBUM_COVER_GENERATION_NOT_READY",
    );
  }

  return record;
}

async function pollAlbumCoverImages(coverTaskId: string): Promise<string[]> {
  for (let attempt = 0; attempt < COVER_POLL_MAX_ATTEMPTS; attempt += 1) {
    const status = await musicService.getAlbumCoverStatus(coverTaskId);

    if (status.status === "completed" && status.images.length > 0) {
      return status.images;
    }

    if (status.status === "failed") {
      throw new BadRequestError(status.errorMessage ?? "Не удалось сгенерировать обложку");
    }

    await sleep(COVER_POLL_INTERVAL_MS);
  }

  throw new ServiceUnavailableError("Генерация обложки заняла слишком много времени");
}

/**
 * Suno cover API accepts only a Suno music generation taskId.
 * Never pass Mureka (or other) providerTaskId into MusicService.generateAlbumCover.
 */
function requireSunoCoverMusicTaskId(
  record: Prisma.MusicGenerationGetPayload<{ include: { tracks: true } }>,
): string {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: record.provider,
    providerTaskId: record.providerTaskId,
  });

  if (strategy.kind !== "suno_music_task") {
    const code =
      strategy.reason === "provider_affinity_mismatch"
        ? "MUSIC_PROVIDER_AFFINITY_MISMATCH"
        : strategy.reason === "provider_affinity_unknown"
          ? "MUSIC_PROVIDER_AFFINITY_UNKNOWN"
          : "ALBUM_COVER_UNAVAILABLE_FOR_PROVIDER";
    throw new BadRequestError("Варианты обложки недоступны для этого трека", code);
  }

  return strategy.sunoMusicTaskId;
}

export async function getAlbumCoverForGeneration(
  userId: string,
  generationId: string,
): Promise<AlbumCoverResponseDto> {
  const record = await loadGenerationForUser(userId, generationId);
  const images = parseAlbumCoverImagesJson(record.albumCoverImagesJson);

  if (!images || images.length === 0) {
    throw new NotFoundError("Album cover variants are not cached for this generation");
  }

  return toAlbumCoverDto(record, true);
}

export async function fetchAlbumCoverForGeneration(
  userId: string,
  generationId: string,
): Promise<AlbumCoverResponseDto> {
  await assertFeature(userId, "albumCover");

  const record = await loadGenerationForUser(userId, generationId);
  const cachedImages = parseAlbumCoverImagesJson(record.albumCoverImagesJson);

  if (cachedImages && cachedImages.length > 0) {
    return toAlbumCoverDto(record, true);
  }

  // Fail fast before credits / provider calls: Mureka task ids must not hit Suno cover.
  const sunoMusicTaskId = requireSunoCoverMusicTaskId(record);

  const spendKey = `album_cover:${generationId}:spend`;
  const coverCostUnits = OPERATION_COST_UNITS.albumCover;
  const shouldCharge = !isZeroCostOperation(coverCostUnits);

  if (shouldCharge) {
    await spendCredits({
      userId,
      amountUnits: coverCostUnits,
      reason: "album_cover",
      idempotencyKey: spendKey,
      relatedEntityType: "music_generation",
      relatedEntityId: generationId,
    });
  }

  try {
    const freshRecord = await prisma.musicGeneration.findUnique({
      where: { id: generationId },
      include: { tracks: true },
    });

    const freshImages = freshRecord
      ? parseAlbumCoverImagesJson(freshRecord.albumCoverImagesJson)
      : null;

    if (freshImages && freshImages.length > 0) {
      if (shouldCharge) {
        await refundOriginalSpend({
          userId,
          spendIdempotencyKey: spendKey,
          refundIdempotencyKey: `album_cover:${generationId}:refund:duplicate`,
          reason: "album_cover_duplicate",
          relatedEntityType: "music_generation",
          relatedEntityId: generationId,
        }).catch(() => undefined);
      }

      return toAlbumCoverDto(freshRecord!, true);
    }

    if (!musicService.generateAlbumCover) {
      throw new BadRequestError("Генерация обложки недоступна");
    }

    let coverTaskId = record.albumCoverTaskId?.trim() || null;

    if (!coverTaskId) {
      const coverTask = await musicService.generateAlbumCover(sunoMusicTaskId);
      coverTaskId = coverTask.taskId;

      await prisma.musicGeneration.update({
        where: { id: generationId },
        data: { albumCoverTaskId: coverTaskId },
      });
    }

    const images = await pollAlbumCoverImages(coverTaskId);

    const updated = await prisma.musicGeneration.update({
      where: { id: generationId },
      data: {
        albumCoverImagesJson: images as unknown as Prisma.InputJsonValue,
        selectedAlbumCoverUrl: record.selectedAlbumCoverUrl ?? images[0] ?? null,
      },
      include: { tracks: true },
    });

    return toAlbumCoverDto(updated, false);
  } catch (error) {
    if (shouldCharge) {
      await refundOriginalSpend({
        userId,
        spendIdempotencyKey: spendKey,
        refundIdempotencyKey: `album_cover:${generationId}:refund`,
        reason: "album_cover_failed",
        relatedEntityType: "music_generation",
        relatedEntityId: generationId,
      }).catch(() => undefined);
    }

    throw error;
  }
}

export async function selectAlbumCoverForGeneration(
  userId: string,
  generationId: string,
  imageUrl: string,
): Promise<AlbumCoverResponseDto> {
  const record = await loadGenerationForUser(userId, generationId);
  const images = parseAlbumCoverImagesJson(record.albumCoverImagesJson) ?? [];
  const normalizedUrl = imageUrl.trim();

  const isAllowed =
    images.includes(normalizedUrl) ||
    record.tracks.some((track) => track.imageSourceUrl === normalizedUrl);

  if (!isAllowed) {
    throw new BadRequestError("Выбранная обложка недоступна для этого трека");
  }

  const updated = await prisma.musicGeneration.update({
    where: { id: generationId },
    data: { selectedAlbumCoverUrl: normalizedUrl },
    include: { tracks: true },
  });

  return toAlbumCoverDto(updated, true);
}

import { createMusicService, downloadUrl, type StemResult } from "@ai-music/ai-providers";
import { prisma } from "@ai-music/db";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { refundOriginalSpend, spendCreditsOnce } from "../credits/service.js";
import {
  assertFeature,
  assertProjectLimit,
} from "../billing/entitlements.service.js";
import {
  OPERATION_COST_UNITS,
  buildSeparationFailedStemNotice,
  isPlanRestrictedStemNotice,
  resolveExistingMusicAssetProvider,
} from "@ai-music/shared";
import { buildSongStemKey, getStorageService } from "../storage/storage.service.js";
import { buildDefaultRegions, type SongVersionWithOperations } from "./song-editor.mapper.js";
import {
  isStemSeparationTimedOut,
  persistOriginalAudioAsStems,
} from "./stem-separation.js";

function resolveSongProviderAffinity(input: {
  songProvider?: string | null;
  generationProvider?: string | null;
  providerTaskId?: string | null;
  providerTrackId?: string | null;
  trackId?: string;
  generationId?: string;
  songId?: string;
}) {
  const affinity = resolveExistingMusicAssetProvider({
    songProvider: input.songProvider,
    generationProvider: input.generationProvider,
    providerTaskId: input.providerTaskId,
    providerTrackId: input.providerTrackId,
  });

  if (!affinity.ok) {
    throw new BadRequestError(
      "Операция недоступна: конфликт данных провайдера трека",
      affinity.code,
    );
  }

  return affinity;
}

export async function ensureSongForTrack(userId: string, trackId: string) {
  await assertFeature(userId, "editor");

  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: trackId },
    include: { musicGeneration: true, song: true },
  });

  if (!track || track.musicGeneration.userId !== userId) {
    throw new NotFoundError("Track not found");
  }

  if (!track.audioStorageKey && !track.audioSourceUrl) {
    throw new BadRequestError("Track audio is not available yet");
  }

  if (track.song) {
    return track.song;
  }

  const projectCount = await prisma.song.count({ where: { userId } });
  await assertProjectLimit(userId, projectCount);

  const durationMs = track.durationSec ? track.durationSec * 1000 : 180_000;

  const affinity = resolveSongProviderAffinity({
    generationProvider: track.musicGeneration.provider,
    providerTaskId: track.musicGeneration.providerTaskId,
    providerTrackId: track.providerTrackId,
    trackId: track.id,
    generationId: track.musicGeneration.id,
  });

  const song = await prisma.song.create({
    data: {
      userId,
      sourceTrackId: track.id,
      provider: affinity.provider,
      providerTaskId: affinity.providerTaskId ?? track.musicGeneration.providerTaskId,
      providerTrackId: affinity.providerTrackId ?? track.providerTrackId,
      prompt: track.musicGeneration.prompt,
      title: track.title,
      status: "ready",
      audioStorageKey: track.audioStorageKey,
      durationMs,
      regions: {
        create: buildDefaultRegions(durationMs),
      },
      versions: {
        create: {
          versionNumber: 1,
          status: "draft",
        },
      },
    },
  });

  return song;
}

export async function getSongForUser(userId: string, songId: string) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: {
      sourceTrack: {
        select: {
          lyricsText: true,
          musicGeneration: { select: { id: true, provider: true } },
        },
      },
      stems: true,
      regions: true,
      versions: {
        include: { operations: { orderBy: { createdAt: "asc" } } },
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!song || song.userId !== userId) {
    throw new NotFoundError("Song not found");
  }

  return song;
}

export async function getCurrentVersion(songId: string): Promise<SongVersionWithOperations> {
  const version = await prisma.songVersion.findFirst({
    where: { songId, status: { in: ["draft", "rendering"] } },
    include: { operations: { orderBy: { createdAt: "asc" } } },
    orderBy: { versionNumber: "desc" },
  });

  if (!version) {
    throw new NotFoundError("Song version not found");
  }

  return version;
}

export async function startStemSeparation(userId: string, songId: string) {
  await kickoffStemSeparation(userId, songId);
  return tickStemSeparation(userId, songId);
}

export async function retryStemSeparation(userId: string, songId: string) {
  const song = await getSongForUser(userId, songId);

  if (song.status === "separating_stems" || song.status === "pending_stems") {
    throw new BadRequestError("Разделение уже выполняется");
  }

  if (!song.stemSeparationNotice?.trim()) {
    throw new BadRequestError("Повторное разделение доступно только после ошибки AI Music");
  }

  if (isPlanRestrictedStemNotice(song.stemSeparationNotice)) {
    throw new BadRequestError("Разделение дорожек недоступно на текущем тарифе");
  }

  const generationProvider = song.sourceTrack?.musicGeneration?.provider ?? song.provider;
  if (generationProvider !== "sunoapi") {
    throw new BadRequestError(
      "Разделение вокала и инструментала для этого трека пока недоступно",
      "STEM_SEPARATION_UNAVAILABLE",
    );
  }

  const storage = getStorageService();

  for (const stem of song.stems) {
    await storage.delete(stem.audioStorageKey).catch(() => undefined);
  }

  await prisma.songStem.deleteMany({ where: { songId } });
  await prisma.song.update({
    where: { id: songId },
    data: {
      status: "pending_stems",
      stemSeparationTaskId: null,
      stemSeparationNotice: null,
    },
  });

  await kickoffStemSeparation(userId, songId);
  return tickStemSeparation(userId, songId);
}

export async function kickoffStemSeparation(userId: string, songId: string) {
  const song = await getSongForUser(userId, songId);
  const reconciled = await reconcileStoredStems(userId, song);

  if (reconciled) {
    return reconciled;
  }

  if (song.stemSeparationTaskId) {
    if (song.status === "pending_stems") {
      await prisma.song.update({
        where: { id: song.id },
        data: { status: "separating_stems" },
      });
      return getSongForUser(userId, song.id);
    }

    return song;
  }

  await assertFeature(userId, "stemSeparation");

  // Affinity + capability before spend: Suno vocal-removal needs Suno task/audio ids.
  // generation.provider is authoritative; legacy Song.provider may be wrongly "sunoapi".
  const generationProvider = song.sourceTrack?.musicGeneration?.provider;
  const affinity = resolveSongProviderAffinity({
    generationProvider: generationProvider ?? song.provider,
    songProvider: generationProvider ? null : song.provider,
    providerTaskId: song.providerTaskId,
    providerTrackId: song.providerTrackId,
    songId: song.id,
    generationId: song.sourceTrack?.musicGeneration?.id,
  });

  if (affinity.provider !== "sunoapi" || !affinity.providerTaskId || !affinity.providerTrackId) {
    throw new BadRequestError(
      "Разделение вокала и инструментала для этого трека пока недоступно",
      "STEM_SEPARATION_UNAVAILABLE",
    );
  }

  // Claim in-flight job before spend to make double-click a no-op.
  const claimed = await prisma.song.updateMany({
    where: {
      id: song.id,
      stemSeparationTaskId: null,
      status: { in: ["ready", "pending_stems"] },
    },
    data: {
      status: "separating_stems",
      stemSeparationNotice: null,
    },
  });

  if (claimed.count === 0) {
    return getSongForUser(userId, songId);
  }

  const spendReason = `stem_separation:${song.id}`;
  const charged = await spendCreditsOnce(
    userId,
    OPERATION_COST_UNITS.stemSeparation,
    spendReason,
  );

  const musicService = createMusicService();
  const started = await musicService
    .separateStems(
      {
        providerTaskId: affinity.providerTaskId,
        providerTrackId: affinity.providerTrackId,
        separationType: "separate_vocal",
      },
      "sunoapi",
    )
    .catch(async (error) => {
      if (charged) {
        await refundStemSeparation(userId, song.id);
      }

      await prisma.song
        .update({
          where: { id: song.id },
          data: {
            status: "ready",
            stemSeparationTaskId: null,
          },
        })
        .catch(() => undefined);

      throw error;
    });

  return prisma.song.update({
    where: { id: song.id },
    data: {
      status: "separating_stems",
      stemSeparationTaskId: started.taskId,
    },
  });
}

async function reconcileStoredStems(userId: string, song: Awaited<ReturnType<typeof getSongForUser>>) {
  if (song.stems.length < 2) {
    return null;
  }

  if (song.status === "ready") {
    return song;
  }

  await prisma.song.update({
    where: { id: song.id },
    data: { status: "ready" },
  });

  return getSongForUser(userId, song.id);
}

export async function tickStemSeparation(userId: string, songId: string) {
  const song = await getSongForUser(userId, songId);
  const reconciled = await reconcileStoredStems(userId, song);

  if (reconciled) {
    return reconciled;
  }

  // Never auto-kickoff / auto-spend on editor open or poll.
  // Explicit POST /separate-stems (or retry) must start the provider job.
  if (!song.stemSeparationTaskId) {
    if (song.status === "pending_stems" || song.status === "separating_stems") {
      await prisma.song.update({
        where: { id: song.id },
        data: { status: "ready" },
      });
      return getSongForUser(userId, songId);
    }

    return song;
  }

  if (isStemSeparationTimedOut(song)) {
    await persistOriginalAudioAsStems(
      userId,
      song,
      buildSeparationFailedStemNotice("Превышено время ожидания сервиса"),
    );
    await refundStemSeparation(userId, song.id);
    return getSongForUser(userId, songId);
  }

  const musicService = createMusicService();
  const generationProvider = song.sourceTrack?.musicGeneration?.provider;
  const stemProvider = resolveSongProviderAffinity({
    generationProvider: generationProvider ?? song.provider,
    songProvider: generationProvider ? null : song.provider,
    providerTaskId: song.providerTaskId,
    providerTrackId: song.providerTrackId,
    songId: song.id,
    generationId: song.sourceTrack?.musicGeneration?.id,
  });
  const result = await musicService.getStemSeparationStatus(
    song.stemSeparationTaskId,
    stemProvider.provider,
  );

  if (result.status === "processing" || result.status === "pending") {
    return song;
  }

  if (result.status === "failed") {
    await persistOriginalAudioAsStems(
      userId,
      song,
      buildSeparationFailedStemNotice(result.errorMessage),
    );
    await refundStemSeparation(userId, song.id);
    return getSongForUser(userId, songId);
  }

  if (result.status !== "completed") {
    return song;
  }

  if (!result.vocalUrl && !result.instrumentalUrl) {
    await persistOriginalAudioAsStems(
      userId,
      song,
      buildSeparationFailedStemNotice("Сервис не вернул ссылки на дорожки"),
    );
    await refundStemSeparation(userId, song.id);
    return getSongForUser(userId, songId);
  }

  await persistStemResult(userId, songId, result);
  return getSongForUser(userId, songId);
}

async function refundStemSeparation(userId: string, songId: string): Promise<void> {
  await refundOriginalSpend({
    userId,
    spendIdempotencyKey: `stem_separation:${songId}`,
    refundIdempotencyKey: `stem_separation_refund:${songId}`,
    reason: `stem_separation_refund:${songId}`,
    relatedEntityType: "song",
    relatedEntityId: songId,
  }).catch(() => undefined);
}

async function persistStemResult(userId: string, songId: string, result: StemResult) {
  const storage = getStorageService();
  const stemPairs: Array<{ type: "vocal" | "instrumental"; url?: string }> = [
    { type: "vocal", url: result.vocalUrl },
    { type: "instrumental", url: result.instrumentalUrl },
  ];

  for (const stem of stemPairs) {
    if (!stem.url) {
      continue;
    }

    const buffer = await downloadUrl(stem.url);
    const key = buildSongStemKey(userId, songId, stem.type);
    await storage.putObject({
      key,
      body: buffer,
      contentType: "audio/mpeg",
      kind: "song_stem",
      userId,
      entityType: "song",
      entityId: songId,
      visibility: "private",
    });

    await prisma.songStem.upsert({
      where: {
        songId_type: {
          songId,
          type: stem.type,
        },
      },
      create: {
        songId,
        type: stem.type,
        audioStorageKey: key,
        durationMs: null,
      },
      update: {
        audioStorageKey: key,
      },
    });
  }

  await prisma.song.update({
    where: { id: songId },
    data: { status: "ready", stemSeparationNotice: null },
  });
}

export async function refreshEditorProgress(userId: string, songId: string) {
  const song = await getSongForUser(userId, songId);

  const reconciled = await reconcileStoredStems(userId, song);

  if (reconciled) {
    return reconciled;
  }

  // Poll provider only when a separation task was explicitly started.
  if (song.stemSeparationTaskId && song.status === "separating_stems") {
    return tickStemSeparation(userId, songId);
  }

  if (
    !song.stemSeparationTaskId &&
    (song.status === "pending_stems" || song.status === "separating_stems")
  ) {
    return tickStemSeparation(userId, songId);
  }

  return song;
}

export async function getSongStemAudio(
  userId: string,
  songId: string,
  stemType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const song = await getSongForUser(userId, songId);
  const stem = song.stems.find((item) => item.type === stemType);

  if (!stem) {
    throw new NotFoundError("Stem not found");
  }

  const buffer = await getStorageService().get(stem.audioStorageKey);

  return { buffer, contentType: "audio/mpeg" };
}

export async function getSongOriginalAudio(
  userId: string,
  songId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const song = await getSongForUser(userId, songId);

  if (!song.audioStorageKey) {
    throw new NotFoundError("Original audio not found");
  }

  const buffer = await getStorageService().get(song.audioStorageKey);

  return { buffer, contentType: "audio/mpeg" };
}

export async function getSongVersionAudio(
  userId: string,
  songId: string,
  versionId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const song = await getSongForUser(userId, songId);
  const version = song.versions.find((item) => item.id === versionId);

  if (!version?.renderedAudioKey) {
    throw new NotFoundError("Rendered version not found");
  }

  const buffer = await getStorageService().get(version.renderedAudioKey);

  return { buffer, contentType: "audio/mpeg" };
}

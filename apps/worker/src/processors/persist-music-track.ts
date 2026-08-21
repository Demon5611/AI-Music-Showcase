import { prisma } from "@ai-music/db";
import {
  musicDownloadDurationSeconds,
  musicPersistDurationSeconds,
  musicPersistFailedTotal,
  musicPersistRetryTotal,
  musicPersistSuccessTotal,
  musicUploadDurationSeconds,
  observeDuration,
  sanitizeErrorCode,
} from "@ai-music/observability";
import { isStorageConfigError, isStorageTransientError } from "@ai-music/storage";
import {
  buildMusicTrackAudioKey,
  logLoadControl,
  MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS_DEFAULT,
  MUSIC_TRACK_MAX_BYTES_DEFAULT,
  MUSIC_TRACK_PERSIST_HEARTBEAT_MS_DEFAULT,
  MUSIC_TRACK_PERSIST_STALE_MS_DEFAULT,
  MUSIC_TRACK_PROVIDER_404_GRACE_MS_DEFAULT,
  type MusicTrackPersistJobPayload,
} from "@ai-music/shared";
import {
  downloadSecureAudio,
  SecureAudioDownloadError,
} from "../common/secure-audio-download.js";
import { getWorkerStorageService } from "../common/storage.js";
import { storageErrorCode } from "../common/storage-error-code.js";

/**
 * Keeps the bucket/credentials mismatch visible: a 404 from PutObject is a config
 * problem, not a missing object, and hiding it behind STORAGE_UPLOAD_FAILED cost
 * us a full staging debugging cycle.
 */
function uploadErrorCode(error: unknown): string {
  if (isStorageTransientError(error)) {
    return "R2_TRANSIENT";
  }

  return isStorageConfigError(error) ? storageErrorCode(error) : "STORAGE_UPLOAD_FAILED";
}

export async function processPersistMusicTrack(
  payload: MusicTrackPersistJobPayload,
): Promise<void> {
  const startedAt = Date.now();
  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: payload.trackId },
    include: { musicGeneration: { select: { id: true, userId: true } } },
  });

  if (!track) {
    logLoadControl("music_track_persist_outcome", {
      outcome: "noop",
      reason: "track_deleted",
      trackId: payload.trackId,
    });
    return;
  }

  if (track.audioStorageKey || track.persistenceState === "stored") {
    if (track.persistenceState !== "stored" && track.audioStorageKey) {
      await prisma.musicGenerationTrack.update({
        where: { id: track.id },
        data: {
          persistenceState: "stored",
          persistenceCompletedAt: new Date(),
          persistenceErrorCode: null,
          persistenceErrorMessage: null,
        },
      });
    }
    logLoadControl("music_track_persist_outcome", {
      outcome: "noop",
      reason: "already_stored",
      trackId: track.id,
    });
    return;
  }

  if (!track.audioSourceUrl) {
    await markFailed(track.id, "MISSING_SOURCE", "No audio source URL");
    return;
  }

  const claimed = await claimTrackForPersistence(track.id);

  if (!claimed) {
    logLoadControl("music_track_persist_outcome", {
      outcome: "noop",
      reason: "claim_lost_or_busy",
      trackId: track.id,
    });
    return;
  }

  const heartbeatMs = Number(
    process.env.MUSIC_TRACK_PERSIST_HEARTBEAT_MS ?? MUSIC_TRACK_PERSIST_HEARTBEAT_MS_DEFAULT,
  );
  let lastHeartbeat = Date.now();

  const touchHeartbeat = async () => {
    const now = Date.now();
    if (now - lastHeartbeat < heartbeatMs) {
      return;
    }
    lastHeartbeat = now;
    await prisma.musicGenerationTrack
      .update({
        where: { id: track.id },
        data: { persistenceHeartbeatAt: new Date() },
      })
      .catch(() => undefined);
  };

  const timeoutMs = Number(
    process.env.MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS ?? MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS_DEFAULT,
  );
  const maxBytes = Number(process.env.MUSIC_TRACK_MAX_BYTES ?? MUSIC_TRACK_MAX_BYTES_DEFAULT);

  let downloadResult;
  const downloadStarted = Date.now();

  try {
    await touchHeartbeat();
    downloadResult = await downloadSecureAudio(track.audioSourceUrl, { timeoutMs, maxBytes });
    await touchHeartbeat();
  } catch (error) {
    await handleDownloadError(track, error);
    return;
  }

  logLoadControl("music_track_persist", {
    phase: "download",
    durationMs: Date.now() - downloadStarted,
    trackId: track.id,
    generationId: track.musicGeneration.id,
    bytes: downloadResult.bytes,
    host: downloadResult.finalHost,
  });
  observeDuration(musicDownloadDurationSeconds, downloadStarted);

  const key = buildMusicTrackAudioKey(
    track.musicGeneration.userId,
    track.musicGeneration.id,
    track.id,
  );
  const uploadStarted = Date.now();

  try {
    await touchHeartbeat();
    await getWorkerStorageService().putObject({
      key,
      body: downloadResult.buffer,
      contentType: downloadResult.contentType || "audio/mpeg",
      kind: "music_track_audio",
      userId: track.musicGeneration.userId,
      entityType: "music_generation_track",
      entityId: track.id,
      visibility: "private",
    });
    await touchHeartbeat();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage upload failed";
    const errorCode = uploadErrorCode(error);
    logLoadControl(
      "music_track_persist_retry",
      {
        trackId: track.id,
        generationId: track.musicGeneration.id,
        errorCode,
        attempt: track.persistenceAttempts,
        retryable: true,
      },
      "warn",
    );
    musicPersistRetryTotal.inc({ error_code: sanitizeErrorCode(errorCode) });
    await prisma.musicGenerationTrack.update({
      where: { id: track.id },
      data: {
        persistenceState: "pending",
        persistenceErrorCode: errorCode,
        persistenceErrorMessage: message.slice(0, 300),
        persistenceHeartbeatAt: new Date(),
      },
    });
    throw error;
  }

  logLoadControl("music_track_persist", {
    phase: "upload",
    durationMs: Date.now() - uploadStarted,
    trackId: track.id,
    generationId: track.musicGeneration.id,
    bytes: downloadResult.bytes,
  });
  observeDuration(musicUploadDurationSeconds, uploadStarted);

  try {
    await prisma.musicGenerationTrack.update({
      where: { id: track.id },
      data: {
        audioStorageKey: key,
        persistenceState: "stored",
        persistenceCompletedAt: new Date(),
        persistenceHeartbeatAt: new Date(),
        persistenceErrorCode: null,
        persistenceErrorMessage: null,
      },
    });
  } catch (error) {
    // R2 succeeded — retry same key via pending + throw.
    await prisma.musicGenerationTrack
      .update({
        where: { id: track.id },
        data: {
          persistenceState: "pending",
          persistenceErrorCode: "DB_AFTER_R2",
          persistenceErrorMessage: "R2 ok, DB update failed",
          persistenceHeartbeatAt: new Date(),
        },
      })
      .catch(() => undefined);
    throw error;
  }

  logLoadControl("music_track_persist", {
    phase: "persist_total",
    durationMs: Date.now() - startedAt,
    trackId: track.id,
    generationId: track.musicGeneration.id,
    bytes: downloadResult.bytes,
  });
  logLoadControl("music_track_persist_outcome", {
    outcome: "stored",
    trackId: track.id,
    generationId: track.musicGeneration.id,
    durationMs: Date.now() - startedAt,
  });
  observeDuration(musicPersistDurationSeconds, startedAt);
  musicPersistSuccessTotal.inc();
}

async function claimTrackForPersistence(trackId: string): Promise<boolean> {
  const staleMs = Number(
    process.env.MUSIC_TRACK_PERSIST_STALE_MS ?? MUSIC_TRACK_PERSIST_STALE_MS_DEFAULT,
  );
  const staleBefore = new Date(Date.now() - staleMs);

  const pending = await prisma.musicGenerationTrack.updateMany({
    where: {
      id: trackId,
      persistenceState: "pending",
      audioStorageKey: null,
      audioSourceUrl: { not: null },
    },
    data: {
      persistenceState: "processing",
      persistenceAttemptedAt: new Date(),
      persistenceHeartbeatAt: new Date(),
      persistenceAttempts: { increment: 1 },
      persistenceErrorCode: null,
      persistenceErrorMessage: null,
    },
  });

  if (pending.count === 1) {
    return true;
  }

  const stale = await prisma.musicGenerationTrack.updateMany({
    where: {
      id: trackId,
      persistenceState: "processing",
      audioStorageKey: null,
      OR: [{ persistenceHeartbeatAt: null }, { persistenceHeartbeatAt: { lt: staleBefore } }],
    },
    data: {
      persistenceHeartbeatAt: new Date(),
      persistenceAttemptedAt: new Date(),
      persistenceAttempts: { increment: 1 },
    },
  });

  return stale.count === 1;
}

async function handleDownloadError(
  track: {
    id: string;
    createdAt: Date;
    persistenceAttempts: number;
    audioSourceUrl: string | null;
  },
  error: unknown,
): Promise<void> {
  if (!(error instanceof SecureAudioDownloadError)) {
    await prisma.musicGenerationTrack.update({
      where: { id: track.id },
      data: {
        persistenceState: "pending",
        persistenceErrorCode: "UNKNOWN",
        persistenceErrorMessage: "download failed",
        persistenceHeartbeatAt: new Date(),
      },
    });
    logLoadControl(
      "music_track_persist_retry",
      { trackId: track.id, errorCode: "UNKNOWN", attempt: track.persistenceAttempts, retryable: true },
      "warn",
    );
    musicPersistRetryTotal.inc({ error_code: "unknown" });
    throw error;
  }

  const graceMs = Number(
    process.env.MUSIC_TRACK_PROVIDER_404_GRACE_MS ?? MUSIC_TRACK_PROVIDER_404_GRACE_MS_DEFAULT,
  );
  const withinGrace = Date.now() - track.createdAt.getTime() < graceMs;
  let retryable = error.retryable;

  if (error.code === "HTTP_404" && withinGrace) {
    retryable = true;
  } else if (error.code === "HTTP_404" && !withinGrace) {
    retryable = false;
  }

  if (!retryable) {
    await markFailed(track.id, error.code, error.message);
    return;
  }

  await prisma.musicGenerationTrack.update({
    where: { id: track.id },
    data: {
      persistenceState: "pending",
      persistenceErrorCode: error.code,
      persistenceErrorMessage: error.message.slice(0, 300),
      persistenceHeartbeatAt: new Date(),
    },
  });

  logLoadControl(
    "music_track_persist_retry",
    {
      trackId: track.id,
      errorCode: error.code,
      attempt: track.persistenceAttempts,
      retryable: true,
    },
    "warn",
  );
  musicPersistRetryTotal.inc({ error_code: sanitizeErrorCode(error.code) });

  throw error;
}

async function markFailed(trackId: string, code: string, message: string): Promise<void> {
  await prisma.musicGenerationTrack.update({
    where: { id: trackId },
    data: {
      persistenceState: "failed",
      persistenceCompletedAt: new Date(),
      persistenceHeartbeatAt: new Date(),
      persistenceErrorCode: code,
      persistenceErrorMessage: message.slice(0, 300),
    },
  });

  logLoadControl("music_track_persist_outcome", {
    outcome: "failed",
    trackId,
    errorCode: code,
  });
  musicPersistFailedTotal.inc({ error_code: sanitizeErrorCode(code) });
}

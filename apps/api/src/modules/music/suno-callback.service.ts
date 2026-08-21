import type {
  GeneratedTrack,
  MusicGenerationCallbackNormalizer,
  NormalizedProviderCallback,
} from "@ai-music/ai-providers";
import {
  tryNormalizeSunoAlbumCoverCallback,
  type NormalizedSunoAlbumCoverCallback,
} from "@ai-music/ai-providers";
import {
  incCallback,
  musicCallbackDurationSeconds,
  observeCallbackPhase,
  observeDuration,
  recordGenerationTransition,
  type CallbackOutcome,
} from "@ai-music/observability";
import { logLoadControl, verifySunoCallbackToken } from "@ai-music/shared";
import { prisma, Prisma } from "@ai-music/db";
import { getApiEnv, resolveProviderReferenceSecret } from "../../config/env.js";
import { refundOriginalSpend } from "../credits/service.js";
import { shouldRefundGeneration } from "./music-generation-refund.js";
import {
  applyMusicGenerationTransition,
  type MusicRecordStatus,
  type TransitionResult,
} from "./music-generation-transition.js";
import { upsertTracksAndEnqueuePersistence } from "./music-track-metadata.js";
import { resolveMusicGenerationErrorDisplay } from "./music-provider-error-display.js";
import { createDefaultSunoCallbackNormalizer } from "./callback/default-callback-normalizer.js";

export type CallbackHttpResult = {
  statusCode: number;
  body: Record<string, unknown>;
};

type ApplyOutcome = {
  status: MusicRecordStatus;
  rawStatus: string;
  errorMessage?: string;
  tracks: GeneratedTrack[];
};

const defaultNormalizer: MusicGenerationCallbackNormalizer =
  createDefaultSunoCallbackNormalizer();

function finishCallback(
  startedAt: number,
  outcome: CallbackOutcome,
  fields: Record<string, string | number | boolean | null | undefined>,
  result: CallbackHttpResult,
): CallbackHttpResult {
  observeDuration(musicCallbackDurationSeconds, startedAt);
  observeCallbackPhase("callback_total", startedAt);
  incCallback(outcome);
  logLoadControl("music_callback_latency", {
    phase: "callback_total",
    durationMs: Date.now() - startedAt,
    outcome,
    ...fields,
  });
  return result;
}

function mapTransitionToCallbackOutcome(transition: TransitionResult): CallbackOutcome {
  if (transition === "applied") {
    return "applied";
  }

  return "duplicate";
}

function toApplyOutcome(normalized: NormalizedProviderCallback): ApplyOutcome | null {
  if (normalized.kind === "progress") {
    return {
      status: "processing",
      rawStatus: normalized.rawStatus ?? "PROCESSING",
      tracks: normalized.tracks,
    };
  }

  if (normalized.kind === "completed") {
    return {
      status: "completed",
      rawStatus: normalized.rawStatus ?? "SUCCESS",
      tracks: normalized.tracks,
    };
  }

  if (normalized.kind === "failed") {
    return {
      status: "failed",
      rawStatus: normalized.rawStatus ?? normalized.error.code,
      errorMessage: normalized.error.message,
      tracks: [],
    };
  }

  return null;
}

async function applyAlbumCoverCallback(
  cover: NormalizedSunoAlbumCoverCallback,
  startedAt: number,
  fields: Record<string, string | number | boolean | null | undefined>,
): Promise<CallbackHttpResult | null> {
  const record = await prisma.musicGeneration.findFirst({
    where: { albumCoverTaskId: cover.coverTaskId },
    select: {
      id: true,
      selectedAlbumCoverUrl: true,
      albumCoverImagesJson: true,
    },
  });

  if (!record) {
    logLoadControl(
      "suno_callback_sync",
      {
        ...fields,
        coverTaskId: cover.coverTaskId,
        ignored: "unknown_album_cover_task",
        coverKind: cover.kind,
      },
      "warn",
    );
    return finishCallback(startedAt, "terminal_ignored", fields, {
      statusCode: 200,
      body: { received: true, ignored: "unknown_album_cover_task" },
    });
  }

  if (cover.kind === "failed") {
    logLoadControl(
      "suno_callback_sync",
      {
        ...fields,
        generationId: record.id,
        coverTaskId: cover.coverTaskId,
        ignored: "album_cover_failed",
        error: cover.message,
      },
      "warn",
    );
    return finishCallback(
      startedAt,
      "ignored",
      { ...fields, generationId: record.id },
      { statusCode: 200, body: { received: true, ignored: "album_cover_failed" } },
    );
  }

  const existing = Array.isArray(record.albumCoverImagesJson)
    ? record.albumCoverImagesJson
    : null;
  if (existing && existing.length > 0) {
    return finishCallback(
      startedAt,
      "duplicate",
      { ...fields, generationId: record.id },
      { statusCode: 200, body: { received: true, duplicate: true } },
    );
  }

  await prisma.musicGeneration.update({
    where: { id: record.id },
    data: {
      albumCoverImagesJson: cover.images as unknown as Prisma.InputJsonValue,
      selectedAlbumCoverUrl: record.selectedAlbumCoverUrl ?? cover.images[0] ?? null,
    },
  });

  logLoadControl("suno_callback_sync", {
    ...fields,
    generationId: record.id,
    coverTaskId: cover.coverTaskId,
    albumCoverImages: cover.images.length,
    status: "album_cover_completed",
  });

  return finishCallback(
    startedAt,
    "applied",
    { ...fields, generationId: record.id },
    { statusCode: 200, body: { received: true, albumCover: true } },
  );
}

export async function handleSignedSunoMusicCallback(
  input: {
    recordId: string;
    token: string;
    payload: unknown;
  },
  normalizer: MusicGenerationCallbackNormalizer = defaultNormalizer,
): Promise<CallbackHttpResult> {
  const startedAt = Date.now();

  try {
    let secret: string;
    try {
      secret = resolveProviderReferenceSecret();
    } catch {
      return finishCallback(startedAt, "error", { generationId: input.recordId }, {
        statusCode: 503,
        body: { error: "Callback secret unavailable", code: "CALLBACK_MISCONFIGURED" },
      });
    }

    // HMAC verify BEFORE any DB/storage mutations (including album-cover).
    if (!verifySunoCallbackToken(secret, input.recordId, input.token)) {
      return finishCallback(startedAt, "invalid_signature", { generationId: input.recordId }, {
        statusCode: 401,
        body: { error: "Invalid callback token", code: "CALLBACK_UNAUTHORIZED" },
      });
    }

    const coverEarly = tryNormalizeSunoAlbumCoverCallback(input.payload);
    if (coverEarly) {
      const applied = await applyAlbumCoverCallback(coverEarly, startedAt, {
        generationId: input.recordId,
        albumCover: true,
      });
      if (applied) {
        return applied;
      }
    }

    const normalized = normalizer.normalizeCallback(input.payload);

    if (normalized.kind === "invalid_payload") {
      return finishCallback(startedAt, "ignored", { generationId: input.recordId }, {
        statusCode: 400,
        body: { error: "Invalid Suno callback payload", code: "INVALID_CALLBACK_PAYLOAD" },
      });
    }

    if (normalized.kind === "ignored" && normalized.reason === "missing_task_id") {
      return finishCallback(
        startedAt,
        "ignored",
        { generationId: input.recordId },
        { statusCode: 200, body: { received: true, ignored: "missing_task_id" } },
      );
    }

    const taskId = normalized.providerTaskId;
    if (!taskId) {
      return finishCallback(
        startedAt,
        "ignored",
        { generationId: input.recordId },
        { statusCode: 200, body: { received: true, ignored: "missing_task_id" } },
      );
    }

    const resolveStarted = Date.now();
    const resolved = await resolveRecordForCallback(input.recordId, taskId);
    observeCallbackPhase("callback_resolve", resolveStarted);
    logLoadControl("suno_callback_sync", {
      phase: "callback_resolve",
      durationMs: Date.now() - resolveStarted,
      generationId: input.recordId,
      recordId: input.recordId,
      providerTaskId: taskId,
      resolved: resolved.kind,
    });

    if (resolved.kind !== "ok") {
      logLoadControl(
        "suno_callback_sync",
        {
          generationId: input.recordId,
          recordId: input.recordId,
          providerTaskId: taskId,
          taskId,
          ignored: resolved.kind,
          durationMs: Date.now() - startedAt,
        },
        resolved.kind === "task_mismatch" ? "warn" : "info",
      );
      return finishCallback(
        startedAt,
        "terminal_ignored",
        { generationId: input.recordId, providerTaskId: taskId },
        { statusCode: 200, body: { received: true, ignored: resolved.kind } },
      );
    }

    if (normalized.kind === "ignored") {
      logLoadControl(
        "suno_callback_sync",
        {
          generationId: input.recordId,
          recordId: input.recordId,
          providerTaskId: taskId,
          taskId,
          ignored: normalized.reason,
          durationMs: Date.now() - startedAt,
        },
        "warn",
      );
      return finishCallback(
        startedAt,
        "ignored",
        { generationId: input.recordId, providerTaskId: taskId },
        { statusCode: 200, body: { received: true, ignored: normalized.reason } },
      );
    }

    const applyOutcome = toApplyOutcome(normalized);
    if (!applyOutcome) {
      return finishCallback(
        startedAt,
        "ignored",
        { generationId: input.recordId, providerTaskId: taskId },
        { statusCode: 200, body: { received: true, ignored: "unknown_event" } },
      );
    }

    const applyResult = await applyMappedStatus(resolved.record, applyOutcome);

    return finishCallback(
      startedAt,
      mapTransitionToCallbackOutcome(applyResult.transition as TransitionResult),
      {
        generationId: input.recordId,
        providerTaskId: taskId,
        transition: applyResult.transition,
      },
      {
        statusCode: 200,
        body: {
          received: true,
          ...(applyResult.transition === "noop" || applyResult.transition === "conflict"
            ? { duplicate: true }
            : {}),
        },
      },
    );
  } catch (error) {
    logLoadControl(
      "suno_callback_sync",
      {
        generationId: input.recordId,
        recordId: input.recordId,
        error: error instanceof Error ? error.message : "unknown",
        durationMs: Date.now() - startedAt,
      },
      "error",
    );
    return finishCallback(startedAt, "error", { generationId: input.recordId }, {
      statusCode: 503,
      body: { error: "Temporary callback processing failure", code: "CALLBACK_TEMPORARY" },
    });
  }
}

/**
 * Legacy unauthenticated callback — fail-closed by default.
 * Enable only with explicit SUNO_CALLBACK_LEGACY_ENABLED=true (drain/migration).
 */
export async function handleLegacySunoMusicCallback(
  payload: unknown,
  normalizer: MusicGenerationCallbackNormalizer = defaultNormalizer,
): Promise<CallbackHttpResult> {
  const startedAt = Date.now();

  if (isLegacyCallbackDisabled()) {
    return finishCallback(startedAt, "legacy_rejected", {}, {
      statusCode: 410,
      body: { error: "Legacy callback retired", code: "LEGACY_CALLBACK_GONE" },
    });
  }

  const cutoff = resolveLegacyCutoff();

  try {
    // Legacy route has no HMAC; album-cover must not mutate without auth.
    // Reject cover payloads on legacy path — signed route only.
    const coverEarly = tryNormalizeSunoAlbumCoverCallback(payload);
    if (coverEarly) {
      return finishCallback(startedAt, "legacy_rejected", { legacy: true, albumCover: true }, {
        statusCode: 410,
        body: {
          error: "Album cover callbacks require signed route",
          code: "LEGACY_ALBUM_COVER_GONE",
        },
      });
    }

    const normalized = normalizer.normalizeCallback(payload);

    if (normalized.kind === "invalid_payload") {
      return finishCallback(startedAt, "ignored", { legacy: true }, {
        statusCode: 400,
        body: { error: "Invalid Suno callback payload", code: "INVALID_CALLBACK_PAYLOAD" },
      });
    }

    if (normalized.kind === "ignored" && normalized.reason === "missing_task_id") {
      return finishCallback(
        startedAt,
        "ignored",
        { legacy: true },
        { statusCode: 200, body: { received: true, ignored: "missing_task_id" } },
      );
    }

    const taskId = normalized.providerTaskId;
    if (!taskId) {
      return finishCallback(
        startedAt,
        "ignored",
        { legacy: true },
        { statusCode: 200, body: { received: true, ignored: "missing_task_id" } },
      );
    }

    const record = await prisma.musicGeneration.findUnique({
      where: { providerTaskId: taskId },
      include: { tracks: true },
    });

    if (!record) {
      logLoadControl(
        "suno_callback_sync",
        { providerTaskId: taskId, taskId, ignored: "unknown_record", legacy: true },
        "warn",
      );
      return finishCallback(
        startedAt,
        "terminal_ignored",
        { providerTaskId: taskId, legacy: true },
        { statusCode: 200, body: { received: true, ignored: "unknown_record" } },
      );
    }

    if (cutoff && record.createdAt >= cutoff) {
      return finishCallback(
        startedAt,
        "legacy_rejected",
        { generationId: record.id, providerTaskId: taskId },
        {
          statusCode: 410,
          body: { error: "Legacy callback disabled for this record", code: "LEGACY_CALLBACK_GONE" },
        },
      );
    }

    if (normalized.kind === "ignored") {
      return finishCallback(
        startedAt,
        "ignored",
        { generationId: record.id, providerTaskId: taskId, legacy: true },
        { statusCode: 200, body: { received: true, ignored: normalized.reason } },
      );
    }

    const applyOutcome = toApplyOutcome(normalized);
    if (!applyOutcome) {
      return finishCallback(
        startedAt,
        "ignored",
        { generationId: record.id, providerTaskId: taskId, legacy: true },
        { statusCode: 200, body: { received: true, ignored: "unknown_event" } },
      );
    }

    const applyResult = await applyMappedStatus(record, applyOutcome);

    logLoadControl("suno_callback_sync", {
      generationId: record.id,
      recordId: record.id,
      providerTaskId: taskId,
      taskId,
      legacy: true,
      status: applyOutcome.status,
      transition: applyResult.transition,
      durationMs: Date.now() - startedAt,
    });

    return finishCallback(
      startedAt,
      mapTransitionToCallbackOutcome(applyResult.transition as TransitionResult),
      { generationId: record.id, providerTaskId: taskId, legacy: true },
      { statusCode: 200, body: { received: true } },
    );
  } catch (error) {
    logLoadControl(
      "suno_callback_sync",
      {
        error: error instanceof Error ? error.message : "unknown",
        legacy: true,
        durationMs: Date.now() - startedAt,
      },
      "error",
    );
    return finishCallback(startedAt, "error", { legacy: true }, {
      statusCode: 503,
      body: { error: "Temporary callback processing failure", code: "CALLBACK_TEMPORARY" },
    });
  }
}

type RecordWithTracks = NonNullable<
  Awaited<ReturnType<typeof prisma.musicGeneration.findUnique>>
> & {
  tracks: Array<{ id: string; providerTrackId: string; audioStorageKey: string | null }>;
};

async function resolveRecordForCallback(
  recordId: string,
  taskId: string,
): Promise<
  | { kind: "ok"; record: RecordWithTracks }
  | { kind: "unknown_record" }
  | { kind: "queued_ignored" }
  | { kind: "failed_ignored" }
  | { kind: "task_mismatch" }
  | { kind: "bind_conflict" }
> {
  const record = await prisma.musicGeneration.findUnique({
    where: { id: recordId },
    include: { tracks: true },
  });

  if (!record) {
    return { kind: "unknown_record" };
  }

  if (record.providerTaskId.startsWith("queue:")) {
    if (record.submissionState === "queued") {
      return { kind: "queued_ignored" };
    }

    if (record.submissionState === "failed") {
      return { kind: "failed_ignored" };
    }

    if (
      record.submissionState === "dispatching" ||
      record.submissionState === "submit_unknown"
    ) {
      try {
        const bound = await prisma.musicGeneration.updateMany({
          where: {
            id: recordId,
            providerTaskId: { startsWith: "queue:" },
            submissionState: { in: ["dispatching", "submit_unknown"] },
          },
          data: {
            providerTaskId: taskId,
            submissionState: "submitted",
            submitCompletedAt: new Date(),
          },
        });

        if (bound.count !== 1) {
          return { kind: "bind_conflict" };
        }
      } catch {
        return { kind: "bind_conflict" };
      }

      const refreshed = await prisma.musicGeneration.findUnique({
        where: { id: recordId },
        include: { tracks: true },
      });

      if (!refreshed) {
        return { kind: "unknown_record" };
      }

      return { kind: "ok", record: refreshed };
    }

    return { kind: "queued_ignored" };
  }

  if (record.providerTaskId !== taskId) {
    logLoadControl(
      "suno_callback_sync",
      {
        recordId,
        expectedTaskPrefix: record.providerTaskId.slice(0, 8),
        ignored: "task_mismatch",
      },
      "warn",
    );
    return { kind: "task_mismatch" };
  }

  return { kind: "ok", record };
}

async function applyMappedStatus(
  record: {
    id: string;
    userId: string;
    type: string;
    status: string;
    submissionState: string;
    tracks: Array<{ id: string; providerTrackId: string; audioStorageKey: string | null }>;
  },
  outcome: ApplyOutcome,
): Promise<{ transition: string; refunded: boolean }> {
  const errorDisplay = resolveMusicGenerationErrorDisplay(
    outcome.rawStatus,
    outcome.errorMessage,
  );

  const transitionStarted = Date.now();
  const transition = await applyMusicGenerationTransition({
    id: record.id,
    toStatus: outcome.status,
    data: {
      rawStatus: errorDisplay.rawStatus,
      errorMessage: errorDisplay.errorMessage,
    },
  });
  observeCallbackPhase("callback_transition", transitionStarted);
  logLoadControl("suno_callback_sync", {
    phase: "callback_transition",
    durationMs: Date.now() - transitionStarted,
    recordId: record.id,
    status: outcome.status,
    transition,
  });

  if (
    transition === "applied" &&
    (outcome.status === "completed" || outcome.status === "failed")
  ) {
    recordGenerationTransition(outcome.status);
  }

  let refunded = false;

  if (outcome.status === "failed") {
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

    // Refund even on duplicate failed transition (partial: status written, refund lost).
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
          reason: `music_generate:${record.id}:callback_failed`,
          relatedEntityType: "music_generation",
          relatedEntityId: record.id,
        }).catch(() => undefined);
        refunded = true;
      }
    }
  }

  if (outcome.tracks.length > 0 && (outcome.status === "processing" || outcome.status === "completed")) {
    await upsertTracksAndEnqueuePersistence(record, outcome.tracks, { transition });
  }

  return { transition, refunded };
}

function isLegacyCallbackDisabled(): boolean {
  // Fail closed: enabled only via explicit SUNO_CALLBACK_LEGACY_ENABLED=true.
  return process.env.SUNO_CALLBACK_LEGACY_ENABLED !== "true";
}

function resolveLegacyCutoff(): Date | null {
  const raw =
    process.env.SUNO_CALLBACK_LEGACY_CUTOFF_AT?.trim() ||
    getApiEnv().SUNO_CALLBACK_LEGACY_CUTOFF_AT;

  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

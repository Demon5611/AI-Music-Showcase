import type { GenerateSongInput } from "@ai-music/ai-providers";
import {
  toPersistedSongInput,
} from "@ai-music/ai-providers";
import { randomUUID } from "node:crypto";
import { prisma } from "@ai-music/db";
import {
  checkContentAllowed,
  isLyricsLanguage,
  MUSIC_STYLES,
  normalizeLyricsLanguage,
  OPERATION_COST_UNITS,
  resolveEffectiveDurationSecForPlan,
  resolveManualLyricsMaxLength,
  resolveRemixEligibility,
  type LyricsLanguage,
  type MusicStyleId,
} from "@ai-music/shared";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../common/errors.js";
import { spendCredits, refundOriginalSpend } from "../credits/service.js";
import {
  assertFeature,
  assertMaxDuration,
  assertMusicGenerationMode,
  getQueuePriorityForUser,
  getUserEntitlements,
} from "../billing/entitlements.service.js";
import { enqueueProviderJob } from "../queue/provider-job-queue.js";
import { assertProviderQueueCapacity } from "../queue/provider-queue-metrics.js";
import {
  buildRemixSongInput,
} from "./build-remix-song-input.js";
import type { MusicGenerateLogger } from "./music-persona.js";
import { createMusicGenerationRecord } from "./music-record.service.js";
import { getConfiguredStorageBucket } from "./music-track-storage-bucket.js";
import { uploadRemixReferenceAudioUrl } from "./remix-reference-audio.js";

const REMIX_TITLE_MAX_LENGTH = 80;
const REMIX_PROMPT_FALLBACK = "Remix this track in the selected style.";
const REMIX_AUDIO_UNAVAILABLE_RU =
  "Ремикс недоступен: исходное аудио не готово.";
const REMIX_NOT_SONG_RU = "Remix доступен только для музыкальных треков";
const REMIX_AUDIO_UNAVAILABLE_CODE = "REMIX_SOURCE_AUDIO_UNAVAILABLE";

function resolveRemixStyle(styleId: MusicStyleId) {
  const style = MUSIC_STYLES.find((item) => item.id === styleId);

  if (!style) {
    throw new BadRequestError("Unknown remix style");
  }

  return style;
}

function buildRemixTitle(sourceTitle: string, styleLabel: string): string {
  const base = sourceTitle.trim() || "Untitled track";
  const title = `${base} — ${styleLabel} remix`;

  return title.length > REMIX_TITLE_MAX_LENGTH ? title.slice(0, REMIX_TITLE_MAX_LENGTH) : title;
}

function resolveRemixPrompt(lyricsText: string | null, generationPrompt: string): string {
  const lyrics = lyricsText?.trim();
  if (lyrics) {
    return lyrics;
  }

  const prompt = generationPrompt.trim();
  if (prompt) {
    return prompt;
  }

  return REMIX_PROMPT_FALLBACK;
}

function resolveRemixLyricsLanguage(providerRequestJson: unknown): LyricsLanguage {
  if (
    typeof providerRequestJson === "object" &&
    providerRequestJson !== null &&
    "lyricsLanguage" in providerRequestJson &&
    isLyricsLanguage((providerRequestJson as { lyricsLanguage?: unknown }).lyricsLanguage)
  ) {
    return (providerRequestJson as { lyricsLanguage: LyricsLanguage }).lyricsLanguage;
  }

  return "auto";
}

const CONTENT_MODERATION_ERROR_CODE = "CONTENT_MODERATION";

function assertModerationForNonEmptyText(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const moderationResult = checkContentAllowed(trimmed);
  if (!moderationResult.allowed) {
    throw new BadRequestError(moderationResult.reasonMessageRu, CONTENT_MODERATION_ERROR_CODE);
  }
}

function assertRemixSourceEligible(track: {
  persistenceState: string | null;
  audioStorageKey: string | null;
  persistenceErrorCode: string | null;
  musicGeneration: { type: string };
}): void {
  const eligibility = resolveRemixEligibility({
    generationType: track.musicGeneration.type,
    audioStorageKey: track.audioStorageKey,
    persistenceState: track.persistenceState,
    persistenceErrorCode: track.persistenceErrorCode,
    configuredStorageBucket: getConfiguredStorageBucket(),
  });

  if (eligibility.reason === "not_song") {
    throw new BadRequestError(REMIX_NOT_SONG_RU);
  }

  if (!eligibility.eligible) {
    throw new BadRequestError(REMIX_AUDIO_UNAVAILABLE_RU, REMIX_AUDIO_UNAVAILABLE_CODE);
  }
}

export async function remixMusicTrackForUser(
  userId: string,
  trackId: string,
  styleId: MusicStyleId,
  log?: MusicGenerateLogger,
) {
  await assertFeature(userId, "aiRemix");

  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: trackId },
    include: { musicGeneration: true },
  });

  if (!track) {
    throw new NotFoundError("Track not found");
  }

  if (track.musicGeneration.userId !== userId) {
    throw new ForbiddenError("Track access denied");
  }

  // Source-audio readiness (not generation.status) — before spend.
  assertRemixSourceEligible(track);

  const remixStyle = resolveRemixStyle(styleId);
  const sourceTitle =
    track.title?.trim() || track.musicGeneration.title?.trim() || "Untitled track";
  const prompt = resolveRemixPrompt(track.lyricsText, track.musicGeneration.prompt);
  const title = buildRemixTitle(sourceTitle, remixStyle.label);
  const styleTag = remixStyle.label.toLowerCase();
  const sourceDurationSec = track.durationSec ?? 0;

  assertModerationForNonEmptyText(prompt);
  assertModerationForNonEmptyText(styleTag);
  assertModerationForNonEmptyText(title);

  const entitlements = await getUserEntitlements(userId);
  const effectiveDurationSec = resolveEffectiveDurationSecForPlan(
    entitlements.planId,
    sourceDurationSec,
  );

  const maxLyricsLength = resolveManualLyricsMaxLength(entitlements.planId, effectiveDurationSec);
  if (prompt.length > maxLyricsLength) {
    throw new BadRequestError(
      `Текст слишком длинный для ремикса — максимум ${maxLyricsLength} символов.`,
    );
  }

  await assertMaxDuration(userId, effectiveDurationSec);
  await assertMusicGenerationMode(userId, {
    customMode: true,
    instrumental: false,
    style: styleTag,
    durationSec: effectiveDurationSec,
  });

  const lyricsLanguage = normalizeLyricsLanguage(
    resolveRemixLyricsLanguage(track.musicGeneration.providerRequestJson),
  );

  // Server-side storage → Suno file upload URL (never client-supplied).
  const referenceAudioUrl = await uploadRemixReferenceAudioUrl(track);

  const songInput: GenerateSongInput = buildRemixSongInput({
    prompt,
    styleTag,
    title,
    durationSec: effectiveDurationSec,
    lyricsLanguage,
    referenceAudioUrl,
  });

  log?.info(
    {
      userId,
      sourceTrackId: trackId,
      remixStyleId: styleId,
      hasReferenceAudio: Boolean(referenceAudioUrl),
    },
    "Submitting music remix generation",
  );

  await assertProviderQueueCapacity();

  const queuePlaceholder = `queue:${randomUUID()}`;

  const record = await createMusicGenerationRecord({
    userId,
    type: "song",
    // Remix is a NEW Suno upload-cover generation from reference audio (not source affinity).
    provider: "sunoapi",
    providerTaskId: queuePlaceholder,
    prompt,
    style: styleTag,
    title,
    customMode: true,
    instrumental: false,
    providerRequestJson: toPersistedSongInput(songInput),
  });

  await spendCredits({
    userId,
    amountUnits: OPERATION_COST_UNITS.generateTrack,
    reason: "music_remix",
    idempotencyKey: `generation:${record.id}:spend`,
    relatedEntityType: "music_generation",
    relatedEntityId: record.id,
  });

  try {
    const priority = await getQueuePriorityForUser(userId);

    await enqueueProviderJob(
      {
        type: "music_generate",
        userId,
        recordId: record.id,
        songInputJson: JSON.stringify(songInput),
        spendReason: `music_remix:${record.id}`,
      },
      priority,
    );

    return {
      recordId: record.id,
      provider: "sunoapi" as const,
      taskId: record.id,
      status: "pending" as const,
    };
  } catch (error) {
    await prisma.musicGeneration.update({
      where: { id: record.id },
      data: {
        status: "failed",
        errorMessage: "Failed to enqueue music remix",
      },
    });

    await refundOriginalSpend({
      userId,
      spendIdempotencyKey: `generation:${record.id}:spend`,
      refundIdempotencyKey: `generation:${record.id}:refund`,
      reason: "music_remix_failed",
      relatedEntityType: "music_generation",
      relatedEntityId: record.id,
    }).catch(() => undefined);

    throw error;
  }
}

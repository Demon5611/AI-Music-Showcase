import {
  getMurekaGenerationOptions,
  resolveMusicProviderForGeneration,
  withMurekaGenerationOptions,
  type GenerateSongInput,
  type MusicProviderId,
} from "@ai-music/ai-providers";
import {
  buildMurekaMusicSpendKey,
  buildMurekaPrompt,
  isMurekaGenerateRuntimeReady,
  MUREKA_OUTPUT_COUNT,
  resolveMusicGenerateCostUnits,
  resolveMurekaFeatureFlags,
  resolveMurekaPersonalVoiceAvailability,
  type MusicBrief,
  type MusicGenerateBody,
} from "@ai-music/shared";
import { prisma } from "@ai-music/db";
import { BadRequestError, ForbiddenError, ServiceUnavailableError } from "../../common/errors.js";
import { getApiEnv } from "../../config/env.js";
import { isMurekaWorkerListenHeartbeatFresh } from "./mureka-worker-heartbeat.js";

export type MusicGenerateRouteOptions = {
  voiceSampleId?: string;
  voiceProfileId?: string;
  usePersonalVoice?: boolean;
  musicBrief?: MusicBrief;
};

export function extractMusicGenerateRouteOptions(
  body: MusicGenerateBody,
): MusicGenerateRouteOptions {
  return {
    voiceSampleId: body.voiceSampleId?.trim() || undefined,
    voiceProfileId: body.voiceProfileId?.trim() || undefined,
    usePersonalVoice: body.usePersonalVoice === true,
    musicBrief: body.musicBrief,
  };
}

export async function loadReadyMurekaVoiceProfile(
  userId: string,
  voiceProfileId?: string,
) {
  const where = voiceProfileId
    ? { id: voiceProfileId, userId, provider: "mureka" as const, deletedAt: null }
    : {
        userId,
        provider: "mureka" as const,
        status: "ready" as const,
        deletedAt: null,
      };

  const profile = await prisma.voiceProfile.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
  });

  if (!profile || profile.status !== "ready" || profile.deletedAt) {
    return null;
  }

  const externalId = profile.externalId?.trim() ?? "";
  if (!externalId || externalId.startsWith("pending:")) {
    return null;
  }

  return profile;
}

export function resolveProviderOrThrow(input: {
  explicitProvider?: MusicProviderId;
  hasPersonalMurekaVoice: boolean;
  lyricsLanguage?: string;
}): MusicProviderId {
  const env = getApiEnv();
  const result = resolveMusicProviderForGeneration({
    explicitProvider: input.explicitProvider,
    hasPersonalMurekaVoice: input.hasPersonalMurekaVoice,
    lyricsLanguage: input.lyricsLanguage,
    appEnv: env.APP_ENV,
  });

  if ("error" in result) {
    if (result.error.statusCode === 400) {
      throw new BadRequestError(result.error.message, result.error.code);
    }
    if (result.error.statusCode === 503) {
      throw new ServiceUnavailableError(result.error.message);
    }
    throw new ForbiddenError(result.error.message);
  }

  return result.providerId;
}

export function buildMurekaSongInput(input: {
  base: GenerateSongInput;
  vocalId: string;
  voiceProfileId: string;
  musicBrief?: MusicBrief;
}): GenerateSongInput {
  const flags = resolveMurekaFeatureFlags();
  const fromOptions = getMurekaGenerationOptions(input.base) ?? {};
  const musicPrompt = resolveMurekaMusicPrompt(input.base, input.musicBrief, fromOptions);
  const vocalId = input.vocalId.trim();

  if (!vocalId) {
    throw new BadRequestError(
      "Персональный AI-голос ещё не готов. Создайте его в разделе голоса.",
      "MUREKA_VOCAL_ID_MISSING",
    );
  }

  // Provider vocal_id comes only from VoiceProfile.externalId — never from the client.
  return withMurekaGenerationOptions(
    {
      ...input.base,
      style: musicPrompt,
      mode: "song",
    },
    {
      vocalId,
      voiceProfileId: input.voiceProfileId,
      musicPrompt,
      model: fromOptions.model ?? flags.model,
      n: MUREKA_OUTPUT_COUNT,
    },
  );
}

/** Standard AI vocals on Mureka (no personal vocal_id). */
export function buildMurekaSongInputWithoutVoice(input: {
  base: GenerateSongInput;
  musicBrief?: MusicBrief;
}): GenerateSongInput {
  const flags = resolveMurekaFeatureFlags();
  const fromOptions = getMurekaGenerationOptions(input.base) ?? {};
  const musicPrompt = resolveMurekaMusicPrompt(input.base, input.musicBrief, fromOptions);

  return withMurekaGenerationOptions(
    {
      ...input.base,
      style: musicPrompt,
      mode: "song",
    },
    {
      musicPrompt,
      model: fromOptions.model ?? flags.model,
      n: MUREKA_OUTPUT_COUNT,
    },
  );
}

function resolveMurekaMusicPrompt(
  base: GenerateSongInput,
  musicBrief: MusicBrief | undefined,
  fromOptions: { musicPrompt?: string },
): string {
  const musicPrompt =
    fromOptions.musicPrompt?.trim() ||
    (musicBrief ? buildMurekaPrompt(musicBrief).trim() : "") ||
    base.style?.trim() ||
    "";

  if (!musicPrompt) {
    throw new BadRequestError(
      "Music prompt is required",
      "MUREKA_MUSIC_PROMPT_REQUIRED",
    );
  }

  return musicPrompt;
}

export async function assertMurekaGenerateAllowed(): Promise<void> {
  const env = getApiEnv();
  const availability = resolveMurekaPersonalVoiceAvailability({
    appEnv: env.APP_ENV,
  });

  if (!availability.available) {
    if (availability.reason === "production_rollout_disabled") {
      throw new ForbiddenError("Mureka generation is not available");
    }
    if (availability.reason === "runtime_not_ready") {
      throw new ServiceUnavailableError("Mureka runtime is not configured");
    }
    throw new ServiceUnavailableError("Mureka is not enabled");
  }

  // Fail closed before spend/enqueue when the worker cannot listen (config).
  if (!isMurekaGenerateRuntimeReady({ appEnv: env.APP_ENV })) {
    throw new ServiceUnavailableError("Mureka generation is not ready");
  }

  // Live proof the worker is consuming mureka-provider-jobs.
  const heartbeatFresh = await isMurekaWorkerListenHeartbeatFresh();
  if (!heartbeatFresh) {
    throw new ServiceUnavailableError("Mureka generation is not ready");
  }
}

export function murekaSpendAmountUnits(): number {
  return resolveMusicGenerateCostUnits({ providerId: "mureka" });
}

export function murekaSpendIdempotencyKey(generationId: string): string {
  return buildMurekaMusicSpendKey(generationId);
}

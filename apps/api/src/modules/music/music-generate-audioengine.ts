import {
  getAudioengineGenerationOptions,
  resolveMusicProviderForGeneration,
  withAudioengineGenerationOptions,
  type GenerateSongInput,
  type MusicProviderId,
} from "@ai-music/ai-providers";
import {
  buildAudioengineMusicSpendKey,
  buildAudioenginePrompt,
  isAudioengineGenerateRuntimeReady,
  AUDIOENGINE_OUTPUT_COUNT,
  resolveMusicGenerateCostUnits,
  resolveAudioengineFeatureFlags,
  resolveAudioenginePersonalVoiceAvailability,
  type MusicBrief,
  type MusicGenerateBody,
} from "@ai-music/shared";
import { prisma } from "@ai-music/db";
import { BadRequestError, ForbiddenError, ServiceUnavailableError } from "../../common/errors.js";
import { getApiEnv } from "../../config/env.js";
import { isAudioengineWorkerListenHeartbeatFresh } from "./audioengine-worker-heartbeat.js";

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

export async function loadReadyAudioengineVoiceProfile(
  userId: string,
  voiceProfileId?: string,
) {
  const where = voiceProfileId
    ? { id: voiceProfileId, userId, provider: "audioengine" as const, deletedAt: null }
    : {
        userId,
        provider: "audioengine" as const,
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
  hasPersonalAudioengineVoice: boolean;
  lyricsLanguage?: string;
}): MusicProviderId {
  const env = getApiEnv();
  const result = resolveMusicProviderForGeneration({
    explicitProvider: input.explicitProvider,
    hasPersonalAudioengineVoice: input.hasPersonalAudioengineVoice,
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

export function buildAudioengineSongInput(input: {
  base: GenerateSongInput;
  vocalId: string;
  voiceProfileId: string;
  musicBrief?: MusicBrief;
}): GenerateSongInput {
  const flags = resolveAudioengineFeatureFlags();
  const fromOptions = getAudioengineGenerationOptions(input.base) ?? {};
  const musicPrompt = resolveAudioengineMusicPrompt(input.base, input.musicBrief, fromOptions);
  const vocalId = input.vocalId.trim();

  if (!vocalId) {
    throw new BadRequestError(
      "Персональный AI-голос ещё не готов. Создайте его в разделе голоса.",
      "AUDIOENGINE_VOCAL_ID_MISSING",
    );
  }

  // Provider vocal_id comes only from VoiceProfile.externalId — never from the client.
  return withAudioengineGenerationOptions(
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
      n: AUDIOENGINE_OUTPUT_COUNT,
    },
  );
}

/** Standard AI vocals on Audioengine (no personal vocal_id). */
export function buildAudioengineSongInputWithoutVoice(input: {
  base: GenerateSongInput;
  musicBrief?: MusicBrief;
}): GenerateSongInput {
  const flags = resolveAudioengineFeatureFlags();
  const fromOptions = getAudioengineGenerationOptions(input.base) ?? {};
  const musicPrompt = resolveAudioengineMusicPrompt(input.base, input.musicBrief, fromOptions);

  return withAudioengineGenerationOptions(
    {
      ...input.base,
      style: musicPrompt,
      mode: "song",
    },
    {
      musicPrompt,
      model: fromOptions.model ?? flags.model,
      n: AUDIOENGINE_OUTPUT_COUNT,
    },
  );
}

function resolveAudioengineMusicPrompt(
  base: GenerateSongInput,
  musicBrief: MusicBrief | undefined,
  fromOptions: { musicPrompt?: string },
): string {
  const musicPrompt =
    fromOptions.musicPrompt?.trim() ||
    (musicBrief ? buildAudioenginePrompt(musicBrief).trim() : "") ||
    base.style?.trim() ||
    "";

  if (!musicPrompt) {
    throw new BadRequestError(
      "Music prompt is required",
      "AUDIOENGINE_MUSIC_PROMPT_REQUIRED",
    );
  }

  return musicPrompt;
}

export async function assertAudioengineGenerateAllowed(): Promise<void> {
  const env = getApiEnv();
  const availability = resolveAudioenginePersonalVoiceAvailability({
    appEnv: env.APP_ENV,
  });

  if (!availability.available) {
    if (availability.reason === "production_rollout_disabled") {
      throw new ForbiddenError("Audioengine generation is not available");
    }
    if (availability.reason === "runtime_not_ready") {
      throw new ServiceUnavailableError("Audioengine runtime is not configured");
    }
    throw new ServiceUnavailableError("Audioengine is not enabled");
  }

  // Fail closed before spend/enqueue when the worker cannot listen (config).
  if (!isAudioengineGenerateRuntimeReady({ appEnv: env.APP_ENV })) {
    throw new ServiceUnavailableError("Audioengine generation is not ready");
  }

  // Live proof the worker is consuming audioengine-provider-jobs.
  const heartbeatFresh = await isAudioengineWorkerListenHeartbeatFresh();
  if (!heartbeatFresh) {
    throw new ServiceUnavailableError("Audioengine generation is not ready");
  }
}

export function audioengineSpendAmountUnits(): number {
  return resolveMusicGenerateCostUnits({ providerId: "audioengine" });
}

export function audioengineSpendIdempotencyKey(generationId: string): string {
  return buildAudioengineMusicSpendKey(generationId);
}

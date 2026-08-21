import type {
  GenerateSongInput,
  ProviderGenerationOptions,
  SunoGenerationOptions,
  MurekaGenerationOptions,
} from "@ai-music/ai-providers";
import {
  buildMurekaPrompt,
  normalizeLyricsLanguage,
  type MusicGenerateBody,
} from "@ai-music/shared";
import { BadRequestError } from "../../common/errors.js";
import { extractMusicGenerateRouteOptions } from "./music-generate-mureka.js";

export type NormalizedMusicGenerateRequest = {
  input: GenerateSongInput;
  voiceSampleId?: string;
  voiceProfileId?: string;
  usePersonalVoice: boolean;
};

function assertSameOptional<T>(
  left: T | undefined,
  right: T | undefined,
  field: string,
): T | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  if (left !== right) {
    throw new BadRequestError(
      `Conflicting values for ${field} between legacy fields and providerOptions`,
      "GENERATE_BODY_CONFLICT",
    );
  }

  return left;
}

function resolveMode(body: MusicGenerateBody): "song" | "instrumental" {
  const fromInstrumental =
    body.instrumental === undefined
      ? undefined
      : body.instrumental
        ? "instrumental"
        : "song";

  if (body.mode === undefined) {
    return fromInstrumental ?? "song";
  }

  if (fromInstrumental !== undefined && fromInstrumental !== body.mode) {
    throw new BadRequestError(
      "Conflicting values for mode/instrumental",
      "GENERATE_BODY_CONFLICT",
    );
  }

  return body.mode;
}

function mergeSunoOptions(body: MusicGenerateBody): SunoGenerationOptions {
  const fromProvider =
    body.providerOptions?.providerId === "sunoapi"
      ? body.providerOptions.options
      : undefined;

  return {
    customMode: assertSameOptional(body.customMode, fromProvider?.customMode, "customMode"),
    referenceAudioUrl: assertSameOptional(
      body.referenceAudioUrl,
      fromProvider?.referenceAudioUrl,
      "referenceAudioUrl",
    ),
    vocalGender: assertSameOptional(body.vocalGender, fromProvider?.vocalGender, "vocalGender"),
    personaId: fromProvider?.personaId,
    personaModel: fromProvider?.personaModel,
  };
}

function mergeMurekaOptions(body: MusicGenerateBody): MurekaGenerationOptions {
  const fromProvider =
    body.providerOptions?.providerId === "mureka"
      ? body.providerOptions.options
      : undefined;

  if (fromProvider?.vocalId) {
    throw new BadRequestError(
      "vocalId must not be supplied by the client",
      "GENERATE_BODY_CONFLICT",
    );
  }

  const briefPrompt = body.musicBrief ? buildMurekaPrompt(body.musicBrief).trim() : "";
  const musicPrompt =
    fromProvider?.musicPrompt?.trim() ||
    briefPrompt ||
    body.style?.trim() ||
    undefined;

  return {
    voiceProfileId:
      fromProvider?.voiceProfileId ?? (body.voiceProfileId?.trim() || undefined),
    musicPrompt,
    model: fromProvider?.model,
    n: fromProvider?.n,
  };
}

function assertNoLegacySunoFieldsForMureka(body: MusicGenerateBody): void {
  if (
    body.customMode !== undefined ||
    body.referenceAudioUrl !== undefined ||
    body.vocalGender !== undefined
  ) {
    throw new BadRequestError(
      "Legacy Suno fields cannot be combined with Mureka generation",
      "GENERATE_BODY_CONFLICT",
    );
  }

  if (body.voiceSampleId) {
    throw new BadRequestError(
      "voiceSampleId cannot be combined with Mureka generation",
      "GENERATE_BODY_CONFLICT",
    );
  }

  if (body.providerOptions?.providerId === "sunoapi") {
    throw new BadRequestError(
      "Legacy Suno fields cannot be combined with Mureka generation",
      "GENERATE_BODY_CONFLICT",
    );
  }
}

function resolveProviderOptions(body: MusicGenerateBody): ProviderGenerationOptions {
  if (body.providerOptions?.providerId === "mock") {
    if (
      body.customMode !== undefined ||
      body.referenceAudioUrl !== undefined ||
      body.vocalGender !== undefined
    ) {
      throw new BadRequestError(
        "Legacy Suno fields cannot be combined with non-sunoapi providerOptions",
        "GENERATE_BODY_CONFLICT",
      );
    }

    return {
      providerId: "mock",
      options: body.providerOptions.options ?? {},
    };
  }

  // Product contract: Mureka only when Personal Voice is explicitly ON.
  if (body.usePersonalVoice === true) {
    assertNoLegacySunoFieldsForMureka(body);

    if (body.providerOptions?.providerId === "sunoapi") {
      throw new BadRequestError(
        "Personal voice generation cannot use sunoapi providerOptions",
        "GENERATE_BODY_CONFLICT",
      );
    }

    return {
      providerId: "mureka",
      options: mergeMurekaOptions(body),
    };
  }

  // OFF / no personal voice → always Suno (ignore client mureka providerOptions).
  return {
    providerId: "sunoapi",
    options: mergeSunoOptions(body),
  };
}

/**
 * Legacy adapter (strategy A): conflict-check → neutral GenerateSongInput.
 * Personal Voice ON → mureka; otherwise → sunoapi.
 */
export function normalizeMusicGenerateBody(
  body: MusicGenerateBody,
): NormalizedMusicGenerateRequest {
  const route = extractMusicGenerateRouteOptions(body);
  const usePersonalVoice = route.usePersonalVoice === true;
  const styleFromBrief =
    body.musicBrief && !body.style?.trim()
      ? buildMurekaPrompt(body.musicBrief).trim() || undefined
      : undefined;

  const input: GenerateSongInput = {
    prompt: body.prompt.trim(),
    style: body.style?.trim() || styleFromBrief,
    title: body.title?.trim() || undefined,
    durationSec: body.durationSec,
    mode: resolveMode(body),
    lyricsLanguage: normalizeLyricsLanguage(body.lyricsLanguage),
    providerOptions: resolveProviderOptions(body),
  };

  return {
    input,
    voiceSampleId: usePersonalVoice ? undefined : route.voiceSampleId,
    voiceProfileId: usePersonalVoice ? route.voiceProfileId : undefined,
    usePersonalVoice,
  };
}

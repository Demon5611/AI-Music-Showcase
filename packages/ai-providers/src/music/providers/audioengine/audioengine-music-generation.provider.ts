import type {
  GenerationSubmitContext,
  MusicGenerationProvider,
  PreparedGeneration,
  SubmitGenerationResult,
} from "../../domain/music-generation-provider.js";
import { createPreparedGeneration } from "../../domain/music-generation-provider.js";
import type { GenerateSongInput, GenerationStatusResult } from "../../domain/music.types.js";
import { getAudioengineGenerationOptions } from "../../domain/generate-song-input.js";
import {
  AUDIOENGINE_ECONOMICS,
  AUDIOENGINE_OUTPUT_COUNT,
  estimateAudioengineLyricsToSongUsdMicros,
  formatUsdFromMicros,
  logLoadControl,
} from "@ai-music/shared";
import { createAudioengineClient, type AudioengineClient } from "./audioengine-client.js";
import { resolveAudioengineClientConfig } from "./audioengine-config.js";
import { AudioengineHttpError, mapAudioengineHttpErrorToMusicError } from "./audioengine-errors.js";
import { mapAudioengineQueryToGenerationStatus } from "./audioengine-status-mapper.js";
import { AUDIOENGINE_PROVIDER_ID } from "./audioengine-types.js";

export type PreparedAudioengineMusicGenerate = {
  body: {
    lyrics: string;
    prompt: string;
    model: string;
    /** Product invariant — always 1. Audioengine API default without `n` is 2. */
    n: typeof AUDIOENGINE_OUTPUT_COUNT;
    vocal_id?: string;
  };
};

function asAudioenginePayload(prepared: PreparedGeneration): PreparedAudioengineMusicGenerate {
  if (prepared.providerId !== AUDIOENGINE_PROVIDER_ID) {
    throw new Error(
      `AudioengineMusicGenerationProvider received prepared from ${prepared.providerId}`,
    );
  }

  return prepared.payload as PreparedAudioengineMusicGenerate;
}

export class AudioengineMusicGenerationProvider implements MusicGenerationProvider {
  readonly id = AUDIOENGINE_PROVIDER_ID;

  constructor(private readonly client: AudioengineClient = createAudioengineClient()) {}

  prepareGeneration(
    input: GenerateSongInput,
    _context: GenerationSubmitContext,
  ): PreparedGeneration<PreparedAudioengineMusicGenerate> {
    void _context;
    const config = this.client.getConfig();
    const options = getAudioengineGenerationOptions(input) ?? {};
    const lyrics = input.prompt.trim();
    const prompt = (options.musicPrompt ?? input.style ?? "").trim();

    if (!lyrics) {
      throw new Error("Audioengine generate requires lyrics (prompt field)");
    }
    if (!prompt) {
      throw new Error("Audioengine generate requires music prompt");
    }

    // Ignore options.n / config.songCount / AUDIOENGINE_SONG_COUNT — never omit `n`
    // (Audioengine provider default is 2).
    return createPreparedGeneration(AUDIOENGINE_PROVIDER_ID, {
      body: {
        lyrics,
        prompt,
        model: options.model ?? config.model,
        n: AUDIOENGINE_OUTPUT_COUNT,
        ...(options.vocalId ? { vocal_id: options.vocalId } : {}),
      },
    });
  }

  async submitPreparedGeneration(
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ): Promise<SubmitGenerationResult> {
    const payload = asAudioenginePayload(prepared);
    const hasVoiceProfile = Boolean(payload.body.vocal_id);

    const variantCount = payload.body.n;
    const estimatedProviderCostUsdMicros = estimateAudioengineLyricsToSongUsdMicros(variantCount);
    const estimatedProviderCostUsd = formatUsdFromMicros(estimatedProviderCostUsdMicros);

    logLoadControl("audioengine_generate_http_started", {
      generationId: context.recordId,
      provider: AUDIOENGINE_PROVIDER_ID,
      hasVoiceProfile,
      model: payload.body.model,
      tariffModel: AUDIOENGINE_ECONOMICS.tariffModel,
      variantCount,
      estimatedProviderCostUsd,
      status: "http_started",
    });

    try {
      const { taskId } = await this.client.generateSong(payload.body);
      logLoadControl("audioengine_generate_http_accepted", {
        generationId: context.recordId,
        provider: AUDIOENGINE_PROVIDER_ID,
        hasVoiceProfile,
        model: payload.body.model,
        tariffModel: AUDIOENGINE_ECONOMICS.tariffModel,
        variantCount,
        estimatedProviderCostUsd,
        status: "http_accepted",
      });
      return { kind: "ok", taskId };
    } catch (error) {
      if (error instanceof AudioengineHttpError) {
        if (error.kind === "rate_limit" || error.kind === "capacity") {
          return {
            kind: "retryable_capacity",
            code: error.httpStatus ?? 429,
            message: error.message,
          };
        }

        if (error.ambiguous || error.kind === "timeout" || error.kind === "network") {
          return {
            kind: "ambiguous",
            code: error.httpStatus,
            message: error.message,
          };
        }

        if (error.kind === "server") {
          return {
            kind: "ambiguous",
            code: error.httpStatus,
            message: error.message,
          };
        }

        return {
          kind: "failed_terminal",
          code: error.httpStatus ?? 400,
          message: error.message,
        };
      }

      return {
        kind: "ambiguous",
        message: error instanceof Error ? error.message : "Audioengine submit failed",
      };
    }
  }

  async getGenerationStatus(providerTaskId: string): Promise<GenerationStatusResult> {
    try {
      const response = await this.client.querySong(providerTaskId);
      return mapAudioengineQueryToGenerationStatus(providerTaskId, response);
    } catch (error) {
      if (error instanceof AudioengineHttpError) {
        throw mapAudioengineHttpErrorToMusicError(error);
      }
      throw error;
    }
  }
}

export function createAudioengineMusicGenerationProvider(
  client?: AudioengineClient,
): AudioengineMusicGenerationProvider {
  return new AudioengineMusicGenerationProvider(
    client ?? createAudioengineClient(resolveAudioengineClientConfig()),
  );
}

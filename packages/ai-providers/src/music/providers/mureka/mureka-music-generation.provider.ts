import type {
  GenerationSubmitContext,
  MusicGenerationProvider,
  PreparedGeneration,
  SubmitGenerationResult,
} from "../../domain/music-generation-provider.js";
import { createPreparedGeneration } from "../../domain/music-generation-provider.js";
import type { GenerateSongInput, GenerationStatusResult } from "../../domain/music.types.js";
import { getMurekaGenerationOptions } from "../../domain/generate-song-input.js";
import {
  MUREKA_ECONOMICS,
  MUREKA_OUTPUT_COUNT,
  estimateMurekaLyricsToSongUsdMicros,
  formatUsdFromMicros,
  logLoadControl,
} from "@ai-music/shared";
import { createMurekaClient, type MurekaClient } from "./mureka-client.js";
import { resolveMurekaClientConfig } from "./mureka-config.js";
import { MurekaHttpError, mapMurekaHttpErrorToMusicError } from "./mureka-errors.js";
import { mapMurekaQueryToGenerationStatus } from "./mureka-status-mapper.js";
import { MUREKA_PROVIDER_ID } from "./mureka-types.js";

export type PreparedMurekaMusicGenerate = {
  body: {
    lyrics: string;
    prompt: string;
    model: string;
    /** Product invariant — always 1. Mureka API default without `n` is 2. */
    n: typeof MUREKA_OUTPUT_COUNT;
    vocal_id?: string;
  };
};

function asMurekaPayload(prepared: PreparedGeneration): PreparedMurekaMusicGenerate {
  if (prepared.providerId !== MUREKA_PROVIDER_ID) {
    throw new Error(
      `MurekaMusicGenerationProvider received prepared from ${prepared.providerId}`,
    );
  }

  return prepared.payload as PreparedMurekaMusicGenerate;
}

export class MurekaMusicGenerationProvider implements MusicGenerationProvider {
  readonly id = MUREKA_PROVIDER_ID;

  constructor(private readonly client: MurekaClient = createMurekaClient()) {}

  prepareGeneration(
    input: GenerateSongInput,
    _context: GenerationSubmitContext,
  ): PreparedGeneration<PreparedMurekaMusicGenerate> {
    void _context;
    const config = this.client.getConfig();
    const options = getMurekaGenerationOptions(input) ?? {};
    const lyrics = input.prompt.trim();
    const prompt = (options.musicPrompt ?? input.style ?? "").trim();

    if (!lyrics) {
      throw new Error("Mureka generate requires lyrics (prompt field)");
    }
    if (!prompt) {
      throw new Error("Mureka generate requires music prompt");
    }

    // Ignore options.n / config.songCount / MUREKA_SONG_COUNT — never omit `n`
    // (Mureka provider default is 2).
    return createPreparedGeneration(MUREKA_PROVIDER_ID, {
      body: {
        lyrics,
        prompt,
        model: options.model ?? config.model,
        n: MUREKA_OUTPUT_COUNT,
        ...(options.vocalId ? { vocal_id: options.vocalId } : {}),
      },
    });
  }

  async submitPreparedGeneration(
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ): Promise<SubmitGenerationResult> {
    const payload = asMurekaPayload(prepared);
    const hasVoiceProfile = Boolean(payload.body.vocal_id);

    const variantCount = payload.body.n;
    const estimatedProviderCostUsdMicros = estimateMurekaLyricsToSongUsdMicros(variantCount);
    const estimatedProviderCostUsd = formatUsdFromMicros(estimatedProviderCostUsdMicros);

    logLoadControl("mureka_generate_http_started", {
      generationId: context.recordId,
      provider: MUREKA_PROVIDER_ID,
      hasVoiceProfile,
      model: payload.body.model,
      tariffModel: MUREKA_ECONOMICS.tariffModel,
      variantCount,
      estimatedProviderCostUsd,
      status: "http_started",
    });

    try {
      const { taskId } = await this.client.generateSong(payload.body);
      logLoadControl("mureka_generate_http_accepted", {
        generationId: context.recordId,
        provider: MUREKA_PROVIDER_ID,
        hasVoiceProfile,
        model: payload.body.model,
        tariffModel: MUREKA_ECONOMICS.tariffModel,
        variantCount,
        estimatedProviderCostUsd,
        status: "http_accepted",
      });
      return { kind: "ok", taskId };
    } catch (error) {
      if (error instanceof MurekaHttpError) {
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
        message: error instanceof Error ? error.message : "Mureka submit failed",
      };
    }
  }

  async getGenerationStatus(providerTaskId: string): Promise<GenerationStatusResult> {
    try {
      const response = await this.client.querySong(providerTaskId);
      return mapMurekaQueryToGenerationStatus(providerTaskId, response);
    } catch (error) {
      if (error instanceof MurekaHttpError) {
        throw mapMurekaHttpErrorToMusicError(error);
      }
      throw error;
    }
  }
}

export function createMurekaMusicGenerationProvider(
  client?: MurekaClient,
): MurekaMusicGenerationProvider {
  return new MurekaMusicGenerationProvider(
    client ?? createMurekaClient(resolveMurekaClientConfig()),
  );
}

import type { MusicProvider } from "../../domain/music-provider.interface.js";
import type {
  ExtendSongInput,
  ExtendSongResult,
  GenerateSongInput,
  GenerateSongResult,
  GenerationStatusResult,
} from "../../domain/music.types.js";
import { NotImplementedMusicProviderError } from "../../domain/not-implemented.error.js";
import { createMurekaClient, type MurekaClient } from "./mureka-client.js";
import { MurekaHttpError, mapMurekaHttpErrorToMusicError } from "./mureka-errors.js";
import {
  createMurekaMusicGenerationProvider,
  type MurekaMusicGenerationProvider,
} from "./mureka-music-generation.provider.js";
import { mapMurekaQueryToGenerationStatus } from "./mureka-status-mapper.js";
import { MUREKA_PROVIDER_ID } from "./mureka-types.js";

/**
 * Wide MusicProvider adapter for Mureka (song generate + status).
 * Stems / lyrics / extend are not supported in the first staging slice.
 */
export class MurekaMusicProvider implements MusicProvider {
  readonly id = MUREKA_PROVIDER_ID;

  constructor(
    private readonly client: MurekaClient = createMurekaClient(),
    private readonly generation: MurekaMusicGenerationProvider = createMurekaMusicGenerationProvider(),
  ) {}

  async generateSong(input: GenerateSongInput): Promise<GenerateSongResult> {
    const prepared = this.generation.prepareGeneration(input, {
      recordId: "direct",
      userId: "direct",
    });
    const result = await this.generation.submitPreparedGeneration(prepared, {
      recordId: "direct",
      userId: "direct",
    });

    if (result.kind !== "ok") {
      throw new MurekaHttpError({
        message: result.message,
        kind: result.kind === "retryable_capacity" ? "rate_limit" : "unknown",
        httpStatus: "code" in result ? result.code : undefined,
        retryable: result.kind === "retryable_capacity",
        ambiguous: result.kind === "ambiguous",
      });
    }

    return {
      provider: MUREKA_PROVIDER_ID,
      taskId: result.taskId,
      status: "pending",
    };
  }

  async getGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    try {
      const response = await this.client.querySong(taskId);
      return mapMurekaQueryToGenerationStatus(taskId, response);
    } catch (error) {
      if (error instanceof MurekaHttpError) {
        throw mapMurekaHttpErrorToMusicError(error);
      }
      throw error;
    }
  }

  async extendSong(_input: ExtendSongInput): Promise<ExtendSongResult> {
    void _input;
    throw new NotImplementedMusicProviderError(MUREKA_PROVIDER_ID, "extendSong");
  }
}

export function createMurekaMusicProvider(client?: MurekaClient): MurekaMusicProvider {
  const resolved = client ?? createMurekaClient();
  return new MurekaMusicProvider(resolved, createMurekaMusicGenerationProvider(resolved));
}

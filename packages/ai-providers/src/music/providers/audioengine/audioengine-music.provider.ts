import type { MusicProvider } from "../../domain/music-provider.interface.js";
import type {
  ExtendSongInput,
  ExtendSongResult,
  GenerateSongInput,
  GenerateSongResult,
  GenerationStatusResult,
} from "../../domain/music.types.js";
import { NotImplementedMusicProviderError } from "../../domain/not-implemented.error.js";
import { createAudioengineClient, type AudioengineClient } from "./audioengine-client.js";
import { AudioengineHttpError, mapAudioengineHttpErrorToMusicError } from "./audioengine-errors.js";
import {
  createAudioengineMusicGenerationProvider,
  type AudioengineMusicGenerationProvider,
} from "./audioengine-music-generation.provider.js";
import { mapAudioengineQueryToGenerationStatus } from "./audioengine-status-mapper.js";
import { AUDIOENGINE_PROVIDER_ID } from "./audioengine-types.js";

/**
 * Wide MusicProvider adapter for Audioengine (song generate + status).
 * Stems / lyrics / extend are not supported in the first staging slice.
 */
export class AudioengineMusicProvider implements MusicProvider {
  readonly id = AUDIOENGINE_PROVIDER_ID;

  constructor(
    private readonly client: AudioengineClient = createAudioengineClient(),
    private readonly generation: AudioengineMusicGenerationProvider = createAudioengineMusicGenerationProvider(),
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
      throw new AudioengineHttpError({
        message: result.message,
        kind: result.kind === "retryable_capacity" ? "rate_limit" : "unknown",
        httpStatus: "code" in result ? result.code : undefined,
        retryable: result.kind === "retryable_capacity",
        ambiguous: result.kind === "ambiguous",
      });
    }

    return {
      provider: AUDIOENGINE_PROVIDER_ID,
      taskId: result.taskId,
      status: "pending",
    };
  }

  async getGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    try {
      const response = await this.client.querySong(taskId);
      return mapAudioengineQueryToGenerationStatus(taskId, response);
    } catch (error) {
      if (error instanceof AudioengineHttpError) {
        throw mapAudioengineHttpErrorToMusicError(error);
      }
      throw error;
    }
  }

  async extendSong(_input: ExtendSongInput): Promise<ExtendSongResult> {
    void _input;
    throw new NotImplementedMusicProviderError(AUDIOENGINE_PROVIDER_ID, "extendSong");
  }
}

export function createAudioengineMusicProvider(client?: AudioengineClient): AudioengineMusicProvider {
  const resolved = client ?? createAudioengineClient();
  return new AudioengineMusicProvider(resolved, createAudioengineMusicGenerationProvider(resolved));
}

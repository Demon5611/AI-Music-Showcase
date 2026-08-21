import type { MusicProvider } from "../../domain/music-provider.interface.js";
import { MusicProviderError } from "../../domain/errors/music-provider.error.js";
import type {
  ExtendSongInput,
  ExtendSongResult,
  GenerateLyricsInput,
  GenerateLyricsResult,
  GenerateSongInput,
  GenerateSongResult,
  GenerationStatusResult,
  SeparateStemsInput,
  StemResult,
  TimestampedLyricsInput,
  TimestampedLyricsResult,
  AlbumCoverStatusResult,
} from "../../domain/music.types.js";
import { resolveMusicProviderConfig, type MusicProviderConfig } from "../../music-config.js";
import { createSunoApiClient } from "./create-suno-api-client.js";
import { mapSunoLyricsTaskToStatus, mapSunoMusicTaskToStatus } from "./suno-api.mapper.js";
import { SunoApiClient, toSunoModelId } from "./suno-api.client.js";
import type {
  SunoExtendMusicRequest,
  SunoGenerateMusicRequest,
  SunoUploadCoverRequest,
} from "./suno-api.types.js";
import { applySunoDurationHints, resolveSunoCustomMode, resolveSunoInstrumental } from "./suno-duration-hints.js";
import { requireSunoGenerationOptions } from "../../domain/generate-song-input.js";
import { stripPersonaConflictingStyleTags } from "./suno-persona-style.js";
import { mapSunoVocalRemovalTaskToStemResult } from "./suno-vocal-removal.mapper.js";
import { mapSunoTimestampedLyricsData } from "./suno-timestamped-lyrics.mapper.js";
import { mapSunoAlbumCoverTaskToStatus } from "./suno-album-cover.mapper.js";

const PROVIDER_ID = "sunoapi" as const;

export type PreparedSunoMusicGenerate = {
  path: "/generate" | "/generate/upload-cover";
  body: SunoGenerateMusicRequest | SunoUploadCoverRequest;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export class SunoApiProvider implements MusicProvider {
  readonly id = PROVIDER_ID;

  private clientInstance: SunoApiClient | null;

  constructor(
    client?: SunoApiClient,
    private readonly config: MusicProviderConfig = resolveMusicProviderConfig(),
  ) {
    this.clientInstance = client ?? null;
  }

  async generateSong(input: GenerateSongInput): Promise<GenerateSongResult> {
    const prepared = this.prepareMusicGenerate(input);
    const client = this.getClient();
    const taskId =
      prepared.path === "/generate/upload-cover"
        ? await client.uploadAndCover(prepared.body as SunoUploadCoverRequest)
        : await client.generateMusic(prepared.body as SunoGenerateMusicRequest);

    return {
      provider: PROVIDER_ID,
      taskId,
      status: "pending",
    };
  }

  /**
   * Build the Suno request body without HTTP. Rate-limit + single POST belong
   * to the worker FSM (preflight before CAS, one fetch after).
   */
  prepareMusicGenerate(input: GenerateSongInput): PreparedSunoMusicGenerate {
    if (input.providerOptions && input.providerOptions.providerId !== "sunoapi") {
      throw new MusicProviderError(
        `Suno adapter rejects providerOptions.providerId="${input.providerOptions.providerId}"`,
        "INVALID_PROVIDER_OPTIONS",
        PROVIDER_ID,
      );
    }

    const suno = requireSunoGenerationOptions(input);
    const useUploadCover = Boolean(suno.referenceAudioUrl);
    const body = useUploadCover
      ? this.buildUploadCoverRequest(input)
      : this.buildGenerateRequest(input);

    return {
      path: useUploadCover ? "/generate/upload-cover" : "/generate",
      body,
      baseUrl: this.config.sunoApiBaseUrl,
      apiKey: this.config.sunoApiKey,
      timeoutMs: this.config.requestTimeoutMs,
    };
  }

  async generateLyrics(input: GenerateLyricsInput): Promise<GenerateLyricsResult> {
    const taskId = await this.getClient().generateLyrics({
      prompt: input.prompt,
      callBackUrl: this.config.sunoCallbackUrl,
    });

    return {
      provider: PROVIDER_ID,
      taskId,
      status: "pending",
    };
  }

  async getLyricsGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    const lyricsTask = await this.getClient().getLyricsGenerationDetails(taskId);
    return mapSunoLyricsTaskToStatus(lyricsTask);
  }

  async extendSong(input: ExtendSongInput): Promise<ExtendSongResult> {
    const body: SunoExtendMusicRequest = {
      audioId: input.audioId,
      defaultParamFlag: true,
      prompt: input.prompt,
      style: input.style ?? "Pop",
      title: input.title ?? "Extended Track",
      continueAt: input.continueAtSec,
      model: toSunoModelId(this.config.sunoModel),
      callBackUrl: this.config.sunoCallbackUrl,
    };

    const taskId = await this.getClient().extendMusic(body);

    return {
      provider: PROVIDER_ID,
      taskId,
      status: "pending",
    };
  }

  async getGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    const client = this.getClient();

    try {
      const musicTask = await client.getMusicGenerationDetails(taskId);
      return mapSunoMusicTaskToStatus(musicTask);
    } catch (musicError) {
      if (!shouldFallbackToLyricsLookup(musicError)) {
        throw musicError;
      }
    }

    const lyricsTask = await client.getLyricsGenerationDetails(taskId);
    return mapSunoLyricsTaskToStatus(lyricsTask);
  }

  async separateStems(input: SeparateStemsInput): Promise<StemResult> {
    const taskId = await this.getClient().separateVocals({
      taskId: input.providerTaskId,
      audioId: input.providerTrackId,
      type: input.separationType ?? "separate_vocal",
      callBackUrl: this.config.sunoCallbackUrl,
    });

    return {
      taskId,
      status: "pending",
    };
  }

  async getStemSeparationStatus(taskId: string): Promise<StemResult> {
    const task = await this.getClient().getVocalRemovalDetails(taskId);
    return mapSunoVocalRemovalTaskToStemResult(task);
  }

  async getTimestampedLyrics(input: TimestampedLyricsInput): Promise<TimestampedLyricsResult> {
    const data = await this.getClient().getTimestampedLyrics({
      taskId: input.taskId,
      audioId: input.audioId,
    });

    const result = mapSunoTimestampedLyricsData(data);

    if (result.lines.length === 0) {
      throw new MusicProviderError(
        "Timestamped lyrics are not available for this track",
        "TIMESTAMPED_LYRICS_UNAVAILABLE",
        PROVIDER_ID,
      );
    }

    return result;
  }

  async generateAlbumCover(providerTaskId: string): Promise<{ taskId: string }> {
    const taskId = await this.getClient().generateAlbumCover({
      taskId: providerTaskId,
      callBackUrl: this.config.sunoCallbackUrl,
    });

    return { taskId };
  }

  async getAlbumCoverStatus(taskId: string): Promise<AlbumCoverStatusResult> {
    const task = await this.getClient().getAlbumCoverDetails(taskId);
    return mapSunoAlbumCoverTaskToStatus(task);
  }

  private getClient(): SunoApiClient {
    this.clientInstance ??= createSunoApiClient({
      sunoApiBaseUrl: this.config.sunoApiBaseUrl,
      sunoApiKey: this.config.sunoApiKey,
      requestTimeoutMs: this.config.requestTimeoutMs,
    });

    return this.clientInstance;
  }

  private buildGenerateRequest(input: GenerateSongInput): SunoGenerateMusicRequest {
    const suno = requireSunoGenerationOptions(input);
    const customMode = resolveSunoCustomMode(input);
    const instrumental = resolveSunoInstrumental(input);
    const withDuration = applySunoDurationHints(input, customMode);
    const personaModel = suno.personaId
      ? (suno.personaModel ?? "voice_persona")
      : undefined;
    const useVoicePersona = personaModel === "voice_persona";
    const model = useVoicePersona
      ? toSunoModelId(this.config.sunoVoiceModel)
      : toSunoModelId(this.config.sunoModel);
    const resolvedStyle = useVoicePersona
      ? stripPersonaConflictingStyleTags(withDuration.style ?? "Pop")
      : (withDuration.style ?? "Pop");

    if (customMode) {
      return {
        customMode: true,
        instrumental,
        prompt: instrumental ? undefined : withDuration.prompt,
        style: resolvedStyle,
        title: input.title ?? "Untitled",
        model,
        callBackUrl: this.config.sunoCallbackUrl,
        personaId: suno.personaId,
        personaModel,
        ...(useVoicePersona ? {} : { vocalGender: suno.vocalGender }),
      };
    }

    return {
      customMode: false,
      instrumental,
      prompt: withDuration.prompt,
      model,
      callBackUrl: this.config.sunoCallbackUrl,
      personaId: suno.personaId,
      personaModel,
      ...(useVoicePersona ? {} : { vocalGender: suno.vocalGender }),
    };
  }

  private buildUploadCoverRequest(input: GenerateSongInput): SunoUploadCoverRequest {
    const suno = requireSunoGenerationOptions(input);
    const base = this.buildGenerateRequest(input);

    if (!suno.referenceAudioUrl) {
      throw new Error("referenceAudioUrl is required for upload-cover");
    }

    return {
      ...base,
      uploadUrl: suno.referenceAudioUrl,
    };
  }
}

export function createSunoApiProvider(
  client?: SunoApiClient,
  config?: MusicProviderConfig,
): SunoApiProvider {
  return new SunoApiProvider(client, config ?? resolveMusicProviderConfig());
}

const NON_LYRICS_LOOKUP_CODES = new Set([
  "SUNO_UNAUTHORIZED",
  "SUNO_API_KEY_MISSING",
  "MUSIC_INSUFFICIENT_CREDITS",
  "MUSIC_RATE_LIMIT",
  "MUSIC_TIMEOUT",
  "MUSIC_PROVIDER_UNAVAILABLE",
]);

function shouldFallbackToLyricsLookup(error: unknown): boolean {
  if (!(error instanceof MusicProviderError)) {
    return true;
  }

  return !NON_LYRICS_LOOKUP_CODES.has(error.code);
}

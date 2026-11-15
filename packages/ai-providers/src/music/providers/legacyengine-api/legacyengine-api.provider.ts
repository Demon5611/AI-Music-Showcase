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
import { createLegacyengineApiClient } from "./create-legacyengine-api-client.js";
import { mapLegacyengineLyricsTaskToStatus, mapLegacyengineMusicTaskToStatus } from "./legacyengine-api.mapper.js";
import { LegacyengineApiClient, toLegacyengineModelId } from "./legacyengine-api.client.js";
import type {
  LegacyengineExtendMusicRequest,
  LegacyengineGenerateMusicRequest,
  LegacyengineUploadCoverRequest,
} from "./legacyengine-api.types.js";
import { applyLegacyengineDurationHints, resolveLegacyengineCustomMode, resolveLegacyengineInstrumental } from "./legacyengine-duration-hints.js";
import { requireLegacyengineGenerationOptions } from "../../domain/generate-song-input.js";
import { stripPersonaConflictingStyleTags } from "./legacyengine-persona-style.js";
import { mapLegacyengineVocalRemovalTaskToStemResult } from "./legacyengine-vocal-removal.mapper.js";
import { mapLegacyengineTimestampedLyricsData } from "./legacyengine-timestamped-lyrics.mapper.js";
import { mapLegacyengineAlbumCoverTaskToStatus } from "./legacyengine-album-cover.mapper.js";

const PROVIDER_ID = "legacyengineapi" as const;

export type PreparedLegacyengineMusicGenerate = {
  path: "/generate" | "/generate/upload-cover";
  body: LegacyengineGenerateMusicRequest | LegacyengineUploadCoverRequest;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export class LegacyengineApiProvider implements MusicProvider {
  readonly id = PROVIDER_ID;

  private clientInstance: LegacyengineApiClient | null;

  constructor(
    client?: LegacyengineApiClient,
    private readonly config: MusicProviderConfig = resolveMusicProviderConfig(),
  ) {
    this.clientInstance = client ?? null;
  }

  async generateSong(input: GenerateSongInput): Promise<GenerateSongResult> {
    const prepared = this.prepareMusicGenerate(input);
    const client = this.getClient();
    const taskId =
      prepared.path === "/generate/upload-cover"
        ? await client.uploadAndCover(prepared.body as LegacyengineUploadCoverRequest)
        : await client.generateMusic(prepared.body as LegacyengineGenerateMusicRequest);

    return {
      provider: PROVIDER_ID,
      taskId,
      status: "pending",
    };
  }

  /**
   * Build the Legacyengine request body without HTTP. Rate-limit + single POST belong
   * to the worker FSM (preflight before CAS, one fetch after).
   */
  prepareMusicGenerate(input: GenerateSongInput): PreparedLegacyengineMusicGenerate {
    if (input.providerOptions && input.providerOptions.providerId !== "legacyengineapi") {
      throw new MusicProviderError(
        `Legacyengine adapter rejects providerOptions.providerId="${input.providerOptions.providerId}"`,
        "INVALID_PROVIDER_OPTIONS",
        PROVIDER_ID,
      );
    }

    const legacyengine = requireLegacyengineGenerationOptions(input);
    const useUploadCover = Boolean(legacyengine.referenceAudioUrl);
    const body = useUploadCover
      ? this.buildUploadCoverRequest(input)
      : this.buildGenerateRequest(input);

    return {
      path: useUploadCover ? "/generate/upload-cover" : "/generate",
      body,
      baseUrl: this.config.legacyengineApiBaseUrl,
      apiKey: this.config.legacyengineApiKey,
      timeoutMs: this.config.requestTimeoutMs,
    };
  }

  async generateLyrics(input: GenerateLyricsInput): Promise<GenerateLyricsResult> {
    const taskId = await this.getClient().generateLyrics({
      prompt: input.prompt,
      callBackUrl: this.config.legacyengineCallbackUrl,
    });

    return {
      provider: PROVIDER_ID,
      taskId,
      status: "pending",
    };
  }

  async getLyricsGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    const lyricsTask = await this.getClient().getLyricsGenerationDetails(taskId);
    return mapLegacyengineLyricsTaskToStatus(lyricsTask);
  }

  async extendSong(input: ExtendSongInput): Promise<ExtendSongResult> {
    const body: LegacyengineExtendMusicRequest = {
      audioId: input.audioId,
      defaultParamFlag: true,
      prompt: input.prompt,
      style: input.style ?? "Pop",
      title: input.title ?? "Extended Track",
      continueAt: input.continueAtSec,
      model: toLegacyengineModelId(this.config.legacyengineModel),
      callBackUrl: this.config.legacyengineCallbackUrl,
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
      return mapLegacyengineMusicTaskToStatus(musicTask);
    } catch (musicError) {
      if (!shouldFallbackToLyricsLookup(musicError)) {
        throw musicError;
      }
    }

    const lyricsTask = await client.getLyricsGenerationDetails(taskId);
    return mapLegacyengineLyricsTaskToStatus(lyricsTask);
  }

  async separateStems(input: SeparateStemsInput): Promise<StemResult> {
    const taskId = await this.getClient().separateVocals({
      taskId: input.providerTaskId,
      audioId: input.providerTrackId,
      type: input.separationType ?? "separate_vocal",
      callBackUrl: this.config.legacyengineCallbackUrl,
    });

    return {
      taskId,
      status: "pending",
    };
  }

  async getStemSeparationStatus(taskId: string): Promise<StemResult> {
    const task = await this.getClient().getVocalRemovalDetails(taskId);
    return mapLegacyengineVocalRemovalTaskToStemResult(task);
  }

  async getTimestampedLyrics(input: TimestampedLyricsInput): Promise<TimestampedLyricsResult> {
    const data = await this.getClient().getTimestampedLyrics({
      taskId: input.taskId,
      audioId: input.audioId,
    });

    const result = mapLegacyengineTimestampedLyricsData(data);

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
      callBackUrl: this.config.legacyengineCallbackUrl,
    });

    return { taskId };
  }

  async getAlbumCoverStatus(taskId: string): Promise<AlbumCoverStatusResult> {
    const task = await this.getClient().getAlbumCoverDetails(taskId);
    return mapLegacyengineAlbumCoverTaskToStatus(task);
  }

  private getClient(): LegacyengineApiClient {
    this.clientInstance ??= createLegacyengineApiClient({
      legacyengineApiBaseUrl: this.config.legacyengineApiBaseUrl,
      legacyengineApiKey: this.config.legacyengineApiKey,
      requestTimeoutMs: this.config.requestTimeoutMs,
    });

    return this.clientInstance;
  }

  private buildGenerateRequest(input: GenerateSongInput): LegacyengineGenerateMusicRequest {
    const legacyengine = requireLegacyengineGenerationOptions(input);
    const customMode = resolveLegacyengineCustomMode(input);
    const instrumental = resolveLegacyengineInstrumental(input);
    const withDuration = applyLegacyengineDurationHints(input, customMode);
    const personaModel = legacyengine.personaId
      ? (legacyengine.personaModel ?? "voice_persona")
      : undefined;
    const useVoicePersona = personaModel === "voice_persona";
    const model = useVoicePersona
      ? toLegacyengineModelId(this.config.legacyengineVoiceModel)
      : toLegacyengineModelId(this.config.legacyengineModel);
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
        callBackUrl: this.config.legacyengineCallbackUrl,
        personaId: legacyengine.personaId,
        personaModel,
        ...(useVoicePersona ? {} : { vocalGender: legacyengine.vocalGender }),
      };
    }

    return {
      customMode: false,
      instrumental,
      prompt: withDuration.prompt,
      model,
      callBackUrl: this.config.legacyengineCallbackUrl,
      personaId: legacyengine.personaId,
      personaModel,
      ...(useVoicePersona ? {} : { vocalGender: legacyengine.vocalGender }),
    };
  }

  private buildUploadCoverRequest(input: GenerateSongInput): LegacyengineUploadCoverRequest {
    const legacyengine = requireLegacyengineGenerationOptions(input);
    const base = this.buildGenerateRequest(input);

    if (!legacyengine.referenceAudioUrl) {
      throw new Error("referenceAudioUrl is required for upload-cover");
    }

    return {
      ...base,
      uploadUrl: legacyengine.referenceAudioUrl,
    };
  }
}

export function createLegacyengineApiProvider(
  client?: LegacyengineApiClient,
  config?: MusicProviderConfig,
): LegacyengineApiProvider {
  return new LegacyengineApiProvider(client, config ?? resolveMusicProviderConfig());
}

const NON_LYRICS_LOOKUP_CODES = new Set([
  "LEGACYENGINE_UNAUTHORIZED",
  "LEGACYENGINE_API_KEY_MISSING",
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

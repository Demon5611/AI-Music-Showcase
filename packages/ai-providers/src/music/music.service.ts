import type {
  AlbumCoverStatusResult,
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
} from "./domain/music.types.js";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import { createMusicProviderFactory, type MusicProviderFactory } from "./music-provider.factory.js";

/**
 * Application-facing music orchestration.
 *
 * Creation methods (generateSong / generateLyrics / …) may use the active/default
 * MusicProvider from routing policy.
 *
 * Post-processing on an EXISTING asset (timestamped lyrics, album cover, stems that
 * require provider task/audio ids) must receive an explicit provider id — never
 * resolve from MUSIC_DEFAULT_PROVIDER alone.
 */
export class MusicService {
  constructor(
    private readonly providerFactory: MusicProviderFactory = createMusicProviderFactory(),
  ) {}

  generateSong(input: GenerateSongInput): Promise<GenerateSongResult> {
    const provider = this.providerFactory.getProvider();
    return provider.generateSong(input);
  }

  generateLyrics(input: GenerateLyricsInput): Promise<GenerateLyricsResult> {
    const provider = this.providerFactory.getProvider();

    if (!provider.generateLyrics) {
      throw new Error("Active music provider does not support lyrics generation");
    }

    return provider.generateLyrics(input);
  }

  getLyricsGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    const provider = this.providerFactory.getProvider();

    if (!provider.getLyricsGenerationStatus) {
      throw new Error("Active music provider does not support lyrics status");
    }

    return provider.getLyricsGenerationStatus(taskId);
  }

  /**
   * Latent creation/extend path. Callers that extend an EXISTING provider asset
   * must pass that asset's provider via getProvider(providerId) — do not rely on
   * this default until affinity is wired at the call site.
   */
  extendSong(input: ExtendSongInput): Promise<ExtendSongResult> {
    const provider = this.providerFactory.getProvider();
    return provider.extendSong(input);
  }

  getGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    const provider = this.providerFactory.getProvider();
    return provider.getGenerationStatus(taskId);
  }

  /**
   * Stem separation that uses provider task/audio ids is provider-affine.
   * Pass the persisted song/generation provider — never omit for existing assets.
   */
  separateStems(input: SeparateStemsInput, providerId: MusicProviderId): Promise<StemResult> {
    const provider = this.providerFactory.getProvider(providerId);

    if (!provider.separateStems) {
      throw new Error(`${providerId} music provider does not support stem separation`);
    }

    return provider.separateStems(input);
  }

  getStemSeparationStatus(taskId: string, providerId: MusicProviderId): Promise<StemResult> {
    const provider = this.providerFactory.getProvider(providerId);

    if (!provider.getStemSeparationStatus) {
      throw new Error(`${providerId} music provider does not support stem separation status`);
    }

    return provider.getStemSeparationStatus(taskId);
  }

  /**
   * Suno-only post-processing on an existing Suno track.
   * Callers must gate on MusicGeneration.provider === "sunoapi" and pass the
   * original Suno taskId + audioId — never MUSIC_DEFAULT_PROVIDER / active provider.
   */
  getTimestampedLyrics(input: TimestampedLyricsInput): Promise<TimestampedLyricsResult> {
    const taskId = input.taskId.trim();
    const audioId = input.audioId.trim();

    if (!taskId || !audioId) {
      throw new Error("Suno taskId and audioId are required for timestamped lyrics");
    }

    const provider = this.providerFactory.getProvider("sunoapi");

    if (!provider.getTimestampedLyrics) {
      throw new Error("Suno music provider does not support timestamped lyrics");
    }

    return provider.getTimestampedLyrics({ taskId, audioId });
  }

  /**
   * @param sunoMusicTaskId — Suno *music* generation taskId only.
   * Never pass a Mureka (or other vendor) task id here.
   */
  generateAlbumCover(sunoMusicTaskId: string): Promise<{ taskId: string }> {
    const taskId = sunoMusicTaskId.trim();
    if (!taskId) {
      throw new Error("Suno music taskId is required for album cover generation");
    }

    const provider = this.providerFactory.getProvider("sunoapi");

    if (!provider.generateAlbumCover) {
      throw new Error("Suno music provider does not support album cover generation");
    }

    return provider.generateAlbumCover(taskId);
  }

  getAlbumCoverStatus(taskId: string): Promise<AlbumCoverStatusResult> {
    const provider = this.providerFactory.getProvider("sunoapi");

    if (!provider.getAlbumCoverStatus) {
      throw new Error("Suno music provider does not support album cover status");
    }

    return provider.getAlbumCoverStatus(taskId);
  }
}

export function createMusicService(providerFactory?: MusicProviderFactory): MusicService {
  return new MusicService(providerFactory);
}

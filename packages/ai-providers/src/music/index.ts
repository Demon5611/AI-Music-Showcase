export type { MusicProvider } from "./domain/music-provider.interface.js";
export {
  MUSIC_PROVIDER_IDS,
  type MusicProviderId,
  isMusicProviderId,
  resolveMusicProviderId,
  resolveMusicDefaultProvider,
} from "./domain/music-provider-id.js";
export {
  MUSIC_GENERATION_STATUSES,
  type MusicGenerationStatus,
  isMusicGenerationStatus,
} from "./domain/music-status.js";
export type {
  ExtendSongInput,
  ExtendSongResult,
  GenerateLyricsInput,
  GenerateLyricsResult,
  GenerateSongInput,
  GenerateSongResult,
  GeneratedLyrics,
  GeneratedTrack,
  GenerationStatusResult,
  PersistedSongInput,
  ProviderGenerationOptions,
  SunoGenerationOptions,
  MurekaGenerationOptions,
} from "./domain/music.types.js";
export {
  fromPersistedSongInput,
  getSunoGenerationOptions,
  getMurekaGenerationOptions,
  isInstrumentalMode,
  requireSunoGenerationOptions,
  toPersistedSongInput,
  withSunoGenerationOptions,
  withMurekaGenerationOptions,
} from "./domain/music.types.js";
export type {
  MusicGenerationProvider,
  PreparedGeneration,
  OpaquePreparedGeneration,
  GenerationSubmitContext,
  SubmitGenerationResult,
} from "./domain/music-generation-provider.js";
export { createPreparedGeneration } from "./domain/music-generation-provider.js";
export type {
  MusicGenerationCallbackNormalizer,
  NormalizedProviderCallback,
  NormalizedProviderCallbackError,
  NormalizedCallbackIgnoreReason,
} from "./domain/music-generation-callback-normalizer.js";
export {
  SunoMusicCallbackNormalizer,
  createSunoMusicCallbackNormalizer,
} from "./providers/suno-api/suno-callback.normalizer.js";
export {
  tryNormalizeSunoAlbumCoverCallback,
  type NormalizedSunoAlbumCoverCallback,
} from "./providers/suno-api/suno-album-cover-callback.js";
export {
  MockMusicCallbackNormalizer,
  createMockMusicCallbackNormalizer,
  type MockCallbackNormalizerOptions,
} from "./providers/mock/mock-callback.normalizer.js";
export {
  MusicProviderError,
  MusicRateLimitError,
  MusicInsufficientCreditsError,
  MusicGenerationFailedError,
  MusicInvalidPromptError,
  MusicProviderUnavailableError,
  MusicTimeoutError,
} from "./domain/errors/index.js";
export { NotImplementedMusicProviderError } from "./domain/not-implemented.error.js";
export { SunoApiProvider, createSunoApiProvider } from "./providers/suno-api/suno-api.provider.js";
export type { PreparedSunoMusicGenerate } from "./providers/suno-api/suno-api.provider.js";
export {
  SunoMusicGenerationProvider,
  createSunoMusicGenerationProvider,
} from "./providers/suno-api/suno-music-generation.provider.js";
export {
  MockMusicGenerationProvider,
  createMockMusicGenerationProvider,
  type MockMusicGenerationProviderOptions,
  type MockSubmitMode,
  type MockPreparedPayload,
} from "./providers/mock/mock-music-generation.provider.js";
export {
  submitSunoMusicTaskOnce,
  type SunoMusicSubmitOnceResult,
} from "./providers/suno-api/suno-music-submit-once.js";
export { getSunoRateLimiter } from "./providers/suno-api/suno-rate-limiter.js";
export { SunoApiClient, toSunoModelId } from "./providers/suno-api/suno-api.client.js";
export { createSunoApiClient } from "./providers/suno-api/create-suno-api-client.js";
export { mapSunoTrack } from "./providers/suno-api/suno-api.mapper.js";
export type { SunoApiClientConfig } from "./providers/suno-api/suno-api.client.js";
export type {
  SunoMusicTaskRaw,
  SunoLyricsTaskRaw,
  SunoModelId,
} from "./providers/suno-api/suno-api.types.js";
export {
  MUREKA_PROVIDER_ID,
  MurekaClient,
  createMurekaClient,
  MurekaMusicProvider,
  createMurekaMusicProvider,
  MurekaMusicGenerationProvider,
  createMurekaMusicGenerationProvider,
  MurekaVocalCloneProvider,
  createMurekaVocalCloneProvider,
  MurekaHttpError,
  MurekaConfigurationError,
  classifyMurekaHttpStatus,
  isMurekaInvalidUrlFetchError,
  mapMurekaHttpErrorToMusicError,
  mapMurekaStatusToMusicStatus,
  mapMurekaQueryToGenerationStatus,
  mapMurekaChoiceToGeneratedTrack,
  isMurekaTerminalStatus,
  getMurekaSongLimiter,
  getMurekaVocalCloneLimiter,
  resetMurekaLimitersForTests,
  resolveMurekaClientConfig,
  assertMurekaEnabled,
  canListenMurekaProviderJobs,
  resolveMurekaVocalId,
} from "./providers/mureka/index.js";
export type {
  MurekaErrorKind,
  MurekaClientConfig,
  MurekaVocalCloneInput,
  PreparedMurekaMusicGenerate,
} from "./providers/mureka/index.js";
export { createMusicGenerationProvider } from "./music-generation-provider.factory.js";
export {
  resolveMusicProviderForGeneration,
  type ResolveMusicProviderInput,
  type ResolveMusicProviderResult,
} from "./resolve-music-provider.js";
export { ElevenLabsMusicProviderAdapter } from "./providers/elevenlabs/elevenlabs-music.provider.js";
export { OfficialSunoProvider } from "./providers/official-suno/official-suno.provider.js";
export { UdioProvider } from "./providers/udio/udio.provider.js";
export {
  MusicProviderFactory,
  createMusicProviderFactory,
  type MusicProviderRegistry,
} from "./music-provider.factory.js";
export {
  DemoMusicProvider,
  createDemoMusicProvider,
} from "./providers/demo/demo-music.provider.js";
export { MusicService, createMusicService } from "./music.service.js";
export {
  createLyricsEngine,
  type LyricsEngine,
} from "./lyrics-engine.js";
export { pollMusicUntilComplete, type PollMusicOptions } from "./poll-music.js";
export {
  resolveMusicProviderConfig,
  assertSafeSunoMusicApiBaseUrl,
  type MusicProviderConfig,
} from "./music-config.js";
export type {
  AddInstrumentalInput,
  AddVocalsInput,
  AudioResult,
  SeparateStemsInput,
  StemResult,
} from "./domain/music.types.js";

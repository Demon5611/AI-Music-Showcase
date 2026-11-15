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
  LegacyengineGenerationOptions,
  AudioengineGenerationOptions,
} from "./domain/music.types.js";
export {
  fromPersistedSongInput,
  getLegacyengineGenerationOptions,
  getAudioengineGenerationOptions,
  isInstrumentalMode,
  requireLegacyengineGenerationOptions,
  toPersistedSongInput,
  withLegacyengineGenerationOptions,
  withAudioengineGenerationOptions,
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
  LegacyengineMusicCallbackNormalizer,
  createLegacyengineMusicCallbackNormalizer,
} from "./providers/legacyengine-api/legacyengine-callback.normalizer.js";
export {
  tryNormalizeLegacyengineAlbumCoverCallback,
  type NormalizedLegacyengineAlbumCoverCallback,
} from "./providers/legacyengine-api/legacyengine-album-cover-callback.js";
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
export { LegacyengineApiProvider, createLegacyengineApiProvider } from "./providers/legacyengine-api/legacyengine-api.provider.js";
export type { PreparedLegacyengineMusicGenerate } from "./providers/legacyengine-api/legacyengine-api.provider.js";
export {
  LegacyengineMusicGenerationProvider,
  createLegacyengineMusicGenerationProvider,
} from "./providers/legacyengine-api/legacyengine-music-generation.provider.js";
export {
  MockMusicGenerationProvider,
  createMockMusicGenerationProvider,
  type MockMusicGenerationProviderOptions,
  type MockSubmitMode,
  type MockPreparedPayload,
} from "./providers/mock/mock-music-generation.provider.js";
export {
  submitLegacyengineMusicTaskOnce,
  type LegacyengineMusicSubmitOnceResult,
} from "./providers/legacyengine-api/legacyengine-music-submit-once.js";
export { getLegacyengineRateLimiter } from "./providers/legacyengine-api/legacyengine-rate-limiter.js";
export { LegacyengineApiClient, toLegacyengineModelId } from "./providers/legacyengine-api/legacyengine-api.client.js";
export { createLegacyengineApiClient } from "./providers/legacyengine-api/create-legacyengine-api-client.js";
export { mapLegacyengineTrack } from "./providers/legacyengine-api/legacyengine-api.mapper.js";
export type { LegacyengineApiClientConfig } from "./providers/legacyengine-api/legacyengine-api.client.js";
export type {
  LegacyengineMusicTaskRaw,
  LegacyengineLyricsTaskRaw,
  LegacyengineModelId,
} from "./providers/legacyengine-api/legacyengine-api.types.js";
export {
  AUDIOENGINE_PROVIDER_ID,
  AudioengineClient,
  createAudioengineClient,
  AudioengineMusicProvider,
  createAudioengineMusicProvider,
  AudioengineMusicGenerationProvider,
  createAudioengineMusicGenerationProvider,
  AudioengineVocalCloneProvider,
  createAudioengineVocalCloneProvider,
  AudioengineHttpError,
  AudioengineConfigurationError,
  classifyAudioengineHttpStatus,
  isAudioengineInvalidUrlFetchError,
  mapAudioengineHttpErrorToMusicError,
  mapAudioengineStatusToMusicStatus,
  mapAudioengineQueryToGenerationStatus,
  mapAudioengineChoiceToGeneratedTrack,
  isAudioengineTerminalStatus,
  getAudioengineSongLimiter,
  getAudioengineVocalCloneLimiter,
  resetAudioengineLimitersForTests,
  resolveAudioengineClientConfig,
  assertAudioengineEnabled,
  canListenAudioengineProviderJobs,
  resolveAudioengineVocalId,
} from "./providers/audioengine/index.js";
export type {
  AudioengineErrorKind,
  AudioengineClientConfig,
  AudioengineVocalCloneInput,
  PreparedAudioengineMusicGenerate,
} from "./providers/audioengine/index.js";
export { createMusicGenerationProvider } from "./music-generation-provider.factory.js";
export {
  resolveMusicProviderForGeneration,
  type ResolveMusicProviderInput,
  type ResolveMusicProviderResult,
} from "./resolve-music-provider.js";
export { VoiceengineMusicProviderAdapter } from "./providers/voiceengine/voiceengine-music.provider.js";
export { OfficialLegacyengineProvider } from "./providers/official-legacyengine/official-legacyengine.provider.js";
export { UdioProvider } from "./providers/alternateengine/alternateengine.provider.js";
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
  assertSafeLegacyengineMusicApiBaseUrl,
  type MusicProviderConfig,
} from "./music-config.js";
export type {
  AddInstrumentalInput,
  AddVocalsInput,
  AudioResult,
  SeparateStemsInput,
  StemResult,
} from "./domain/music.types.js";

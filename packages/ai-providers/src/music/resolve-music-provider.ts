import {
  isAudioengineSupportedLyricsLanguage,
  resolveAudioenginePersonalVoiceAvailability,
} from "@ai-music/shared";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import { MusicProviderError } from "./domain/errors/music-provider.error.js";

export type ResolveMusicProviderInput = {
  /** Explicit provider from client (ignored for non-personal Audioengine). */
  explicitProvider?: MusicProviderId;
  /**
   * True only when the user opted into Personal Voice AND a ready Audioengine
   * VoiceProfile was resolved. Ready profile alone must not set this.
   */
  hasPersonalAudioengineVoice: boolean;
  /** Lyrics language code (execution language). */
  lyricsLanguage?: string;
  /** APP_ENV — required for production rollout gate. */
  appEnv?: string;
  env?: NodeJS.ProcessEnv;
};

export type ResolveMusicProviderResult =
  | { providerId: MusicProviderId }
  | { error: MusicProviderError };

/**
 * Product music routing (deterministic; ignores MUSIC_DEFAULT_PROVIDER for songs):
 * - Personal Voice ON + ready profile → Audioengine (when Personal Voice available)
 * - otherwise → LegacyengineAPI
 *
 * Ready VoiceProfile alone never selects Audioengine.
 * Production additionally requires AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED.
 */
export function resolveMusicProviderForGeneration(
  input: ResolveMusicProviderInput,
): ResolveMusicProviderResult {
  const env = input.env ?? process.env;
  const appEnv = input.appEnv ?? env.APP_ENV;

  if (input.hasPersonalAudioengineVoice) {
    const availability = resolveAudioenginePersonalVoiceAvailability({ appEnv, env });
    if (!availability.available) {
      return {
        error: new MusicProviderError(
          "Personal AI voice requires Audioengine, which is unavailable",
          "AUDIOENGINE_PERSONAL_VOICE_UNAVAILABLE",
          "audioengine",
          503,
        ),
      };
    }

    const language = input.lyricsLanguage?.trim().toLowerCase();
    if (language === "auto") {
      return {
        error: new MusicProviderError(
          'lyricsLanguage "auto" must be resolved before provider routing',
          "AUDIOENGINE_LANGUAGE_UNSUPPORTED",
          "audioengine",
          400,
        ),
      };
    }
    if (language && !isAudioengineSupportedLyricsLanguage(language)) {
      return {
        error: new MusicProviderError(
          `Language "${language}" is not supported for personal AI voice`,
          "AUDIOENGINE_LANGUAGE_UNSUPPORTED",
          "audioengine",
          400,
        ),
      };
    }

    return { providerId: "audioengine" };
  }

  if (input.explicitProvider === "mock") {
    return { providerId: "mock" };
  }

  // Non-personal path is always Legacyengine — ignore explicit audioengine / MUSIC_DEFAULT_PROVIDER=audioengine.
  return { providerId: "legacyengineapi" };
}

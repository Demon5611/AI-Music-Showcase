import {
  isMurekaSupportedLyricsLanguage,
  resolveMurekaPersonalVoiceAvailability,
} from "@ai-music/shared";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import { MusicProviderError } from "./domain/errors/music-provider.error.js";

export type ResolveMusicProviderInput = {
  /** Explicit provider from client (ignored for non-personal Mureka). */
  explicitProvider?: MusicProviderId;
  /**
   * True only when the user opted into Personal Voice AND a ready Mureka
   * VoiceProfile was resolved. Ready profile alone must not set this.
   */
  hasPersonalMurekaVoice: boolean;
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
 * - Personal Voice ON + ready profile → Mureka (when Personal Voice available)
 * - otherwise → SunoAPI
 *
 * Ready VoiceProfile alone never selects Mureka.
 * Production additionally requires MUREKA_PRODUCTION_ROLLOUT_ENABLED.
 */
export function resolveMusicProviderForGeneration(
  input: ResolveMusicProviderInput,
): ResolveMusicProviderResult {
  const env = input.env ?? process.env;
  const appEnv = input.appEnv ?? env.APP_ENV;

  if (input.hasPersonalMurekaVoice) {
    const availability = resolveMurekaPersonalVoiceAvailability({ appEnv, env });
    if (!availability.available) {
      return {
        error: new MusicProviderError(
          "Personal AI voice requires Mureka, which is unavailable",
          "MUREKA_PERSONAL_VOICE_UNAVAILABLE",
          "mureka",
          503,
        ),
      };
    }

    const language = input.lyricsLanguage?.trim().toLowerCase();
    if (language === "auto") {
      return {
        error: new MusicProviderError(
          'lyricsLanguage "auto" must be resolved before provider routing',
          "MUREKA_LANGUAGE_UNSUPPORTED",
          "mureka",
          400,
        ),
      };
    }
    if (language && !isMurekaSupportedLyricsLanguage(language)) {
      return {
        error: new MusicProviderError(
          `Language "${language}" is not supported for personal AI voice`,
          "MUREKA_LANGUAGE_UNSUPPORTED",
          "mureka",
          400,
        ),
      };
    }

    return { providerId: "mureka" };
  }

  if (input.explicitProvider === "mock") {
    return { providerId: "mock" };
  }

  // Non-personal path is always Suno — ignore explicit mureka / MUSIC_DEFAULT_PROVIDER=mureka.
  return { providerId: "sunoapi" };
}

import type { SunoVoiceConfig } from "./suno-voice.types.js";

export function resolveSunoVoiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): SunoVoiceConfig {
  return {
    apiBaseUrl: env.SUNO_API_BASE_URL ?? "https://api.sunoapi.org",
    fileUploadBaseUrl:
      env.SUNO_FILE_UPLOAD_BASE_URL ?? "https://sunoapiorg.redpandaai.co",
    apiKey: env.SUNO_API_KEY ?? "",
    callbackUrl:
      env.SUNO_CALLBACK_URL ??
      "http://localhost:3001/api/music/callback/suno",
    requestTimeoutMs: Number(env.SUNO_REQUEST_TIMEOUT_MS ?? 30_000),
    voiceLanguage: env.SUNO_VOICE_LANGUAGE ?? "ru",
  };
}

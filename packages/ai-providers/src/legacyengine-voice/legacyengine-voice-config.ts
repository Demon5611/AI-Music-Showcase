import type { LegacyengineVoiceConfig } from "./legacyengine-voice.types.js";

export function resolveLegacyengineVoiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): LegacyengineVoiceConfig {
  return {
    apiBaseUrl: env.LEGACYENGINE_API_BASE_URL ?? "https://integration.example.invalid",
    fileUploadBaseUrl:
      env.LEGACYENGINE_FILE_UPLOAD_BASE_URL ?? "https://integration.example.invalid",
    apiKey: env.LEGACYENGINE_API_KEY ?? "",
    callbackUrl:
      env.LEGACYENGINE_CALLBACK_URL ??
      "http://localhost:3001/api/music/callback/legacyengine",
    requestTimeoutMs: Number(env.LEGACYENGINE_REQUEST_TIMEOUT_MS ?? 30_000),
    voiceLanguage: env.LEGACYENGINE_VOICE_LANGUAGE ?? "ru",
  };
}

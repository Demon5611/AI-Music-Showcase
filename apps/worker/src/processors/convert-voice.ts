import {
  createMusicService,
  downloadUrl,
  pollMusicUntilComplete,
  resolveMusicProviderConfig,
} from "@ai-music/ai-providers";
import type { GenerationJob, VoiceSample } from "@ai-music/db";
import { readStorageObject } from "../common/storage.js";

function buildTrackTitle(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.slice(0, 80) || "Generated Track";
}

export async function generateSongWithSunoVoice(
  job: GenerationJob,
  voiceSample: VoiceSample,
): Promise<Buffer> {
  const config = resolveMusicProviderConfig();
  const sunoVoiceId = voiceSample.sunoVoiceId;

  if (!sunoVoiceId) {
    throw new Error("Голос AI Music не готов");
  }

  if (config.providerId === "sunoapi" && config.sunoApiKey.trim()) {
    const music = createMusicService();
    const started = await music.generateSong({
      prompt: job.prompt,
      style: job.style,
      title: buildTrackTitle(job.prompt),
      mode: "song",
      providerOptions: {
        providerId: "sunoapi",
        options: {
          customMode: true,
          personaId: sunoVoiceId,
          personaModel: "voice_persona",
        },
      },
    });

    const completed = await pollMusicUntilComplete(music, started.taskId, {
      intervalMs: config.pollIntervalMs,
      timeoutMs: config.pollTimeoutMs,
    });

    const audioUrl = completed.tracks?.[0]?.audioUrl;

    if (!audioUrl) {
      throw new Error("AI Music не вернул ссылку на аудио");
    }

    return downloadUrl(audioUrl);
  }

  if (process.env.AUTH_DEV_MODE === "true") {
    return readStorageObject(voiceSample.r2Key);
  }

  throw new Error("SUNO_API_KEY is required for music generation");
}

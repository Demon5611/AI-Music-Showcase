import type { MusicGenerationStatus } from "./domain/music-status.js";
import type { GenerationStatusResult } from "./domain/music.types.js";
import type { MusicService } from "./music.service.js";
import { MusicGenerationFailedError } from "./domain/errors/music-generation-failed.error.js";
import { MusicTimeoutError } from "./domain/errors/music-timeout.error.js";
import { resolveMusicProviderConfig } from "./music-config.js";

export interface PollMusicOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

function isTerminalStatus(status: MusicGenerationStatus): boolean {
  return status === "completed" || status === "failed";
}

export async function pollMusicUntilComplete(
  music: MusicService,
  taskId: string,
  options: PollMusicOptions = {},
): Promise<GenerationStatusResult> {
  const config = resolveMusicProviderConfig();
  const intervalMs = options.intervalMs ?? config.pollIntervalMs;
  const timeoutMs = options.timeoutMs ?? config.pollTimeoutMs;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await music.getGenerationStatus(taskId);

    if (isTerminalStatus(status.status)) {
      if (status.status === "failed") {
        throw new MusicGenerationFailedError(
          status.provider,
          status.errorMessage ?? "Music generation failed",
        );
      }

      return status;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new MusicTimeoutError(config.providerId);
}

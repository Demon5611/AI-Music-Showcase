/**
 * Publishes a short-TTL Redis heartbeat while the Audioengine provider job worker
 * is listening. API reads the same key before spend/enqueue.
 */
import {
  logLoadControl,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
} from "@ai-music/shared";
import { Redis } from "ioredis";

export type AudioengineWorkerHeartbeatHandle = {
  stop(): Promise<void>;
};

export async function startAudioengineWorkerListenHeartbeat(): Promise<AudioengineWorkerHeartbeatHandle> {
  const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  let stopped = false;
  let loggedStarted = false;

  const beat = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      await redis.set(
        AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
        String(Date.now()),
        "EX",
        AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
      );
      if (!loggedStarted) {
        loggedStarted = true;
        logLoadControl("audioengine_worker_heartbeat", {
          provider: "audioengine",
          queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
          key: AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
          ttlSec: AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
          intervalMs: AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
          status: "started",
        });
      }
    } catch (error) {
      logLoadControl(
        "audioengine_worker_heartbeat",
        {
          provider: "audioengine",
          queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
          key: AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
          status: "error",
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        },
        "error",
      );
    }
  };

  await beat();
  const timer = setInterval(() => {
    void beat();
  }, AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      try {
        await redis.del(AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY);
      } catch {
        // best-effort clear
      }
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}

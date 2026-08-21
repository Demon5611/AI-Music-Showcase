/**
 * Publishes a short-TTL Redis heartbeat while the Mureka provider job worker
 * is listening. API reads the same key before spend/enqueue.
 */
import {
  logLoadControl,
  MUREKA_PROVIDER_JOB_QUEUE_NAME,
  MUREKA_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
  MUREKA_WORKER_LISTEN_HEARTBEAT_KEY,
  MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
} from "@ai-music/shared";
import { Redis } from "ioredis";

export type MurekaWorkerHeartbeatHandle = {
  stop(): Promise<void>;
};

export async function startMurekaWorkerListenHeartbeat(): Promise<MurekaWorkerHeartbeatHandle> {
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
        MUREKA_WORKER_LISTEN_HEARTBEAT_KEY,
        String(Date.now()),
        "EX",
        MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
      );
      if (!loggedStarted) {
        loggedStarted = true;
        logLoadControl("mureka_worker_heartbeat", {
          provider: "mureka",
          queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
          key: MUREKA_WORKER_LISTEN_HEARTBEAT_KEY,
          ttlSec: MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
          intervalMs: MUREKA_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
          status: "started",
        });
      }
    } catch (error) {
      logLoadControl(
        "mureka_worker_heartbeat",
        {
          provider: "mureka",
          queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
          key: MUREKA_WORKER_LISTEN_HEARTBEAT_KEY,
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
  }, MUREKA_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      try {
        await redis.del(MUREKA_WORKER_LISTEN_HEARTBEAT_KEY);
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

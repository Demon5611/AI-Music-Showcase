/**
 * API-side check: Audioengine worker listen heartbeat must be fresh before spend/enqueue.
 */
import {
  isAudioengineWorkerHeartbeatValueFresh,
  logLoadControl,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
} from "@ai-music/shared";
import { Redis } from "ioredis";

let redis: Redis | null = null;

function getHeartbeatRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }
  return redis;
}

export async function closeAudioengineWorkerHeartbeatReader(): Promise<void> {
  if (!redis) {
    return;
  }
  const client = redis;
  redis = null;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

export async function isAudioengineWorkerListenHeartbeatFresh(
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    const value = await getHeartbeatRedis().get(AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY);
    const fresh = isAudioengineWorkerHeartbeatValueFresh(value, nowMs);
    if (!fresh) {
      logLoadControl(
        "audioengine_worker_heartbeat_missing",
        {
          provider: "audioengine",
          queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
          key: AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
          status: "missing_or_stale",
        },
        "warn",
      );
    }
    return fresh;
  } catch (error) {
    logLoadControl(
      "audioengine_worker_heartbeat_missing",
      {
        provider: "audioengine",
        queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
        key: AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
        status: "redis_error",
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      },
      "error",
    );
    return false;
  }
}

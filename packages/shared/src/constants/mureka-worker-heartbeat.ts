/**
 * Redis heartbeat: worker proves mureka-provider-jobs listener is alive.
 * API must see a fresh key before spend/enqueue for Mureka generate / vocal clone.
 */

/** Shared Redis key (API + worker). Value: unix ms timestamp string. */
export const MUREKA_WORKER_LISTEN_HEARTBEAT_KEY = "mureka:worker:listen:heartbeat";

/**
 * Key TTL. Must be greater than the refresh interval so a healthy worker
 * never expires between beats.
 */
export const MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC = 15;

/** How often the listening worker refreshes the key. */
export const MUREKA_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS = 5_000;

export function isMurekaWorkerHeartbeatValueFresh(
  value: string | null | undefined,
  nowMs: number = Date.now(),
  maxAgeMs: number = MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC * 1000,
): boolean {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const writtenAt = Number(value.trim());
  if (!Number.isFinite(writtenAt) || writtenAt <= 0) {
    return false;
  }

  return nowMs - writtenAt <= maxAgeMs;
}

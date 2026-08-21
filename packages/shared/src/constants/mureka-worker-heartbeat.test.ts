/**
 * Mureka worker listen heartbeat helpers.
 * Run: pnpm --filter @ai-music/shared exec tsx --test src/constants/mureka-worker-heartbeat.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMurekaWorkerHeartbeatValueFresh,
  MUREKA_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
  MUREKA_WORKER_LISTEN_HEARTBEAT_KEY,
  MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
} from "./mureka-worker-heartbeat.js";

describe("mureka worker listen heartbeat", () => {
  it("exports stable key and TTL greater than refresh interval", () => {
    assert.equal(MUREKA_WORKER_LISTEN_HEARTBEAT_KEY, "mureka:worker:listen:heartbeat");
    assert.ok(
      MUREKA_WORKER_LISTEN_HEARTBEAT_TTL_SEC * 1000 >
        MUREKA_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
    );
  });

  it("treats missing/invalid values as stale", () => {
    assert.equal(isMurekaWorkerHeartbeatValueFresh(null), false);
    assert.equal(isMurekaWorkerHeartbeatValueFresh(""), false);
    assert.equal(isMurekaWorkerHeartbeatValueFresh("abc"), false);
  });

  it("accepts a recent timestamp and rejects an expired one", () => {
    const now = 1_700_000_000_000;
    assert.equal(isMurekaWorkerHeartbeatValueFresh(String(now), now), true);
    assert.equal(
      isMurekaWorkerHeartbeatValueFresh(String(now - 14_000), now),
      true,
    );
    assert.equal(
      isMurekaWorkerHeartbeatValueFresh(String(now - 16_000), now),
      false,
    );
  });
});

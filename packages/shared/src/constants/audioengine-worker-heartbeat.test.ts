/**
 * Audioengine worker listen heartbeat helpers.
 * Run: pnpm --filter @ai-music/shared exec tsx --test src/constants/audioengine-worker-heartbeat.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAudioengineWorkerHeartbeatValueFresh,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY,
  AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_TTL_SEC,
} from "./audioengine-worker-heartbeat.js";

describe("audioengine worker listen heartbeat", () => {
  it("exports stable key and TTL greater than refresh interval", () => {
    assert.equal(AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_KEY, "audioengine:worker:listen:heartbeat");
    assert.ok(
      AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_TTL_SEC * 1000 >
        AUDIOENGINE_WORKER_LISTEN_HEARTBEAT_INTERVAL_MS,
    );
  });

  it("treats missing/invalid values as stale", () => {
    assert.equal(isAudioengineWorkerHeartbeatValueFresh(null), false);
    assert.equal(isAudioengineWorkerHeartbeatValueFresh(""), false);
    assert.equal(isAudioengineWorkerHeartbeatValueFresh("abc"), false);
  });

  it("accepts a recent timestamp and rejects an expired one", () => {
    const now = 1_700_000_000_000;
    assert.equal(isAudioengineWorkerHeartbeatValueFresh(String(now), now), true);
    assert.equal(
      isAudioengineWorkerHeartbeatValueFresh(String(now - 14_000), now),
      true,
    );
    assert.equal(
      isAudioengineWorkerHeartbeatValueFresh(String(now - 16_000), now),
      false,
    );
  });
});

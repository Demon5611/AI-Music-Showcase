/**
 * Global Legacyengine POST rate limit (sliding window). Shared via Redis when REDIS_URL is set.
 * @see docs/music-generation-queue-load-control.md
 */
import { randomUUID } from "node:crypto";
import { logLoadControl } from "@ai-music/shared";
import { Redis } from "ioredis";

export interface LegacyengineRateLimiterConfig {
  redisUrl: string | null;
  maxRequests: number;
  windowMs: number;
  maxWaitMs: number;
}

const REDIS_KEY = "legacyengine:submit:sliding-window";

const ACQUIRE_SLOT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)

if count < limit then
  redis.call("ZADD", key, now, member)
  redis.call("PEXPIRE", key, window + 1000)
  return 0
end

local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
if oldest[2] then
  return math.ceil(tonumber(oldest[2]) + window - now)
end

return window
`;

export function resolveLegacyengineRateLimiterConfig(
  env: NodeJS.ProcessEnv = process.env,
): LegacyengineRateLimiterConfig {
  return {
    redisUrl: env.REDIS_URL?.trim() || null,
    maxRequests: Number(env.LEGACYENGINE_RATE_LIMIT_MAX ?? 18),
    windowMs: Number(env.LEGACYENGINE_RATE_LIMIT_WINDOW_MS ?? 10_000),
    maxWaitMs: Number(env.LEGACYENGINE_RATE_LIMIT_MAX_WAIT_MS ?? 120_000),
  };
}

export interface LegacyengineRateLimiter {
  acquire(): Promise<void>;
}

class InMemoryLegacyengineRateLimiter implements LegacyengineRateLimiter {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly maxWaitMs: number,
  ) {}

  async acquire(): Promise<void> {
    const startedAt = Date.now();
    const deadline = startedAt + this.maxWaitMs;
    let waitedMs = 0;

    while (Date.now() < deadline) {
      const now = Date.now();
      this.prune(now);

      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        logRateLimitAcquire(startedAt, waitedMs, "memory");
        return;
      }

      const oldest = this.timestamps[0] ?? now;
      const waitMs = Math.max(1, oldest + this.windowMs - now);
      waitedMs += waitMs;
      await sleep(waitMs + jitterMs());
    }

    logLoadControl(
      "legacyengine_rate_limit_timeout",
      {
        backend: "memory",
        maxWaitMs: this.maxWaitMs,
        waitedMs,
      },
      "error",
    );

    throw new Error("Legacyengine rate limiter wait timeout");
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }
  }
}

class RedisLegacyengineRateLimiter implements LegacyengineRateLimiter {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly maxWaitMs: number,
  ) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async acquire(): Promise<void> {
    const startedAt = Date.now();
    const deadline = startedAt + this.maxWaitMs;
    let waitedMs = 0;

    while (Date.now() < deadline) {
      const waitMs = await this.tryAcquireSlot();
      if (waitMs === 0) {
        logRateLimitAcquire(startedAt, waitedMs, "redis");
        return;
      }

      const cappedWait = Math.min(waitMs, deadline - Date.now());
      if (cappedWait <= 0) {
        break;
      }

      waitedMs += cappedWait;
      await sleep(cappedWait + jitterMs());
    }

    logLoadControl(
      "legacyengine_rate_limit_timeout",
      {
        backend: "redis",
        maxWaitMs: this.maxWaitMs,
        waitedMs,
      },
      "error",
    );

    throw new Error("Legacyengine rate limiter wait timeout");
  }

  private async tryAcquireSlot(): Promise<number> {
    const result = await this.redis.eval(
      ACQUIRE_SLOT_SCRIPT,
      1,
      REDIS_KEY,
      String(Date.now()),
      String(this.windowMs),
      String(this.maxRequests),
      randomUUID(),
    );

    return Number(result);
  }
}

let limiterInstance: LegacyengineRateLimiter | null = null;

export function createLegacyengineRateLimiter(
  config: LegacyengineRateLimiterConfig = resolveLegacyengineRateLimiterConfig(),
): LegacyengineRateLimiter {
  if (config.redisUrl) {
    return new RedisLegacyengineRateLimiter(
      config.redisUrl,
      config.maxRequests,
      config.windowMs,
      config.maxWaitMs,
    );
  }

  return new InMemoryLegacyengineRateLimiter(
    config.maxRequests,
    config.windowMs,
    config.maxWaitMs,
  );
}

export function getLegacyengineRateLimiter(): LegacyengineRateLimiter {
  if (!limiterInstance) {
    limiterInstance = createLegacyengineRateLimiter();
  }

  return limiterInstance;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitterMs(): number {
  return Math.floor(Math.random() * 150);
}

function logRateLimitAcquire(
  startedAt: number,
  waitedMs: number,
  backend: "memory" | "redis",
): void {
  const totalMs = Date.now() - startedAt;

  if (waitedMs <= 0) {
    return;
  }

  logLoadControl("legacyengine_rate_limit_acquire", {
    backend,
    waitedMs,
    totalMs,
  });
}

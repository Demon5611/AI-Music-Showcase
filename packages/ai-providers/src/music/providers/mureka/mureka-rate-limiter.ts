/**
 * Distributed concurrency limiter for Mureka operations (Redis + in-memory fallback).
 * Slot is held with TTL so crashed workers do not leak capacity forever.
 */
import { randomUUID } from "node:crypto";
import { logLoadControl, resolveMurekaFeatureFlags } from "@ai-music/shared";
import { Redis } from "ioredis";

export type MurekaLimiterKind = "song" | "vocal_clone";

export interface MurekaRateLimiterConfig {
  redisUrl: string | null;
  maxConcurrent: number;
  maxWaitMs: number;
  slotTtlMs: number;
}

const ACQUIRE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now)
local count = redis.call("ZCARD", key)

if count < limit then
  redis.call("ZADD", key, now + ttl, member)
  redis.call("PEXPIRE", key, ttl + 1000)
  return 0
end

local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
if oldest[2] then
  return math.ceil(tonumber(oldest[2]) - now)
end

return 1000
`;

const RELEASE_SCRIPT = `
local key = KEYS[1]
local member = ARGV[1]
redis.call("ZREM", key, member)
return 1
`;

export interface MurekaConcurrencyPermit {
  release(): Promise<void>;
}

export interface MurekaConcurrencyLimiter {
  acquire(): Promise<MurekaConcurrencyPermit>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(): number {
  return Math.floor(Math.random() * 50);
}

class InMemoryMurekaLimiter implements MurekaConcurrencyLimiter {
  private readonly slots = new Map<string, number>();

  constructor(
    private readonly kind: MurekaLimiterKind,
    private readonly maxConcurrent: number,
    private readonly maxWaitMs: number,
    private readonly slotTtlMs: number,
  ) {}

  private prune(now: number): void {
    for (const [id, expiresAt] of this.slots) {
      if (expiresAt <= now) {
        this.slots.delete(id);
      }
    }
  }

  async acquire(): Promise<MurekaConcurrencyPermit> {
    const startedAt = Date.now();
    const deadline = startedAt + this.maxWaitMs;
    const member = randomUUID();

    while (Date.now() < deadline) {
      const now = Date.now();
      this.prune(now);

      if (this.slots.size < this.maxConcurrent) {
        this.slots.set(member, now + this.slotTtlMs);
        logLoadControl("mureka_limiter_acquire", {
          kind: this.kind,
          backend: "memory",
          waitedMs: Date.now() - startedAt,
        });
        return {
          release: async () => {
            this.slots.delete(member);
          },
        };
      }

      await sleep(100 + jitterMs());
    }

    logLoadControl(
      "mureka_limiter_timeout",
      { kind: this.kind, backend: "memory", maxWaitMs: this.maxWaitMs },
      "error",
    );
    throw new Error(`Mureka ${this.kind} concurrency limiter wait timeout`);
  }
}

class RedisMurekaLimiter implements MurekaConcurrencyLimiter {
  private readonly redis: Redis;
  private readonly key: string;

  constructor(
    private readonly kind: MurekaLimiterKind,
    redisUrl: string,
    private readonly maxConcurrent: number,
    private readonly maxWaitMs: number,
    private readonly slotTtlMs: number,
  ) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
    this.key = `mureka:limiter:${kind}`;
  }

  async acquire(): Promise<MurekaConcurrencyPermit> {
    const startedAt = Date.now();
    const deadline = startedAt + this.maxWaitMs;
    const member = randomUUID();

    while (Date.now() < deadline) {
      const waitMs = (await this.redis.eval(
        ACQUIRE_SCRIPT,
        1,
        this.key,
        String(Date.now()),
        String(this.slotTtlMs),
        String(this.maxConcurrent),
        member,
      )) as number;

      if (waitMs === 0) {
        logLoadControl("mureka_limiter_acquire", {
          kind: this.kind,
          backend: "redis",
          waitedMs: Date.now() - startedAt,
        });
        return {
          release: async () => {
            await this.redis.eval(RELEASE_SCRIPT, 1, this.key, member);
          },
        };
      }

      await sleep(Math.min(Math.max(waitMs, 50), 2_000) + jitterMs());
    }

    logLoadControl(
      "mureka_limiter_timeout",
      { kind: this.kind, backend: "redis", maxWaitMs: this.maxWaitMs },
      "error",
    );
    throw new Error(`Mureka ${this.kind} concurrency limiter wait timeout`);
  }
}

const songLimiterSingleton: { current: MurekaConcurrencyLimiter | null } = {
  current: null,
};
const vocalLimiterSingleton: { current: MurekaConcurrencyLimiter | null } = {
  current: null,
};

function createLimiter(
  kind: MurekaLimiterKind,
  env: NodeJS.ProcessEnv = process.env,
): MurekaConcurrencyLimiter {
  const flags = resolveMurekaFeatureFlags(env);
  const maxConcurrent =
    kind === "song" ? flags.providerConcurrency : flags.vocalCloneConcurrency;
  const maxWaitMs = Number(env.MUREKA_LIMITER_MAX_WAIT_MS ?? 120_000);
  const slotTtlMs = Number(env.MUREKA_LIMITER_SLOT_TTL_MS ?? 700_000);
  const redisUrl = env.REDIS_URL?.trim() || null;

  if (redisUrl) {
    return new RedisMurekaLimiter(
      kind,
      redisUrl,
      maxConcurrent,
      Number.isFinite(maxWaitMs) ? maxWaitMs : 120_000,
      Number.isFinite(slotTtlMs) ? slotTtlMs : 700_000,
    );
  }

  return new InMemoryMurekaLimiter(
    kind,
    maxConcurrent,
    Number.isFinite(maxWaitMs) ? maxWaitMs : 120_000,
    Number.isFinite(slotTtlMs) ? slotTtlMs : 700_000,
  );
}

export function getMurekaSongLimiter(
  env: NodeJS.ProcessEnv = process.env,
): MurekaConcurrencyLimiter {
  if (!songLimiterSingleton.current) {
    songLimiterSingleton.current = createLimiter("song", env);
  }
  return songLimiterSingleton.current;
}

export function getMurekaVocalCloneLimiter(
  env: NodeJS.ProcessEnv = process.env,
): MurekaConcurrencyLimiter {
  if (!vocalLimiterSingleton.current) {
    vocalLimiterSingleton.current = createLimiter("vocal_clone", env);
  }
  return vocalLimiterSingleton.current;
}

/** Test helper. */
export function resetMurekaLimitersForTests(): void {
  songLimiterSingleton.current = null;
  vocalLimiterSingleton.current = null;
}

import { prisma } from "@ai-music/db";
import { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

export type DependencyChecks = {
  db: boolean;
  redis: boolean;
};

function sanitizeHealthError(error: unknown): { name: string; message: string } {
  const err = error instanceof Error ? error : new Error(String(error));

  return {
    name: err.name,
    message: err.message.replace(/postgresql:\/\/[^\s'"]+/gi, "postgresql://[redacted]"),
  };
}

export async function checkDatabase(log?: FastifyBaseLogger): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log?.error({ err: sanitizeHealthError(error) }, "Health DB check failed");
    return false;
  }
}

export async function checkRedis(
  redisUrl: string,
  log?: FastifyBaseLogger,
): Promise<boolean> {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
  });

  try {
    await client.connect();
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    log?.error({ err: sanitizeHealthError(error) }, "Health Redis check failed");
    return false;
  } finally {
    client.disconnect();
  }
}

export async function runDependencyChecks(
  redisUrl: string,
  log?: FastifyBaseLogger,
): Promise<DependencyChecks> {
  const [db, redis] = await Promise.all([
    checkDatabase(log),
    checkRedis(redisUrl, log),
  ]);

  return { db, redis };
}

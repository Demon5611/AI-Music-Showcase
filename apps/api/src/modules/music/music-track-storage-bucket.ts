import { prisma } from "@ai-music/db";
import { getApiEnv } from "../../config/env.js";

/** Current R2 bucket from API env, or null for local/non-R2 drivers. */
export function getConfiguredStorageBucket(): string | null {
  const env = getApiEnv();

  if (env.STORAGE_DRIVER !== "r2") {
    return null;
  }

  return env.R2_BUCKET_NAME?.trim() || null;
}

export async function loadStorageBucketsByKey(
  keys: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(keys.map((key) => key?.trim() ?? "").filter((key) => key.length > 0)),
  ];

  if (unique.length === 0) {
    return new Map();
  }

  const rows = await prisma.storageObject.findMany({
    where: { key: { in: unique }, deletedAt: null },
    select: { key: true, bucket: true },
  });

  return new Map(rows.map((row) => [row.key, row.bucket]));
}

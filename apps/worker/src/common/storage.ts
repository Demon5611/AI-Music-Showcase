import { recordStorageObject } from "@ai-music/db";
import { createInstrumentedObjectStorage } from "@ai-music/observability";
import {
  createObjectStorage,
  type ObjectStorage,
  type PutObjectInput,
} from "@ai-music/storage";
import { getWorkerEnv } from "../config/env.js";
import { buildWorkerStorageOptions } from "./storage-config.js";

let workerStorage: ObjectStorage | null = null;

async function onObjectStored(
  input: PutObjectInput & { bucket: string; sizeBytes: number; etag?: string },
): Promise<void> {
  await recordStorageObject({
    bucket: input.bucket,
    key: input.key,
    kind: input.kind,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    visibility: input.visibility,
    checksum: input.etag ?? null,
  });
}

export function getWorkerStorageService(): ObjectStorage {
  if (!workerStorage) {
    const env = getWorkerEnv();

    const raw = createObjectStorage({
      ...buildWorkerStorageOptions(),
      onObjectStored,
    });

    workerStorage = createInstrumentedObjectStorage(raw, env.STORAGE_DRIVER);
  }

  return workerStorage;
}

export async function readStorageObject(key: string): Promise<Buffer> {
  return getWorkerStorageService().getObject(key);
}

export async function writeStorageObject(
  key: string,
  data: Buffer,
  contentType: string,
  meta?: Pick<PutObjectInput, "kind" | "userId" | "entityType" | "entityId" | "visibility">,
): Promise<void> {
  await getWorkerStorageService().putObject({
    key,
    body: data,
    contentType,
    kind: meta?.kind ?? "worker_upload",
    userId: meta?.userId,
    entityType: meta?.entityType,
    entityId: meta?.entityId,
    visibility: meta?.visibility ?? "private",
  });
}

export async function deleteStorageObject(key: string): Promise<void> {
  await getWorkerStorageService().deleteObject(key);
}

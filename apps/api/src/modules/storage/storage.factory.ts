import { recordStorageObject } from "@ai-music/db";
import { createInstrumentedObjectStorage } from "@ai-music/observability";
import { createObjectStorage, type ObjectStorage, type PutObjectInput } from "@ai-music/storage";
import { getApiEnv } from "../../config/env.js";
import { buildApiStorageOptions } from "./storage-config.js";

const ALLOWED_AUDIO_MIME = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/webm",
  "audio/flac",
]);

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

let storageInstance: ObjectStorage | null = null;

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

export function getStorageService(): ObjectStorage {
  if (!storageInstance) {
    const env = getApiEnv();

    const raw = createObjectStorage({
      ...buildApiStorageOptions(),
      onObjectStored,
    });

    storageInstance = createInstrumentedObjectStorage(raw, env.STORAGE_DRIVER);
  }

  return storageInstance;
}

export function assertAllowedUploadMime(contentType: string, kind: "audio" | "image"): void {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const allowed = kind === "audio" ? ALLOWED_AUDIO_MIME : ALLOWED_IMAGE_MIME;

  if (!allowed.has(normalized)) {
    throw new Error(`Unsupported ${kind} MIME type: ${normalized}`);
  }
}

export function assertUploadSize(sizeBytes: number, maxBytes: number): void {
  if (sizeBytes > maxBytes) {
    throw new Error(`Upload exceeds max size of ${maxBytes} bytes`);
  }
}

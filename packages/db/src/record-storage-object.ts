import { prisma } from "./prisma.js";

/**
 * Single upsert path for StorageObject rows (API + worker).
 * Clears deletedAt on re-upload of the same bucket/key.
 *
 * `checksum` stores the driver's opaque `etag` string (not SHA-256 / not
 * portable MD5). Do not compare checksums across Local vs R2 as content hashes.
 */
export type RecordStorageObjectInput = {
  bucket: string;
  key: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  visibility?: string;
  /** Opaque storage etag — see ObjectStorage PutObjectResult.etag. */
  checksum?: string | null;
};

export async function recordStorageObject(input: RecordStorageObjectInput): Promise<void> {
  await prisma.storageObject.upsert({
    where: {
      bucket_key: {
        bucket: input.bucket,
        key: input.key,
      },
    },
    create: {
      userId: input.userId ?? null,
      bucket: input.bucket,
      key: input.key,
      kind: input.kind,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum ?? null,
      visibility: input.visibility ?? "private",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
    update: {
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum ?? undefined,
      visibility: input.visibility ?? "private",
      deletedAt: null,
      userId: input.userId ?? undefined,
      entityType: input.entityType ?? undefined,
      entityId: input.entityId ?? undefined,
      kind: input.kind,
    },
  });
}

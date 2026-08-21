export type StorageVisibility = "private" | "public" | "signed";

export type PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  userId?: string;
  kind: string;
  entityType?: string;
  entityId?: string;
  visibility?: StorageVisibility;
};

export type PutObjectResult = {
  bucket: string;
  key: string;
  sizeBytes: number;
  /**
   * Opaque object identity from the driver.
   * Do NOT assume MD5/SHA — Local and R2 may use different algorithms.
   * Compare only for equality within the same driver+key revision.
   */
  etag?: string;
  contentType: string;
};

export type ObjectMetadata = {
  key: string;
  sizeBytes: number;
  contentType: string;
  /**
   * Opaque identifier (same contract as PutObjectResult.etag).
   * After a successful put, getMetadata().etag matches putObject().etag
   * for that revision. Not a portable content hash across drivers.
   */
  etag?: string;
  lastModified?: Date;
};

/**
 * Unified storage API implemented by Local and R2 backends.
 *
 * Semantics (both drivers):
 * - putObject: create or overwrite; returns sizeBytes + opaque etag
 * - getObject / getMetadata: missing key → StorageNotFoundError
 * - exists: false when missing (never throws for not-found)
 * - deleteObject: physical delete only; missing key is a no-op (idempotent)
 * - Soft-delete of DB `StorageObject.deletedAt` is app-level, not part of this API
 */
export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<ObjectMetadata>;
  getSignedReadUrl(key: string, ttlSeconds?: number): Promise<string>;
  getSignedWriteUrl(input: {
    key: string;
    contentType: string;
    ttlSeconds?: number;
  }): Promise<string>;
  /** Legacy-compatible helpers used across API/worker. Prefer putObject. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export type StorageDriver = "local" | "r2";

export type CreateObjectStorageOptions = {
  driver: StorageDriver;
  localPath?: string;
  r2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    signedUrlTtlSeconds?: number;
  };
  onObjectStored?: (input: PutObjectInput & PutObjectResult) => Promise<void>;
};

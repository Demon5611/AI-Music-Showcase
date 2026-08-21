export class StorageNotFoundError extends Error {
  readonly code = "STORAGE_NOT_FOUND" as const;

  constructor(public readonly key: string) {
    super(`Object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

/**
 * Bucket itself is missing or invisible to the credentials in use.
 * Distinct from a missing key: a write can never fail because the key is absent,
 * so a 404 on put means the bucket/account wiring is wrong.
 */
export class StorageBucketNotFoundError extends Error {
  readonly code = "STORAGE_BUCKET_NOT_FOUND" as const;

  constructor(
    public readonly key: string,
    public readonly bucketFingerprint: string,
  ) {
    super(`Storage bucket not found for ${key} (bucket ${bucketFingerprint})`);
    this.name = "StorageBucketNotFoundError";
  }
}

/** Credentials are valid-looking but not allowed to touch this bucket or key. */
export class StorageForbiddenError extends Error {
  readonly code = "STORAGE_FORBIDDEN" as const;

  constructor(
    public readonly key: string,
    public readonly bucketFingerprint: string,
  ) {
    super(`Storage access denied for ${key} (bucket ${bucketFingerprint})`);
    this.name = "StorageForbiddenError";
  }
}

export class StorageTransientError extends Error {
  readonly code: "STORAGE_TRANSIENT" | "STORAGE_UNAVAILABLE" = "STORAGE_TRANSIENT";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "StorageTransientError";
  }
}

/** Provider-side 5xx, throttling or network failure — safe to retry. */
export class StorageUnavailableError extends StorageTransientError {
  override readonly code = "STORAGE_UNAVAILABLE" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageUnavailableError";
  }
}

export function isStorageNotFoundError(error: unknown): error is StorageNotFoundError {
  return error instanceof StorageNotFoundError;
}

export function isStorageTransientError(error: unknown): error is StorageTransientError {
  return error instanceof StorageTransientError;
}

export function isStorageBucketNotFoundError(
  error: unknown,
): error is StorageBucketNotFoundError {
  return error instanceof StorageBucketNotFoundError;
}

export function isStorageForbiddenError(error: unknown): error is StorageForbiddenError {
  return error instanceof StorageForbiddenError;
}

/** Config/permission problems that retrying cannot fix. */
export function isStorageConfigError(
  error: unknown,
): error is StorageBucketNotFoundError | StorageForbiddenError {
  return isStorageBucketNotFoundError(error) || isStorageForbiddenError(error);
}

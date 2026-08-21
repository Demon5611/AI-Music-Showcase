# Object storage contract (`@ai-music/storage`)

Local and R2 implement the same `ObjectStorage` API via `createObjectStorage({ driver })`.

## API semantics (both drivers)

| Method | Behavior |
|--------|----------|
| `putObject` | Create or **overwrite**. Returns `sizeBytes`, `contentType`, opaque `etag`. |
| `getObject` | Missing key → `StorageNotFoundError`. |
| `getMetadata` | Missing key → `StorageNotFoundError`. After put, `etag` / `contentType` match that put. |
| `exists` | `false` if missing; does not throw for not-found. |
| `deleteObject` | **Physical delete only**. Missing key is a **no-op** (idempotent). |

Soft-delete (`StorageObject.deletedAt`) is **not** part of `deleteObject`.
It is an optional app/DB concern; not wired on delete in MVP.

## Key semantics — no driver prefix

`storage_objects.key` and DB columns such as `VoiceSample.r2Key` hold the **full, final key**
(`voice-samples/{userId}/{id}.mp3`). Neither driver prepends an environment prefix, so a key
written by the API is read verbatim by the worker. Environment isolation comes from the
**bucket**, which is why API and worker must resolve the same bucket and account.

Key builders live in `@ai-music/shared` (`storage/keys.ts`) — never rebuild keys locally.

## Error taxonomy

| Error | Code | Cause |
|-------|------|-------|
| `StorageNotFoundError` | `STORAGE_NOT_FOUND` | Read (`get`/`head`/`delete`) of a missing key |
| `StorageBucketNotFoundError` | `STORAGE_BUCKET_NOT_FOUND` | `NoSuchBucket`, or **any 404 on `put`** — a write cannot fail for a missing key, so it means wrong bucket/account |
| `StorageForbiddenError` | `STORAGE_FORBIDDEN` | `AccessDenied`, `InvalidAccessKeyId`, `SignatureDoesNotMatch`, 401/403 |
| `StorageUnavailableError` (extends `StorageTransientError`) | `STORAGE_UNAVAILABLE` | 408/429/5xx, timeouts, network — retryable |

Config errors (`isStorageConfigError`) are not fixable by retry: they mean env mismatch.
`isStorageTransientError` still matches `StorageUnavailableError`, so retry logic is unchanged.

## Diagnosing an API ↔ worker mismatch

Both services log a startup snapshot (`event":"storage_config"`), with one-way fingerprints
instead of values:

```txt
storage_driver, bucket_configured, account_configured, access_key_configured,
secret_configured, bucket_fingerprint, account_fingerprint, access_key_fingerprint, prefix
```

Compare the two lines: identical `bucket_fingerprint` + `account_fingerprint` means the services
point at the same place. Different fingerprints with `STORAGE_BUCKET_NOT_FOUND` in the worker is
the signature of a bucket/account mismatch.

Worker probe (staging/dev only, refuses `APP_ENV=production`, no DB writes):

```bash
pnpm --filter @ai-music/worker storage:probe                 # put → head → get → delete
pnpm --filter @ai-music/worker storage:probe --key=<full-key> # read-only head of an existing key
```

The lifecycle probe writes under `staging/health/<uuid>.txt` and deletes it. Run it before any
paid provider smoke test whenever storage errors are suspected.

## ETag — opaque identifier

`etag` is an **opaque** revision identity from the driver:

- **Local:** implementation detail (content fingerprint + sidecar); may look like hex MD5.
- **R2:** provider `ETag` from Put/Head (S3-compatible; often MD5 for simple puts, but **not guaranteed**).

**Do not:**

- treat `etag` as portable MD5/SHA-256 across drivers;
- compare Local etag to R2 etag for the “same” bytes as a content checksum;
- use etag as a cryptographic integrity proof in persistence.

**Do:** equality checks for the same driver+key after put/getMetadata, cache validators, change detection.

## Checksum column (`storage_objects.checksum`)

On put, `recordStorageObject` stores `checksum = etag` (opaque string).

This is **not** a named algorithm field (no SHA-256). Persistence must not assume algorithm or cross-driver equality.

Authoritative size/type for app logic: `sizeBytes` + `mimeType` on the row / `PutObjectResult`.

## Out of scope (MVP)

Streaming upload, CDN, multipart, object versioning.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fingerprintValue } from "./config-fingerprint.js";
import { contentTypeFromKey } from "./content-type-from-key.js";
import { StorageNotFoundError } from "./errors.js";
import { mapR2Error, type R2Operation } from "./map-r2-error.js";
import type {
  CreateObjectStorageOptions,
  ObjectMetadata,
  ObjectStorage,
  PutObjectInput,
} from "./types.js";

export function createR2ObjectStorage(
  options: NonNullable<CreateObjectStorageOptions["r2"]> &
    Pick<CreateObjectStorageOptions, "onObjectStored">,
): ObjectStorage {
  const bucket = options.bucketName;
  const bucketFingerprint = fingerprintValue(bucket);

  function wrapR2Error(key: string, error: unknown, operation: R2Operation): never {
    throw mapR2Error({ key, error, operation, bucketFingerprint });
  }

  const ttlSeconds = options.signedUrlTtlSeconds ?? 900;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  async function putObject(input: PutObjectInput) {
    const body = Buffer.from(input.body);
    let etag: string | undefined;

    try {
      const response = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: body,
          ContentType: input.contentType,
        }),
      );

      etag = response.ETag?.replaceAll('"', "");
    } catch (error) {
      wrapR2Error(input.key, error, "put");
    }

    const result = {
      bucket,
      key: input.key,
      sizeBytes: body.length,
      contentType: input.contentType,
      etag,
    };

    await options.onObjectStored?.({ ...input, ...result });
    return result;
  }

  async function getMetadata(key: string): Promise<ObjectMetadata> {
    try {
      const response = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );

      return {
        key,
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? contentTypeFromKey(key),
        etag: response.ETag?.replaceAll('"', ""),
        lastModified: response.LastModified,
      };
    } catch (error) {
      wrapR2Error(key, error, "head");
    }
  }

  return {
    putObject,
    async getObject(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        const bytes = await response.Body?.transformToByteArray();

        if (!bytes) {
          throw new StorageNotFoundError(key);
        }

        return Buffer.from(bytes);
      } catch (error) {
        wrapR2Error(key, error, "get");
      }
    },
    async deleteObject(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        const mapped = mapR2Error({
          key,
          error,
          operation: "delete",
          bucketFingerprint,
        });

        if (mapped instanceof StorageNotFoundError) {
          return;
        }

        throw mapped;
      }
    },
    async exists(key) {
      try {
        await getMetadata(key);
        return true;
      } catch (error) {
        if (error instanceof StorageNotFoundError) {
          return false;
        }

        throw error;
      }
    },
    getMetadata,
    async getSignedReadUrl(key, customTtl) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: customTtl ?? ttlSeconds },
      );
    },
    async getSignedWriteUrl(input) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          ContentType: input.contentType,
        }),
        { expiresIn: input.ttlSeconds ?? ttlSeconds },
      );
    },
    async put(key, data, contentType) {
      await putObject({ key, body: data, contentType, kind: "legacy" });
    },
    get(key) {
      return this.getObject(key);
    },
    delete(key) {
      return this.deleteObject(key);
    },
  };
}

import { access, mkdir, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { contentTypeFromKey } from "./content-type-from-key.js";
import { StorageNotFoundError, StorageTransientError } from "./errors.js";
import type {
  CreateObjectStorageOptions,
  ObjectMetadata,
  ObjectStorage,
  PutObjectInput,
} from "./types.js";

const LOCAL_BUCKET = "local";
/** Sidecar next to object: contentType + opaque etag from put. */
const META_SUFFIX = ".ai-music-meta";

type LocalObjectMeta = {
  contentType: string;
  etag: string;
};

function isPathInsideBase(baseDir: string, targetDir: string): boolean {
  const rel = relative(resolve(baseDir), resolve(targetDir));
  return rel !== "" && !rel.startsWith("..");
}

async function pruneEmptyParentDirs(filePath: string, baseDir: string): Promise<void> {
  const resolvedBase = resolve(baseDir);
  let currentDir = resolve(dirname(filePath));

  while (currentDir !== resolvedBase && isPathInsideBase(resolvedBase, currentDir)) {
    try {
      await rmdir(currentDir);
      currentDir = dirname(currentDir);
    } catch {
      break;
    }
  }
}

function wrapFsError(key: string, error: unknown): never {
  if (error instanceof StorageNotFoundError || error instanceof StorageTransientError) {
    throw error;
  }

  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";

  if (code === "ENOENT") {
    throw new StorageNotFoundError(key);
  }

  if (code === "EAGAIN" || code === "EBUSY" || code === "EMFILE" || code === "ENFILE") {
    throw new StorageTransientError(
      `Transient local storage error for ${key}: ${code}`,
      { cause: error },
    );
  }

  throw error;
}

function opaqueEtagFromBody(body: Buffer): string {
  // Local-only implementation detail. Callers must treat etag as opaque.
  return createHash("md5").update(body).digest("hex");
}

async function readLocalMeta(fullPath: string): Promise<LocalObjectMeta | null> {
  try {
    const raw = await readFile(`${fullPath}${META_SUFFIX}`, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalObjectMeta>;
    if (typeof parsed.contentType === "string" && typeof parsed.etag === "string") {
      return { contentType: parsed.contentType, etag: parsed.etag };
    }
    return null;
  } catch {
    return null;
  }
}

export function createLocalObjectStorage(
  options: Pick<CreateObjectStorageOptions, "localPath" | "onObjectStored">,
): ObjectStorage {
  const baseDir = resolve(options.localPath ?? "./storage");

  async function putObject(input: PutObjectInput) {
    const fullPath = join(baseDir, input.key);

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      const body = Buffer.from(input.body);
      const etag = opaqueEtagFromBody(body);
      await writeFile(fullPath, body);
      await writeFile(
        `${fullPath}${META_SUFFIX}`,
        JSON.stringify({ contentType: input.contentType, etag } satisfies LocalObjectMeta),
        "utf8",
      );

      const result = {
        bucket: LOCAL_BUCKET,
        key: input.key,
        sizeBytes: body.length,
        contentType: input.contentType,
        etag,
      };

      await options.onObjectStored?.({ ...input, ...result });
      return result;
    } catch (error) {
      wrapFsError(input.key, error);
    }
  }

  async function getMetadata(key: string): Promise<ObjectMetadata> {
    const fullPath = join(baseDir, key);

    try {
      const info = await stat(fullPath);
      const meta = await readLocalMeta(fullPath);
      const body = meta ? null : await readFile(fullPath);

      return {
        key,
        sizeBytes: info.size,
        contentType: meta?.contentType ?? contentTypeFromKey(key),
        etag: meta?.etag ?? opaqueEtagFromBody(body!),
        lastModified: info.mtime,
      };
    } catch (error) {
      wrapFsError(key, error);
    }
  }

  return {
    putObject,
    async getObject(key) {
      try {
        return await readFile(join(baseDir, key));
      } catch (error) {
        wrapFsError(key, error);
      }
    },
    async deleteObject(key) {
      const fullPath = join(baseDir, key);

      try {
        await unlink(fullPath);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";

        if (code !== "ENOENT") {
          wrapFsError(key, error);
        }
      }

      await unlink(`${fullPath}${META_SUFFIX}`).catch(() => undefined);
      await pruneEmptyParentDirs(fullPath, baseDir);
    },
    async exists(key) {
      try {
        await access(join(baseDir, key));
        return true;
      } catch {
        return false;
      }
    },
    getMetadata,
    async getSignedReadUrl(key) {
      return `file://${join(baseDir, key)}`;
    },
    async getSignedWriteUrl(input) {
      return `file://${join(baseDir, input.key)}`;
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

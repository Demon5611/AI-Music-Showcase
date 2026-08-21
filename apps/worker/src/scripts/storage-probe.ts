import "../common/load-env.js";
import { randomUUID } from "node:crypto";
import { logLoadControl } from "@ai-music/shared";
import { createObjectStorage, describeStorageConfig } from "@ai-music/storage";
import { getWorkerEnv } from "../config/env.js";
import { buildWorkerStorageOptions } from "../common/storage-config.js";

const PROBE_PREFIX = "staging/health";
const PROBE_BODY = Buffer.from("storage-probe");

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return error instanceof Error ? error.name : "UNKNOWN";
}

function parseKeyArg(): string | null {
  const arg = process.argv.slice(2).find((value) => value.startsWith("--key="));

  return arg ? arg.slice("--key=".length).trim() || null : null;
}

/** Read-only check of a key written by another service (API voice samples, tracks). */
async function probeExistingKey(
  storage: ReturnType<typeof createObjectStorage>,
  key: string,
): Promise<void> {
  const metadata = await storage.getMetadata(key);

  logLoadControl("storage_probe", {
    step: "head_existing_key",
    key,
    sizeBytes: metadata.sizeBytes,
    contentType: metadata.contentType,
    result: "ok",
  });
}

async function probeLifecycle(
  storage: ReturnType<typeof createObjectStorage>,
): Promise<void> {
  const key = `${PROBE_PREFIX}/${randomUUID()}.txt`;

  const put = await storage.putObject({
    key,
    body: PROBE_BODY,
    contentType: "text/plain",
    kind: "storage_probe",
    visibility: "private",
  });
  logLoadControl("storage_probe", { step: "put", key, sizeBytes: put.sizeBytes });

  const metadata = await storage.getMetadata(key);
  logLoadControl("storage_probe", { step: "head", key, sizeBytes: metadata.sizeBytes });

  const body = await storage.getObject(key);
  logLoadControl("storage_probe", {
    step: "get",
    key,
    sizeBytes: body.length,
    bodyMatches: body.equals(PROBE_BODY),
  });

  await storage.deleteObject(key);
  logLoadControl("storage_probe", {
    step: "delete",
    key,
    stillExists: await storage.exists(key),
  });
}

async function main(): Promise<void> {
  const env = getWorkerEnv();

  if (env.APP_ENV === "production") {
    throw new Error("storage probe is staging/dev only");
  }

  const options = buildWorkerStorageOptions();
  logLoadControl("storage_probe", {
    step: "config",
    service: "worker",
    appEnv: env.APP_ENV,
    ...describeStorageConfig(options),
  });

  const storage = createObjectStorage(options);
  const existingKey = parseKeyArg();

  if (existingKey) {
    await probeExistingKey(storage, existingKey);
    return;
  }

  await probeLifecycle(storage);
}

main()
  .then(() => {
    logLoadControl("storage_probe", { step: "done", result: "green" });
    process.exit(0);
  })
  .catch((error: unknown) => {
    logLoadControl(
      "storage_probe",
      {
        step: "failed",
        result: "red",
        errorCode: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      },
      "error",
    );
    process.exit(1);
  });

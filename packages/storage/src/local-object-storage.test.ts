import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalObjectStorage } from "./local-object-storage.js";
import { StorageNotFoundError } from "./errors.js";

const dir = await mkdtemp(join(tmpdir(), "ai-music-storage-"));
const storage = createLocalObjectStorage({ localPath: dir });
const key = "music-generations/user/test/track.mp3";
const body = Buffer.from("hello-audio-bytes");

try {
  assert.equal(await storage.exists(key), false);

  await assert.rejects(() => storage.getMetadata(key), StorageNotFoundError);
  await assert.rejects(() => storage.getObject(key), StorageNotFoundError);

  const put1 = await storage.putObject({
    key,
    body,
    contentType: "audio/mpeg",
    kind: "test",
  });

  assert.equal(await storage.exists(key), true);
  assert.equal(put1.contentType, "audio/mpeg");
  assert.ok(put1.etag);

  const meta1 = await storage.getMetadata(key);
  assert.equal(meta1.etag, put1.etag);
  assert.equal(meta1.contentType, "audio/mpeg");
  assert.equal(meta1.sizeBytes, body.length);

  const got = await storage.getObject(key);
  assert.equal(Buffer.compare(got, body), 0);

  // overwrite
  const body2 = Buffer.from("hello-audio-bytes-v2");
  const put2 = await storage.putObject({
    key,
    body: body2,
    contentType: "audio/mpeg",
    kind: "test",
  });
  assert.notEqual(put2.etag, put1.etag);
  assert.equal((await storage.getMetadata(key)).etag, put2.etag);
  assert.equal(Buffer.compare(await storage.getObject(key), body2), 0);

  // delete existing
  await storage.deleteObject(key);
  assert.equal(await storage.exists(key), false);
  await assert.rejects(() => storage.getMetadata(key), StorageNotFoundError);

  // delete missing — idempotent
  await storage.deleteObject(key);
  assert.equal(await storage.exists(key), false);

  console.log("local-object-storage unit tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}

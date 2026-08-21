import assert from "node:assert/strict";
import { isAbsolute } from "node:path";
import { resolveLocalStoragePath } from "./resolve-local-storage-path.js";

const absolute = resolveLocalStoragePath("./storage");
assert.equal(isAbsolute(absolute), true);
assert.match(absolute, /storage$/);

const kept = resolveLocalStoragePath("/tmp/ai-music-storage");
assert.equal(kept, "/tmp/ai-music-storage");

console.log("resolve-local-storage-path unit tests passed");
console.log("resolved:", absolute);

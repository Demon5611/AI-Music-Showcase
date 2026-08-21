/**
 * Guards PR8.2 boundary: callback service must not import vendor schema/mapper/enums.
 * Run: `pnpm --filter @ai-music/api exec tsx src/modules/music/suno-callback.service.imports.test.ts`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, "suno-callback.service.ts"), "utf8");

const bannedTokens = [
  "sunoMusicCallbackSchema",
  "SunoMusicCallbackPayload",
  "mapSunoMusicCallbackToStatus",
  "mapSunoTrack",
  "callbackType",
  "suno-callback.schema",
  "TEXT_SUCCESS",
  "FIRST_SUCCESS",
];

for (const token of bannedTokens) {
  assert.equal(
    serviceSource.includes(token),
    false,
    `suno-callback.service.ts must not contain banned token: ${token}`,
  );
}

assert.match(
  serviceSource,
  /MusicGenerationCallbackNormalizer/,
  "service must depend on MusicGenerationCallbackNormalizer",
);
assert.match(
  serviceSource,
  /resolveMusicGenerationErrorDisplay/,
  "display mapping must stay in application layer",
);
assert.equal(
  serviceSource.includes("retryable"),
  false,
  "failed DTO must not expose retryable in callback service",
);

console.log("suno-callback.service import boundary tests passed");

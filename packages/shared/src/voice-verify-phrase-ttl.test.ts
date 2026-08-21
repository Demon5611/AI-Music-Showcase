/**
 * Unit tests for verify-phrase TTL helpers.
 * Run: `pnpm --filter @ai-music/api exec tsx ../../packages/shared/src/voice-verify-phrase-ttl.test.ts`
 */
import assert from "node:assert/strict";
import { VOICE_VERIFY_PHRASE_TTL_SEC } from "./constants/index.js";
import {
  formatVerifyPhraseCountdown,
  isStaleVerifyPhraseExpiredError,
  isVerifyPhraseExpired,
  resolveVerifyPhraseRemainingSec,
  VERIFY_PHRASE_EXPIRED_ERROR_MARKER,
} from "./voice-verify-phrase-ttl.js";

const EXPIRED_API =
  `${VERIFY_PHRASE_EXPIRED_ERROR_MARKER}. Нажмите «Повторить верификацию» — AI Music выдаст новую фразу.`;

function run(): void {
  const startedAt = "2026-07-15T10:00:00.000Z";
  const startedMs = Date.parse(startedAt);

  assert.equal(resolveVerifyPhraseRemainingSec(null, startedMs), null);
  assert.equal(resolveVerifyPhraseRemainingSec("not-a-date", startedMs), null);

  assert.equal(
    resolveVerifyPhraseRemainingSec(startedAt, startedMs),
    VOICE_VERIFY_PHRASE_TTL_SEC,
  );
  assert.equal(
    resolveVerifyPhraseRemainingSec(startedAt, startedMs + 60_000),
    VOICE_VERIFY_PHRASE_TTL_SEC - 60,
  );
  assert.equal(
    resolveVerifyPhraseRemainingSec(
      startedAt,
      startedMs + VOICE_VERIFY_PHRASE_TTL_SEC * 1000,
    ),
    0,
  );
  assert.equal(
    resolveVerifyPhraseRemainingSec(
      startedAt,
      startedMs + (VOICE_VERIFY_PHRASE_TTL_SEC + 5) * 1000,
    ),
    0,
  );

  assert.equal(isVerifyPhraseExpired(null, startedMs), false);
  assert.equal(isVerifyPhraseExpired(startedAt, startedMs + 30_000), false);
  assert.equal(
    isVerifyPhraseExpired(startedAt, startedMs + VOICE_VERIFY_PHRASE_TTL_SEC * 1000),
    true,
  );

  assert.equal(formatVerifyPhraseCountdown(0), "0:00");
  assert.equal(formatVerifyPhraseCountdown(65), "1:05");
  assert.equal(formatVerifyPhraseCountdown(-3), "0:00");

  assert.equal(
    isStaleVerifyPhraseExpiredError(
      EXPIRED_API,
      startedAt,
      "awaiting_verification",
      startedMs + 30_000,
    ),
    true,
  );
  assert.equal(
    isStaleVerifyPhraseExpiredError(
      EXPIRED_API,
      startedAt,
      "awaiting_verification",
      startedMs + VOICE_VERIFY_PHRASE_TTL_SEC * 1000,
    ),
    false,
  );
  assert.equal(
    isStaleVerifyPhraseExpiredError(EXPIRED_API, startedAt, "failed", startedMs + 30_000),
    false,
  );
  assert.equal(
    isStaleVerifyPhraseExpiredError(
      "Голос не совпал с первым образцом.",
      startedAt,
      "awaiting_verification",
      startedMs + 30_000,
    ),
    false,
  );
  assert.equal(
    isStaleVerifyPhraseExpiredError(
      EXPIRED_API,
      null,
      "awaiting_verification",
      startedMs + 30_000,
    ),
    false,
  );

  console.log("voice-verify-phrase-ttl.test.ts: ok");
}

run();

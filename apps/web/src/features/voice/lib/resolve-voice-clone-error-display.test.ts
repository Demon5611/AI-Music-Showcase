import assert from "node:assert/strict";
import { resolveVoiceCloneErrorForDisplay } from "./resolve-voice-clone-error-display";

const t = ((key: string) => {
  const map: Record<string, string> = {
    failedGeneric: "Could not confirm the voice.",
    failedMismatch: "Voice mismatch.",
    phraseExpiredBanner: "Phrase expired.",
    failedEmptyPhrase: "Empty phrase.",
  };
  return map[key] ?? key;
}) as Parameters<typeof resolveVoiceCloneErrorForDisplay>[2];

assert.equal(
  resolveVoiceCloneErrorForDisplay(
    "Подтверждение голоса не прошло. Пройдите верификацию заново.",
    "en",
    t,
  ),
  null,
);

assert.equal(
  resolveVoiceCloneErrorForDisplay(
    "Фраза верификации истекла. Нажмите «Повторить верификацию».",
    "en",
    t,
  ),
  "Phrase expired.",
);

assert.equal(
  resolveVoiceCloneErrorForDisplay("Сырая неизвестная ошибка с кириллицей", "en", t),
  "Could not confirm the voice.",
);

assert.equal(
  resolveVoiceCloneErrorForDisplay("Сырая неизвестная ошибка с кириллицей", "ru", t),
  "Сырая неизвестная ошибка с кириллицей",
);

console.log("resolve-voice-clone-error-display.test.ts: ok");

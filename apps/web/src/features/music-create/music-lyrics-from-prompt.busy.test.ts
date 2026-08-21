import assert from "node:assert/strict";
import type { MusicLyricsStatusResponseDto } from "@ai-music/shared";

/**
 * Mirrors music-lyrics-from-prompt busy/terminal rule.
 * undefined must NOT be terminal — otherwise the submit button flickers active
 * between POST /lyrics and the first status poll.
 */
function isLyricsStatusTerminal(data: MusicLyricsStatusResponseDto | undefined): boolean {
  return data?.status === "completed" || data?.status === "failed";
}

function status(
  partial: Pick<MusicLyricsStatusResponseDto, "status"> &
    Partial<MusicLyricsStatusResponseDto>,
): MusicLyricsStatusResponseDto {
  return {
    taskId: partial.taskId ?? "task-1",
    provider: partial.provider ?? "sunoapi",
    status: partial.status,
    lyrics: partial.lyrics,
    errorMessage: partial.errorMessage,
  };
}

assert.equal(isLyricsStatusTerminal(undefined), false);
assert.equal(isLyricsStatusTerminal(status({ status: "pending" })), false);
assert.equal(isLyricsStatusTerminal(status({ status: "processing" })), false);
assert.equal(isLyricsStatusTerminal(status({ status: "completed", lyrics: [] })), true);
assert.equal(isLyricsStatusTerminal(status({ status: "failed" })), true);

function isBusy(input: {
  isGenerating: boolean;
  lyricsTaskId: string | null;
  status: MusicLyricsStatusResponseDto | undefined;
  error: Error | null;
}): boolean {
  const isPolling =
    Boolean(input.lyricsTaskId) &&
    !input.error &&
    !isLyricsStatusTerminal(input.status);
  return input.isGenerating || isPolling;
}

// Hand-off: POST done, first poll not yet arrived — must stay busy.
assert.equal(
  isBusy({
    isGenerating: false,
    lyricsTaskId: "task-1",
    status: undefined,
    error: null,
  }),
  true,
);

assert.equal(
  isBusy({
    isGenerating: true,
    lyricsTaskId: null,
    status: undefined,
    error: null,
  }),
  true,
);

assert.equal(
  isBusy({
    isGenerating: false,
    lyricsTaskId: "task-1",
    status: status({ status: "completed", lyrics: [] }),
    error: null,
  }),
  false,
);

console.log("music-lyrics-from-prompt.busy.test.ts: ok");

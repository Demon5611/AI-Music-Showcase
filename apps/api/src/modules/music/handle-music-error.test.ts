import assert from "node:assert/strict";
import { Prisma } from "@ai-music/db";
import { sendMusicError } from "./handle-music-error.js";
import { InsufficientCreditsError } from "../../common/errors.js";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Transaction not found", {
    code,
    clientVersion: "6.9.0",
  });
}

function fakeReply() {
  const captured: { status?: number; body?: unknown } = {};
  return {
    captured,
    status(code: number) {
      captured.status = code;
      return {
        send(body: unknown) {
          captured.body = body;
          return captured;
        },
      };
    },
  };
}

const p2028 = fakeReply();
sendMusicError(p2028 as never, prismaError("P2028"));
assert.equal(p2028.captured.status, 503);
assert.equal(
  (p2028.captured.body as { code?: string }).code,
  "SERVICE_UNAVAILABLE",
);

const generic = fakeReply();
sendMusicError(generic as never, new Error("boom"));
assert.equal(generic.captured.status, 502);

const credits = fakeReply();
sendMusicError(credits as never, new InsufficientCreditsError());
assert.equal(credits.captured.status, 402);
assert.equal((credits.captured.body as { code?: string }).code, "INSUFFICIENT_CREDITS");

console.log("handle-music-error tests passed");

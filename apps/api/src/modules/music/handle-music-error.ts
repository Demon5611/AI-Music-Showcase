import { MusicProviderError } from "@ai-music/ai-providers";
import type { FastifyReply } from "fastify";
import { isAppError, sendAppError, ServiceUnavailableError } from "../../common/errors.js";
import { isPrismaInteractiveTransactionGoneError } from "./commit-music-generation-retry.js";

export function sendMusicError(reply: FastifyReply, error: unknown) {
  if (isAppError(error)) {
    return sendAppError(reply, error);
  }

  if (error instanceof MusicProviderError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      provider: error.provider,
    });
  }

  if (isPrismaInteractiveTransactionGoneError(error)) {
    return sendAppError(
      reply,
      new ServiceUnavailableError("Сервис временно занят. Повторите запрос."),
    );
  }

  return reply.status(502).send({
    error: error instanceof Error ? error.message : "Music provider error",
  });
}

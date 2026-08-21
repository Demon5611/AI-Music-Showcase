import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../common/require-auth.js";
import { assertOpsAdmin } from "../../common/ops-auth.js";
import { RATE_LIMITS, userRateLimitRouteConfig } from "../../common/rate-limit.js";
import { isAppError, sendAppError } from "../../common/errors.js";
import { sendMusicError } from "./handle-music-error.js";
import {
  getMusicGenerationTrackAudio,
  getMusicGenerationTrackAudioById,
} from "./music-record.service.js";
import {
  generateLyricsForUser,
  generateMusicForUser,
  getLyricsGenerationStatus,
  getMusicGenerationStatusForUser,
  getMusicHistory,
  getMusicTestStatus,
  removeMusicGenerationTrack,
  removeMusicGenerations,
} from "./service.js";
import { fetchTimedLyricsForTrack, getTimedLyricsForTrack } from "./timed-lyrics.service.js";
import {
  fetchAlbumCoverForGeneration,
  getAlbumCoverForGeneration,
  selectAlbumCoverForGeneration,
} from "./album-cover.service.js";
import {
  handleLegacySunoMusicCallback,
  handleSignedSunoMusicCallback,
} from "./suno-callback.service.js";
import { remixMusicTrackForUser } from "./remix.service.js";
import { verifyProviderReferenceToken } from "./track-provider-reference.js";
import {
  musicGenerateBodySchema,
  musicLyricsGenerateBodySchema,
  musicRemixBodySchema,
} from "@ai-music/shared";
import { parseOptionalIdempotencyKey } from "./music-generate-idempotency.js";
import { normalizeMusicGenerateBody } from "./music-generate-body.js";
import { getApiEnv } from "../../config/env.js";

interface LyricsStatusQuery {
  durationSec?: string;
}

interface DeleteHistoryBody {
  ids: string[];
}

interface SelectAlbumCoverBody {
  imageUrl: string;
}

export async function registerMusicRoutes(app: FastifyInstance) {
  app.get("/api/music/test/status", async (request, reply) => {
    const env = getApiEnv();
    // Staging + production: ops token required. Development stays open for local smoke.
    if (env.isDeployed) {
      try {
        assertOpsAdmin(request);
      } catch (error) {
        return sendAppError(reply, error);
      }
    }
    return reply.send(await getMusicTestStatus());
  });

  // User-facing readiness for Music Create. Must NOT use assertOpsAdmin —
  // regular Clerk session is enough; no secrets beyond provider id + configured flag.
  app.get("/api/music/provider-status", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(await getMusicTestStatus());
  });

  app.get("/api/music/history", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const history = await getMusicHistory(request.userId!);
      return reply.send(history);
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  app.post<{ Body: DeleteHistoryBody }>(
    "/api/music/history/delete",
    { preHandler: requireAuth },
    async (request, reply) => {
      const ids = request.body.ids ?? [];

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: "ids array is required" });
      }

      try {
        const result = await removeMusicGenerations(request.userId!, ids);
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.delete<{ Params: { trackId: string } }>(
    "/api/music/tracks/:trackId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await removeMusicGenerationTrack(request.userId!, request.params.trackId);
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { trackId: string } }>(
    "/api/music/tracks/:trackId/audio",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { buffer, contentType } = await getMusicGenerationTrackAudio(
          request.userId!,
          request.params.trackId,
        );

        return reply
          .header("Content-Type", contentType)
          .header("Cache-Control", "private, max-age=3600")
          .send(buffer);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { trackId: string }; Querystring: { token?: string } }>(
    /**
     * Provider capability URL (HMAC token) — not Clerk session auth.
     * Used when a music provider must fetch reference audio server-to-server.
     * TTL: 15m (see track-provider-reference.ts).
     */
    "/api/music/tracks/:trackId/provider-reference",
    async (request, reply) => {
      const trackId = request.params.trackId.trim();
      const token = request.query.token?.trim();

      if (!trackId || !token) {
        return reply.status(400).send({ error: "trackId and token are required" });
      }

      if (!verifyProviderReferenceToken(trackId, token)) {
        return reply.status(403).send({ error: "Invalid or expired token" });
      }

      try {
        const { buffer, contentType } = await getMusicGenerationTrackAudioById(trackId);

        return reply
          .header("Content-Type", contentType)
          .header("Cache-Control", "private, max-age=300")
          .send(buffer);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { trackId: string }; Body: { styleId?: string } }>(
    "/api/music/tracks/:trackId/remix",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.musicGenerate.max,
        RATE_LIMITS.musicGenerate.timeWindowMs,
      ),
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const trackId = request.params.trackId.trim();

      if (!trackId) {
        return reply.status(400).send({ error: "trackId is required" });
      }

      const parsed = musicRemixBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid remix body" });
      }

      try {
        const result = await remixMusicTrackForUser(
          request.userId!,
          trackId,
          parsed.data.styleId,
          request.log,
        );

        return reply.send(result);
      } catch (error) {
        request.log.error(error);

        if (isAppError(error)) {
          return sendAppError(reply, error);
        }

        return sendMusicError(reply, error);
      }
    },
  );

  app.get<{ Params: { trackId: string } }>(
    "/api/music/tracks/:trackId/timed-lyrics",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await getTimedLyricsForTrack(request.userId!, request.params.trackId);
        return reply.send(result);
      } catch (error) {
        return sendMusicError(reply, error);
      }
    },
  );

  app.post<{ Params: { trackId: string } }>(
    "/api/music/tracks/:trackId/timed-lyrics",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await fetchTimedLyricsForTrack(request.userId!, request.params.trackId);
        return reply.send(result);
      } catch (error) {
        return sendMusicError(reply, error);
      }
    },
  );

  app.get<{ Params: { generationId: string } }>(
    "/api/music/generations/:generationId/album-cover",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await getAlbumCoverForGeneration(
          request.userId!,
          request.params.generationId,
        );
        return reply.send(result);
      } catch (error) {
        return sendMusicError(reply, error);
      }
    },
  );

  app.post<{ Params: { generationId: string } }>(
    "/api/music/generations/:generationId/album-cover",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await fetchAlbumCoverForGeneration(
          request.userId!,
          request.params.generationId,
        );
        return reply.send(result);
      } catch (error) {
        return sendMusicError(reply, error);
      }
    },
  );

  app.patch<{ Params: { generationId: string }; Body: SelectAlbumCoverBody }>(
    "/api/music/generations/:generationId/album-cover",
    { preHandler: requireAuth },
    async (request, reply) => {
      const imageUrl = request.body.imageUrl?.trim();

      if (!imageUrl) {
        return reply.status(400).send({ error: "imageUrl is required" });
      }

      try {
        const result = await selectAlbumCoverForGeneration(
          request.userId!,
          request.params.generationId,
          imageUrl,
        );
        return reply.send(result);
      } catch (error) {
        return sendMusicError(reply, error);
      }
    },
  );

  app.post(
    "/api/music/generate",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.musicGenerate.max,
        RATE_LIMITS.musicGenerate.timeWindowMs,
      ),
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsedBody = musicGenerateBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "Invalid generate body",
          code: "INVALID_GENERATE_BODY",
          details: parsedBody.error.flatten(),
        });
      }

      try {
        const clientRequestId = parseOptionalIdempotencyKey(request.headers["idempotency-key"]);

        if (getApiEnv().API_REQUIRE_IDEMPOTENCY_KEY && !clientRequestId) {
          return reply
            .status(400)
            .send({ error: "Idempotency-Key header is required", code: "IDEMPOTENCY_KEY_REQUIRED" });
        }

        const { input, voiceSampleId, voiceProfileId, usePersonalVoice } =
          normalizeMusicGenerateBody(parsedBody.data);

        if (!input.prompt) {
          return reply.status(400).send({ error: "prompt is required" });
        }

        const result = await generateMusicForUser(
          request.userId!,
          input,
          {
            voiceSampleId,
            voiceProfileId,
            usePersonalVoice,
            musicBrief: parsedBody.data.musicBrief,
            clientRequestId,
          },
          request.log,
        );

        return reply.send(result);
      } catch (error) {
        request.log.error(error);

        if (isAppError(error)) {
          return sendAppError(reply, error);
        }

        return sendMusicError(reply, error);
      }
    },
  );

  app.get<{ Params: { taskId: string } }>(
    "/api/music/status/:taskId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const taskId = request.params.taskId.trim();

      if (!taskId) {
        return reply.status(400).send({ error: "taskId is required" });
      }

      try {
        const result = await getMusicGenerationStatusForUser(taskId, request.userId!);
        return reply.send(result);
      } catch (error) {
        request.log.error(error);
        return sendAppError(reply, error);
      }
    },
  );

  app.post(
    "/api/music/lyrics",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsedBody = musicLyricsGenerateBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "Invalid lyrics generate body",
          code: "INVALID_LYRICS_BODY",
          details: parsedBody.error.flatten(),
        });
      }

      try {
        const result = await generateLyricsForUser(
          request.userId!,
          {
            prompt: parsedBody.data.prompt,
            durationSec: parsedBody.data.durationSec,
            lyricsLanguage: parsedBody.data.lyricsLanguage,
            uiLocale: parsedBody.data.uiLocale,
          },
          request.log,
        );
        return reply.send(result);
      } catch (error) {
        request.log.error(error);

        if (isAppError(error)) {
          return sendAppError(reply, error);
        }

        return sendMusicError(reply, error);
      }
    },
  );

  app.get<{ Params: { taskId: string }; Querystring: LyricsStatusQuery }>(
    "/api/music/lyrics/status/:taskId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const taskId = request.params.taskId.trim();

      if (!taskId) {
        return reply.status(400).send({ error: "taskId is required" });
      }

      const parsedDuration = Number(request.query.durationSec);
      const durationSec =
        Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined;

      try {
        const result = await getLyricsGenerationStatus(taskId, request.userId!, durationSec);
        return reply.send(result);
      } catch (error) {
        request.log.error(error);
        return sendMusicError(reply, error);
      }
    },
  );

  app.post(
    "/api/music/callback/suno/:recordId/:token",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.sunoCallback.max,
        RATE_LIMITS.sunoCallback.timeWindowMs,
      ),
    },
    async (request, reply) => {
      const { recordId, token } = request.params as { recordId: string; token: string };
      const result = await handleSignedSunoMusicCallback({
        recordId,
        token,
        payload: request.body,
      });
      return reply.status(result.statusCode).send(result.body);
    },
  );

  app.post(
    "/api/music/callback/suno",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.sunoCallback.max,
        RATE_LIMITS.sunoCallback.timeWindowMs,
      ),
    },
    async (request, reply) => {
      const result = await handleLegacySunoMusicCallback(request.body);
      return reply.status(result.statusCode).send(result.body);
    },
  );
}

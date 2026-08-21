import type { FastifyInstance } from "fastify";
import { ApplyOperationBodySchema } from "@ai-music/shared";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import { assertFeature } from "../billing/entitlements.service.js";
import {
  applyOperation,
  previewOperation,
  redoLastOperation,
  undoLastOperation,
} from "./operation.service.js";
import { renderSongVersion, getRenderJob } from "./render.service.js";
import { exportSongWav, getSongVersionWav } from "./wav-export.service.js";
import {
  ensureSongForTrack,
  getCurrentVersion,
  getSongOriginalAudio,
  getSongStemAudio,
  getSongVersionAudio,
  kickoffStemSeparation,
  refreshEditorProgress,
  retryStemSeparation,
} from "./song-editor.service.js";
import { toEditorStateDto, toRenderJobDto, parseOperations } from "./song-editor.mapper.js";
async function buildEditorResponse(userId: string, songId: string) {
  await assertFeature(userId, "editor");
  const song = await refreshEditorProgress(userId, songId);
  const version = await getCurrentVersion(song.id);
  return toEditorStateDto(song, version);
}

export async function registerMusicEditorRoutes(app: FastifyInstance) {
  app.post<{ Params: { trackId: string } }>(
    "/api/music/tracks/:trackId/editor",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const song = await ensureSongForTrack(request.userId!, request.params.trackId);

        return reply.send({
          songId: song.id,
          status: song.status,
        });
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { songId: string } }>(
    "/api/music/:songId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return reply.send(await buildEditorResponse(request.userId!, request.params.songId));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { songId: string } }>(
    "/api/music/:songId/editor-state",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return reply.send(await buildEditorResponse(request.userId!, request.params.songId));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string } }>(
    "/api/music/:songId/separate-stems",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        await kickoffStemSeparation(request.userId!, request.params.songId);
        return reply.send(await buildEditorResponse(request.userId!, request.params.songId));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string } }>(
    "/api/music/:songId/separate-stems/retry",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        await retryStemSeparation(request.userId!, request.params.songId);
        return reply.send(await buildEditorResponse(request.userId!, request.params.songId));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string }; Body: unknown }>(
    "/api/music/:songId/operations",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = ApplyOperationBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const song = await applyOperation(
          request.userId!,
          request.params.songId,
          parsed.data.operation,
          {
            selectedRegionId: parsed.data.selectedRegionId,
            selectedTrackId: parsed.data.selectedTrackId,
          },
        );
        const version = await getCurrentVersion(song.id);
        return reply.send(toEditorStateDto(song, version));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string } }>(
    "/api/music/:songId/operations/undo",
    { preHandler: requireAuth },
    async (request, reply) => {
      const logger = {
        info: (payload: Record<string, unknown>, message: string) => {
          request.log.info(payload, message);
        },
        warn: (payload: Record<string, unknown>, message: string) => {
          request.log.warn(payload, message);
        },
      };

      try {
        request.log.info(
          { songId: request.params.songId, userId: request.userId },
          "undo: request received",
        );

        const song = await undoLastOperation(request.userId!, request.params.songId, logger);
        const version = await getCurrentVersion(song.id);

        request.log.info(
          {
            songId: request.params.songId,
            activeOperations: parseOperations(version.operations).length,
          },
          "undo: completed",
        );

        return reply.send(toEditorStateDto(song, version));
      } catch (error) {
        request.log.warn(
          {
            songId: request.params.songId,
            userId: request.userId,
            error: error instanceof Error ? error.message : String(error),
          },
          "undo: failed",
        );
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string } }>(
    "/api/music/:songId/operations/redo",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const song = await redoLastOperation(request.userId!, request.params.songId);
        const version = await getCurrentVersion(song.id);
        return reply.send(toEditorStateDto(song, version));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string }; Body: unknown }>(
    "/api/music/:songId/preview-operation",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = ApplyOperationBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const result = await previewOperation(
          request.userId!,
          request.params.songId,
          parsed.data.operation,
          {
            selectedRegionId: parsed.data.selectedRegionId,
            selectedTrackId: parsed.data.selectedTrackId,
          },
        );
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { songId: string; jobId: string } }>(
    "/api/music/:songId/render/:jobId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const job = await getRenderJob(
          request.userId!,
          request.params.songId,
          request.params.jobId,
        );
        return reply.send(toRenderJobDto(job));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string } }>(
    "/api/music/:songId/render",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await renderSongVersion(request.userId!, request.params.songId);
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { songId: string }; Body: { versionId?: string } }>(
    "/api/music/:songId/export-wav",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await exportSongWav(
          request.userId!,
          request.params.songId,
          request.body?.versionId?.trim() || undefined,
        );
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { songId: string; versionId: string } }>(
    "/api/music/songs/:songId/versions/:versionId/wav",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { buffer, contentType } = await getSongVersionWav(
          request.userId!,
          request.params.songId,
          request.params.versionId,
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

  app.get<{ Params: { songId: string } }>(
    "/api/music/songs/:songId/audio/original",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { buffer, contentType } = await getSongOriginalAudio(
          request.userId!,
          request.params.songId,
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

  app.get<{ Params: { songId: string; stemType: string } }>(
    "/api/music/songs/:songId/stems/:stemType/audio",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { buffer, contentType } = await getSongStemAudio(
          request.userId!,
          request.params.songId,
          request.params.stemType,
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

  app.get<{ Params: { songId: string; versionId: string } }>(
    "/api/music/songs/:songId/versions/:versionId/audio",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { buffer, contentType } = await getSongVersionAudio(
          request.userId!,
          request.params.songId,
          request.params.versionId,
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

}

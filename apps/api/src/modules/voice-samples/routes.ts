import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../common/require-auth.js";
import { RATE_LIMITS, userRateLimitRouteConfig } from "../../common/rate-limit.js";
import { sendAppError } from "../../common/errors.js";
import {
  createVoiceSample,
  deleteVoiceSample,
  getVoiceSampleAudio,
  listVoiceSamples,
} from "./service.js";
import {
  cancelSunoVoiceClone,
  getSunoVoiceCloneStatus,
  prepareSunoVoiceClone,
  submitSunoVoiceVerification,
} from "./suno-voice.service.js";

export async function registerVoiceSampleRoutes(app: FastifyInstance) {
  app.get(
    "/api/voice-samples",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const samples = await listVoiceSamples(request.userId!);
        return reply.send(samples);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post(
    "/api/voice-samples",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        let fileBuffer: Buffer | null = null;
        let filename = "audio.mp3";
        let mimeType = "audio/mpeg";
        const fields: Record<string, string> = {};

        for await (const part of request.parts()) {
          if (part.type === "file" && part.fieldname === "soundFile") {
            fileBuffer = await part.toBuffer();
            filename = part.filename || filename;
            mimeType = part.mimetype || mimeType;
          }

          if (part.type === "field") {
            fields[part.fieldname] = String(part.value);
          }
        }

        if (!fileBuffer || fileBuffer.byteLength === 0) {
          return reply.status(400).send({ error: "soundFile is required" });
        }

        const sample = await createVoiceSample({
          userId: request.userId!,
          filename,
          mimeType,
          fileBuffer,
          fields,
        });

        return reply.status(201).send(sample);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/voice-samples/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        await deleteVoiceSample(request.userId!, request.params.id);
        return reply.status(204).send();
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/voice-samples/:id/audio",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { buffer, contentType } = await getVoiceSampleAudio(
          request.userId!,
          request.params.id,
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

  app.post<{ Params: { id: string }; Body: { restart?: boolean } }>(
    "/api/voice-samples/:id/suno-voice/prepare",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.voicePrepare.max,
        RATE_LIMITS.voicePrepare.timeWindowMs,
      ),
      preHandler: requireAuth,
    },
    async (request, reply) => {
      try {
        const sample = await prepareSunoVoiceClone(
          request.userId!,
          request.params.id,
          { restart: request.body?.restart === true },
        );
        return reply.send(sample);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/voice-samples/:id/suno-voice/status",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const sample = await getSunoVoiceCloneStatus(
          request.userId!,
          request.params.id,
        );
        return reply.send(sample);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/voice-samples/:id/suno-voice/cancel",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const sample = await cancelSunoVoiceClone(
          request.userId!,
          request.params.id,
        );
        return reply.send(sample);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/voice-samples/:id/suno-voice/verify",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.voiceVerify.max,
        RATE_LIMITS.voiceVerify.timeWindowMs,
      ),
      preHandler: requireAuth,
    },
    async (request, reply) => {
      try {
        let fileBuffer: Buffer | null = null;
        let filename = "verify.mp3";
        let mimeType = "audio/mpeg";
        let durationSec: number | undefined;

        for await (const part of request.parts()) {
          if (part.type === "file" && part.fieldname === "soundFile") {
            fileBuffer = await part.toBuffer();
            filename = part.filename || filename;
            mimeType = part.mimetype || mimeType;
          }

          if (part.type === "field" && part.fieldname === "durationSec") {
            const parsed = Number(part.value);

            if (Number.isFinite(parsed) && parsed > 0) {
              durationSec = parsed;
            }
          }
        }

        if (!fileBuffer || fileBuffer.byteLength === 0) {
          return reply.status(400).send({ error: "soundFile is required" });
        }

        const sample = await submitSunoVoiceVerification({
          userId: request.userId!,
          sampleId: request.params.id,
          filename,
          mimeType,
          fileBuffer,
          durationSec,
        });

        return reply.send(sample);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

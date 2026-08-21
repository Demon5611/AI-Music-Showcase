import type { FastifyInstance } from "fastify";
import {
  createMurekaVoiceProfileSchema,
  type CreateMurekaVoiceProfileBody,
} from "@ai-music/shared";
import { BadRequestError, sendAppError } from "../../common/errors.js";
import { assertOpsAdmin } from "../../common/ops-auth.js";
import { requireAuth } from "../../common/require-auth.js";
import {
  listPendingProviderDeletionRequests,
  markProviderDeletionConfirmed,
  markProviderDeletionSubmitted,
  requestVoiceProfileDeletion,
} from "./deletion.service.js";
import {
  createMurekaVoiceProfile,
  getMyVoiceProfile,
} from "./service.js";

export async function registerVoiceProfileRoutes(app: FastifyInstance) {
  app.get(
    "/api/voice-profiles/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        return reply.send(await getMyVoiceProfile(request.userId!));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Body: CreateMurekaVoiceProfileBody }>(
    "/api/voice-profiles/mureka",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = createMurekaVoiceProfileSchema.safeParse(request.body);

      if (!parsed.success) {
        return sendAppError(
          reply,
          new BadRequestError(
            "Voice sample and explicit consent are required",
            "VOICE_PROFILE_INPUT_INVALID",
          ),
        );
      }

      try {
        const profile = await createMurekaVoiceProfile(
          request.userId!,
          parsed.data,
          request.id,
        );
        return reply.status(201).send(profile);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/voice-profiles/:id/request-deletion",
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = request.params.id?.trim();
      if (!id) {
        return sendAppError(reply, new BadRequestError("Voice profile id is required"));
      }

      try {
        const result = await requestVoiceProfileDeletion(request.userId!, id);
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get(
    "/api/ops/provider-deletion-requests",
    async (request, reply) => {
      try {
        assertOpsAdmin(request);
        const limitRaw = (request.query as { limit?: string }).limit;
        const limit = limitRaw ? Number(limitRaw) : 100;
        return reply.send({
          items: await listPendingProviderDeletionRequests(
            Number.isFinite(limit) ? limit : 100,
          ),
        });
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/ops/provider-deletion-requests/:id/mark-submitted",
    async (request, reply) => {
      try {
        assertOpsAdmin(request);
        const id = request.params.id?.trim();
        if (!id) {
          return sendAppError(reply, new BadRequestError("Request id is required"));
        }
        return reply.send(await markProviderDeletionSubmitted(id));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/ops/provider-deletion-requests/:id/mark-confirmed",
    async (request, reply) => {
      try {
        assertOpsAdmin(request);
        const id = request.params.id?.trim();
        if (!id) {
          return sendAppError(reply, new BadRequestError("Request id is required"));
        }
        return reply.send(await markProviderDeletionConfirmed(id));
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

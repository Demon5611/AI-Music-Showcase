import type { FastifyInstance } from "fastify";
import {
  approveRefundRequestSchema,
  createRefundRequestSchema,
  rejectRefundRequestSchema,
} from "@ai-music/shared";
import { requireAuth } from "../../common/require-auth.js";
import { requireAdmin } from "../../common/require-admin.js";
import { sendAppError } from "../../common/errors.js";
import {
  approveRefundRequest,
  assertNoClientUserIdIdentity,
  createRefundRequest,
  getRefundRequestForAdmin,
  listRefundRequestsForAdmin,
  rejectRefundRequest,
  requeueApprovedRefund,
} from "./refund.service.js";

export async function registerRefundRoutes(app: FastifyInstance) {
  app.post("/api/billing/refunds", { preHandler: requireAuth }, async (request, reply) => {
    try {
      assertNoClientUserIdIdentity(request.body);
      const parsed = createRefundRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const result = await createRefundRequest(request.userId!, parsed.data);
      return reply.status(201).send(result);
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  app.get(
    "/api/admin/refunds",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      try {
        const status =
          typeof (request.query as { status?: string }).status === "string"
            ? (request.query as { status?: string }).status
            : undefined;
        const result = await listRefundRequestsForAdmin({ status });
        return reply.send({ items: result });
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { refundId: string } }>(
    "/api/admin/refunds/:refundId",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      try {
        const result = await getRefundRequestForAdmin(request.params.refundId);
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { refundId: string } }>(
    "/api/admin/refunds/:refundId/approve",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      try {
        assertNoClientUserIdIdentity(request.body);
        const parsed = approveRefundRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.status(400).send({ error: parsed.error.flatten() });
        }

        const result = await approveRefundRequest(
          request.userId!,
          request.params.refundId,
          parsed.data,
        );
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { refundId: string } }>(
    "/api/admin/refunds/:refundId/requeue",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      try {
        assertNoClientUserIdIdentity(request.body);
        const result = await requeueApprovedRefund(
          request.userId!,
          request.params.refundId,
        );
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post<{ Params: { refundId: string } }>(
    "/api/admin/refunds/:refundId/reject",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      try {
        assertNoClientUserIdIdentity(request.body);
        const parsed = rejectRefundRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.status(400).send({ error: parsed.error.flatten() });
        }

        const result = await rejectRefundRequest(
          request.userId!,
          request.params.refundId,
          parsed.data.reason,
        );
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

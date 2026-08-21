import type { FastifyInstance } from "fastify";

export async function registerTrackRoutes(app: FastifyInstance) {
  app.get("/api/tracks", async () => []);

  app.get("/api/tracks/:id", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/api/share/:slug", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.delete("/api/tracks/:id", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}

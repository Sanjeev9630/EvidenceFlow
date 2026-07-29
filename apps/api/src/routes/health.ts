import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    let database: "connected" | "error" = "connected";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "error";
    }

    return reply.send({
      ok: true as const,
      service: "evidenceflow-api" as const,
      version: "0.1.0",
      database,
    });
  });
}

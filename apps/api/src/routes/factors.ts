import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function factorRoutes(app: FastifyInstance) {
  app.get("/factors", async (_req, reply) => {
    const factors = await prisma.emissionFactor.findMany({
      orderBy: [{ category: "asc" }, { region: "asc" }, { factorKey: "asc" }],
    });

    return reply.send(
      factors.map((f) => ({
        id: f.id,
        factorKey: f.factorKey,
        version: f.version,
        activityType: f.activityType,
        category: f.category,
        region: f.region,
        unit: f.unit,
        valueKgCo2e: f.valueKgCo2e,
        sourceLabel: f.sourceLabel,
        description: f.description,
      })),
    );
  });
}

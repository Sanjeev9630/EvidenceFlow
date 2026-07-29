import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const VisitBodySchema = z.object({
  path: z.string().min(1).max(500).default("/"),
  referrer: z.string().max(2000).nullable().optional(),
  language: z.string().max(32).nullable().optional(),
  screen: z.string().max(32).nullable().optional(),
});

function clientIp(req: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim() || null;
  }
  return req.ip || null;
}

export async function analyticsRoutes(app: FastifyInstance) {
  /** Record a browser page hit into the `visited` table (no viewer UI — inspect via DB). */
  app.post("/analytics/visit", async (req, reply) => {
    const parsed = VisitBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid visit payload",
        details: parsed.error.flatten(),
      });
    }

    const userAgentHeader = req.headers["user-agent"];
    const userAgent =
      typeof userAgentHeader === "string"
        ? userAgentHeader.slice(0, 1000)
        : Array.isArray(userAgentHeader)
          ? userAgentHeader[0]?.slice(0, 1000) ?? null
          : null;

    const visit = await prisma.visited.create({
      data: {
        path: parsed.data.path,
        referrer: parsed.data.referrer ?? null,
        language: parsed.data.language ?? null,
        screen: parsed.data.screen ?? null,
        userAgent,
        ip: clientIp(req),
      },
    });

    return reply.status(201).send({ id: visit.id, createdAt: visit.createdAt.toISOString() });
  });
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { fileRoutes } from "./routes/files.js";
import { importRoutes } from "./routes/imports.js";
import { factorRoutes } from "./routes/factors.js";
import { analyticsRoutes } from "./routes/analytics.js";

export async function createApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: config.corsOrigin,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
    },
  });

  await app.register(healthRoutes);
  await app.register(fileRoutes);
  await app.register(importRoutes);
  await app.register(factorRoutes);
  await app.register(analyticsRoutes);

  return app;
}

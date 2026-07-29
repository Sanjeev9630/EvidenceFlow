import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { prisma } from "../db.js";

export async function fileRoutes(app: FastifyInstance) {
  app.post("/files", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: "No file uploaded. Use multipart field 'file'." });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return reply.status(400).send({ error: "Empty file." });
    }

    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${sha256.slice(0, 12)}-${safeName}`;

    await mkdir(config.uploadDir, { recursive: true });
    const storagePath = path.join(config.uploadDir, storedName);
    await writeFile(storagePath, buffer);

    const company = await prisma.company.findFirst();
    if (!company) {
      return reply.status(500).send({
        error: "No demo company found. Run: pnpm db:seed",
      });
    }

    const sourceFile = await prisma.sourceFile.create({
      data: {
        originalName: file.filename,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: buffer.length,
        sha256,
        storagePath,
      },
    });

    const importRecord = await prisma.import.create({
      data: {
        companyId: company.id,
        sourceFileId: sourceFile.id,
        status: "uploaded",
      },
      include: {
        sourceFile: true,
      },
    });

    return reply.status(201).send({
      file: {
        id: sourceFile.id,
        originalName: sourceFile.originalName,
        mimeType: sourceFile.mimeType,
        sizeBytes: sourceFile.sizeBytes,
        sha256: sourceFile.sha256,
        createdAt: sourceFile.createdAt.toISOString(),
      },
      import: {
        id: importRecord.id,
        status: importRecord.status,
        sourceFileId: sourceFile.id,
        createdAt: importRecord.createdAt.toISOString(),
      },
    });
  });

  app.get("/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const sourceFile = await prisma.sourceFile.findUnique({ where: { id } });
    if (!sourceFile) {
      return reply.status(404).send({ error: "File not found" });
    }

    return {
      id: sourceFile.id,
      originalName: sourceFile.originalName,
      mimeType: sourceFile.mimeType,
      sizeBytes: sourceFile.sizeBytes,
      sha256: sourceFile.sha256,
      createdAt: sourceFile.createdAt.toISOString(),
    };
  });
}

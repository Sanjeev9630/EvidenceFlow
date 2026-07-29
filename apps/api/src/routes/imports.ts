import type { FastifyInstance } from "fastify";
import { buildAuditPack } from "../modules/audit/buildAuditPack.js";
import { renderAuditPackHtml } from "../modules/audit/renderHtml.js";
import {
  ApplyMappingRequestSchema,
  ExtractImportRequestSchema,
  UpdateActivityRowSchema,
} from "@evidenceflow/shared";
import { prisma } from "../db.js";
import {
  LOW_CONFIDENCE_THRESHOLD,
  paretoRows,
} from "../modules/confidence/score.js";
import { readDocumentText } from "../modules/extraction/readText.js";
import {
  applyMapping,
  calculateImport,
  extractImport,
  isDocumentFile,
  previewImport,
  validateImport,
} from "../services/importPipeline.js";
import { parseStrictDate } from "../utils/dates.js";
import { roundTo } from "../utils/numbers.js";

export async function importRoutes(app: FastifyInstance) {
  app.get("/imports", async (_req, reply) => {
    const imports = await prisma.import.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sourceFile: true,
        _count: { select: { calculations: true } },
      },
      take: 50,
    });

    return reply.send(
      imports.map((item) => ({
        id: item.id,
        status: item.status,
        originalName: item.sourceFile.originalName,
        rowCount: item.rowCount,
        warningCount: item.warningCount,
        errorCount: item.errorCount,
        qualityScore: item.qualityScore,
        totalKgCo2e: item.totalKgCo2e,
        calculatedRowCount: item._count.calculations,
        createdAt: item.createdAt.toISOString(),
      })),
    );
  });

  app.get("/imports/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await prisma.import.findUnique({
      where: { id },
      include: {
        sourceFile: true,
        activityRows: {
          include: { site: true },
          orderBy: { createdAt: "asc" },
        },
        issues: { orderBy: { createdAt: "asc" } },
        calculations: {
          include: { emissionFactor: true },
          orderBy: { resultKgCo2e: "desc" },
        },
      },
    });

    if (!item) {
      return reply.status(404).send({ error: "Import not found" });
    }

    const totalKgCo2e = item.totalKgCo2e ?? 0;
    const scored = item.calculations
      .filter((calc) => calc.confidence !== null)
      .map((calc) => {
        const row = item.activityRows.find((activity) => activity.id === calc.activityRowId);
        return {
          activityRowId: calc.activityRowId,
          sourceRef: row?.sourceRef ?? null,
          category: row?.category ?? null,
          resultKgCo2e: calc.resultKgCo2e,
          confidence: calc.confidence as number,
          formula: calc.formula,
        };
      });
    const pareto = paretoRows(scored).map((row) => ({
      ...row,
      shareOfTotal: totalKgCo2e > 0 ? roundTo(row.resultKgCo2e / totalKgCo2e, 4) : 0,
    }));

    return reply.send({
      id: item.id,
      status: item.status,
      rowCount: item.rowCount,
      warningCount: item.warningCount,
      errorCount: item.errorCount,
      qualityScore: item.qualityScore,
      totalKgCo2e: item.totalKgCo2e,
      mappingJson: item.mappingJson,
      isDocument: isDocumentFile(item.sourceFile.originalName),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      sourceFile: {
        id: item.sourceFile.id,
        originalName: item.sourceFile.originalName,
        mimeType: item.sourceFile.mimeType,
        sizeBytes: item.sourceFile.sizeBytes,
        sha256: item.sourceFile.sha256,
        createdAt: item.sourceFile.createdAt.toISOString(),
      },
      activityRows: item.activityRows,
      issues: item.issues,
      calculations: item.calculations,
      quality: {
        qualityScore: item.qualityScore,
        calculatedRowCount: item.calculations.length,
        lowConfidenceRowCount: scored.filter(
          (row) => row.confidence < LOW_CONFIDENCE_THRESHOLD,
        ).length,
        lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
        pareto,
      },
    });
  });

  app.get("/imports/:id/document-text", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await prisma.import.findUnique({
      where: { id },
      include: { sourceFile: true },
    });
    if (!item) {
      return reply.status(404).send({ error: "Import not found" });
    }
    if (!isDocumentFile(item.sourceFile.originalName)) {
      return reply.status(400).send({ error: "This import is tabular, not a document." });
    }

    const document = await readDocumentText(
      item.sourceFile.storagePath,
      item.sourceFile.originalName,
    );
    return reply.send({
      importId: id,
      originalName: item.sourceFile.originalName,
      text: document.text,
      needsPaste: document.needsPaste,
      note: document.note,
      source: document.source,
    });
  });

  app.post("/imports/:id/extract", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ExtractImportRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid extract request",
        details: parsed.error.flatten(),
      });
    }

    try {
      return reply.send(await extractImport(id, parsed.data));
    } catch (error) {
      if (error instanceof Error && error.message === "IMPORT_NOT_FOUND") {
        return reply.status(404).send({ error: "Import not found" });
      }
      const message = error instanceof Error ? error.message : "Unable to extract document";
      if (message.includes("DOCUMENT_NEEDS_PASTE") || message.includes("Paste")) {
        return reply.status(422).send({ error: message, needsPaste: true });
      }
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/imports/:id/preview", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(await previewImport(id));
    } catch (error) {
      if (error instanceof Error && error.message === "IMPORT_NOT_FOUND") {
        return reply.status(404).send({ error: "Import not found" });
      }
      const message = error instanceof Error ? error.message : "Unable to preview file";
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/imports/:id/mapping", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ApplyMappingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid mapping",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await applyMapping(id, parsed.data);
      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === "IMPORT_NOT_FOUND") {
        return reply.status(404).send({ error: "Import not found" });
      }
      const message = error instanceof Error ? error.message : "Unable to apply mapping";
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/imports/:id/validate", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(await validateImport(id));
    } catch (error) {
      if (error instanceof Error && error.message === "IMPORT_NOT_FOUND") {
        return reply.status(404).send({ error: "Import not found" });
      }
      if (error instanceof Error && error.message === "NO_ACTIVITY_ROWS") {
        return reply.status(400).send({ error: "Map the file into activity rows first." });
      }
      const message = error instanceof Error ? error.message : "Unable to validate import";
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/imports/:id/calculate", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(await calculateImport(id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to calculate emissions";
      if (message === "IMPORT_NOT_FOUND") {
        return reply.status(404).send({ error: "Import not found" });
      }
      if (message === "NO_ACTIVITY_ROWS") {
        return reply.status(400).send({ error: "Map the file into activity rows first." });
      }
      if (message === "NOT_VALIDATED") {
        return reply.status(409).send({ error: "Run validation before calculating emissions." });
      }
      if (message === "VALIDATION_FAILED") {
        return reply
          .status(409)
          .send({ error: "Resolve the validation errors before calculating emissions." });
      }
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/imports/:id/audit-pack", async (req, reply) => {
    const { id } = req.params as { id: string };
    const format = (req.query as { format?: string }).format ?? "json";

    try {
      const pack = await buildAuditPack(id);
      if (format === "html") {
        const html = renderAuditPackHtml(pack);
        return reply
          .header("Content-Type", "text/html; charset=utf-8")
          .send(html);
      }
      const filename = `audit-pack-${pack.sourceFile.originalName.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`;
      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pack);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to build audit pack";
      if (message === "IMPORT_NOT_FOUND") {
        return reply.status(404).send({ error: "Import not found" });
      }
      if (message === "NOT_CALCULATED") {
        return reply
          .status(409)
          .send({ error: "Calculate emissions before exporting an audit pack." });
      }
      return reply.status(400).send({ error: message });
    }
  });

  app.patch("/imports/:id/rows/:rowId", async (req, reply) => {
    const { id, rowId } = req.params as { id: string; rowId: string };
    const parsed = UpdateActivityRowSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid activity row update",
        details: parsed.error.flatten(),
      });
    }

    const existing = await prisma.activityRow.findFirst({
      where: { id: rowId, importId: id },
      include: { import: { include: { company: { include: { sites: true } } } } },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Activity row not found" });
    }

    const { siteCode, date, needsBetterData, needsBetterDataNote, ...values } = parsed.data;
    const siteId =
      siteCode === undefined
        ? undefined
        : existing.import.company.sites.find(
            (site) => site.code.toUpperCase() === siteCode.toUpperCase(),
          )?.id ?? null;
    const parsedDate = date === undefined ? undefined : parseStrictDate(date);
    if (date !== undefined && !parsedDate) {
      return reply.status(400).send({ error: "Invalid date" });
    }

    const auditOnly =
      needsBetterData !== undefined ||
      needsBetterDataNote !== undefined
        ? Object.keys(values).length === 0 &&
          siteCode === undefined &&
          date === undefined
        : false;

    const updateData = {
      ...values,
      country: values.country?.toUpperCase(),
      ...(siteCode !== undefined ? { siteId } : {}),
      ...(date !== undefined ? { date: parsedDate } : {}),
      ...(needsBetterData !== undefined ? { needsBetterData } : {}),
      ...(needsBetterDataNote !== undefined ? { needsBetterDataNote } : {}),
    };

    if (auditOnly) {
      const updated = await prisma.activityRow.update({
        where: { id: rowId },
        data: updateData,
        include: { site: true },
      });
      return reply.send(updated);
    }

    const [updated] = await prisma.$transaction([
      prisma.activityRow.update({
        where: { id: rowId },
        data: updateData,
        include: { site: true },
      }),
      // Editing a row invalidates the previous validation and calculation passes.
      prisma.issue.deleteMany({ where: { activityRowId: rowId } }),
      prisma.calculation.deleteMany({ where: { importId: id } }),
      prisma.import.update({
        where: { id },
        data: { status: "draft", totalKgCo2e: null, qualityScore: null },
      }),
    ]);
    return reply.send(updated);
  });
}

import type {
  AuditPack,
  ConfidenceBreakdown,
  ConfidenceRule,
  FieldEvidence,
  QualitySummary,
} from "@evidenceflow/shared";
import { AuditPackSchema } from "@evidenceflow/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import {
  LOW_CONFIDENCE_THRESHOLD,
  paretoRows,
} from "../confidence/score.js";
import { isDocumentFile } from "../../services/importPipeline.js";
import { roundTo } from "../../utils/numbers.js";

const GLOBAL_ASSUMPTIONS = [
  {
    id: "factors_illustrative",
    text: "Emission factors use MOCK-* source labels and are illustrative only — not licensed ecoinvent/DEFRA data.",
  },
  {
    id: "llm_never_computes",
    text: "LLM extraction (when used) proposes candidate activity fields only. All CO₂e numbers are computed deterministically in TypeScript.",
  },
  {
    id: "passenger_bridge",
    text: "Distance → passenger-distance conversion assumes 1 passenger per trip and is disclosed on affected rows.",
  },
  {
    id: "factor_snapshot",
    text: "Factor key, version, and value are frozen on each Calculation at calculation time and may differ from the current factor library.",
  },
] as const;

type ImportBundle = Prisma.ImportGetPayload<{
  include: {
    company: true;
    sourceFile: true;
    activityRows: { include: { site: true; issues: true } };
    issues: true;
    calculations: true;
  };
}>;

function fieldEvidenceFrom(rawJson: unknown): FieldEvidence[] {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return [];
  const evidence = (rawJson as { fieldEvidence?: FieldEvidence[] }).fieldEvidence;
  return Array.isArray(evidence) ? evidence : [];
}

function extractionSourceFrom(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null;
  const source = (rawJson as { extractionSource?: string }).extractionSource;
  return typeof source === "string" ? source : null;
}

function extractionMethodFrom(mappingJson: unknown): string | null {
  if (!mappingJson || typeof mappingJson !== "object" || Array.isArray(mappingJson)) return null;
  const method = (mappingJson as { method?: string }).method;
  return typeof method === "string" ? method : null;
}

function confidenceRulesFrom(json: unknown): ConfidenceRule[] | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
  const breakdown = json as ConfidenceBreakdown;
  return Array.isArray(breakdown.rules) ? breakdown.rules : undefined;
}

function buildQuality(importRecord: ImportBundle): QualitySummary {
  const totalKgCo2e = importRecord.totalKgCo2e ?? 0;
  const scored = importRecord.calculations
    .filter((calc) => calc.confidence !== null)
    .map((calc) => {
      const row = importRecord.activityRows.find((r) => r.id === calc.activityRowId);
      return {
        activityRowId: calc.activityRowId,
        sourceRef: row?.sourceRef ?? null,
        category: row?.category ?? null,
        resultKgCo2e: calc.resultKgCo2e,
        confidence: calc.confidence as number,
        formula: calc.formula,
      };
    });

  return {
    qualityScore: importRecord.qualityScore,
    calculatedRowCount: importRecord.calculations.length,
    lowConfidenceRowCount: scored.filter((r) => r.confidence < LOW_CONFIDENCE_THRESHOLD).length,
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    pareto: paretoRows(scored).map((row) => ({
      ...row,
      shareOfTotal: totalKgCo2e > 0 ? roundTo(row.resultKgCo2e / totalKgCo2e, 4) : 0,
    })),
  };
}

function buildFactors(importRecord: ImportBundle) {
  const seen = new Map<string, AuditPack["factors"][number]>();
  for (const calc of importRecord.calculations) {
    if (!seen.has(calc.factorKey)) {
      seen.set(calc.factorKey, {
        factorKey: calc.factorKey,
        version: calc.factorVersion,
        activityType: calc.activityBasis === "category" ? "(category match)" : "",
        category: "",
        region: calc.factorRegion,
        unit: calc.factorUnit,
        valueKgCo2e: calc.factorValueKgCo2e,
        sourceLabel: calc.factorSourceLabel,
      });
    }
    const entry = seen.get(calc.factorKey)!;
    const row = importRecord.activityRows.find((r) => r.id === calc.activityRowId);
    if (row?.activityType && entry.activityType === "") {
      entry.activityType = row.activityType;
    }
    if (row?.category) entry.category = row.category;
  }
  return [...seen.values()].sort((a, b) => a.factorKey.localeCompare(b.factorKey));
}

export async function buildAuditPack(importId: string): Promise<AuditPack> {
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      company: true,
      sourceFile: true,
      activityRows: {
        include: { site: true, issues: true },
        orderBy: { createdAt: "asc" },
      },
      issues: { orderBy: { createdAt: "asc" } },
      calculations: { orderBy: { resultKgCo2e: "desc" } },
    },
  });

  if (!importRecord) {
    throw new Error("IMPORT_NOT_FOUND");
  }
  if (importRecord.status !== "calculated") {
    throw new Error("NOT_CALCULATED");
  }

  const calcByRow = new Map(importRecord.calculations.map((c) => [c.activityRowId, c]));
  const quality = buildQuality(importRecord);

  const pack: AuditPack = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    product: "evidenceflow",
    company: {
      id: importRecord.company.id,
      name: importRecord.company.name,
    },
    import: {
      id: importRecord.id,
      status: importRecord.status as AuditPack["import"]["status"],
      rowCount: importRecord.rowCount,
      errorCount: importRecord.errorCount,
      warningCount: importRecord.warningCount,
      totalKgCo2e: importRecord.totalKgCo2e,
      qualityScore: importRecord.qualityScore,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      isDocument: isDocumentFile(importRecord.sourceFile.originalName),
      extractionMethod: extractionMethodFrom(importRecord.mappingJson),
    },
    sourceFile: {
      id: importRecord.sourceFile.id,
      originalName: importRecord.sourceFile.originalName,
      mimeType: importRecord.sourceFile.mimeType,
      sizeBytes: importRecord.sourceFile.sizeBytes,
      sha256: importRecord.sourceFile.sha256,
      createdAt: importRecord.sourceFile.createdAt.toISOString(),
    },
    assumptions: [...GLOBAL_ASSUMPTIONS],
    factors: buildFactors(importRecord),
    quality,
    issues: importRecord.issues.map((issue) => ({
      id: issue.id,
      activityRowId: issue.activityRowId,
      severity: issue.severity as AuditPack["issues"][number]["severity"],
      code: issue.code,
      message: issue.message,
      createdAt: issue.createdAt.toISOString(),
    })),
    lineage: importRecord.activityRows.map((row) => {
      const auditRow = row as typeof row & {
        needsBetterData?: boolean;
        needsBetterDataNote?: string | null;
      };
      const calc = calcByRow.get(row.id);
      return {
        activityRowId: row.id,
        sourceRef: row.sourceRef,
        date: row.date?.toISOString() ?? null,
        siteCode: row.site?.code ?? null,
        category: row.category,
        activityType: row.activityType,
        quantity: row.quantity,
        unit: row.unit,
        country: row.country,
        supplier: row.supplier,
        extractionSource: extractionSourceFrom(row.rawJson),
        extractionConfidence: row.extractionConfidence,
        fieldEvidence: fieldEvidenceFrom(row.rawJson),
        needsBetterData: auditRow.needsBetterData ?? false,
        needsBetterDataNote: auditRow.needsBetterDataNote ?? null,
        factorKey: calc?.factorKey ?? null,
        factorVersion: calc?.factorVersion ?? null,
        factorRegion: calc?.factorRegion ?? null,
        factorValueKgCo2e: calc?.factorValueKgCo2e ?? null,
        factorSourceLabel: calc?.factorSourceLabel ?? null,
        activityBasis: (calc?.activityBasis as AuditPack["lineage"][number]["activityBasis"]) ?? null,
        regionTier: (calc?.regionTier as AuditPack["lineage"][number]["regionTier"]) ?? null,
        matchNotes: calc?.matchNotes ?? null,
        formula: calc?.formula ?? null,
        resultKgCo2e: calc?.resultKgCo2e ?? null,
        confidence: calc?.confidence ?? null,
        confidenceRules: calc ? confidenceRulesFrom(calc.confidenceJson) : undefined,
        issues: row.issues.map((issue) => ({
          severity: issue.severity as "error" | "warning" | "info",
          code: issue.code,
          message: issue.message,
        })),
      };
    }),
  };

  return AuditPackSchema.parse(pack);
}

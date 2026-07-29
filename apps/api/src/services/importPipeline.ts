import type {
  ApplyMappingRequest,
  ActivityCategory,
  ActivityDraft,
  CanonicalField,
  ExtractImportRequest,
} from "@evidenceflow/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { computeEmission } from "../modules/calc/compute.js";
import {
  batchQualityScore,
  isDocumentExtraction,
  LOW_CONFIDENCE_THRESHOLD,
  paretoRows,
  scoreConfidence,
} from "../modules/confidence/score.js";
import { extractActivities } from "../modules/extraction/index.js";
import { matchFactor, type FactorCandidate } from "../modules/factors/match.js";
import { autoMapColumns } from "../modules/mapping/autoMap.js";
import { parseSourceFile, type RawRow } from "../modules/parsing/index.js";
import {
  categoryForActivityType,
  normalizeActivityType,
  normalizeCountry,
  normalizeRow,
} from "../modules/validation/normalize.js";
import {
  runValidation,
  type FieldSources,
  type ValidatableRow,
} from "../modules/validation/rules.js";
import { parseStrictDate } from "../utils/dates.js";
import { roundTo } from "../utils/numbers.js";
import { canonicalUnit } from "../utils/units.js";

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);

export function isDocumentFile(originalName: string): boolean {
  const lower = originalName.toLowerCase();
  return [...DOCUMENT_EXTENSIONS].some((ext) => lower.endsWith(ext));
}

export async function previewImport(importId: string) {
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: { sourceFile: true },
  });
  if (!importRecord) {
    throw new Error("IMPORT_NOT_FOUND");
  }
  if (isDocumentFile(importRecord.sourceFile.originalName)) {
    throw new Error(
      "This is a document import. Use POST /imports/:id/extract (or the Extract page) instead of column mapping.",
    );
  }

  const parsed = await parseSourceFile(
    importRecord.sourceFile.storagePath,
    importRecord.sourceFile.originalName,
  );
  const suggestions = autoMapColumns(parsed.columns);

  await prisma.import.updateMany({
    where: { id: importId, status: "uploaded" },
    data: { status: "previewed" },
  });

  return {
    importId,
    columns: parsed.columns,
    sampleRows: parsed.rows.slice(0, 20),
    totalRows: parsed.rows.length,
    autoMapping: suggestions.mapping,
    mappingConfidence: suggestions.confidence,
    suggestedDefaults: suggestions.defaults,
  };
}

function cleanString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const result = String(value).trim();
  return result === "" ? undefined : result;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanString(value);
  if (!text) return undefined;
  const normalized = text.replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function cleanDate(value: unknown): string | undefined {
  const text = cleanString(value);
  if (!text) return undefined;
  return parseStrictDate(text)?.toISOString();
}

function mapValue(field: CanonicalField, value: unknown): unknown {
  if (field === "quantity") return cleanNumber(value);
  if (field === "date") return cleanDate(value);
  if (field === "activityType") return normalizeActivityType(cleanString(value)) ?? undefined;
  return cleanString(value);
}

function toActivityDraft(
  row: RawRow,
  rowIndex: number,
  request: ApplyMappingRequest,
): ActivityDraft {
  const draft: ActivityDraft = {
    ...request.defaults,
    sourceRef: `row:${rowIndex + 2}`,
    extractionConfidence: 1,
  };

  for (const [sourceColumn, field] of Object.entries(request.mapping)) {
    if (field === "ignore") continue;
    const value = mapValue(field, row[sourceColumn]);
    if (value !== undefined) {
      (draft as Record<string, unknown>)[field] = value;
    }
  }

  const mappedFields = new Set(Object.values(request.mapping));
  const activityType = normalizeActivityType(draft.activityType);
  const derivedCategory = categoryForActivityType(activityType) as ActivityCategory | null;
  // A per-row activity type outranks a file-level default: a mixed fuel column
  // must not inherit one category for every row and then match the wrong factor.
  const category =
    mappedFields.has("category") || !mappedFields.has("activityType")
      ? draft.category ?? derivedCategory
      : derivedCategory ?? draft.category;

  draft.activityType = activityType ?? undefined;
  draft.category = category ?? undefined;
  // Unrecognised units are kept verbatim so validation can flag them.
  draft.unit = canonicalUnit(draft.unit) ?? draft.unit;
  return draft;
}

export async function applyMapping(importId: string, request: ApplyMappingRequest) {
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      sourceFile: true,
      company: { include: { sites: true } },
    },
  });
  if (!importRecord) {
    throw new Error("IMPORT_NOT_FOUND");
  }

  const parsed = await parseSourceFile(
    importRecord.sourceFile.storagePath,
    importRecord.sourceFile.originalName,
  );
  const siteByCode = new Map(
    importRecord.company.sites.map((site) => [site.code.toUpperCase(), site.id]),
  );

  const rows: Prisma.ActivityRowCreateManyInput[] = parsed.rows.map((rawRow, index) => {
    const draft = toActivityDraft(rawRow, index, request);
    return {
      importId,
      siteId: draft.siteCode ? siteByCode.get(draft.siteCode.toUpperCase()) : undefined,
      date: draft.date ? new Date(draft.date) : undefined,
      category: draft.category,
      activityType: draft.activityType,
      quantity: draft.quantity,
      unit: draft.unit,
      country: normalizeCountry(draft.country) ?? undefined,
      supplier: draft.supplier,
      description: draft.description,
      sourceRef: draft.sourceRef,
      extractionConfidence: draft.extractionConfidence,
      rawJson: JSON.parse(JSON.stringify(rawRow)) as Prisma.InputJsonValue,
    };
  });

  await prisma.$transaction([
    prisma.issue.deleteMany({ where: { importId } }),
    prisma.activityRow.deleteMany({ where: { importId } }),
    prisma.import.update({
      where: { id: importId },
      data: {
        status: "mapped",
        mappingJson: JSON.parse(JSON.stringify(request)) as Prisma.InputJsonValue,
      },
    }),
    prisma.activityRow.createMany({ data: rows }),
    prisma.import.update({
      where: { id: importId },
      data: {
        status: "draft",
        rowCount: rows.length,
        warningCount: 0,
        errorCount: 0,
      },
    }),
  ]);

  return prisma.import.findUnique({
    where: { id: importId },
    include: {
      sourceFile: true,
      activityRows: { orderBy: { createdAt: "asc" } },
    },
  });
}

/**
 * PDF/TXT path: extract candidate activity fields (LLM or heuristic) and create
 * the same draft ActivityRows the CSV mapping path produces.
 */
export async function extractImport(importId: string, request: ExtractImportRequest = {}) {
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      sourceFile: true,
      company: { include: { sites: true } },
    },
  });
  if (!importRecord) {
    throw new Error("IMPORT_NOT_FOUND");
  }

  const extraction = await extractActivities({
    storagePath: importRecord.sourceFile.storagePath,
    originalName: importRecord.sourceFile.originalName,
    pastedText: request.pastedText,
  });

  const siteByCode = new Map(
    importRecord.company.sites.map((site) => [site.code.toUpperCase(), site.id]),
  );

  const rows: Prisma.ActivityRowCreateManyInput[] = extraction.activities.map((activity, index) => {
    const date = activity.date ? parseStrictDate(activity.date) : null;
    return {
      importId,
      siteId: activity.siteCode
        ? siteByCode.get(activity.siteCode.toUpperCase())
        : undefined,
      date: date ?? undefined,
      category: activity.category,
      activityType: activity.activityType,
      quantity: activity.quantity,
      unit: canonicalUnit(activity.unit) ?? activity.unit,
      country: normalizeCountry(activity.country) ?? undefined,
      supplier: activity.supplier,
      description: activity.description,
      sourceRef: activity.sourceRef ?? `doc:activity-${index + 1}`,
      extractionConfidence: activity.extractionConfidence,
      rawJson: {
        extractionSource: extraction.method,
        extractionModel: extraction.model,
        fieldEvidence: activity.fieldEvidence,
        documentChars: extraction.documentChars,
      } as Prisma.InputJsonValue,
    };
  });

  await prisma.$transaction([
    prisma.calculation.deleteMany({ where: { importId } }),
    prisma.issue.deleteMany({ where: { importId } }),
    prisma.activityRow.deleteMany({ where: { importId } }),
    prisma.activityRow.createMany({ data: rows }),
    prisma.import.update({
      where: { id: importId },
      data: {
        status: "draft",
        rowCount: rows.length,
        warningCount: 0,
        errorCount: 0,
        totalKgCo2e: null,
        qualityScore: null,
        mappingJson: {
          kind: "document_extraction",
          method: extraction.method,
          model: extraction.model,
          documentChars: extraction.documentChars,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  const detail = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      sourceFile: true,
      activityRows: { include: { site: true }, orderBy: { createdAt: "asc" } },
    },
  });

  return {
    import: detail,
    extraction: {
      method: extraction.method,
      model: extraction.model,
      documentChars: extraction.documentChars,
      activityCount: extraction.activities.length,
      activities: extraction.activities,
    },
  };
}

/** Builds a canonical-field → source-column lookup from the stored mapping. */
function fieldSourcesFrom(mappingJson: Prisma.JsonValue | null): FieldSources {
  const sources: FieldSources = {};
  if (!mappingJson || typeof mappingJson !== "object" || Array.isArray(mappingJson)) {
    return sources;
  }
  const mapping = (mappingJson as { mapping?: Record<string, string> }).mapping;
  if (!mapping) return sources;

  for (const [column, field] of Object.entries(mapping)) {
    if (field !== "ignore" && !sources[field]) {
      sources[field] = column;
    }
  }
  return sources;
}

export async function validateImport(importId: string) {
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      activityRows: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!importRecord) {
    throw new Error("IMPORT_NOT_FOUND");
  }
  if (importRecord.activityRows.length === 0) {
    throw new Error("NO_ACTIVITY_ROWS");
  }

  const normalizedUpdates: Prisma.PrismaPromise<unknown>[] = [];
  const rows: ValidatableRow[] = importRecord.activityRows.map((row) => {
    const normalized = normalizeRow(row);
    const changed =
      normalized.category !== row.category ||
      normalized.activityType !== row.activityType ||
      normalized.unit !== row.unit ||
      normalized.country !== row.country;

    if (changed) {
      normalizedUpdates.push(
        prisma.activityRow.update({
          where: { id: row.id },
          data: {
            category: normalized.category,
            activityType: normalized.activityType,
            unit: normalized.unit,
            country: normalized.country,
          },
        }),
      );
    }

    return {
      id: row.id,
      sourceRef: row.sourceRef,
      date: row.date,
      siteId: row.siteId,
      category: normalized.category,
      activityType: normalized.activityType,
      quantity: row.quantity,
      unit: normalized.unit,
      country: normalized.country,
      supplier: row.supplier,
      rawJson: row.rawJson,
    };
  });

  const issues = runValidation(rows, fieldSourcesFrom(importRecord.mappingJson));
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  await prisma.$transaction([
    ...normalizedUpdates,
    prisma.issue.deleteMany({ where: { importId } }),
    prisma.issue.createMany({
      data: issues.map((issue) => ({
        importId,
        activityRowId: issue.activityRowId,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
      })),
    }),
    // Re-validating may change the data a factor was matched against, so any
    // existing calculation is discarded rather than left to drift.
    prisma.calculation.deleteMany({ where: { importId } }),
    prisma.import.update({
      where: { id: importId },
      data: {
        status: errorCount > 0 ? "failed" : "validated",
        errorCount,
        warningCount,
        totalKgCo2e: null,
        qualityScore: null,
      },
    }),
  ]);

  return prisma.import.findUnique({
    where: { id: importId },
    include: {
      sourceFile: true,
      activityRows: { include: { site: true }, orderBy: { createdAt: "asc" } },
      issues: { orderBy: { createdAt: "asc" } },
    },
  });
}

/** Issue codes owned by the calculation pass; replaced on every re-run. */
export const CALC_ISSUE_CODES = [
  "FACTOR_NOT_FOUND",
  "FACTOR_UNIT_INCOMPATIBLE",
  "ROW_NOT_CALCULABLE",
];

const CALCULABLE_STATUSES = new Set(["validated", "calculated"]);

export async function calculateImport(importId: string) {
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      activityRows: {
        include: { issues: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!importRecord) {
    throw new Error("IMPORT_NOT_FOUND");
  }
  if (importRecord.activityRows.length === 0) {
    throw new Error("NO_ACTIVITY_ROWS");
  }
  if (importRecord.status === "failed") {
    throw new Error("VALIDATION_FAILED");
  }
  if (!CALCULABLE_STATUSES.has(importRecord.status)) {
    throw new Error("NOT_VALIDATED");
  }

  const factors: FactorCandidate[] = await prisma.emissionFactor.findMany({
    select: {
      id: true,
      factorKey: true,
      version: true,
      activityType: true,
      category: true,
      region: true,
      unit: true,
      valueKgCo2e: true,
      sourceLabel: true,
    },
  });

  const calculations: Prisma.CalculationCreateManyInput[] = [];
  const issues: Prisma.IssueCreateManyInput[] = [];
  const categoryTotals = new Map<string, { rowCount: number; kgCo2e: number }>();
  const tierCounts = { country: 0, region: 0, global: 0 };
  const scoredRows: Array<{
    activityRowId: string;
    sourceRef: string | null;
    category: string | null;
    resultKgCo2e: number;
    confidence: number;
    formula: string;
  }> = [];

  const fail = (activityRowId: string, code: string, message: string) => {
    issues.push({ importId, activityRowId, severity: "error", code, message });
  };

  for (const row of importRecord.activityRows) {
    if (row.quantity === null || !row.unit) {
      fail(
        row.id,
        "ROW_NOT_CALCULABLE",
        "Row is missing a quantity or unit, so no emission can be calculated.",
      );
      continue;
    }

    const result = matchFactor(
      {
        activityType: row.activityType,
        category: row.category,
        unit: row.unit,
        country: row.country,
        date: row.date,
      },
      factors,
    );
    if (!result.ok) {
      fail(row.id, result.code, result.message);
      continue;
    }

    const { factor, activityBasis, regionTier, notes } = result.match;
    const computed = computeEmission(row.quantity, row.unit, factor);
    if (!computed) {
      fail(
        row.id,
        "ROW_NOT_CALCULABLE",
        `Could not convert ${row.quantity} ${row.unit} to the factor basis ${factor.unit}.`,
      );
      continue;
    }

    const warningCount = row.issues.filter((issue) => issue.severity === "warning").length;
    const breakdown = scoreConfidence({
      activityType: row.activityType,
      category: row.category,
      unit: row.unit,
      extractionConfidence: row.extractionConfidence,
      fromDocumentExtraction: isDocumentExtraction(row.sourceRef, row.rawJson),
      activityBasis,
      regionTier,
      factorSourceLabel: factor.sourceLabel,
      warningCount,
    });

    calculations.push({
      importId,
      activityRowId: row.id,
      emissionFactorId: factor.id,
      formula: computed.formula,
      resultKgCo2e: computed.resultKgCo2e,
      confidence: breakdown.score,
      confidenceJson: breakdown as Prisma.InputJsonValue,
      inputQuantity: computed.inputQuantity,
      inputUnit: computed.inputUnit,
      factorQuantity: computed.factorQuantity,
      factorUnit: computed.factorUnit,
      factorKey: factor.factorKey,
      factorVersion: factor.version,
      factorValueKgCo2e: factor.valueKgCo2e,
      factorRegion: factor.region,
      factorSourceLabel: factor.sourceLabel,
      activityBasis,
      regionTier,
      matchNotes: notes,
    });

    scoredRows.push({
      activityRowId: row.id,
      sourceRef: row.sourceRef,
      category: row.category,
      resultKgCo2e: computed.resultKgCo2e,
      confidence: breakdown.score,
      formula: computed.formula,
    });

    tierCounts[regionTier] += 1;
    const key = row.category ?? "other";
    const bucket = categoryTotals.get(key) ?? { rowCount: 0, kgCo2e: 0 };
    bucket.rowCount += 1;
    bucket.kgCo2e += computed.resultKgCo2e;
    categoryTotals.set(key, bucket);
  }

  // Validation issues survive a calculation run; only calc-owned codes are replaced.
  const survivingIssues = await prisma.issue.findMany({
    where: { importId, code: { notIn: CALC_ISSUE_CODES } },
    select: { severity: true },
  });
  const errorCount =
    survivingIssues.filter((issue) => issue.severity === "error").length + issues.length;
  const warningCount = survivingIssues.filter((issue) => issue.severity === "warning").length;
  const totalKgCo2e = roundTo(calculations.reduce((sum, calc) => sum + calc.resultKgCo2e, 0));
  const qualityScore = batchQualityScore(scoredRows);
  const pareto = paretoRows(scoredRows).map((row) => ({
    activityRowId: row.activityRowId,
    sourceRef: row.sourceRef,
    category: row.category,
    resultKgCo2e: row.resultKgCo2e,
    confidence: row.confidence,
    shareOfTotal: totalKgCo2e > 0 ? roundTo(row.resultKgCo2e / totalKgCo2e, 4) : 0,
    formula: row.formula,
  }));

  await prisma.$transaction([
    prisma.calculation.deleteMany({ where: { importId } }),
    prisma.issue.deleteMany({ where: { importId, code: { in: CALC_ISSUE_CODES } } }),
    prisma.issue.createMany({ data: issues }),
    prisma.calculation.createMany({ data: calculations }),
    prisma.import.update({
      where: { id: importId },
      data: {
        status: "calculated",
        totalKgCo2e,
        qualityScore,
        errorCount,
        warningCount,
      },
    }),
  ]);

  return {
    importId,
    status: "calculated" as const,
    rowCount: importRecord.activityRows.length,
    calculatedRowCount: calculations.length,
    unmatchedRowCount: issues.length,
    totalKgCo2e,
    qualityScore,
    byCategory: [...categoryTotals.entries()]
      .map(([category, bucket]) => ({
        category,
        rowCount: bucket.rowCount,
        kgCo2e: roundTo(bucket.kgCo2e),
      }))
      .sort((a, b) => b.kgCo2e - a.kgCo2e),
    byRegionTier: tierCounts,
    quality: {
      qualityScore,
      calculatedRowCount: calculations.length,
      lowConfidenceRowCount: scoredRows.filter(
        (row) => row.confidence < LOW_CONFIDENCE_THRESHOLD,
      ).length,
      lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
      pareto,
    },
  };
}

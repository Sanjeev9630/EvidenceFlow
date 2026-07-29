import { z } from "zod";

export const ImportStatus = z.enum([
  "uploaded",
  "previewed",
  "mapped",
  "draft",
  "validated",
  "calculated",
  "failed",
]);
export type ImportStatus = z.infer<typeof ImportStatus>;

export const IssueSeverity = z.enum(["error", "warning", "info"]);
export type IssueSeverity = z.infer<typeof IssueSeverity>;

export const ActivityCategory = z.enum([
  "electricity",
  "natural_gas",
  "diesel",
  "petrol",
  "road_freight",
  "sea_freight",
  "air_freight",
  "business_travel",
  "steel",
  "aluminium",
  "other",
]);
export type ActivityCategory = z.infer<typeof ActivityCategory>;

export const ActivityDraftSchema = z.object({
  date: z.string().optional(),
  siteCode: z.string().optional(),
  category: ActivityCategory.optional(),
  activityType: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  country: z.string().optional(),
  supplier: z.string().optional(),
  description: z.string().optional(),
  sourceRef: z.string().optional(),
  extractionConfidence: z.number().min(0).max(1).optional(),
});
export type ActivityDraft = z.infer<typeof ActivityDraftSchema>;

export const CanonicalField = z.enum([
  "date",
  "siteCode",
  "category",
  "activityType",
  "quantity",
  "unit",
  "country",
  "supplier",
  "description",
  "ignore",
]);
export type CanonicalField = z.infer<typeof CanonicalField>;

export const ColumnMappingSchema = z.record(z.string(), CanonicalField);
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const MappingDefaultsSchema = z.object({
  category: ActivityCategory.optional(),
  activityType: z.string().optional(),
  unit: z.string().optional(),
  country: z.string().optional(),
});
export type MappingDefaults = z.infer<typeof MappingDefaultsSchema>;

export const ApplyMappingRequestSchema = z.object({
  mapping: ColumnMappingSchema,
  defaults: MappingDefaultsSchema.default({}),
});
export type ApplyMappingRequest = z.infer<typeof ApplyMappingRequestSchema>;

export const PreviewResponseSchema = z.object({
  importId: z.string(),
  columns: z.array(z.string()),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
  totalRows: z.number(),
  autoMapping: ColumnMappingSchema,
  mappingConfidence: z.record(z.string(), z.number()),
  suggestedDefaults: MappingDefaultsSchema,
});
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;

export const UpdateActivityRowSchema = ActivityDraftSchema.partial().extend({
  needsBetterData: z.boolean().optional(),
  needsBetterDataNote: z.string().max(500).optional(),
});
export type UpdateActivityRow = z.infer<typeof UpdateActivityRowSchema>;

export const IssueRecordSchema = z.object({
  id: z.string(),
  importId: z.string(),
  activityRowId: z.string().nullable(),
  severity: IssueSeverity,
  code: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export type IssueRecord = z.infer<typeof IssueRecordSchema>;

export const SourceFileMetaSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
  createdAt: z.string(),
});
export type SourceFileMeta = z.infer<typeof SourceFileMetaSchema>;

export const ImportSummarySchema = z.object({
  id: z.string(),
  status: ImportStatus,
  originalName: z.string().optional(),
  rowCount: z.number(),
  warningCount: z.number(),
  errorCount: z.number(),
  qualityScore: z.number().nullable(),
  totalKgCo2e: z.number().nullable(),
  calculatedRowCount: z.number(),
  createdAt: z.string(),
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;

export const EmissionFactorRecordSchema = z.object({
  id: z.string(),
  factorKey: z.string(),
  version: z.string(),
  activityType: z.string(),
  category: z.string(),
  region: z.string(),
  unit: z.string(),
  valueKgCo2e: z.number(),
  sourceLabel: z.string(),
  description: z.string().nullable(),
});
export type EmissionFactorRecord = z.infer<typeof EmissionFactorRecordSchema>;

/** How specific the region match was, cheapest-to-defend first. */
export const RegionTier = z.enum(["country", "region", "global"]);
export type RegionTier = z.infer<typeof RegionTier>;

/** Whether the factor was found by exact activity type or by the broader category. */
export const ActivityBasis = z.enum(["activityType", "category"]);
export type ActivityBasis = z.infer<typeof ActivityBasis>;

export const ConfidenceRuleId = z.enum([
  "primary_data",
  "unit_clarity",
  "factor_specificity",
  "extraction_source",
  "validation_clean",
]);
export type ConfidenceRuleId = z.infer<typeof ConfidenceRuleId>;

export const ConfidenceRuleSchema = z.object({
  id: ConfidenceRuleId,
  label: z.string(),
  weight: z.number(),
  score: z.number().min(0).max(1),
  reason: z.string(),
});
export type ConfidenceRule = z.infer<typeof ConfidenceRuleSchema>;

export const ConfidenceBreakdownSchema = z.object({
  score: z.number().min(0).max(1),
  rules: z.array(ConfidenceRuleSchema),
});
export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;

export const CalculationRecordSchema = z.object({
  id: z.string(),
  importId: z.string(),
  activityRowId: z.string(),
  emissionFactorId: z.string(),
  formula: z.string(),
  resultKgCo2e: z.number(),
  confidence: z.number().nullable(),
  confidenceJson: ConfidenceBreakdownSchema.nullable().optional(),
  inputQuantity: z.number(),
  inputUnit: z.string(),
  factorQuantity: z.number(),
  factorUnit: z.string(),
  factorKey: z.string(),
  factorVersion: z.string(),
  factorValueKgCo2e: z.number(),
  factorRegion: z.string(),
  factorSourceLabel: z.string(),
  activityBasis: ActivityBasis,
  regionTier: RegionTier,
  matchNotes: z.string(),
  createdAt: z.string(),
});
export type CalculationRecord = z.infer<typeof CalculationRecordSchema>;

export const CategoryTotalSchema = z.object({
  category: z.string(),
  rowCount: z.number(),
  kgCo2e: z.number(),
});
export type CategoryTotal = z.infer<typeof CategoryTotalSchema>;

export const CalculationSummarySchema = z.object({
  importId: z.string(),
  status: ImportStatus,
  rowCount: z.number(),
  calculatedRowCount: z.number(),
  unmatchedRowCount: z.number(),
  totalKgCo2e: z.number(),
  byCategory: z.array(CategoryTotalSchema),
  byRegionTier: z.record(RegionTier, z.number()),
  qualityScore: z.number().nullable().optional(),
});
export type CalculationSummary = z.infer<typeof CalculationSummarySchema>;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("evidenceflow-api"),
  version: z.string(),
  database: z.enum(["connected", "error"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Where a candidate field was found in the source document. */
export const FieldEvidenceSchema = z.object({
  field: z.string(),
  location: z.string(),
  snippet: z.string(),
});
export type FieldEvidence = z.infer<typeof FieldEvidenceSchema>;

/**
 * Strict LLM / heuristic extraction output. Intentionally has no emission fields —
 * the model may only propose activity candidates; CO₂e is computed in TypeScript.
 */
export const ExtractedActivitySchema = z.object({
  date: z.string().optional(),
  siteCode: z.string().optional(),
  category: ActivityCategory.optional(),
  activityType: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  country: z.string().optional(),
  supplier: z.string().optional(),
  description: z.string().optional(),
  sourceRef: z.string().optional(),
  extractionConfidence: z.number().min(0).max(1),
  fieldEvidence: z.array(FieldEvidenceSchema).default([]),
});
export type ExtractedActivity = z.infer<typeof ExtractedActivitySchema>;

export const ExtractionResultSchema = z.object({
  activities: z.array(ExtractedActivitySchema).min(1),
  method: z.enum(["llm", "heuristic", "pasted"]),
  model: z.string().nullable(),
  documentChars: z.number(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const ExtractImportRequestSchema = z.object({
  /** Optional pasted document text — used when PDF OCR fails or as the demo fallback. */
  pastedText: z.string().min(1).max(100_000).optional(),
});
export type ExtractImportRequest = z.infer<typeof ExtractImportRequestSchema>;

export const ParetoRowSchema = z.object({
  activityRowId: z.string(),
  sourceRef: z.string().nullable(),
  category: z.string().nullable(),
  resultKgCo2e: z.number(),
  confidence: z.number(),
  shareOfTotal: z.number(),
  formula: z.string(),
});
export type ParetoRow = z.infer<typeof ParetoRowSchema>;

export const QualitySummarySchema = z.object({
  qualityScore: z.number().nullable(),
  calculatedRowCount: z.number(),
  lowConfidenceRowCount: z.number(),
  lowConfidenceThreshold: z.number(),
  pareto: z.array(ParetoRowSchema),
});
export type QualitySummary = z.infer<typeof QualitySummarySchema>;

export const AuditAssumptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});
export type AuditAssumption = z.infer<typeof AuditAssumptionSchema>;

export const AuditFactorRecordSchema = z.object({
  factorKey: z.string(),
  version: z.string(),
  activityType: z.string(),
  category: z.string(),
  region: z.string(),
  unit: z.string(),
  valueKgCo2e: z.number(),
  sourceLabel: z.string(),
});
export type AuditFactorRecord = z.infer<typeof AuditFactorRecordSchema>;

export const AuditLineageRowSchema = z.object({
  activityRowId: z.string(),
  sourceRef: z.string().nullable(),
  date: z.string().nullable(),
  siteCode: z.string().nullable(),
  category: z.string().nullable(),
  activityType: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  country: z.string().nullable(),
  supplier: z.string().nullable(),
  extractionSource: z.string().nullable(),
  extractionConfidence: z.number().nullable(),
  fieldEvidence: z.array(FieldEvidenceSchema),
  needsBetterData: z.boolean(),
  needsBetterDataNote: z.string().nullable(),
  factorKey: z.string().nullable(),
  factorVersion: z.string().nullable(),
  factorRegion: z.string().nullable(),
  factorValueKgCo2e: z.number().nullable(),
  factorSourceLabel: z.string().nullable(),
  activityBasis: ActivityBasis.nullable(),
  regionTier: RegionTier.nullable(),
  matchNotes: z.string().nullable(),
  formula: z.string().nullable(),
  resultKgCo2e: z.number().nullable(),
  confidence: z.number().nullable(),
  confidenceRules: z.array(ConfidenceRuleSchema).optional(),
  issues: z.array(
    z.object({
      severity: IssueSeverity,
      code: z.string(),
      message: z.string(),
    }),
  ),
});
export type AuditLineageRow = z.infer<typeof AuditLineageRowSchema>;

export const AuditPackSchema = z.object({
  schemaVersion: z.literal("1.0"),
  generatedAt: z.string(),
  product: z.literal("evidenceflow"),
  company: z.object({
    id: z.string(),
    name: z.string(),
  }),
  import: z.object({
    id: z.string(),
    status: ImportStatus,
    rowCount: z.number(),
    errorCount: z.number(),
    warningCount: z.number(),
    totalKgCo2e: z.number().nullable(),
    qualityScore: z.number().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    isDocument: z.boolean(),
    extractionMethod: z.string().nullable(),
  }),
  sourceFile: SourceFileMetaSchema,
  assumptions: z.array(AuditAssumptionSchema),
  factors: z.array(AuditFactorRecordSchema),
  quality: QualitySummarySchema,
  issues: z.array(IssueRecordSchema.omit({ importId: true })),
  lineage: z.array(AuditLineageRowSchema),
});
export type AuditPack = z.infer<typeof AuditPackSchema>;

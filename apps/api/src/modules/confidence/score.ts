import type {
  ActivityBasis,
  ConfidenceBreakdown,
  ConfidenceRule,
  RegionTier,
} from "@evidenceflow/shared";
import { resolveUnit } from "../../utils/units.js";
import { dimensionsForCategory } from "../../utils/units.js";
import { roundTo } from "../../utils/numbers.js";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export type ConfidenceInput = {
  activityType: string | null;
  category: string | null;
  unit: string | null;
  extractionConfidence: number | null;
  /** true when the row came from LLM/heuristic document extraction rather than a tabular map. */
  fromDocumentExtraction: boolean;
  activityBasis: ActivityBasis;
  regionTier: RegionTier;
  factorSourceLabel: string;
  warningCount: number;
};

/**
 * Explainable weighted confidence. Weights sum to 1.0 so the score is a
 * convex combination of the five rules — never an opaque model output.
 */
const WEIGHTS = {
  primary_data: 0.25,
  unit_clarity: 0.15,
  factor_specificity: 0.25,
  extraction_source: 0.2,
  validation_clean: 0.15,
} as const;

function scorePrimaryData(input: ConfidenceInput): ConfidenceRule {
  const isSpend =
    input.activityType === "spend_proxy" ||
    resolveUnit(input.unit)?.dimension === "currency" ||
    /spend|proxy/i.test(input.factorSourceLabel);
  const isUnknown = input.activityType === "unknown" || input.category === "other";

  if (isSpend) {
    return {
      id: "primary_data",
      label: "Primary activity data",
      weight: WEIGHTS.primary_data,
      score: 0.25,
      reason: "Spend / monetary proxy — prefer measured activity data.",
    };
  }
  if (isUnknown) {
    return {
      id: "primary_data",
      label: "Primary activity data",
      weight: WEIGHTS.primary_data,
      score: 0.4,
      reason: "Activity type is vague (other/unknown).",
    };
  }
  return {
    id: "primary_data",
    label: "Primary activity data",
    weight: WEIGHTS.primary_data,
    score: 1,
    reason: "Row uses measured activity data (not a spend proxy).",
  };
}

function scoreUnitClarity(input: ConfidenceInput): ConfidenceRule {
  const unit = resolveUnit(input.unit);
  if (!input.unit || !unit) {
    return {
      id: "unit_clarity",
      label: "Unambiguous unit",
      weight: WEIGHTS.unit_clarity,
      score: 0.2,
      reason: "Unit is missing or outside the registry.",
    };
  }
  const expected = dimensionsForCategory(input.category);
  if (expected.length > 0 && !expected.includes(unit.dimension)) {
    return {
      id: "unit_clarity",
      label: "Unambiguous unit",
      weight: WEIGHTS.unit_clarity,
      score: 0.35,
      reason: `Unit ${unit.canonical} is registered but does not fit category ${input.category}.`,
    };
  }
  return {
    id: "unit_clarity",
    label: "Unambiguous unit",
    weight: WEIGHTS.unit_clarity,
    score: 1,
    reason: `Unit ${unit.canonical} is in the registry and fits the category.`,
  };
}

function scoreFactorSpecificity(input: ConfidenceInput): ConfidenceRule {
  const tierScore =
    input.regionTier === "country" ? 1 : input.regionTier === "region" ? 0.7 : 0.4;
  const basisScore = input.activityBasis === "activityType" ? 1 : 0.65;
  const score = roundTo(tierScore * 0.7 + basisScore * 0.3, 4);

  const tierReason =
    input.regionTier === "country"
      ? "Country-specific factor."
      : input.regionTier === "region"
        ? "Regional average factor (no country match)."
        : "Global average factor (weakest geographic match).";
  const basisReason =
    input.activityBasis === "activityType"
      ? "Matched on exact activity type."
      : "Matched on category only (no activity-type factor).";

  return {
    id: "factor_specificity",
    label: "Factor specificity",
    weight: WEIGHTS.factor_specificity,
    score,
    reason: `${tierReason} ${basisReason}`,
  };
}

function scoreExtractionSource(input: ConfidenceInput): ConfidenceRule {
  if (!input.fromDocumentExtraction) {
    return {
      id: "extraction_source",
      label: "Extraction source",
      weight: WEIGHTS.extraction_source,
      score: 1,
      reason: "Tabular CSV/XLSX mapping — structured source.",
    };
  }
  const score = Math.max(0.35, Math.min(1, input.extractionConfidence ?? 0.6));
  return {
    id: "extraction_source",
    label: "Extraction source",
    weight: WEIGHTS.extraction_source,
    score,
    reason: `Document extraction confidence ${score.toFixed(2)} (LLM/heuristic candidate fields).`,
  };
}

function scoreValidationClean(input: ConfidenceInput): ConfidenceRule {
  if (input.warningCount <= 0) {
    return {
      id: "validation_clean",
      label: "Validation clean",
      weight: WEIGHTS.validation_clean,
      score: 1,
      reason: "No validation warnings on this row.",
    };
  }
  if (input.warningCount === 1) {
    return {
      id: "validation_clean",
      label: "Validation clean",
      weight: WEIGHTS.validation_clean,
      score: 0.65,
      reason: "One validation warning on this row.",
    };
  }
  return {
    id: "validation_clean",
    label: "Validation clean",
    weight: WEIGHTS.validation_clean,
    score: 0.4,
    reason: `${input.warningCount} validation warnings on this row.`,
  };
}

export function scoreConfidence(input: ConfidenceInput): ConfidenceBreakdown {
  const rules = [
    scorePrimaryData(input),
    scoreUnitClarity(input),
    scoreFactorSpecificity(input),
    scoreExtractionSource(input),
    scoreValidationClean(input),
  ];
  const score = roundTo(
    rules.reduce((sum, rule) => sum + rule.weight * rule.score, 0),
    4,
  );
  return { score, rules };
}

/** Emission-weighted batch quality in 0–100. */
export function batchQualityScore(
  rows: Array<{ resultKgCo2e: number; confidence: number }>,
): number | null {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.resultKgCo2e, 0);
  if (total <= 0) {
    const mean = rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length;
    return roundTo(mean * 100, 1);
  }
  const weighted =
    rows.reduce((sum, row) => sum + row.resultKgCo2e * row.confidence, 0) / total;
  return roundTo(weighted * 100, 1);
}

/**
 * High-emission, low-confidence rows first — the audit triage view.
 * Rank = kgCO₂e × (1 − confidence).
 */
export function paretoRows<T extends { resultKgCo2e: number; confidence: number }>(
  rows: T[],
  limit = 8,
): T[] {
  return [...rows]
    .map((row) => ({
      row,
      rank: row.resultKgCo2e * (1 - row.confidence),
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((entry) => entry.row);
}

export function isDocumentExtraction(sourceRef: string | null, rawJson: unknown): boolean {
  if (sourceRef?.startsWith("doc:")) return true;
  if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
    const source = (rawJson as { extractionSource?: string }).extractionSource;
    return source === "llm" || source === "heuristic" || source === "pasted";
  }
  return false;
}

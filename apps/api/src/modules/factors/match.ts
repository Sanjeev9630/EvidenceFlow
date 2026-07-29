import { conversionPath, resolveUnit } from "../../utils/units.js";

export type FactorCandidate = {
  id: string;
  factorKey: string;
  version: string;
  activityType: string;
  category: string;
  region: string;
  unit: string;
  valueKgCo2e: number;
  sourceLabel: string;
};

export type RegionTier = "country" | "region" | "global";
export type ActivityBasis = "activityType" | "category";

export const GLOBAL_REGION = "GLOBAL";

/**
 * Countries grouped into the regional aggregates the factor library publishes.
 * Anything not listed falls straight through to the global average.
 */
const REGION_GROUP_BY_COUNTRY: Record<string, string> = Object.fromEntries(
  [
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
    "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
    "SE", "SI", "SK", "IS", "LI", "NO",
  ].map((country) => [country, "EU"]),
);

/** Region lookup order: exact country → regional aggregate → global average. */
export function regionChain(country: string | null | undefined): string[] {
  const code = country?.trim().toUpperCase();
  const chain: string[] = [];
  if (code) chain.push(code);
  const group = code ? REGION_GROUP_BY_COUNTRY[code] : undefined;
  if (group) chain.push(group);
  chain.push(GLOBAL_REGION);
  return [...new Set(chain)];
}

function tierFor(region: string, country: string | null | undefined): RegionTier {
  if (region === GLOBAL_REGION) return "global";
  if (country && region === country.trim().toUpperCase()) return "country";
  return "region";
}

const YEAR_PATTERN = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/;

/** Reporting year a factor was published for, read from its key or source label. */
export function factorVintage(factor: FactorCandidate): number | null {
  for (const text of [factor.factorKey, factor.sourceLabel]) {
    const match = YEAR_PATTERN.exec(text);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

/**
 * Ranks a factor's vintage against the activity year. Same year wins, then the
 * closest earlier vintage (data published before the activity), and only then a
 * later vintage — applying a future factor to past activity is the weakest option.
 */
function vintageRank(vintage: number | null, activityYear: number | null): number {
  if (vintage === null) return 500;
  if (activityYear === null) return 100 - Math.min(vintage, 99);
  if (vintage === activityYear) return 0;
  if (vintage < activityYear) return 1 + (activityYear - vintage);
  return 200 + (vintage - activityYear);
}

export type MatchableRow = {
  activityType: string | null;
  category: string | null;
  unit: string | null;
  country: string | null;
  date: Date | null;
};

export type FactorMatch = {
  factor: FactorCandidate;
  activityBasis: ActivityBasis;
  regionTier: RegionTier;
  needsConversion: boolean;
  notes: string;
};

export type MatchFailureCode =
  | "FACTOR_NOT_FOUND"
  | "FACTOR_UNIT_INCOMPATIBLE"
  | "ROW_NOT_CALCULABLE";

export type MatchResult =
  | { ok: true; match: FactorMatch }
  | { ok: false; code: MatchFailureCode; message: string };

function describeMatch(
  row: MatchableRow,
  rowUnit: string,
  factor: FactorCandidate,
  activityBasis: ActivityBasis,
  regionTier: RegionTier,
  needsConversion: boolean,
): string {
  const notes: string[] = [];

  if (activityBasis === "category") {
    notes.push(
      `No factor published for activity type "${row.activityType}"; matched on category "${factor.category}".`,
    );
  }

  if (regionTier === "country") {
    notes.push(`Country-specific factor for ${factor.region}.`);
  } else if (regionTier === "region") {
    notes.push(`No ${row.country} factor available; used ${factor.region} regional average.`);
  } else if (row.country) {
    notes.push(`No ${row.country} or regional factor available; used global average.`);
  } else {
    notes.push("No country on the row; used global average.");
  }

  if (needsConversion) {
    notes.push(`Quantity converted from ${rowUnit} to the factor basis ${factor.unit}.`);
    const assumption = conversionPath(rowUnit, factor.unit)?.assumption;
    if (assumption) notes.push(assumption);
  }

  const vintage = factorVintage(factor);
  const activityYear = row.date?.getUTCFullYear() ?? null;
  if (vintage !== null && activityYear !== null) {
    notes.push(
      vintage === activityYear
        ? `Factor vintage ${vintage} matches the activity year.`
        : `Factor vintage ${vintage} applied to ${activityYear} activity (closest available).`,
    );
  }

  return notes.join(" ");
}

/**
 * Picks one emission factor for a row. The order is fixed and auditable:
 * activity type (then category) → unit reconcilability → region chain → unit-exactness
 * → factor vintage → factor key, so the same row and library always match the same way.
 */
export function matchFactor(row: MatchableRow, factors: FactorCandidate[]): MatchResult {
  const rowUnit = resolveUnit(row.unit);
  if (!row.unit || !rowUnit) {
    return {
      ok: false,
      code: "ROW_NOT_CALCULABLE",
      message: `Unit "${row.unit ?? ""}" is not in the unit registry, so no factor basis can be compared.`,
    };
  }

  let activityBasis: ActivityBasis = "activityType";
  let candidates = row.activityType
    ? factors.filter((factor) => factor.activityType === row.activityType)
    : [];

  if (candidates.length === 0 && row.category) {
    activityBasis = "category";
    candidates = factors.filter((factor) => factor.category === row.category);
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "FACTOR_NOT_FOUND",
      message: `No emission factor for activity type "${row.activityType ?? "?"}" or category "${row.category ?? "?"}".`,
    };
  }

  const compatible = candidates.filter(
    (factor) => conversionPath(rowUnit.canonical, factor.unit) !== null,
  );
  if (compatible.length === 0) {
    const available = [...new Set(candidates.map((factor) => factor.unit))].join(", ");
    return {
      ok: false,
      code: "FACTOR_UNIT_INCOMPATIBLE",
      message: `Unit "${rowUnit.canonical}" (${rowUnit.dimension}) cannot be converted to any factor basis for this activity (available: ${available}).`,
    };
  }

  const chain = regionChain(row.country);
  const region = chain.find((candidate) =>
    compatible.some((factor) => factor.region === candidate),
  );
  if (!region) {
    return {
      ok: false,
      code: "FACTOR_NOT_FOUND",
      message: `No factor for "${row.activityType ?? row.category}" in region order ${chain.join(" → ")}.`,
    };
  }

  const activityYear = row.date?.getUTCFullYear() ?? null;
  const [best] = compatible
    .filter((factor) => factor.region === region)
    .map((factor) => ({
      factor,
      unitRank: factor.unit === rowUnit.canonical ? 0 : 1,
      vintageRank: vintageRank(factorVintage(factor), activityYear),
    }))
    .sort(
      (a, b) =>
        a.unitRank - b.unitRank ||
        a.vintageRank - b.vintageRank ||
        a.factor.factorKey.localeCompare(b.factor.factorKey),
    );

  if (!best) {
    return {
      ok: false,
      code: "FACTOR_NOT_FOUND",
      message: `No factor for "${row.activityType ?? row.category}" in region order ${chain.join(" → ")}.`,
    };
  }

  const regionTier = tierFor(best.factor.region, row.country);
  const needsConversion = best.factor.unit !== rowUnit.canonical;

  return {
    ok: true,
    match: {
      factor: best.factor,
      activityBasis,
      regionTier,
      needsConversion,
      notes: describeMatch(
        row,
        rowUnit.canonical,
        best.factor,
        activityBasis,
        regionTier,
        needsConversion,
      ),
    },
  };
}

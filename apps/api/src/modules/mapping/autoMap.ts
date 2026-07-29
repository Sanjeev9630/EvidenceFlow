import type {
  CanonicalField,
  ColumnMapping,
  MappingDefaults,
} from "@evidenceflow/shared";
import { canonicalUnit } from "../../utils/units.js";

const aliases: Record<Exclude<CanonicalField, "ignore">, string[]> = {
  date: ["date", "invoice date", "travel date", "activity date", "period", "month"],
  siteCode: ["site", "site code", "plant", "facility", "location", "branch"],
  category: ["category", "emission category", "esg category", "scope category"],
  activityType: ["activity type", "fuel type", "material", "mode", "transport mode", "type"],
  quantity: [
    "quantity",
    "amount",
    "consumption",
    "usage",
    "power used",
    "power used kwh",
    "distance",
    "distance km",
    "quantity litres",
    "quantity kg",
    "weight",
  ],
  unit: ["unit", "uom", "measurement unit", "unit of measure"],
  country: ["country", "country code", "region", "market"],
  supplier: ["supplier", "vendor", "provider", "utility provider"],
  description: ["description", "notes", "note", "purpose", "vehicle", "details", "comment"],
};

function normalize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const tokenScore = overlap / Math.max(aTokens.size, bTokens.size);
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return Math.max(tokenScore * 0.9, editScore * 0.8);
}

function bestField(column: string): { field: CanonicalField; confidence: number } {
  const normalizedColumn = normalize(column);
  let best: { field: CanonicalField; confidence: number } = {
    field: "ignore",
    confidence: 0,
  };

  for (const [field, values] of Object.entries(aliases) as [
    Exclude<CanonicalField, "ignore">,
    string[],
  ][]) {
    for (const alias of values) {
      const score = similarity(normalizedColumn, normalize(alias));
      if (score > best.confidence) {
        best = { field, confidence: score };
      }
    }
  }

  return best.confidence >= 0.55 ? best : { field: "ignore", confidence: best.confidence };
}

/** Tokens that resolve as units but only ever appear as field names. */
const NOT_UNIT_TOKENS = new Set(["unit", "units", "t"]);

/**
 * Spreadsheets usually carry the unit in the header rather than in a column of
 * its own (`quantity_litres`, `power_used_kwh`), so header tokens are resolved
 * against the same unit registry the rest of the pipeline uses.
 */
function unitFromColumns(columns: string[]): string | undefined {
  for (const column of columns) {
    for (const token of normalize(column).split(" ")) {
      if (token.length < 2 || NOT_UNIT_TOKENS.has(token)) continue;
      const unit = canonicalUnit(token);
      if (unit) return unit;
    }
  }
  return undefined;
}

/** Unit to assume when the header names an activity but no unit token at all. */
const UNIT_BY_CATEGORY: Record<string, string> = {
  electricity: "kWh",
  diesel: "litre",
  petrol: "litre",
  business_travel: "km",
};

function inferDefaults(columns: string[]): MappingDefaults {
  const joined = columns.map(normalize).join(" ");
  const defaults: MappingDefaults = {};

  if (joined.includes("electric") || joined.includes("power") || joined.includes("kwh")) {
    defaults.category = "electricity";
    defaults.activityType = "grid_electricity";
  } else if (joined.includes("diesel")) {
    defaults.category = "diesel";
    defaults.activityType = "diesel";
  } else if (joined.includes("petrol") || joined.includes("gasoline")) {
    defaults.category = "petrol";
    defaults.activityType = "petrol";
  } else if (joined.includes("travel") || joined.includes("distance")) {
    defaults.category = "business_travel";
  }

  const unit =
    unitFromColumns(columns) ??
    (defaults.category ? UNIT_BY_CATEGORY[defaults.category] : undefined);
  if (unit) defaults.unit = unit;

  return defaults;
}

export function autoMapColumns(columns: string[]): {
  mapping: ColumnMapping;
  confidence: Record<string, number>;
  defaults: MappingDefaults;
} {
  const candidates = columns
    .map((column) => ({ column, ...bestField(column) }))
    .sort((a, b) => b.confidence - a.confidence);

  const mapping: ColumnMapping = {};
  const confidence: Record<string, number> = {};
  const claimed = new Set<CanonicalField>();

  for (const candidate of candidates) {
    const field =
      candidate.field !== "ignore" && !claimed.has(candidate.field)
        ? candidate.field
        : "ignore";
    mapping[candidate.column] = field;
    confidence[candidate.column] = Number(candidate.confidence.toFixed(2));
    if (field !== "ignore") claimed.add(field);
  }

  return { mapping, confidence, defaults: inferDefaults(columns) };
}

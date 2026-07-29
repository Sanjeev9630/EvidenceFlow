import { canonicalUnit } from "../../utils/units.js";

const ACTIVITY_TYPE_ALIASES: Record<string, string> = {
  electricity: "grid_electricity",
  grid_electricity: "grid_electricity",
  power: "grid_electricity",
  natural_gas: "natural_gas",
  gas: "natural_gas",
  diesel: "diesel",
  petrol: "petrol",
  gasoline: "petrol",
  car: "business_travel_car",
  rail: "business_travel_rail",
  train: "business_travel_rail",
  air_short: "business_travel_air_short",
  air_long: "business_travel_air_long",
  flight_short: "business_travel_air_short",
  flight_long: "business_travel_air_long",
  steel: "steel",
  aluminium: "aluminium",
  aluminum: "aluminium",
};

const CATEGORY_BY_ACTIVITY: Record<string, string> = {
  grid_electricity: "electricity",
  natural_gas: "natural_gas",
  diesel: "diesel",
  petrol: "petrol",
  business_travel_car: "business_travel",
  business_travel_rail: "business_travel",
  business_travel_air_short: "business_travel",
  business_travel_air_long: "business_travel",
  steel: "steel",
  aluminium: "aluminium",
};

/** ISO 3166-1 alpha-2 codes relevant to the demo dataset. */
export const KNOWN_COUNTRIES = new Set([
  "AT", "BE", "BG", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "NL", "NO", "PL", "PT", "RO", "SE",
  "SI", "SK", "TR", "US", "CN", "IN", "JP", "BR", "CA", "MX", "ZA", "AU",
]);

export function normalizeActivityType(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!key) return null;
  return ACTIVITY_TYPE_ALIASES[key] ?? key;
}

export function categoryForActivityType(activityType: string | null | undefined): string | null {
  if (!activityType) return null;
  return CATEGORY_BY_ACTIVITY[activityType] ?? null;
}

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
}

export type NormalizedRow = {
  category: string | null;
  activityType: string | null;
  unit: string | null;
  country: string | null;
  unitRecognized: boolean;
};

/**
 * Canonicalises the interpretive fields of a row. Quantities and dates are left
 * untouched here so that validation can report on the original values.
 */
export function normalizeRow(row: {
  category: string | null;
  activityType: string | null;
  unit: string | null;
  country: string | null;
}): NormalizedRow {
  const activityType = normalizeActivityType(row.activityType);
  const category = row.category ?? categoryForActivityType(activityType);
  const canonical = canonicalUnit(row.unit);

  return {
    category,
    activityType,
    unit: canonical ?? row.unit,
    country: normalizeCountry(row.country),
    unitRecognized: canonical !== null,
  };
}

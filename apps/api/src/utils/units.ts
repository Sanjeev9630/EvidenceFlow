export type Dimension =
  | "energy"
  | "volume"
  | "mass"
  | "distance"
  | "freight"
  | "passenger"
  | "currency"
  | "count";

export type UnitDefinition = {
  canonical: string;
  dimension: Dimension;
  /** Multiplier that converts one unit into the dimension's base unit. */
  toBase: number;
};

const BASE_UNIT: Record<Dimension, string> = {
  energy: "kWh",
  volume: "litre",
  mass: "kg",
  distance: "km",
  freight: "tkm",
  passenger: "passenger_km",
  currency: "EUR",
  count: "unit",
};

const DEFINITIONS: UnitDefinition[] = [
  { canonical: "kWh", dimension: "energy", toBase: 1 },
  { canonical: "MWh", dimension: "energy", toBase: 1000 },
  { canonical: "GJ", dimension: "energy", toBase: 277.778 },
  { canonical: "litre", dimension: "volume", toBase: 1 },
  { canonical: "m3", dimension: "volume", toBase: 1000 },
  { canonical: "kg", dimension: "mass", toBase: 1 },
  { canonical: "tonne", dimension: "mass", toBase: 1000 },
  { canonical: "km", dimension: "distance", toBase: 1 },
  { canonical: "mile", dimension: "distance", toBase: 1.60934 },
  { canonical: "tkm", dimension: "freight", toBase: 1 },
  { canonical: "passenger_km", dimension: "passenger", toBase: 1 },
  { canonical: "EUR", dimension: "currency", toBase: 1 },
  { canonical: "unit", dimension: "count", toBase: 1 },
];

const ALIASES: Record<string, string> = {
  kwh: "kWh",
  kw_h: "kWh",
  kilowatt_hour: "kWh",
  kilowatt_hours: "kWh",
  mwh: "MWh",
  megawatt_hour: "MWh",
  gj: "GJ",
  gigajoule: "GJ",
  l: "litre",
  lt: "litre",
  ltr: "litre",
  liter: "litre",
  liters: "litre",
  litre: "litre",
  litres: "litre",
  m3: "m3",
  m_3: "m3",
  cubic_metre: "m3",
  cubic_meter: "m3",
  sm3: "m3",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilogram: "kg",
  kilograms: "kg",
  t: "tonne",
  ton: "tonne",
  tons: "tonne",
  tonne: "tonne",
  tonnes: "tonne",
  metric_ton: "tonne",
  km: "km",
  kms: "km",
  kilometre: "km",
  kilometres: "km",
  kilometer: "km",
  kilometers: "km",
  mile: "mile",
  miles: "mile",
  tkm: "tkm",
  t_km: "tkm",
  tonne_km: "tkm",
  tonne_kilometre: "tkm",
  ton_km: "tkm",
  pkm: "passenger_km",
  passenger_km: "passenger_km",
  passenger_kilometre: "passenger_km",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  unit: "unit",
  units: "unit",
  pcs: "unit",
};

const BY_CANONICAL = new Map(DEFINITIONS.map((definition) => [definition.canonical, definition]));

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveUnit(raw: string | null | undefined): UnitDefinition | null {
  if (!raw) return null;
  const canonical = ALIASES[normalizeKey(raw)];
  if (!canonical) return null;
  return BY_CANONICAL.get(canonical) ?? null;
}

export function canonicalUnit(raw: string | null | undefined): string | null {
  return resolveUnit(raw)?.canonical ?? null;
}

export function baseUnitFor(dimension: Dimension): string {
  return BASE_UNIT[dimension];
}

/** Converts a quantity between two units of the same dimension. */
export function convertQuantity(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = resolveUnit(fromUnit);
  const to = resolveUnit(toUnit);
  if (!from || !to || from.dimension !== to.dimension) return null;
  return (value * from.toBase) / to.toBase;
}

/**
 * Cross-dimension conversions that are only defensible with a stated assumption.
 * Each one must carry disclosure text, which is recorded on the calculation and
 * repeated in the audit pack — the tool never bridges dimensions silently.
 */
const DIMENSION_BRIDGES: {
  from: Dimension;
  to: Dimension;
  ratio: number;
  assumption: string;
}[] = [
  {
    from: "distance",
    to: "passenger",
    ratio: 1,
    assumption: "Assumes 1 passenger per trip, so distance is read as passenger-distance.",
  },
];

export type ConversionPath = {
  /** Multiply the source quantity by this to reach the target unit. */
  ratio: number;
  assumption: string | null;
};

/**
 * Ratio that takes a quantity from one unit to another, or null when the two
 * units cannot be reconciled at all.
 */
export function conversionPath(fromUnit: string, toUnit: string): ConversionPath | null {
  const from = resolveUnit(fromUnit);
  const to = resolveUnit(toUnit);
  if (!from || !to) return null;

  if (from.dimension === to.dimension) {
    return { ratio: from.toBase / to.toBase, assumption: null };
  }

  for (const bridge of DIMENSION_BRIDGES) {
    if (bridge.from === from.dimension && bridge.to === to.dimension) {
      return { ratio: (from.toBase * bridge.ratio) / to.toBase, assumption: bridge.assumption };
    }
    if (bridge.to === from.dimension && bridge.from === to.dimension) {
      return { ratio: from.toBase / (to.toBase * bridge.ratio), assumption: bridge.assumption };
    }
  }

  return null;
}

/** Dimensions that make physical sense for a given activity category. */
export function dimensionsForCategory(category: string | null | undefined): Dimension[] {
  switch (category) {
    case "electricity":
      return ["energy"];
    case "natural_gas":
      return ["energy", "volume"];
    case "diesel":
    case "petrol":
      return ["volume", "mass"];
    case "road_freight":
    case "sea_freight":
    case "air_freight":
      return ["freight"];
    case "business_travel":
      return ["distance", "passenger"];
    case "steel":
    case "aluminium":
      return ["mass"];
    default:
      return [];
  }
}

export const KNOWN_UNITS = DEFINITIONS.map((definition) => definition.canonical);

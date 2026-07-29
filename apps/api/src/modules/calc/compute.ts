import { formatValue, roundTo } from "../../utils/numbers.js";
import { canonicalUnit, conversionPath } from "../../utils/units.js";
import type { FactorCandidate } from "../factors/match.js";

export type ComputedEmission = {
  inputQuantity: number;
  inputUnit: string;
  factorQuantity: number;
  factorUnit: string;
  resultKgCo2e: number;
  formula: string;
};

/**
 * The only place a CO₂e number is produced. Plain arithmetic on a converted
 * quantity and a stored factor value — never an LLM, never an estimate.
 */
export function computeEmission(
  quantity: number,
  unit: string,
  factor: FactorCandidate,
): ComputedEmission | null {
  const inputUnit = canonicalUnit(unit);
  if (!inputUnit || !Number.isFinite(quantity)) return null;

  const path = conversionPath(inputUnit, factor.unit);
  if (!path) return null;

  // The result is derived from the rounded converted quantity, so the printed
  // formula reproduces the stored number exactly rather than approximating it.
  const factorQuantity = roundTo(quantity * path.ratio);
  const resultKgCo2e = roundTo(factorQuantity * factor.valueKgCo2e);

  const basis =
    inputUnit === factor.unit
      ? `${formatValue(quantity)} ${inputUnit}`
      : `${formatValue(quantity)} ${inputUnit} → ${formatValue(factorQuantity)} ${factor.unit}`;

  const formula =
    `${basis} × ${formatValue(factor.valueKgCo2e)} kgCO₂e/${factor.unit} ` +
    `[${factor.factorKey} ${factor.version}] = ${formatValue(resultKgCo2e)} kgCO₂e`;

  return {
    inputQuantity: quantity,
    inputUnit,
    factorQuantity,
    factorUnit: factor.unit,
    resultKgCo2e,
    formula,
  };
}

/** Decimal places every stored calculation value is rounded to. */
export const CALC_DECIMALS = 6;

/** Trims binary floating-point noise (1240 × 0.366 = 453.84000000000003). */
export function roundTo(value: number, decimals: number = CALC_DECIMALS): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/**
 * Prints a number at the same precision it is stored at, so every step of a
 * formula string can be re-checked on a calculator digit for digit.
 */
export function formatValue(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: CALC_DECIMALS }).format(value);
}

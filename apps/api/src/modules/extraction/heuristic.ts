import type { ExtractedActivity, FieldEvidence } from "@evidenceflow/shared";
import { ActivityCategory } from "@evidenceflow/shared";
import { categoryForActivityType, normalizeActivityType } from "../validation/normalize.js";
import { canonicalUnit } from "../../utils/units.js";

function lineRef(lines: string[], index: number): { location: string; snippet: string } {
  return {
    location: `line ${index + 1}`,
    snippet: lines[index]!.trim().slice(0, 160),
  };
}

function evidence(
  field: string,
  lines: string[],
  index: number,
): FieldEvidence {
  const { location, snippet } = lineRef(lines, index);
  return { field, location, snippet };
}

function findLine(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line));
}

function parseQuantity(raw: string): number | undefined {
  const cleaned = raw.replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Deterministic fallback when the LLM is unavailable or times out.
 * Tuned for the sample invoice / receipt stand-ins under sample-data/pdf/.
 */
export function extractHeuristic(text: string): ExtractedActivity[] {
  const lines = text.split(/\r?\n/);
  const joined = text.toLowerCase();
  const fieldEvidence: FieldEvidence[] = [];

  let date: string | undefined;
  const dateIdx = findLine(lines, /\bdate\b|\bissue date\b/i);
  if (dateIdx >= 0) {
    const match = lines[dateIdx]!.match(/(\d{4}-\d{2}-\d{2})/);
    if (match?.[1]) {
      date = match[1];
      fieldEvidence.push(evidence("date", lines, dateIdx));
    }
  }

  let siteCode: string | undefined;
  const siteIdx = findLine(lines, /\bsite\b|\bberlin plant\b|\(ber\)/i);
  if (siteIdx >= 0) {
    const match = lines[siteIdx]!.match(/\(([A-Z]{2,4})\)/) ?? lines[siteIdx]!.match(/\b([A-Z]{3})\b/);
    if (match?.[1]) {
      siteCode = match[1];
      fieldEvidence.push(evidence("siteCode", lines, siteIdx));
    }
  }

  let country: string | undefined;
  const countryIdx = findLine(lines, /\bcountry\b/i);
  if (countryIdx >= 0) {
    const match = lines[countryIdx]!.match(/\b([A-Z]{2})\b/);
    if (match?.[1]) {
      country = match[1];
      fieldEvidence.push(evidence("country", lines, countryIdx));
    }
  }
  if (!country && /\bde\b|\bgermany\b|\bberlin\b/i.test(joined)) country = "DE";

  let supplier: string | undefined;
  const supplierIdx = findLine(lines, /\bsupplier\b|\bcustomer\b|shell fleet|gasnetz/i);
  if (supplierIdx >= 0) {
    const line = lines[supplierIdx]!;
    const after = line.split(/:\s*/).slice(1).join(":").trim();
    supplier = after || line.trim();
    fieldEvidence.push(evidence("supplier", lines, supplierIdx));
  }

  let activityType: string | undefined;
  let unit: string | undefined;
  let quantity: number | undefined;
  let description: string | undefined;

  const fuelIdx = findLine(lines, /\bfuel\b|\bdiesel\b|\bpetrol\b|\bgasoline\b/i);
  const gasIdx = findLine(lines, /\bnatural gas\b|\bgas consumption\b/i);
  const qtyIdx = findLine(lines, /\bquantity\b|\bconsumption\b/i);

  if (gasIdx >= 0 || joined.includes("natural gas")) {
    activityType = "natural_gas";
    const qtyLineIdx = qtyIdx >= 0 ? qtyIdx : gasIdx;
    if (qtyLineIdx >= 0) {
      const match = lines[qtyLineIdx]!.match(/([\d,]+(?:\.\d+)?)\s*(kWh|MWh|m3|m³)/i);
      if (match) {
        quantity = parseQuantity(match[1]!);
        unit = canonicalUnit(match[2]!.replace("³", "3")) ?? match[2];
        fieldEvidence.push(evidence("quantity", lines, qtyLineIdx));
        fieldEvidence.push(evidence("unit", lines, qtyLineIdx));
      }
    }
    if (gasIdx >= 0) fieldEvidence.push(evidence("activityType", lines, gasIdx));
  } else if (fuelIdx >= 0 || joined.includes("diesel") || joined.includes("petrol")) {
    const fuelLine = fuelIdx >= 0 ? lines[fuelIdx]! : "";
    activityType = /petrol|gasoline/i.test(fuelLine + joined) ? "petrol" : "diesel";
    if (fuelIdx >= 0) fieldEvidence.push(evidence("activityType", lines, fuelIdx));

    const qtyLineIdx = qtyIdx >= 0 ? qtyIdx : fuelIdx;
    if (qtyLineIdx >= 0) {
      const match = lines[qtyLineIdx]!.match(/([\d,]+(?:\.\d+)?)\s*(litres?|liters?|l|kg)/i);
      if (match) {
        quantity = parseQuantity(match[1]!);
        unit = canonicalUnit(match[2]!) ?? match[2];
        fieldEvidence.push(evidence("quantity", lines, qtyLineIdx));
        fieldEvidence.push(evidence("unit", lines, qtyLineIdx));
      }
    }

    const vehicleIdx = findLine(lines, /\bvehicle\b/i);
    if (vehicleIdx >= 0) {
      description = lines[vehicleIdx]!.split(/:\s*/).slice(1).join(":").trim() || lines[vehicleIdx]!.trim();
      fieldEvidence.push(evidence("description", lines, vehicleIdx));
    }
  }

  const normalizedType = normalizeActivityType(activityType);
  const categoryRaw = categoryForActivityType(normalizedType);
  const category = ActivityCategory.safeParse(categoryRaw).success
    ? (categoryRaw as ExtractedActivity["category"])
    : undefined;

  if (!quantity && !activityType) {
    throw new Error(
      "HEURISTIC_FAILED: Could not find quantity or activity type in the document text.",
    );
  }

  return [
    {
      date,
      siteCode,
      category,
      activityType: normalizedType ?? undefined,
      quantity,
      unit: canonicalUnit(unit) ?? unit,
      country,
      supplier,
      description,
      sourceRef: "doc:activity-1",
      extractionConfidence: 0.72,
      fieldEvidence,
    },
  ];
}

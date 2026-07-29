import { dimensionsForCategory, resolveUnit } from "../../utils/units.js";
import { KNOWN_COUNTRIES } from "./normalize.js";

export type IssueSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  activityRowId: string;
  severity: IssueSeverity;
  code: string;
  message: string;
};

export type ValidatableRow = {
  id: string;
  sourceRef: string | null;
  date: Date | null;
  siteId: string | null;
  category: string | null;
  activityType: string | null;
  quantity: number | null;
  unit: string | null;
  country: string | null;
  supplier: string | null;
  rawJson: unknown;
};

/** Maps a canonical field back to the source column it came from. */
export type FieldSources = Partial<Record<string, string>>;

function rawValue(row: ValidatableRow, column: string | undefined): string | null {
  if (!column || typeof row.rawJson !== "object" || row.rawJson === null) return null;
  const value = (row.rawJson as Record<string, unknown>)[column];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function validateRow(row: ValidatableRow, sources: FieldSources): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (severity: IssueSeverity, code: string, message: string) =>
    issues.push({ activityRowId: row.id, severity, code, message });

  const rawQuantity = rawValue(row, sources.quantity);
  if (row.quantity === null) {
    if (rawQuantity) {
      add("error", "NON_NUMERIC_QUANTITY", `Quantity "${rawQuantity}" is not a number.`);
    } else {
      add("error", "MISSING_QUANTITY", "Quantity is required to calculate emissions.");
    }
  } else if (row.quantity < 0) {
    add("error", "NEGATIVE_QUANTITY", `Quantity ${row.quantity} is negative.`);
  } else if (row.quantity === 0) {
    add("warning", "ZERO_QUANTITY", "Quantity is zero; the row will contribute no emissions.");
  }

  const rawDate = rawValue(row, sources.date);
  if (row.date === null) {
    if (rawDate) {
      add("error", "INVALID_DATE", `Date "${rawDate}" could not be parsed.`);
    } else {
      add("error", "MISSING_DATE", "Date is required to assign the row to a reporting period.");
    }
  } else if (row.date.getTime() > Date.now()) {
    add("warning", "FUTURE_DATE", `Date ${row.date.toISOString().slice(0, 10)} is in the future.`);
  }

  const unit = resolveUnit(row.unit);
  if (!row.unit) {
    add("error", "MISSING_UNIT", "Unit is required to select an emission factor.");
  } else if (!unit) {
    add("error", "UNKNOWN_UNIT", `Unit "${row.unit}" is not in the unit registry.`);
  }

  if (!row.category) {
    add("error", "MISSING_CATEGORY", "Category is required to select an emission factor.");
  } else if (unit) {
    const expected = dimensionsForCategory(row.category);
    if (expected.length > 0 && !expected.includes(unit.dimension)) {
      add(
        "error",
        "UNIT_CATEGORY_MISMATCH",
        `Unit "${unit.canonical}" (${unit.dimension}) does not fit category "${row.category}".`,
      );
    }
  }

  if (!row.siteId) {
    const rawSite = rawValue(row, sources.siteCode);
    if (rawSite) {
      add("warning", "UNKNOWN_SITE", `Site "${rawSite}" does not match a known company site.`);
    } else {
      add("warning", "MISSING_SITE", "No site assigned; multi-site reporting will be incomplete.");
    }
  }

  if (!row.country) {
    add("warning", "MISSING_COUNTRY", "No country; only a global average factor can be applied.");
  } else if (!/^[A-Z]{2}$/.test(row.country) || !KNOWN_COUNTRIES.has(row.country)) {
    add("warning", "UNKNOWN_COUNTRY", `Country "${row.country}" is not a recognised ISO code.`);
  }

  if (!row.supplier) {
    add("info", "MISSING_SUPPLIER", "No supplier recorded; evidence trail is weaker.");
  }

  return issues;
}

function findDuplicates(rows: ValidatableRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();

  for (const row of rows) {
    const key = [
      row.date?.toISOString() ?? "",
      row.siteId ?? "",
      row.category ?? "",
      row.quantity ?? "",
      row.unit ?? "",
    ].join("|");
    if (key === "||||") continue;

    const original = seen.get(key);
    if (original) {
      issues.push({
        activityRowId: row.id,
        severity: "warning",
        code: "DUPLICATE_ROW",
        message: `Identical activity already recorded at ${original}; possible double counting.`,
      });
    } else {
      seen.set(key, row.sourceRef ?? row.id);
    }
  }

  return issues;
}

function findOutliers(rows: ValidatableRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const groups = new Map<string, ValidatableRow[]>();

  for (const row of rows) {
    if (row.quantity === null || row.quantity <= 0) continue;
    const key = `${row.category ?? "?"}|${row.unit ?? "?"}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  for (const group of groups.values()) {
    if (group.length < 4) continue;
    const values = group.map((row) => row.quantity as number);
    const centre = median(values);
    const deviation = median(values.map((value) => Math.abs(value - centre)));

    for (const row of group) {
      const quantity = row.quantity as number;
      const isOutlier =
        deviation > 0
          ? Math.abs(quantity - centre) / deviation > 6
          : quantity > centre * 10;
      if (isOutlier) {
        issues.push({
          activityRowId: row.id,
          severity: "warning",
          code: "QUANTITY_OUTLIER",
          message: `Quantity ${quantity.toLocaleString()} is far from the group median of ${centre.toLocaleString()}.`,
        });
      }
    }
  }

  return issues;
}

export function runValidation(
  rows: ValidatableRow[],
  sources: FieldSources,
): ValidationIssue[] {
  return [
    ...rows.flatMap((row) => validateRow(row, sources)),
    ...findDuplicates(rows),
    ...findOutliers(rows),
  ];
}

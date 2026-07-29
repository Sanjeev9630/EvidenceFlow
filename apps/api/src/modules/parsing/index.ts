import path from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import XLSX from "xlsx";

export type RawRow = Record<string, unknown>;

export type ParsedFile = {
  columns: string[];
  rows: RawRow[];
};

function cleanRows(rows: RawRow[]): ParsedFile {
  const nonEmpty = rows.filter((row) =>
    Object.values(row).some((value) => value !== null && value !== undefined && String(value).trim() !== ""),
  );

  const columns = Array.from(
    new Set(nonEmpty.flatMap((row) => Object.keys(row).map((key) => key.trim()))),
  );

  return { columns, rows: nonEmpty };
}

async function parseCsvFile(storagePath: string): Promise<ParsedFile> {
  const content = await readFile(storagePath, "utf8");
  const rows = parseCsv(content, {
    columns: (headers: string[]) => headers.map((header) => header.trim()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as RawRow[];

  return cleanRows(rows);
}

function parseWorkbook(storagePath: string): ParsedFile {
  const workbook = XLSX.readFile(storagePath, {
    cellDates: false,
    raw: false,
  });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("The workbook contains no sheets.");
  }

  const sheet = workbook.Sheets[firstSheet];
  if (!sheet) {
    throw new Error("The first workbook sheet could not be read.");
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: "",
    raw: false,
  });
  return cleanRows(rows);
}

export async function parseSourceFile(
  storagePath: string,
  originalName: string,
): Promise<ParsedFile> {
  const extension = path.extname(originalName).toLowerCase();

  if (extension === ".csv") {
    return parseCsvFile(storagePath);
  }
  if (extension === ".xlsx" || extension === ".xls") {
    return parseWorkbook(storagePath);
  }

  throw new Error("Day 2 preview supports CSV, XLSX, and XLS files.");
}

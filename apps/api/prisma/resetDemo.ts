/**
 * Wipe test imports and rebuild a short, demo-ready history.
 *
 * Keeps Company / Site / EmissionFactor. Rebuilds calculated CSV batches, one
 * failed validation batch, and two document-extraction batches (Day 5).
 *
 * Usage (from repo root): pnpm db:reset-demo
 */
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  applyMapping,
  calculateImport,
  extractImport,
  previewImport,
  validateImport,
} from "../src/services/importPipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config();

const prisma = new PrismaClient();
const uploadDir = path.resolve(root, "apps/api/uploads");
const sampleDir = path.join(root, "sample-data");

type DemoFile = {
  relativePath: string;
  mimeType: string;
  kind: "tabular" | "document";
  calculate: boolean;
};

const DEMO_FILES: DemoFile[] = [
  {
    relativePath: "csv/electricity-berlin-q1.csv",
    mimeType: "text/csv",
    kind: "tabular",
    calculate: true,
  },
  {
    relativePath: "csv/diesel-fleet-feb.csv",
    mimeType: "text/csv",
    kind: "tabular",
    calculate: true,
  },
  {
    relativePath: "csv/materials-q1.csv",
    mimeType: "text/csv",
    kind: "tabular",
    calculate: true,
  },
  {
    relativePath: "csv/travel-expenses.csv",
    mimeType: "text/csv",
    kind: "tabular",
    calculate: true,
  },
  {
    relativePath: "pdf/diesel-receipt-demo.txt",
    mimeType: "text/plain",
    kind: "document",
    calculate: true,
  },
  {
    relativePath: "pdf/gas-invoice-demo.txt",
    mimeType: "text/plain",
    kind: "document",
    calculate: true,
  },
  {
    relativePath: "csv/electricity-bad-rows.csv",
    mimeType: "text/csv",
    kind: "tabular",
    calculate: false,
  },
];

async function clearUploads() {
  await mkdir(uploadDir, { recursive: true });
  const entries = await readdir(uploadDir);
  await Promise.all(
    entries.map((entry) => rm(path.join(uploadDir, entry), { force: true, recursive: true })),
  );
}

async function wipeImports() {
  await prisma.calculation.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.activityRow.deleteMany();
  await prisma.import.deleteMany();
  await prisma.sourceFile.deleteMany();
}

async function storeFile(demo: DemoFile, companyId: string) {
  const absolute = path.join(sampleDir, demo.relativePath);
  const buffer = await readFile(absolute);
  const originalName = path.basename(demo.relativePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storedName = `${Date.now()}-${sha256.slice(0, 12)}-${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = path.join(uploadDir, storedName);
  await writeFile(storagePath, buffer);

  const sourceFile = await prisma.sourceFile.create({
    data: {
      originalName,
      mimeType: demo.mimeType,
      sizeBytes: buffer.length,
      sha256,
      storagePath,
    },
  });

  return prisma.import.create({
    data: {
      companyId,
      sourceFileId: sourceFile.id,
      status: "uploaded",
    },
  });
}

async function ingestFile(demo: DemoFile, companyId: string) {
  const importRecord = await storeFile(demo, companyId);

  if (demo.kind === "document") {
    await extractImport(importRecord.id);
  } else {
    const preview = await previewImport(importRecord.id);
    await applyMapping(importRecord.id, {
      mapping: preview.autoMapping,
      defaults: preview.suggestedDefaults,
    });
  }

  const validated = await validateImport(importRecord.id);
  if (demo.calculate && validated?.status === "validated") {
    await calculateImport(importRecord.id);
  }

  return prisma.import.findUniqueOrThrow({
    where: { id: importRecord.id },
    include: {
      sourceFile: true,
      _count: { select: { calculations: true, issues: true } },
    },
  });
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    throw new Error("No demo company found. Run: pnpm db:seed");
  }

  console.log("Clearing uploads and import history…");
  await wipeImports();
  await clearUploads();

  console.log(`Rebuilding demo batches for ${company.name}…`);
  for (const demo of DEMO_FILES) {
    const result = await ingestFile(demo, company.id);
    console.log(
      `  ${result.sourceFile.originalName.padEnd(28)} status=${result.status.padEnd(10)} ` +
        `rows=${result.rowCount} calcs=${result._count.calculations} ` +
        `errors=${result.errorCount} warnings=${result.warningCount}` +
        (result.qualityScore !== null ? ` quality=${result.qualityScore}` : "") +
        (result.totalKgCo2e !== null ? ` total=${result.totalKgCo2e} kgCO₂e` : ""),
    );
  }

  const remaining = await prisma.import.count();
  const factors = await prisma.emissionFactor.count();
  console.log(`Done. Imports: ${remaining}. Factors: ${factors}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

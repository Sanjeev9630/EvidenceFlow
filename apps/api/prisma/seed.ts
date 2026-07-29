import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config();

const prisma = new PrismaClient();
const factorsPath = path.join(root, "sample-data", "factors", "emission-factors.seed.json");

type FactorSeed = {
  factorKey: string;
  version: string;
  activityType: string;
  category: string;
  region: string;
  unit: string;
  valueKgCo2e: number;
  sourceLabel: string;
  description?: string;
};

async function main() {
  const factors = JSON.parse(readFileSync(factorsPath, "utf-8")) as FactorSeed[];

  const company = await prisma.company.upsert({
    where: { id: "demo-company-nordwerk" },
    update: { name: "Nordwerk Industrial GmbH" },
    create: {
      id: "demo-company-nordwerk",
      name: "Nordwerk Industrial GmbH",
    },
  });

  const sites = [
    { code: "BER", name: "Berlin Plant", country: "DE" },
    { code: "MUC", name: "Munich Warehouse", country: "DE" },
    { code: "MIL", name: "Milan Assembly", country: "IT" },
  ];

  for (const site of sites) {
    await prisma.site.upsert({
      where: {
        companyId_code: { companyId: company.id, code: site.code },
      },
      update: { name: site.name, country: site.country },
      create: {
        companyId: company.id,
        code: site.code,
        name: site.name,
        country: site.country,
      },
    });
  }

  for (const factor of factors) {
    await prisma.emissionFactor.upsert({
      where: { factorKey: factor.factorKey },
      update: {
        version: factor.version,
        activityType: factor.activityType,
        category: factor.category,
        region: factor.region,
        unit: factor.unit,
        valueKgCo2e: factor.valueKgCo2e,
        sourceLabel: factor.sourceLabel,
        description: factor.description ?? null,
      },
      create: factor,
    });
  }

  const factorCount = await prisma.emissionFactor.count();
  const siteCount = await prisma.site.count({ where: { companyId: company.id } });

  console.log(`Seeded company: ${company.name}`);
  console.log(`Sites: ${siteCount}`);
  console.log(`Emission factors: ${factorCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

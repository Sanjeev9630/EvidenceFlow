# EvidenceFlow

**Turn messy ESG evidence into trusted, auditable CO₂e numbers.**

EvidenceFlow ingests utility CSVs, spreadsheets, and invoices, maps them to a canonical activity schema, validates the data, matches versioned emission factors, and produces transparent kgCO₂e / tCO₂e totals with full lineage. Built as a focused prototype for **Metrikflow**-style workflows — trust and auditability, not another dashboard.

---

## The problem

Industrial companies collect ESG evidence in spreadsheets, PDFs, and supplier exports. Turning that into reportable emissions usually means:

- Manual rework and opaque spreadsheets
- Numbers that cannot be traced back to a source file
- AI tools that “calculate” without showing their work

EvidenceFlow treats **evidence → activity data → emissions** as a pipeline with a clear audit trail at every step.

---

## What you get

| Capability | Outcome |
|---|---|
| **File integrity** | Every upload stored with SHA-256 — calculations tie back to an exact file |
| **Mapping & validation** | CSV/XLSX columns mapped to activity fields; rules catch bad units, dates, duplicates |
| **Document extraction** | PDF/TXT invoices → draft activity rows (LLM proposes fields only) |
| **Deterministic CO₂e** | `quantity × emission factor` in TypeScript — reproducible, formula shown per row |
| **Confidence scoring** | Emission-weighted quality score; flags where auditors should look first |
| **Audit export** | JSON pack or printable HTML report with factors, formulas, and assumptions |

**Hard rule:** the LLM never produces an emission number. It may extract candidate fields from documents; all CO₂e math runs in deterministic code.

---

## How it works

```text
Upload evidence (CSV / XLSX / PDF / TXT)
        ↓
Map columns  OR  Extract fields from document
        ↓
Validate activity rows (errors block calculation)
        ↓
Match emission factor (country → region → global)
        ↓
Calculate kgCO₂e with frozen formula + factor snapshot
        ↓
Export audit pack
```

Demo company: **Nordwerk Industrial GmbH** (3 sites, ~40 illustrative emission factors). Sample files live in [`sample-data/`](./sample-data/).

---

## Try it locally

**Requirements:** Node 20+, pnpm, Neon Postgres (or any Postgres)

```bash
cp .env.example .env          # set DATABASE_URL
pnpm install
pnpm --filter @evidenceflow/shared build
pnpm db:setup                 # schema + seed
pnpm db:reset-demo            # optional: 7 demo imports ready to open
pnpm dev
```

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3001 |
| Health | http://localhost:3001/health |

**Quick demo path:** Home → **Open demo batch** → review totals and quality → **View audit report**.

Inspect visitor hits in the `visited` table via `pnpm db:studio` (page views are logged server-side; no viewer UI).

---

## Deploy

| Component | Suggested host | Key env |
|---|---|---|
| **API** | Railway or Render | `DATABASE_URL`, `CORS_ORIGIN`, `UPLOAD_DIR`, optional `LLM_API_KEY` |
| **Web** | Vercel | `VITE_API_URL` → public API URL |
| **Database** | Neon | Pooled connection string |
| **Keep-alive** | GitHub Actions | Secret `KEEP_ALIVE_URL` = `https://your-api/health` |

After first deploy, run `pnpm db:seed` and `pnpm db:reset-demo` against production Neon once so the demo batches exist.

Set `CORS_ORIGIN` to your Vercel URL after the frontend is live.

---

## Important limitations

- Emission factors are **illustrative mocks** (`MOCK-*` labels) — not licensed ecoinvent, DEFRA, or commercial factor data.
- Binary PDFs without extractable text require paste fallback; OCR is out of scope.
- No multi-tenant auth, ERP connectors, or full Scope 1–3 product — this is a **trust & lineage prototype**.

---

## Stack

React · Vite · Fastify · Prisma · Neon Postgres · Zod · pnpm monorepo

Technical deep-dive: [`docs/Architecture.md`](./docs/Architecture.md)

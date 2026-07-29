# EvidenceFlow architecture

## Purpose

EvidenceFlow turns unstructured or semi-structured ESG evidence (utility CSVs, fuel logs, invoices) into **audit-ready activity records** with:

- Source file identity (SHA-256)
- Validation issues
- Versioned emission-factor lineage
- Deterministic CO₂e formulas
- Explainable confidence scores

LLM is used only to extract candidate fields from PDFs. **The model never produces the final emission number.**

## Monorepo

```text
evidenceflow/
├── apps/web          React UI
├── apps/api          Fastify + Prisma
├── packages/shared   Zod contracts
├── sample-data       Demo files + factor seed
└── docs
```

## Runtime diagram

```text
Browser → REST/multipart → Fastify
                              ├── Prisma → Neon Postgres
                              ├── Disk uploads/
                              └── (Day 5) LLM PDF extract → Zod → same pipeline
```

## Import status machine

`uploaded → previewed → mapped → draft → validated → calculated`

Validation sets `failed` when any error-severity issue exists, otherwise `validated`.
Editing an activity row deletes that row's issues and drops the import back to `draft`,
so a displayed validation result always reflects the current data.

Calculations are held to the same rule: editing a row or re-running validation deletes the
import's calculations and clears `Import.totalKgCo2e`. The invariant is that calculations
exist only while the status is `calculated`, which means a number on screen can never
belong to an older version of the data.

## Unit handling

`utils/units.ts` is the single unit registry: canonical names, aliases, dimensions
(energy, volume, mass, distance, freight, passenger, currency, count) and conversion
factors to a base unit per dimension. Categories declare which dimensions are physically
valid, which is what powers the `UNIT_CATEGORY_MISMATCH` rule and drives factor matching.

`conversionPath()` is the one place two units are reconciled. Within a dimension it is a
pure ratio. Across dimensions it only succeeds for an explicitly listed bridge, and every
bridge must carry disclosure text that is stored on the calculation and repeated in the
audit pack. Silent cross-dimension guessing is the failure mode this design rules out.

## Factor matching and calculation

`modules/factors/match.ts` selects exactly one factor per row in a fixed order —
activity type (then category), unit reconcilability, region chain, unit-exactness,
factor vintage, then factor key. The order is what makes the result reproducible and
explainable; each decision is turned into a sentence stored as `Calculation.matchNotes`.

Region fallback is country → regional aggregate (EU/EEA today) → `GLOBAL`. A less
specific match is not an error, but it is recorded as `regionTier` so Day 5 can price it
into the confidence score.

`modules/calc/compute.ts` is the only code that produces a CO₂e number: a converted
quantity multiplied by a stored factor value, rounded to 6 decimals. It also builds the
human-readable formula, printing every value at the stored precision so the string can be
re-checked by hand.

`Calculation` rows keep a snapshot of the factor used (`factorKey`, `factorVersion`,
`factorValueKgCo2e`, `factorRegion`, `factorSourceLabel`) rather than relying only on the
foreign key, so re-seeding or revising the factor library cannot silently restate a past
import.

## Document extraction and confidence

`modules/extraction` reads document text, calls a timeboxed LLM (`LLM_TIMEOUT_MS`, default
25s) with a Zod-validated JSON schema, and falls back to a deterministic heuristic when the
provider is missing or fails. Binary PDFs without extractable text require an explicit
paste — OCR is out of scope.

`modules/confidence/score.ts` turns known signals (data type, unit clarity, region tier,
activity basis, extraction source, validation warnings) into a weighted 0–1 score. The
batch `qualityScore` is emission-weighted so a large uncertain row hurts more than a small
one. The UI lineage panel walks file → field evidence → factor → formula → result.

## Pipeline modules (by day)

| Day | Module | Responsibility |
|---|---|---|
| 1 | `routes/files` | Persist file + import batch |
| 2 | `parsing` + `mapping` | CSV/XLSX preview + column map |
| 3 | `validation` + `utils/units` | Canonical units, normalization, rule engine, issues |
| 4 | `factors/match` + `calc/compute` | Deterministic factor match + `qty × factor` formula |
| 5 | `extraction` + `confidence` | PDF/TXT LLM extract + lineage UI + quality score |
| 6 | `audit` | Export pack + history polish |

## Audit export

`modules/audit/buildAuditPack.ts` assembles a single JSON document from existing DB state —
no recomputation. `renderHtml.ts` turns the same structure into a printable report.

`ActivityRow.needsBetterData` / `needsBetterDataNote` are auditor flags included in the pack.
Updating only these fields does not invalidate calculations.

## Database (Prisma)

Core entities: `Company`, `Site`, `SourceFile`, `Import`, `ActivityRow`, `EmissionFactor`, `Calculation`, `Issue`.

Lineage-critical fields: `SourceFile.sha256`, `ActivityRow.sourceRef`, `EmissionFactor.factorKey` + `version`, `Calculation.formula` and its frozen factor snapshot.

## Environment

Root `.env` (loaded by API):

- `DATABASE_URL` — Neon Postgres
- `PORT`, `CORS_ORIGIN`, `UPLOAD_DIR`
- `LLM_API_KEY` — optional until Day 5

## Non-goals

- Full Scope 1–3 product
- Real ecoinvent licensing
- ERP connectors
- Multi-tenant auth product
- CSRD report generator

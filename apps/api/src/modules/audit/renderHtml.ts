import type { AuditPack } from "@evidenceflow/shared";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function renderAuditPackHtml(pack: AuditPack): string {
  const title = `EvidenceFlow Audit Pack — ${pack.sourceFile.originalName}`;
  const rows = pack.lineage
    .map((row) => {
      const conf =
        row.confidence !== null ? `${(row.confidence * 100).toFixed(0)}%` : "—";
      const betterData = row.needsBetterData
        ? `<span class="flag">Needs better data</span>${row.needsBetterDataNote ? ` — ${escapeHtml(row.needsBetterDataNote)}` : ""}`
        : "";
      const evidence =
        row.fieldEvidence.length > 0
          ? `<ul class="evidence">${row.fieldEvidence
              .map(
                (e) =>
                  `<li><code>${escapeHtml(e.field)}</code> @ ${escapeHtml(e.location)}: “${escapeHtml(e.snippet)}”</li>`,
              )
              .join("")}</ul>`
          : "";
      const rules =
        row.confidenceRules && row.confidenceRules.length > 0
          ? `<ul class="rules">${row.confidenceRules
              .map(
                (r) =>
                  `<li><strong>${escapeHtml(r.label)}</strong> (${(r.score * 100).toFixed(0)}%, w=${r.weight}) — ${escapeHtml(r.reason)}</li>`,
              )
              .join("")}</ul>`
          : "";
      const rowIssues =
        row.issues.length > 0
          ? `<ul class="issues">${row.issues
              .map((i) => `<li class="${i.severity}">${escapeHtml(i.code)}: ${escapeHtml(i.message)}</li>`)
              .join("")}</ul>`
          : "";

      return `
        <article class="row">
          <header>
            <h3>${escapeHtml(row.sourceRef ?? row.activityRowId)}</h3>
            <span class="result">${formatNum(row.resultKgCo2e)} kgCO₂e</span>
            <span class="conf">confidence ${conf}</span>
          </header>
          ${betterData}
          <p><strong>Activity:</strong> ${escapeHtml(row.activityType ?? "?")} · ${formatNum(row.quantity)} ${escapeHtml(row.unit ?? "")} · ${escapeHtml(row.country ?? "?")}</p>
          ${evidence}
          <p><strong>Factor:</strong> ${escapeHtml(row.factorKey ?? "—")} ${escapeHtml(row.factorVersion ?? "")} · ${escapeHtml(row.factorRegion ?? "")} · ${formatNum(row.factorValueKgCo2e, 6)} kgCO₂e/${escapeHtml(row.unit ?? "")}</p>
          <p class="formula">${escapeHtml(row.formula ?? "—")}</p>
          <p class="notes">${escapeHtml(row.matchNotes ?? "")}</p>
          ${rules}
          ${rowIssues}
        </article>`;
    })
    .join("");

  const factors = pack.factors
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.factorKey)}</td><td>${escapeHtml(f.version)}</td><td>${escapeHtml(f.region)}</td><td>${formatNum(f.valueKgCo2e, 6)}</td><td>${escapeHtml(f.unit)}</td><td>${escapeHtml(f.sourceLabel)}</td></tr>`,
    )
    .join("");

  const assumptions = pack.assumptions
    .map((a) => `<li>${escapeHtml(a.text)}</li>`)
    .join("");

  const pareto = pack.quality.pareto
    .map(
      (p) =>
        `<li>${escapeHtml(p.sourceRef ?? p.activityRowId)} — ${formatNum(p.resultKgCo2e)} kg (${(p.shareOfTotal * 100).toFixed(1)}% of batch) · conf ${(p.confidence * 100).toFixed(0)}%</li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Georgia, serif; color: #121a17; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
    .meta { font-family: ui-monospace, monospace; font-size: 0.8rem; color: #444; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.4rem 0.5rem; text-align: left; }
    th { background: #f4f1ea; }
    .row { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
    .row header { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: baseline; }
    .row h3 { margin: 0; font-size: 1rem; }
    .result { font-weight: bold; }
    .conf { font-size: 0.85rem; color: #2f7a4e; }
    .formula { font-family: ui-monospace, monospace; font-size: 0.8rem; background: #f4f1ea; padding: 0.5rem; border-radius: 4px; }
    .notes { font-size: 0.85rem; color: #555; }
    .flag { background: #fef3c7; color: #92400e; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.8rem; font-weight: bold; }
    ul.evidence, ul.rules, ul.issues { font-size: 0.8rem; margin: 0.5rem 0; padding-left: 1.25rem; }
    .error { color: #b91c1c; }
    .warning { color: #b45309; }
    @media print { body { margin: 0; } .row { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>EvidenceFlow Audit Pack</h1>
  <p class="meta">Generated ${escapeHtml(pack.generatedAt)} · schema ${pack.schemaVersion}</p>

  <h2>Batch summary</h2>
  <p><strong>Company:</strong> ${escapeHtml(pack.company.name)}</p>
  <p><strong>File:</strong> ${escapeHtml(pack.sourceFile.originalName)}</p>
  <p><strong>SHA-256:</strong> <code>${escapeHtml(pack.sourceFile.sha256)}</code></p>
  <p><strong>Status:</strong> ${escapeHtml(pack.import.status)} · ${pack.import.rowCount} rows · ${formatNum(pack.import.totalKgCo2e)} kgCO₂e total</p>
  <p><strong>Quality score:</strong> ${pack.import.qualityScore !== null ? pack.import.qualityScore.toFixed(1) : "—"} / 100</p>

  <h2>Assumptions</h2>
  <ul>${assumptions}</ul>

  <h2>Emission factors used</h2>
  <table>
    <thead><tr><th>Key</th><th>Ver</th><th>Region</th><th>Value</th><th>Unit</th><th>Source</th></tr></thead>
    <tbody>${factors}</tbody>
  </table>

  <h2>Quality triage (high emission × low confidence)</h2>
  <ul>${pareto || "<li>No calculated rows.</li>"}</ul>

  <h2>Per-row lineage</h2>
  ${rows || "<p>No activity rows.</p>"}

  <footer class="meta" style="margin-top:3rem;padding-top:1rem;border-top:1px solid #ddd;">
    EvidenceFlow — illustrative factors (MOCK-*). LLM never computed emissions.
  </footer>
</body>
</html>`;
}

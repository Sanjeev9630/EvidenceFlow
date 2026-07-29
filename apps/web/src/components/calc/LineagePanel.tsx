import type { CalculationRecord, ConfidenceBreakdown, FieldEvidence } from "@evidenceflow/shared";
import { activityHeadline, friendlySourceRef } from "../../utils/labels";

type ActivityRowLite = {
  id: string;
  sourceRef: string | null;
  category: string | null;
  activityType: string | null;
  quantity: number | null;
  unit: string | null;
  country: string | null;
  extractionConfidence: number | null;
  rawJson: unknown;
  site?: { code: string } | null;
};

type SourceFileLite = {
  originalName: string;
  sha256: string;
};

function fieldEvidenceFrom(rawJson: unknown): FieldEvidence[] {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return [];
  const evidence = (rawJson as { fieldEvidence?: FieldEvidence[] }).fieldEvidence;
  return Array.isArray(evidence) ? evidence : [];
}

function extractionMethod(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return null;
  const source = (rawJson as { extractionSource?: string }).extractionSource;
  return typeof source === "string" ? source : null;
}

export function LineagePanel({
  sourceFile,
  rows,
  calculations,
}: {
  sourceFile: SourceFileLite;
  rows: ActivityRowLite[];
  calculations: CalculationRecord[];
}) {
  if (calculations.length === 0) return null;

  const calcByRow = new Map(calculations.map((calc) => [calc.activityRowId, calc]));
  const calculatedRows = rows.filter((row) => calcByRow.has(row.id));

  return (
    <section className="overflow-hidden rounded-xl border border-ink-900/10 bg-white/75">
      <details>
        <summary className="cursor-pointer list-none border-b border-ink-900/10 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-950">Evidence lineage</h2>
              <p className="mt-1 text-sm text-ink-700/70">
                Per-row factor trail — expand when you need the audit detail.
              </p>
            </div>
            <span className="text-sm font-medium text-moss-700">Show details →</span>
          </div>
        </summary>

        <div className="border-b border-ink-900/5 px-5 py-3 text-sm text-ink-800">
          <span className="font-semibold text-ink-950">Source file:</span>{" "}
          {sourceFile.originalName}
          <details className="mt-1 text-xs text-ink-700/65">
            <summary className="cursor-pointer">File integrity fingerprint</summary>
            <p className="mt-1 font-mono break-all">SHA-256 {sourceFile.sha256}</p>
            <p className="mt-1">
              Proves this calculation is tied to this exact file contents — included in the audit
              export.
            </p>
          </details>
        </div>

        <ul className="divide-y divide-ink-900/5">
          {calculatedRows.map((row) => {
            const calc = calcByRow.get(row.id)!;
            const evidence = fieldEvidenceFrom(row.rawJson);
            const method = extractionMethod(row.rawJson);
            const breakdown = calc.confidenceJson as ConfidenceBreakdown | null | undefined;
            const sheetHint = friendlySourceRef(row.sourceRef);

            return (
              <li key={row.id} className="px-5 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 marker:content-none [&::-webkit-details-marker]:hidden">
                    <div className="text-sm text-ink-950">
                      {activityHeadline(row)}
                      {method && (
                        <span className="ml-2 font-mono text-xs text-moss-600">via {method}</span>
                      )}
                    </div>
                    <div className="font-mono text-sm font-semibold text-ink-950">
                      {calc.resultKgCo2e.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                      kgCO₂e
                      {calc.confidence !== null && (
                        <span className="ml-2 text-xs font-normal text-ink-700/60">
                          {(calc.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </summary>

                  <ol className="mt-3 space-y-2 text-sm">
                    {sheetHint && <Step label="In source file" value={sheetHint} />}
                    <Step
                      label="Emission factor"
                      value={`${calc.factorKey} ${calc.factorVersion} · ${calc.factorRegion} · ${calc.factorValueKgCo2e} kgCO₂e/${calc.factorUnit}`}
                    />
                    <Step label="Formula" value={calc.formula} mono />
                    {evidence.slice(0, 4).map((item) => (
                      <li key={`${item.field}-${item.location}`} className="text-xs text-ink-700/65">
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink-700/55">
                          Evidence ·{" "}
                        </span>
                        <span className="font-mono text-ink-950">{item.field}</span> @{" "}
                        {item.location}
                        {item.snippet && (
                          <span className="mt-0.5 block font-mono text-[11px] text-ink-700/50">
                            “{item.snippet}”
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>

                  {breakdown && (
                    <details className="mt-3 rounded border border-ink-900/8 bg-ink-900/[0.02] px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-ink-800">
                        Confidence breakdown ({(breakdown.score * 100).toFixed(0)}%)
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {breakdown.rules.map((rule) => (
                          <li key={rule.id} className="text-xs text-ink-800/85">
                            <div className="flex justify-between gap-3">
                              <span>{rule.label}</span>
                              <span className="font-mono font-semibold">
                                {(rule.score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-700/60">{rule.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

function Step({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <li className="grid gap-1 sm:grid-cols-[9rem_1fr]">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-700/55">{label}</span>
      <span className={`text-ink-950 ${mono ? "font-mono text-xs leading-relaxed" : "text-sm"}`}>
        {value}
      </span>
    </li>
  );
}

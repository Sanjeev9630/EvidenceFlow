import type { ParetoRow, QualitySummary } from "@evidenceflow/shared";

export function QualityPareto({
  quality,
  labelsByRowId,
}: {
  quality: QualitySummary;
  /** Prefer human labels over raw sourceRef (row:7). */
  labelsByRowId?: Record<string, string>;
}) {
  if (quality.calculatedRowCount === 0 || quality.qualityScore === null) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-ink-900/10 bg-white/75">
      <div className="border-b border-ink-900/10 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink-950">Batch quality</h2>
            <p className="mt-1 text-sm text-ink-700/70">
              How trustworthy this batch is — rows with the most impact listed first.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-semibold text-ink-950">
              {quality.qualityScore.toFixed(1)}
            </div>
            <div className="text-xs text-ink-700/60">/ 100</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-ink-900/5 px-5 py-3 sm:grid-cols-2">
        <Metric label="Rows calculated" value={String(quality.calculatedRowCount)} />
        <Metric
          label={`Below ${(quality.lowConfidenceThreshold * 100).toFixed(0)}% confidence`}
          value={String(quality.lowConfidenceRowCount)}
          warn={quality.lowConfidenceRowCount > 0}
        />
      </div>

      {quality.pareto.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-700/70">No calculated rows.</p>
      ) : (
        <ul className="divide-y divide-ink-900/5">
          {quality.pareto.map((row) => (
            <ParetoItem
              key={row.activityRowId}
              row={row}
              label={labelsByRowId?.[row.activityRowId]}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-700/55">{label}</div>
      <div
        className={`mt-0.5 font-mono text-lg font-semibold ${warn ? "text-amber-700" : "text-ink-950"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ParetoItem({ row, label }: { row: ParetoRow; label?: string }) {
  const low = row.confidence < 0.7;
  const title =
    label ??
    (row.category ? row.category.replaceAll("_", " ") : null) ??
    "Activity";

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm capitalize text-ink-950">{title}</div>
        <div className="font-mono text-xs">
          <span className="font-semibold text-ink-950">
            {row.resultKgCo2e.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg
          </span>
          <span className="mx-1.5 text-ink-700/40">·</span>
          <span className={low ? "font-semibold text-amber-700" : "text-moss-600"}>
            {(row.confidence * 100).toFixed(0)}% conf
          </span>
          <span className="mx-1.5 text-ink-700/40">·</span>
          <span className="text-ink-700/60">{(row.shareOfTotal * 100).toFixed(1)}% of batch</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-900/8">
        <div
          className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-moss-500"}`}
          style={{ width: `${Math.max(row.shareOfTotal * 100, 2)}%` }}
        />
      </div>
    </li>
  );
}

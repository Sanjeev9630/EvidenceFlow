import { useMemo } from "react";
import type { CalculationRecord, RegionTier } from "@evidenceflow/shared";

const TIER_LABELS: Record<RegionTier, string> = {
  country: "country-specific",
  region: "regional average",
  global: "global average",
};

const CATEGORY_LABELS: Record<string, string> = {
  electricity: "Electricity",
  natural_gas: "Natural gas",
  diesel: "Diesel",
  petrol: "Petrol",
  road_freight: "Road freight",
  sea_freight: "Sea freight",
  air_freight: "Air freight",
  business_travel: "Business travel",
  steel: "Steel",
  aluminium: "Aluminium",
  other: "Other",
};

function formatKg(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatTonnes(value: number): string {
  return (value / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function EmissionsSummary({
  totalKgCo2e,
  rowCount,
  calculations,
  categoryByRow,
  unmatchedCount,
}: {
  totalKgCo2e: number;
  rowCount: number;
  calculations: CalculationRecord[];
  categoryByRow: Record<string, string | null>;
  unmatchedCount: number;
}) {
  const byCategory = useMemo(() => {
    const totals = new Map<string, { rowCount: number; kgCo2e: number }>();
    for (const calc of calculations) {
      const key = categoryByRow[calc.activityRowId] ?? "other";
      const bucket = totals.get(key) ?? { rowCount: 0, kgCo2e: 0 };
      bucket.rowCount += 1;
      bucket.kgCo2e += calc.resultKgCo2e;
      totals.set(key, bucket);
    }
    return [...totals.entries()]
      .map(([category, bucket]) => ({ category, ...bucket }))
      .sort((a, b) => b.kgCo2e - a.kgCo2e);
  }, [calculations, categoryByRow]);

  const tierCounts = useMemo(() => {
    const counts: Record<RegionTier, number> = { country: 0, region: 0, global: 0 };
    for (const calc of calculations) counts[calc.regionTier] += 1;
    return counts;
  }, [calculations]);

  const convertedCount = calculations.filter((calc) => calc.inputUnit !== calc.factorUnit).length;
  const proxyCount = calculations.filter((calc) => calc.activityBasis === "category").length;

  return (
    <section className="overflow-hidden rounded-xl border border-moss-500/25 bg-white/80">
      <div className="border-b border-ink-900/10 bg-moss-500/5 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink-950">Calculated emissions</h2>
            <p className="mt-1 text-sm text-ink-700/70">
              Total from versioned emission factors — broken down by category.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-semibold text-ink-950">
              {formatTonnes(totalKgCo2e)}{" "}
              <span className="text-lg font-normal text-ink-700/70">tCO₂e</span>
            </div>
            <div className="font-mono text-xs text-ink-700/60">{formatKg(totalKgCo2e)} kgCO₂e</div>
          </div>
        </div>
      </div>

      {unmatchedCount > 0 && (
        <div className="border-b border-amber-500/25 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          <span className="font-semibold">Partial batch.</span> {unmatchedCount} of {rowCount} rows
          could not be matched to a factor — total covers {calculations.length} rows only.
        </div>
      )}

      <div className="px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-700/60">
          By category
        </h3>
        <ul className="mt-2 space-y-2">
          {byCategory.map((entry) => {
            const share = totalKgCo2e > 0 ? (entry.kgCo2e / totalKgCo2e) * 100 : 0;
            return (
              <li key={entry.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-950">
                    {CATEGORY_LABELS[entry.category] ?? entry.category}
                    <span className="ml-1.5 font-mono text-xs text-ink-700/50">
                      {entry.rowCount} {entry.rowCount === 1 ? "row" : "rows"}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-ink-950">
                    {formatKg(entry.kgCo2e)} kg
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-900/8">
                  <div
                    className="h-full rounded-full bg-moss-500"
                    style={{ width: `${Math.max(share, 1)}%` }}
                  />
                </div>
              </li>
            );
          })}
          {byCategory.length === 0 && (
            <li className="text-sm text-ink-700/70">No rows were calculated.</li>
          )}
        </ul>

        <details className="mt-4 rounded-md border border-ink-900/8 bg-ink-900/[0.02]">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-800">
            Factor match details
          </summary>
          <div className="border-t border-ink-900/5 px-3 py-3">
            <dl className="space-y-1.5 text-sm">
              <Line
                label="Rows calculated"
                value={`${calculations.length} of ${rowCount}`}
                tone={calculations.length === rowCount ? "good" : "warn"}
              />
              {(["country", "region", "global"] as const).map((tier) => (
                <Line
                  key={tier}
                  label={`Match — ${TIER_LABELS[tier]}`}
                  value={String(tierCounts[tier])}
                  tone={tier === "global" && tierCounts[tier] > 0 ? "warn" : "neutral"}
                />
              ))}
              <Line label="Unit conversions" value={String(convertedCount)} tone="neutral" />
              <Line
                label="Category fallback matches"
                value={String(proxyCount)}
                tone={proxyCount > 0 ? "warn" : "neutral"}
              />
            </dl>
          </div>
        </details>
      </div>
    </section>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn";
}) {
  const tones = {
    neutral: "text-ink-950",
    good: "text-moss-600",
    warn: "text-amber-700",
  };
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-900/5 pb-1.5 last:border-0">
      <dt className="text-ink-800/80">{label}</dt>
      <dd className={`font-mono text-xs font-semibold ${tones[tone]}`}>{value}</dd>
    </div>
  );
}

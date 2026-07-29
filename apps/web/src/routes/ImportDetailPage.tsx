import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type {
  ActivityCategory,
  CalculationRecord,
  IssueRecord,
  QualitySummary,
  UpdateActivityRow,
} from "@evidenceflow/shared";
import { apiGet, apiSend } from "../api/client";
import { ExportAuditButton } from "../components/audit/ExportAuditButton";
import { EmissionsSummary } from "../components/calc/EmissionsSummary";
import { LineagePanel } from "../components/calc/LineagePanel";
import { QualityPareto } from "../components/calc/QualityPareto";
import { StatusBadge } from "../components/common/StatusBadge";
import { IssuesPanel } from "../components/review/IssuesPanel";
import { activityHeadline, friendlySourceRef } from "../utils/labels";

type ActivityRow = {
  id: string;
  date: string | null;
  category: ActivityCategory | null;
  activityType: string | null;
  quantity: number | null;
  unit: string | null;
  country: string | null;
  supplier: string | null;
  description: string | null;
  sourceRef: string | null;
  extractionConfidence: number | null;
  needsBetterData: boolean;
  needsBetterDataNote: string | null;
  rawJson: unknown;
  site: { code: string; name: string } | null;
};

type ImportDetail = {
  id: string;
  status: string;
  rowCount: number;
  warningCount: number;
  errorCount: number;
  qualityScore: number | null;
  totalKgCo2e: number | null;
  isDocument?: boolean;
  createdAt: string;
  updatedAt: string;
  sourceFile: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    createdAt: string;
  };
  activityRows: ActivityRow[];
  issues: IssueRecord[];
  calculations: CalculationRecord[];
  quality?: QualitySummary;
};

/** Issue codes raised by the calculation pass rather than by validation. */
const CALC_ISSUE_CODES = new Set([
  "FACTOR_NOT_FOUND",
  "FACTOR_UNIT_INCOMPATIBLE",
  "ROW_NOT_CALCULABLE",
]);

export function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["import", id],
    queryFn: () => apiGet<ImportDetail>(`/imports/${id}`),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    setPipelineError(null);
    queryClient.invalidateQueries({ queryKey: ["import", id] });
    queryClient.invalidateQueries({ queryKey: ["imports"] });
  };

  const validate = useMutation({
    mutationFn: () => apiSend(`/imports/${id}/validate`, "POST"),
    onSuccess: invalidate,
    onError: (error: Error) => setPipelineError(error.message),
  });

  const calculate = useMutation({
    mutationFn: () => apiSend(`/imports/${id}/calculate`, "POST"),
    onSuccess: invalidate,
    onError: (error: Error) => setPipelineError(error.message),
  });

  const item = detail.data;

  const issuesByRow = useMemo(() => {
    const map = new Map<string, IssueRecord[]>();
    for (const issue of item?.issues ?? []) {
      if (!issue.activityRowId) continue;
      const bucket = map.get(issue.activityRowId);
      if (bucket) bucket.push(issue);
      else map.set(issue.activityRowId, [issue]);
    }
    return map;
  }, [item?.issues]);

  const rowLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const row of item?.activityRows ?? []) {
      labels[row.id] = activityHeadline(row);
    }
    return labels;
  }, [item?.activityRows]);

  const calcByRow = useMemo(() => {
    const map = new Map<string, CalculationRecord>();
    for (const calc of item?.calculations ?? []) map.set(calc.activityRowId, calc);
    return map;
  }, [item?.calculations]);

  const categoryByRow = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const row of item?.activityRows ?? []) map[row.id] = row.category;
    return map;
  }, [item?.activityRows]);

  if (detail.isLoading) {
    return <p className="text-sm text-ink-700">Loading import…</p>;
  }

  if (detail.isError || !item) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">Import not found or API error.</p>
        <Link to="/imports" className="text-sm font-semibold text-moss-600">
          Back to history
        </Link>
      </div>
    );
  }

  const infoCount = item.issues.filter((issue) => issue.severity === "info").length;
  const hasRows = item.activityRows.length > 0;
  const isStale = item.status === "draft" || item.status === "mapped";
  const isCalculated = item.status === "calculated";
  const canCalculate = item.status === "validated" || isCalculated;
  const unmatchedCount = item.issues.filter((issue) => CALC_ISSUE_CODES.has(issue.code)).length;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/imports" className="text-sm font-medium text-moss-600 hover:underline">
          ← History
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold text-ink-950">
            {item.sourceFile.originalName}
          </h1>
          <StatusBadge status={item.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {item.isDocument ? (
            <Link
              to={`/imports/${item.id}/extract`}
              className="rounded-md border border-ink-900/15 bg-white/60 px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-white"
            >
              {hasRows ? "Re-extract document" : "Extract fields"}
            </Link>
          ) : (
            <Link
              to={`/imports/${item.id}/map`}
              className="rounded-md border border-ink-900/15 bg-white/60 px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-white"
            >
              {hasRows ? "Review mapping" : "Map columns"}
            </Link>
          )}
          {hasRows && (
            <button
              type="button"
              onClick={() => validate.mutate()}
              disabled={validate.isPending}
              className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-sand-50 disabled:opacity-50"
            >
              {validate.isPending ? "Validating…" : isStale ? "Run validation" : "Re-run validation"}
            </button>
          )}
          {hasRows && canCalculate && (
            <button
              type="button"
              onClick={() => calculate.mutate()}
              disabled={calculate.isPending}
              className="rounded-md bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-500 disabled:opacity-50"
            >
              {calculate.isPending
                ? "Calculating…"
                : isCalculated
                  ? "Re-calculate emissions"
                  : "Calculate emissions"}
            </button>
          )}
          {isCalculated && (
            <ExportAuditButton importId={item.id} fileName={item.sourceFile.originalName} />
          )}
        </div>
      </div>

      {pipelineError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {pipelineError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-5">
        <Stat label="Rows" value={item.rowCount} tone="neutral" />
        <Stat label="Errors" value={item.errorCount} tone={item.errorCount > 0 ? "error" : "good"} />
        <Stat
          label="Warnings"
          value={item.warningCount}
          tone={item.warningCount > 0 ? "warn" : "good"}
        />
        <Stat
          label="kgCO₂e"
          value={item.totalKgCo2e ?? 0}
          tone={item.totalKgCo2e === null ? "neutral" : "good"}
          hint={item.totalKgCo2e === null ? "not calculated" : undefined}
        />
        <Stat
          label="Quality"
          value={item.qualityScore ?? 0}
          tone={
            item.qualityScore === null
              ? "neutral"
              : item.qualityScore >= 80
                ? "good"
                : item.qualityScore >= 60
                  ? "warn"
                  : "error"
          }
          hint={item.qualityScore === null ? "not scored" : "/ 100"}
        />
      </div>

      {isCalculated && item.totalKgCo2e !== null && (
        <EmissionsSummary
          totalKgCo2e={item.totalKgCo2e}
          rowCount={item.rowCount}
          calculations={item.calculations}
          categoryByRow={categoryByRow}
          unmatchedCount={unmatchedCount}
        />
      )}

      {isCalculated && item.quality && (
        <QualityPareto quality={item.quality} labelsByRowId={rowLabels} />
      )}

      {isCalculated && (
        <LineagePanel
          sourceFile={item.sourceFile}
          rows={item.activityRows}
          calculations={item.calculations}
        />
      )}

      {item.status === "validated" && (
        <div className="rounded-lg border border-moss-500/25 bg-moss-500/5 px-4 py-3 text-sm text-ink-800">
          Rows are validated and ready for factor matching. Calculate emissions to attach a
          versioned factor and a formula to every row.
        </div>
      )}

      {item.status === "failed" && (
        <div className="rounded-lg border border-red-500/25 bg-red-50 px-4 py-3 text-sm text-red-900">
          Emission calculation is blocked while error-severity issues remain. Fix the highlighted
          rows, re-run validation, then calculate.
        </div>
      )}

      {hasRows && !isStale && (
        <IssuesPanel issues={item.issues} rowLabels={rowLabels} />
      )}

      {hasRows && isStale && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {infoCount > 0 || item.issues.length > 0
            ? "Rows changed since the last validation pass. Re-run validation to refresh issues."
            : "Rows are mapped but not yet validated. Run validation to check units, dates, and duplicates."}
        </div>
      )}

      {hasRows ? (
        <ActivityRows
          importId={item.id}
          rows={item.activityRows}
          issuesByRow={issuesByRow}
          calcByRow={calcByRow}
        />
      ) : (
        <div className="rounded-lg border border-moss-500/20 bg-moss-500/5 px-4 py-4 text-sm text-ink-800">
          <p>
            This file is stored with a content hash, but it has not been turned into activity rows
            yet.
          </p>
          <p className="mt-2">
            {item.isDocument ? (
              <Link
                to={`/imports/${item.id}/extract`}
                className="font-semibold text-moss-700 hover:underline"
              >
                Extract fields from the document →
              </Link>
            ) : (
              <Link
                to={`/imports/${item.id}/map`}
                className="font-semibold text-moss-700 hover:underline"
              >
                Map columns to activity fields →
              </Link>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "warn" | "error";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-ink-900/10 bg-white/70 text-ink-950",
    good: "border-moss-500/25 bg-moss-500/5 text-moss-600",
    warn: "border-amber-500/25 bg-amber-50 text-amber-900",
    error: "border-red-500/25 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 font-display text-3xl font-semibold">
        {value.toLocaleString("en-US", { maximumFractionDigits: 6 })}
      </div>
      {hint && <div className="mt-0.5 font-mono text-[11px] opacity-60">{hint}</div>}
    </div>
  );
}

function ActivityRows({
  importId,
  rows,
  issuesByRow,
  calcByRow,
}: {
  importId: string;
  rows: ActivityRow[];
  issuesByRow: Map<string, IssueRecord[]>;
  calcByRow: Map<string, CalculationRecord>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink-900/10 bg-white/75">
      <div className="border-b border-ink-900/10 px-5 py-4">
        <h2 className="font-display text-xl font-semibold text-ink-950">Activity rows</h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Edit a value and save to re-validate. Errors are highlighted.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-ink-900/10 bg-ink-900/[0.03] font-mono uppercase tracking-wide text-ink-700/70">
            <tr>
              <th className="px-3 py-3">Line</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Site</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Activity</th>
              <th className="px-3 py-3">Quantity</th>
              <th className="px-3 py-3">Unit</th>
              <th className="px-3 py-3">Country</th>
              <th className="px-3 py-3">Supplier</th>
              <th className="px-3 py-3 text-right">kgCO₂e</th>
              <th className="px-3 py-3 text-right">Conf</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <EditableRow
                key={row.id}
                importId={importId}
                row={row}
                issues={issuesByRow.get(row.id) ?? []}
                calculation={calcByRow.get(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditableRow({
  importId,
  row,
  issues,
  calculation,
}: {
  importId: string;
  row: ActivityRow;
  issues: IssueRecord[];
  calculation?: CalculationRecord;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    date: row.date?.slice(0, 10) ?? "",
    siteCode: row.site?.code ?? "",
    category: row.category ?? "",
    activityType: row.activityType ?? "",
    quantity: row.quantity?.toString() ?? "",
    unit: row.unit ?? "",
    country: row.country ?? "",
    supplier: row.supplier ?? "",
  });
  const [betterDataNote, setBetterDataNote] = useState(row.needsBetterDataNote ?? "");

  const flagBetterData = useMutation({
    mutationFn: (next: { needsBetterData: boolean; needsBetterDataNote?: string }) =>
      apiSend(`/imports/${importId}/rows/${row.id}`, "PATCH", next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["import", importId] }),
  });

  const save = useMutation({
    mutationFn: () => {
      const update: UpdateActivityRow = {
        date: draft.date || undefined,
        siteCode: draft.siteCode || undefined,
        category: (draft.category || undefined) as ActivityCategory | undefined,
        activityType: draft.activityType || undefined,
        quantity: draft.quantity === "" ? undefined : Number(draft.quantity),
        unit: draft.unit || undefined,
        country: draft.country || undefined,
        supplier: draft.supplier || undefined,
      };
      return apiSend(`/imports/${importId}/rows/${row.id}`, "PATCH", update);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["import", importId] }),
  });

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  const rowTone = hasError ? "bg-red-50/70" : hasWarning ? "bg-amber-50/60" : "";
  const cellClass =
    "min-w-24 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-ink-900/10 focus:border-moss-500 focus:bg-white";

  return (
    <>
      <tr className={`border-b border-ink-900/5 ${rowTone}`}>
        <td className="whitespace-nowrap px-3 py-2 text-ink-700/70">
          {friendlySourceRef(row.sourceRef) ?? "—"}
        </td>
        {(
          [
            "date",
            "siteCode",
            "category",
            "activityType",
            "quantity",
            "unit",
            "country",
            "supplier",
          ] as const
        ).map((field) => (
          <td key={field} className="px-2 py-2">
            <input
              className={cellClass}
              type={field === "quantity" ? "number" : field === "date" ? "date" : "text"}
              value={draft[field]}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [field]: event.target.value }))
              }
            />
          </td>
        ))}
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
          {calculation ? (
            <span className="font-semibold text-ink-950">
              {calculation.resultKgCo2e.toLocaleString("en-US", { maximumFractionDigits: 6 })}
            </span>
          ) : (
            <span className="text-ink-700/40">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
          {calculation?.confidence !== null && calculation?.confidence !== undefined ? (
            <span
              className={
                calculation.confidence < 0.7
                  ? "font-semibold text-amber-700"
                  : "font-semibold text-moss-600"
              }
            >
              {(calculation.confidence * 100).toFixed(0)}%
            </span>
          ) : (
            <span className="text-ink-700/40">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded bg-ink-900 px-2.5 py-1.5 font-semibold text-sand-50 disabled:opacity-50"
          >
            {save.isPending ? "…" : save.isSuccess ? "Saved" : "Save"}
          </button>
          {save.isError && <span className="ml-2 text-red-700">Failed</span>}
        </td>
      </tr>
      {(issues.length > 0 || calculation || row.needsBetterData) && (
        <tr className={`border-b border-ink-900/5 ${rowTone}`}>
          <td />
          <td colSpan={11} className="px-2 pb-3 pt-0">
            {issues.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {issues.map((issue) => (
                  <span
                    key={issue.id}
                    title={issue.message}
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                      issue.severity === "error"
                        ? "bg-red-500/12 text-red-900"
                        : issue.severity === "warning"
                          ? "bg-amber-500/15 text-amber-900"
                          : "bg-ink-900/6 text-ink-700"
                    }`}
                  >
                    {issue.code}
                  </span>
                ))}
              </div>
            )}
            {calculation && (
              <details className="rounded border border-moss-500/20 bg-moss-500/[0.05]">
                <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold text-ink-800">
                  Calculation detail
                </summary>
                <div className="border-t border-moss-500/15 px-2.5 py-2">
                  <FormulaTrace calculation={calculation} />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <label className="inline-flex items-center gap-1.5 text-ink-800">
                      <input
                        type="checkbox"
                        checked={row.needsBetterData}
                        disabled={flagBetterData.isPending}
                        onChange={(event) =>
                          flagBetterData.mutate({
                            needsBetterData: event.target.checked,
                            needsBetterDataNote: betterDataNote || undefined,
                          })
                        }
                      />
                      Request better primary data
                    </label>
                    {row.needsBetterData && (
                      <input
                        type="text"
                        value={betterDataNote}
                        placeholder="Note for supplier / auditor"
                        className="min-w-48 flex-1 rounded border border-ink-900/10 px-2 py-1 text-[11px]"
                        onChange={(event) => setBetterDataNote(event.target.value)}
                        onBlur={() => {
                          if (betterDataNote !== (row.needsBetterDataNote ?? "")) {
                            flagBetterData.mutate({
                              needsBetterData: true,
                              needsBetterDataNote: betterDataNote || undefined,
                            });
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </details>
            )}
            {!calculation && row.needsBetterData && (
              <p className="text-[11px] text-amber-800">Flagged for better primary data</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const TIER_LABELS: Record<string, string> = {
  country: "country-specific factor",
  region: "regional average factor",
  global: "global average factor",
};

function FormulaTrace({ calculation }: { calculation: CalculationRecord }) {
  return (
    <div>
      <div className="font-mono text-[11px] leading-relaxed text-ink-950">
        {calculation.formula}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-700/75">
        <span className="rounded bg-ink-900/[0.06] px-1.5 py-0.5 font-mono">
          {calculation.factorKey} {calculation.factorVersion}
        </span>
        <span
          className={
            calculation.regionTier === "country" ? "text-moss-600" : "text-amber-700"
          }
        >
          {TIER_LABELS[calculation.regionTier] ?? calculation.regionTier}
        </span>
      </div>
    </div>
  );
}

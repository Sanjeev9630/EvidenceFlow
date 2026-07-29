import type { IssueRecord } from "@evidenceflow/shared";

const SEVERITY_STYLES: Record<string, string> = {
  error: "border-red-500/25 bg-red-50 text-red-900",
  warning: "border-amber-500/25 bg-amber-50 text-amber-900",
  info: "border-ink-900/10 bg-white text-ink-800",
};

const SEVERITY_ORDER = ["error", "warning", "info"] as const;

export function IssuesPanel({
  issues,
  rowLabels,
}: {
  issues: IssueRecord[];
  rowLabels: Record<string, string>;
}) {
  if (issues.length === 0) {
    return (
      <section className="rounded-xl border border-moss-500/25 bg-moss-500/5 px-5 py-4">
        <h2 className="font-display text-xl font-semibold text-ink-950">No issues found</h2>
        <p className="mt-1 text-sm text-ink-800/75">
          Every row passed the validation rules. This batch is ready for factor matching.
        </p>
      </section>
    );
  }

  const grouped = new Map<string, IssueRecord[]>();
  for (const issue of issues) {
    const bucket = grouped.get(issue.code);
    if (bucket) bucket.push(issue);
    else grouped.set(issue.code, [issue]);
  }

  const codes = [...grouped.entries()].sort((a, b) => {
    const severityA = SEVERITY_ORDER.indexOf(a[1][0]!.severity as "error");
    const severityB = SEVERITY_ORDER.indexOf(b[1][0]!.severity as "error");
    if (severityA !== severityB) return severityA - severityB;
    return b[1].length - a[1].length;
  });

  return (
    <section className="overflow-hidden rounded-xl border border-ink-900/10 bg-white/75">
      <div className="border-b border-ink-900/10 px-5 py-4">
        <h2 className="font-display text-xl font-semibold text-ink-950">Validation issues</h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Grouped by rule. Errors block emission calculation; warnings reduce confidence.
        </p>
      </div>
      <ul className="divide-y divide-ink-900/5">
        {codes.map(([code, items]) => {
          const severity = items[0]!.severity;
          return (
            <li key={code} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-xs ${
                    SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info
                  }`}
                >
                  {severity}
                </span>
                <span className="font-mono text-sm text-ink-950">{code}</span>
                <span className="text-xs text-ink-700/60">
                  {items.length} {items.length === 1 ? "row" : "rows"}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-800/85">{items[0]!.message}</p>
              <p className="mt-1.5 font-mono text-xs text-ink-700/55">
                {items
                  .slice(0, 8)
                  .map((issue) =>
                    issue.activityRowId ? rowLabels[issue.activityRowId] ?? "row" : "batch",
                  )
                  .join(", ")}
                {items.length > 8 ? ` +${items.length - 8} more` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

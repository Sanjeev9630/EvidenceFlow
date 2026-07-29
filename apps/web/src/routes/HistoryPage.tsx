import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { StatusBadge } from "../components/common/StatusBadge";

type ImportSummary = {
  id: string;
  status: string;
  originalName?: string;
  rowCount: number;
  warningCount: number;
  errorCount: number;
  qualityScore: number | null;
  totalKgCo2e: number | null;
  calculatedRowCount: number;
  createdAt: string;
};

export function HistoryPage() {
  const imports = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiGet<ImportSummary[]>("/imports"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-950">Import history</h1>
          <p className="mt-2 text-ink-800/75">Recent evidence batches stored in Neon.</p>
        </div>
        <Link
          to="/imports/new"
          className="rounded-md bg-moss-600 px-3 py-2 text-sm font-semibold text-white hover:bg-moss-500"
        >
          New import
        </Link>
      </div>

      {imports.isLoading && <p className="text-sm text-ink-700">Loading…</p>}
      {imports.isError && (
        <p className="text-sm text-red-700">Failed to load imports. Is the API running?</p>
      )}

      {imports.data && imports.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-ink-900/20 bg-white/50 px-6 py-10 text-center">
          <p className="text-ink-800">No imports yet.</p>
          <Link to="/imports/new" className="mt-2 inline-block text-sm font-semibold text-moss-600">
            Upload your first file
          </Link>
        </div>
      )}

      {imports.data && imports.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-ink-900/10 bg-white/80">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-900/10 bg-ink-900/[0.03] font-mono text-xs uppercase tracking-wide text-ink-700/70">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rows</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3">Warnings</th>
                <th className="px-4 py-3 text-right">tCO₂e</th>
                <th className="px-4 py-3 text-right">Quality</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {imports.data.map((item) => (
                <tr key={item.id} className="border-b border-ink-900/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link to={`/imports/${item.id}`} className="font-medium text-moss-600 hover:underline">
                      {item.originalName ?? item.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.rowCount}</td>
                  <td
                    className={`px-4 py-3 font-mono text-xs ${
                      item.errorCount > 0 ? "font-semibold text-red-700" : "text-ink-700/50"
                    }`}
                  >
                    {item.errorCount}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono text-xs ${
                      item.warningCount > 0 ? "font-semibold text-amber-700" : "text-ink-700/50"
                    }`}
                  >
                    {item.warningCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {item.totalKgCo2e === null ? (
                      <span className="text-ink-700/40">—</span>
                    ) : (
                      <span className="font-semibold text-ink-950">
                        {(item.totalKgCo2e / 1000).toLocaleString("en-US", {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {item.qualityScore === null ? (
                      <span className="text-ink-700/40">—</span>
                    ) : (
                      <span
                        className={
                          item.qualityScore >= 80
                            ? "font-semibold text-moss-600"
                            : item.qualityScore >= 60
                              ? "font-semibold text-amber-700"
                              : "font-semibold text-red-700"
                        }
                      >
                        {item.qualityScore.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700/70">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

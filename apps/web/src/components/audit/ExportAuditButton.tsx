import { useState } from "react";
import { apiDownload, openAuditPackHtml } from "../../api/download";

export function ExportAuditButton({
  importId,
  fileName,
  disabled,
}: {
  importId: string;
  fileName: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<"json" | "html" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");

  async function downloadJson() {
    setBusy("json");
    setError(null);
    try {
      await apiDownload(`/imports/${importId}/audit-pack`, `audit-pack-${safeName}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  function viewHtml() {
    setError(null);
    setBusy("html");
    try {
      openAuditPackHtml(importId);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={viewHtml}
        disabled={disabled || busy !== null}
        className="rounded-md border border-moss-600/30 bg-moss-600/10 px-3 py-2 text-sm font-semibold text-moss-700 hover:bg-moss-600/15 disabled:opacity-50"
      >
        View audit report
      </button>
      <button
        type="button"
        onClick={() => void downloadJson()}
        disabled={disabled || busy !== null}
        className="rounded-md border border-ink-900/15 bg-white/60 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-white disabled:opacity-50"
        title="Machine-readable pack for auditors or systems — full lineage, factors, and confidence"
      >
        {busy === "json" ? "Exporting…" : "Export JSON"}
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  );
}

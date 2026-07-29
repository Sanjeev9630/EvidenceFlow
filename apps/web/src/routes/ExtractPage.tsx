import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ExtractedActivity } from "@evidenceflow/shared";
import { apiGet, apiSend } from "../api/client";

type DocumentTextResponse = {
  importId: string;
  originalName: string;
  text: string;
  needsPaste: boolean;
  note: string | null;
  source: string;
};

type ExtractResponse = {
  import: { id: string; status: string; rowCount: number };
  extraction: {
    method: string;
    model: string | null;
    documentChars: number;
    activityCount: number;
    activities: ExtractedActivity[];
  };
};

export function ExtractPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const document = useQuery({
    queryKey: ["document-text", id],
    queryFn: () => apiGet<DocumentTextResponse>(`/imports/${id}/document-text`),
    enabled: Boolean(id),
  });

  const extract = useMutation({
    mutationFn: () =>
      apiSend<ExtractResponse>(`/imports/${id}/extract`, "POST", {
        pastedText: pastedText.trim() || undefined,
      }),
    onSuccess: (data) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["import", id] });
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      navigate(`/imports/${data.import.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const previewText = useMemo(() => {
    if (pastedText.trim()) return pastedText;
    return document.data?.text ?? "";
  }, [pastedText, document.data?.text]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/imports" className="text-sm font-medium text-moss-600 hover:underline">
          ← History
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink-950">
          Extract activity data
        </h1>
        <p className="mt-2 text-ink-800/75">
          The LLM proposes candidate fields from the document. It never computes emissions —
          those stay deterministic after validation.
        </p>
        {document.data && (
          <p className="mt-1 font-mono text-xs text-ink-700/60">{document.data.originalName}</p>
        )}
      </div>

      {document.isLoading && <p className="text-sm text-ink-700">Reading document…</p>}
      {document.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(document.error as Error).message}
        </div>
      )}

      {document.data?.note && (
        <div className="rounded-md border border-amber-500/25 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {document.data.note}
        </div>
      )}

      <section className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-700/60">
          Document text {document.data?.needsPaste ? "(paste required)" : "(editable override)"}
        </label>
        <textarea
          value={pastedText || document.data?.text || ""}
          onChange={(event) => setPastedText(event.target.value)}
          rows={16}
          className="w-full rounded-lg border border-ink-900/15 bg-white/80 px-3 py-2 font-mono text-xs leading-relaxed text-ink-950 outline-none focus:border-moss-500"
          placeholder="Paste invoice or receipt text here…"
        />
        <p className="text-xs text-ink-700/60">
          {previewText.length.toLocaleString()} characters ready for extraction.
        </p>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!previewText.trim() || extract.isPending}
          onClick={() => extract.mutate()}
          className="rounded-md bg-moss-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-moss-500 disabled:opacity-40"
        >
          {extract.isPending ? "Extracting…" : "Extract activity rows"}
        </button>
        <Link
          to={`/imports/${id}`}
          className="rounded-md border border-ink-900/15 bg-white/60 px-4 py-2.5 text-sm font-semibold text-ink-900"
        >
          Skip to detail
        </Link>
      </div>
    </div>
  );
}

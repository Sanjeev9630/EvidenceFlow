import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiUploadFile } from "../api/client";
import { Dropzone } from "../components/upload/Dropzone";

function isDocumentName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".txt") || lower.endsWith(".md");
}

export function NewImportPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: apiUploadFile,
    onSuccess: (data) => {
      const name = data.file.originalName;
      if (isDocumentName(name)) {
        navigate(`/imports/${data.import.id}/extract`);
      } else {
        navigate(`/imports/${data.import.id}/map`);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const documentSelected = selected ? isDocumentName(selected.name) : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-950">New import</h1>
        <p className="mt-2 text-ink-800/75">
          Upload a CSV/Excel spreadsheet or a PDF/TXT invoice. Spreadsheets go through column
          mapping; documents go through LLM field extraction (with a paste fallback). Emissions
          are never computed by the model.
        </p>
      </div>

      <Dropzone
        file={selected}
        onFile={(file) => {
          setSelected(file);
          setError(null);
        }}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={!selected || upload.isPending}
        onClick={() => selected && upload.mutate(selected)}
        className="rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-sand-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {upload.isPending
          ? "Uploading…"
          : documentSelected
            ? "Upload & extract"
            : "Upload & map columns"}
      </button>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  ActivityCategory,
  ApplyMappingRequest,
  CanonicalField,
  ColumnMapping,
  MappingDefaults,
  PreviewResponse,
} from "@evidenceflow/shared";
import { apiSend } from "../api/client";

const targetFields: { value: CanonicalField; label: string }[] = [
  { value: "ignore", label: "Ignore column" },
  { value: "date", label: "Date" },
  { value: "siteCode", label: "Site code" },
  { value: "category", label: "Category" },
  { value: "activityType", label: "Activity type" },
  { value: "quantity", label: "Quantity" },
  { value: "unit", label: "Unit" },
  { value: "country", label: "Country" },
  { value: "supplier", label: "Supplier" },
  { value: "description", label: "Description" },
];

const categories: ActivityCategory[] = [
  "electricity",
  "natural_gas",
  "diesel",
  "petrol",
  "road_freight",
  "sea_freight",
  "air_freight",
  "business_travel",
  "steel",
  "aluminium",
  "other",
];

export function MappingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [defaults, setDefaults] = useState<MappingDefaults>({});
  const [formError, setFormError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["import-preview", id],
    queryFn: () => apiSend<PreviewResponse>(`/imports/${id}/preview`, "POST"),
    enabled: Boolean(id),
    retry: false,
  });

  useEffect(() => {
    if (preview.data) {
      setMapping(preview.data.autoMapping);
      setDefaults(preview.data.suggestedDefaults);
    }
  }, [preview.data]);

  const duplicateTargets = useMemo(() => {
    const selected = Object.values(mapping).filter((field) => field !== "ignore");
    return selected.filter((field, index) => selected.indexOf(field) !== index);
  }, [mapping]);

  const apply = useMutation({
    mutationFn: (request: ApplyMappingRequest) =>
      apiSend(`/imports/${id}/mapping`, "POST", request),
    onSuccess: () => navigate(`/imports/${id}`),
    onError: (error: Error) => setFormError(error.message),
  });

  if (preview.isLoading) {
    return <p className="text-sm text-ink-700">Parsing file and detecting columns…</p>;
  }

  if (preview.isError || !preview.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">
          {preview.error instanceof Error ? preview.error.message : "Unable to preview this file."}
        </p>
        <Link to={`/imports/${id}`} className="text-sm font-semibold text-moss-600">
          Back to import
        </Link>
      </div>
    );
  }

  const data = preview.data;

  function submit() {
    setFormError(null);
    if (!Object.values(mapping).includes("quantity")) {
      setFormError("Map one source column to Quantity before continuing.");
      return;
    }
    if (duplicateTargets.length > 0) {
      setFormError(`Each target can only be used once: ${[...new Set(duplicateTargets)].join(", ")}`);
      return;
    }
    apply.mutate({ mapping, defaults });
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-moss-600">
          Step 2 · Map fields
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink-950">
          Review detected columns
        </h1>
        <p className="mt-2 text-ink-800/70">
          {data.totalRows.toLocaleString()} rows detected. Confirm how each source column maps to
          EvidenceFlow’s activity schema.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-ink-900/10 bg-white/75">
        <div className="border-b border-ink-900/10 px-5 py-4">
          <h2 className="font-display text-xl font-semibold text-ink-950">Column mapping</h2>
          <p className="mt-1 text-sm text-ink-700/70">
            Suggestions use aliases and fuzzy matching. You remain in control.
          </p>
        </div>
        <div className="divide-y divide-ink-900/5">
          {data.columns.map((column) => {
            return (
              <div
                key={column}
                className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_auto_1fr]"
              >
                <div className="font-mono text-sm text-ink-950">{column}</div>
                <span className="hidden text-ink-700/35 sm:block">→</span>
                <select
                  value={mapping[column] ?? "ignore"}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [column]: event.target.value as CanonicalField,
                    }))
                  }
                  className="rounded-md border border-ink-900/15 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-moss-500"
                >
                  {targetFields.map((field) => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-ink-900/10 bg-white/75 p-5">
        <h2 className="font-display text-xl font-semibold text-ink-950">Detected defaults</h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Applied when the file does not contain a dedicated column.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="Category">
            <select
              value={defaults.category ?? ""}
              onChange={(event) =>
                setDefaults((current) => ({
                  ...current,
                  category: (event.target.value || undefined) as ActivityCategory | undefined,
                }))
              }
              className="input"
            >
              <option value="">Not set</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity type">
            <input
              className="input"
              value={defaults.activityType ?? ""}
              onChange={(event) =>
                setDefaults((current) => ({ ...current, activityType: event.target.value || undefined }))
              }
              placeholder="grid_electricity"
            />
          </Field>
          <Field label="Unit">
            <input
              className="input"
              value={defaults.unit ?? ""}
              onChange={(event) =>
                setDefaults((current) => ({ ...current, unit: event.target.value || undefined }))
              }
              placeholder="kWh"
            />
          </Field>
          <Field label="Country">
            <input
              className="input"
              value={defaults.country ?? ""}
              onChange={(event) =>
                setDefaults((current) => ({ ...current, country: event.target.value || undefined }))
              }
              placeholder="DE"
            />
          </Field>
        </div>
      </section>

      <PreviewTable columns={data.columns} rows={data.sampleRows.slice(0, 8)} />

      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Link to={`/imports/${id}`} className="text-sm font-semibold text-ink-700 hover:text-ink-950">
          Cancel
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={apply.isPending}
          className="rounded-md bg-ink-900 px-5 py-2.5 text-sm font-semibold text-sand-50 disabled:opacity-50"
        >
          {apply.isPending ? "Creating draft rows…" : `Confirm mapping · ${data.totalRows} rows`}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-700/65">{label}</span>
      {children}
    </label>
  );
}

function PreviewTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink-900/10 bg-white/75">
      <div className="px-5 py-4">
        <h2 className="font-display text-xl font-semibold text-ink-950">Source preview</h2>
        <p className="mt-1 text-sm text-ink-700/70">First {rows.length} rows, before mapping.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-y border-ink-900/10 bg-ink-900/[0.03] font-mono uppercase tracking-wide text-ink-700/70">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-ink-900/5 last:border-0">
                {columns.map((column) => (
                  <td key={column} className="max-w-56 truncate whitespace-nowrap px-4 py-3">
                    {String(row[column] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

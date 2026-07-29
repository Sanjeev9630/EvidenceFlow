import { useCallback, useState, type DragEvent } from "react";

const ACCEPT = ".csv,.xlsx,.xls,.pdf,.txt";

export function Dropzone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const next = e.dataTransfer.files?.[0];
      if (next) onFile(next);
    },
    [onFile],
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 transition ${
        dragging
          ? "border-moss-500 bg-moss-500/10"
          : "border-ink-900/20 bg-white/60 hover:border-moss-500/50"
      }`}
    >
      <input
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const next = e.target.files?.[0];
          if (next) onFile(next);
        }}
      />
      <p className="font-display text-lg text-ink-950">Drop evidence here</p>
      <p className="mt-1 text-sm text-ink-700/70">CSV, XLSX, PDF, or TXT — max 20 MB</p>
      {file && (
        <p className="mt-4 rounded bg-ink-900/5 px-3 py-1.5 font-mono text-xs text-ink-800">
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </p>
      )}
    </label>
  );
}

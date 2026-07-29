const STYLES: Record<string, string> = {
  uploaded: "bg-ink-900/8 text-ink-800",
  previewed: "bg-ink-900/8 text-ink-800",
  mapped: "bg-sky-500/10 text-sky-800",
  draft: "bg-amber-500/10 text-amber-800",
  validated: "bg-moss-500/15 text-moss-600",
  calculated: "bg-moss-500/20 text-moss-600",
  failed: "bg-red-500/10 text-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-xs font-medium ${
        STYLES[status] ?? "bg-ink-900/8 text-ink-800"
      }`}
    >
      {status}
    </span>
  );
}

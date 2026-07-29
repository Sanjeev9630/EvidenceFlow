/** Human-readable label for an activity row (UI only — sourceRef stays in the DB). */
export function activityHeadline(row: {
  activityType?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  country?: string | null;
  date?: string | null;
  site?: { code: string } | null;
  supplier?: string | null;
}): string {
  const activity = (row.activityType ?? row.category ?? "Activity").replaceAll("_", " ");
  const parts: string[] = [capitalize(activity)];

  if (row.quantity != null && row.unit) {
    parts.push(
      `${row.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${row.unit}`,
    );
  } else if (row.quantity != null) {
    parts.push(String(row.quantity));
  }

  if (row.country) parts.push(row.country);
  if (row.site?.code) parts.push(row.site.code);

  return parts.join(" · ");
}

/** Soften technical source refs like row:7 / doc:activity-1 for display. */
export function friendlySourceRef(sourceRef: string | null | undefined): string | null {
  if (!sourceRef) return null;
  const sheet = /^row:(\d+)$/i.exec(sourceRef);
  if (sheet) return `Sheet row ${sheet[1]}`;
  const doc = /^doc:activity-(\d+)$/i.exec(sourceRef);
  if (doc) return `Extracted activity ${doc[1]}`;
  return sourceRef;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

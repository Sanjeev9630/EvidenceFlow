import { API_URL } from "./client";

export async function apiDownload(
  path: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openAuditPackHtml(importId: string): void {
  window.open(`${API_URL}/imports/${importId}/audit-pack?format=html`, "_blank", "noopener");
}

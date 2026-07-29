import { readFile } from "node:fs/promises";
import path from "node:path";

export type DocumentText = {
  text: string;
  source: "file" | "pasted";
  /** Hint for the UI when a binary PDF needs a paste fallback. */
  needsPaste: boolean;
  note: string | null;
};

function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 800));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

/**
 * Pulls plain text from a stored evidence file. Real binary PDFs are not OCR'd
 * here — the Day 5 contract is LLM-on-text with an explicit paste fallback.
 */
export async function readDocumentText(
  storagePath: string,
  originalName: string,
  pastedText?: string,
): Promise<DocumentText> {
  if (pastedText && pastedText.trim()) {
    return {
      text: pastedText.trim(),
      source: "pasted",
      needsPaste: false,
      note: "Using pasted document text.",
    };
  }

  const extension = path.extname(originalName).toLowerCase();
  const buffer = await readFile(storagePath);

  if (extension === ".txt" || extension === ".md" || extension === ".csv") {
    return {
      text: buffer.toString("utf8").trim(),
      source: "file",
      needsPaste: false,
      note: null,
    };
  }

  if (extension === ".pdf") {
    if (!isProbablyBinary(buffer)) {
      const text = buffer.toString("utf8").trim();
      if (text.length > 40) {
        return {
          text,
          source: "file",
          needsPaste: false,
          note: "Read PDF storage as plain text (demo / text-based PDF).",
        };
      }
    }

    return {
      text: "",
      source: "file",
      needsPaste: true,
      note: "This PDF looks binary. Paste the invoice text below to continue extraction.",
    };
  }

  // Unknown extension: try UTF-8 if it looks textual.
  if (!isProbablyBinary(buffer)) {
    return {
      text: buffer.toString("utf8").trim(),
      source: "file",
      needsPaste: false,
      note: null,
    };
  }

  return {
    text: "",
    source: "file",
    needsPaste: true,
    note: "Could not read this file as text. Paste the document contents to continue.",
  };
}

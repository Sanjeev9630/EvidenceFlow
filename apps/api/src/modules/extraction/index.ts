import type { ExtractedActivity, ExtractionResult } from "@evidenceflow/shared";
import { config } from "../../config.js";
import { extractHeuristic } from "./heuristic.js";
import { extractWithLlm } from "./llm.js";
import { readDocumentText } from "./readText.js";

export type ExtractOptions = {
  storagePath: string;
  originalName: string;
  pastedText?: string;
};

/**
 * Document → candidate activity rows. Prefers the LLM when configured; falls
 * back to the deterministic heuristic on timeout / error / missing key.
 */
export async function extractActivities(options: ExtractOptions): Promise<ExtractionResult> {
  const document = await readDocumentText(
    options.storagePath,
    options.originalName,
    options.pastedText,
  );

  if (document.needsPaste || !document.text) {
    throw new Error(document.note ?? "DOCUMENT_NEEDS_PASTE");
  }

  const methodBase = options.pastedText?.trim() ? "pasted" : "file";

  if (config.llmApiKey) {
    try {
      const activities = await extractWithLlm(document.text);
      return {
        activities,
        method: methodBase === "pasted" ? "pasted" : "llm",
        model: config.llmModel,
        documentChars: document.text.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM_FAILED";
      // Fall through to heuristic — demo must not die on a flaky provider.
      const activities = extractHeuristic(document.text);
      return {
        activities: annotateFallback(activities, message),
        method: "heuristic",
        model: null,
        documentChars: document.text.length,
      };
    }
  }

  const activities = extractHeuristic(document.text);
  return {
    activities,
    method: "heuristic",
    model: null,
    documentChars: document.text.length,
  };
}

function annotateFallback(
  activities: ExtractedActivity[],
  reason: string,
): ExtractedActivity[] {
  return activities.map((activity) => ({
    ...activity,
    extractionConfidence: Math.min(activity.extractionConfidence, 0.7),
    description: activity.description
      ? `${activity.description} (heuristic after ${reason})`
      : `Extracted by heuristic after ${reason}`,
  }));
}

export { readDocumentText };

import {
  ExtractedActivitySchema,
  type ExtractedActivity,
} from "@evidenceflow/shared";
import { z } from "zod";
import { config } from "../../config.js";
import { categoryForActivityType, normalizeActivityType } from "../validation/normalize.js";
import { canonicalUnit } from "../../utils/units.js";

const LlmPayloadSchema = z.object({
  activities: z.array(z.unknown()).min(1),
});

const SYSTEM_PROMPT = `You extract industrial ESG activity data from invoice/receipt text.

Return ONLY valid JSON of the form:
{
  "activities": [
    {
      "date": "YYYY-MM-DD",
      "siteCode": "BER",
      "category": "diesel|natural_gas|electricity|petrol|road_freight|sea_freight|air_freight|business_travel|steel|aluminium|other",
      "activityType": "diesel|natural_gas|grid_electricity|petrol|...",
      "quantity": 385,
      "unit": "litre|kWh|kg|km|...",
      "country": "DE",
      "supplier": "string",
      "description": "string",
      "sourceRef": "doc:activity-1",
      "extractionConfidence": 0.0-1.0,
      "fieldEvidence": [
        { "field": "quantity", "location": "line 9", "snippet": "Quantity: 385 litres" }
      ]
    }
  ]
}

Rules:
- Extract candidate activity fields only.
- NEVER invent or compute CO2, CO₂e, emissions, factors, or totals.
- Prefer ISO dates and ISO-2 country codes.
- Prefer site codes in parentheses like (BER).
- If a field is unknown, omit it.
- extractionConfidence reflects how clear the source text is for that row.`;

function cleanSiteCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.toUpperCase().match(/\b([A-Z]{2,4})\b/);
  return match?.[1];
}

function sanitizeActivity(raw: unknown, index: number): ExtractedActivity {
  const parsed = ExtractedActivitySchema.safeParse(raw);
  if (parsed.success) {
    const activity = parsed.data;
    const activityType = normalizeActivityType(activity.activityType) ?? activity.activityType;
    const category =
      activity.category ??
      (categoryForActivityType(activityType) as ExtractedActivity["category"] | null) ??
      undefined;
    return {
      ...activity,
      activityType: activityType ?? undefined,
      category,
      siteCode: cleanSiteCode(activity.siteCode),
      unit: canonicalUnit(activity.unit) ?? activity.unit,
      sourceRef: activity.sourceRef ?? `doc:activity-${index + 1}`,
      country: activity.country?.toUpperCase(),
    };
  }

  // Soft-coerce a partial object rather than discarding the whole batch.
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const quantity =
    typeof record.quantity === "number"
      ? record.quantity
      : typeof record.quantity === "string"
        ? Number(String(record.quantity).replace(/,/g, ""))
        : undefined;
  const activityType = normalizeActivityType(
    typeof record.activityType === "string"
      ? record.activityType
      : typeof record.fuel === "string"
        ? record.fuel
        : undefined,
  );
  const coerced = ExtractedActivitySchema.parse({
    date: typeof record.date === "string" ? record.date : undefined,
    siteCode: cleanSiteCode(
      typeof record.siteCode === "string"
        ? record.siteCode
        : typeof record.site === "string"
          ? record.site
          : undefined,
    ),
    category: categoryForActivityType(activityType) ?? undefined,
    activityType: activityType ?? undefined,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    unit:
      canonicalUnit(typeof record.unit === "string" ? record.unit : undefined) ??
      (typeof record.unit === "string" ? record.unit : undefined),
    country:
      typeof record.country === "string" ? record.country.toUpperCase() : undefined,
    supplier: typeof record.supplier === "string" ? record.supplier : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    sourceRef:
      typeof record.sourceRef === "string" ? record.sourceRef : `doc:activity-${index + 1}`,
    extractionConfidence:
      typeof record.extractionConfidence === "number" ? record.extractionConfidence : 0.6,
    fieldEvidence: Array.isArray(record.fieldEvidence) ? record.fieldEvidence : [],
  });
  return coerced;
}

export async function extractWithLlm(text: string): Promise<ExtractedActivity[]> {
  if (!config.llmApiKey) {
    throw new Error("LLM_NOT_CONFIGURED");
  }
  if (config.llmProvider !== "openai") {
    throw new Error(`LLM_PROVIDER_UNSUPPORTED:${config.llmProvider}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.llmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.llmModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
    content: `Extract activity rows from this document text.
Prefer bare site codes like BER (not parentheses). Prefer ISO units (litre, kWh).

Document:
${text.slice(0, 12_000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM_HTTP_${response.status}:${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM_EMPTY_RESPONSE");

    const json = JSON.parse(content) as unknown;
    const envelope = LlmPayloadSchema.parse(json);
    const activities = envelope.activities.map((item, index) => sanitizeActivity(item, index));

    // Hard rule: reject any payload that smuggled an emission number in.
    for (const activity of activities) {
      const bag = activity as Record<string, unknown>;
      for (const key of Object.keys(bag)) {
        if (/co2|emission|factor|kgco2/i.test(key)) {
          throw new Error("LLM_EMITTED_FORBIDDEN_FIELD");
        }
      }
    }

    return activities;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LLM_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config();

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads"),
  ),
  demoMode: (process.env.DEMO_MODE ?? "true") === "true",
  databaseUrl: optional(
    "DATABASE_URL",
    "postgresql://user:pass@localhost:5432/evidenceflow",
  ),
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  llmProvider: process.env.LLM_PROVIDER ?? "openai",
  /** Hard ceiling on the LLM call so a hung provider cannot stall the import. */
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 25_000),
};

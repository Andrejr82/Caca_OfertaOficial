import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateCandidates } from "./common-evaluator";
import { serializeNdjson, serializeReport } from "./report";
import type { OfferQualityCandidate } from "./types";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

async function readCandidates(inputPath: string): Promise<OfferQualityCandidate[]> {
  const raw = await readFile(inputPath, "utf8");
  if (inputPath.endsWith(".ndjson")) {
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as OfferQualityCandidate);
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Input must be a JSON array or NDJSON file");
  return parsed as OfferQualityCandidate[];
}

async function main(): Promise<void> {
  const inputPath = resolve(argument("--input"));
  const outputDir = resolve(argument("--output"));
  const runId = `dry-run-${Date.now()}`;
  const generatedAt = new Date().toISOString();
  const candidates = await readCandidates(inputPath);
  const report = evaluateCandidates(candidates, { runId, generatedAt });

  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, `${runId}.json`), serializeReport(report), "utf8");
  await writeFile(resolve(outputDir, `${runId}.ndjson`), serializeNdjson(report), "utf8");

  console.log(JSON.stringify({
    runId,
    recordCount: report.recordCount,
    groups: report.groupCount,
    winners: report.winners.length,
    rejected: report.decisions.filter((decision) => decision.decision === "rejected").length,
    persist_attempts: report.persistAttemptCount,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

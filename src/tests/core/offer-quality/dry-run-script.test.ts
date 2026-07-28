import { describe, expect, it } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function runDryRun(input: string, output: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/offer-quality-dry-run.cjs", "--input", input, "--output", output], {
      env: { ...process.env, OFFER_QUALITY_PIPELINE_V2: "false" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("offer quality dry-run script", () => {
  it("runs only from an explicit input and reports zero persistence attempts", async () => {
    const output = await mkdtemp(join(tmpdir(), "offer-quality-"));
    const input = "src/tests/fixtures/offer-quality/multimarketplace.json";
    const result = await runDryRun(input, output);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"persist_attempts": 0');
    await rm(output, { recursive: true, force: true });
  });

  it("fails when the input file is missing", async () => {
    const output = await mkdtemp(join(tmpdir(), "offer-quality-"));
    const result = await runDryRun("missing-offer-quality-input.json", output);
    expect(result.code).not.toBe(0);
    await rm(output, { recursive: true, force: true });
  });
});

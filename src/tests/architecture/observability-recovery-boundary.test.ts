import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const coreFiles = [
  "src/core/observability/event.ts", "src/core/observability/health.ts",
  "src/core/observability/metrics.ts", "src/core/observability/reconciliation.ts",
  "src/core/observability/recovery.ts", "src/core/observability/sanitization.ts"
];
const source = coreFiles.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");

describe("PMAV5-011 observability architecture", () => {
  it("does not depend on concrete runtimes, providers, transports or state adapters", () => {
    for (const forbidden of [
      "@supabase", "process.env", "console.", "inngest", "vercel",
      "StateServiceDependencies", "AIProviderPort", "PublicationTransportPort",
      "supabase-state-adapter", "compareAndSet", ".from(\"offers\")", ".from(\"posts\")"
    ]) expect(source).not.toContain(forbidden);
  });

  it("detectors and health contain no business mutation vocabulary", () => {
    const readOnly = ["src/core/observability/recovery.ts", "src/core/observability/health.ts"]
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    expect(readOnly).not.toMatch(/transitionOfferState|transitionPostState|\.update\(|\.insert\(|\.delete\(|\.upsert\(/);
  });

  it("reconciliation delegates only through official replay ports", () => {
    const reconciliation = readFileSync(resolve(process.cwd(), "src/core/observability/reconciliation.ts"), "utf8");
    expect(reconciliation).toContain("OfficialReplayPort");
    expect(reconciliation).not.toMatch(/provider\.generate|transport\.publish|compareAndSet|persistDrafts/);
  });
});

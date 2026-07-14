import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const officialCallers = [
  "src/lib/offers/actions.ts",
  "src/app/api/ai/generate/route.ts",
  "src/app/api/whatsapp/publish/route.ts",
  "src/app/api/telegram/publish/route.ts",
  "src/app/api/instagram/publish/route.ts",
  "src/app/api/facebook/publish/route.ts",
  "src/app/api/posts/reject/route.ts",
  "src/app/api/posts/bulk-reject/route.ts",
  "src/lib/publish/actions.ts"
];

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("official state writers", () => {
  it.each(officialCallers)("contains no direct status update in %s", (path) => {
    expect(source(path)).not.toMatch(/\.from\(["'](?:offers|posts)["']\)\s*\.update\(\s*\{[^}]*status\s*:/);
    expect(source(path)).not.toMatch(/\.from\(["'](?:offers|posts)["']\)\s*\.insert\(\s*\{[^}]*status\s*:\s*["'](?:selected|approved|posted|published)["']/);
  });

  it("routes curation, approval and publication through the official service", () => {
    expect(source("src/lib/offers/actions.ts")).toContain("transitionOfficialOfferState");
    expect(source("src/app/api/ai/generate/route.ts")).toContain("transitionOfficialOfferState");

    for (const path of officialCallers.filter((item) => item.includes("/publish/") && item.includes("/api/"))) {
      expect(source(path)).toContain("completeOfficialPublication");
    }
    expect(source("src/lib/state/official-publication-service.ts")).toContain("transitionOfficialPostState");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const officialClients = {
  "src/lib/inngest/functions.ts": ["generateOfficialAI", "publishOfficialPost"],
  "src/app/api/publish/extension/route.ts": ["generateOfficialAI"],
  "scripts/github-publish.ts": ["publishOfficialPost"],
  "scripts/publish-direct.ts": ["publishOfficialPost"],
  "scripts/publish-rest.ts": ["publishOfficialPost"]
} as const;

const blockedComponents = [
  "src/lib/publish/actions.ts",
  "src/app/api/scraper/cron/route.ts",
  "src/app/api/scraper/trends/route.ts",
  "src/app/api/scraper/import/route.ts",
  "src/app/api/instagram/poll-comments/route.ts"
] as const;

const readOnlyComponents = ["src/app/api/scraper/coupons/route.ts"] as const;
const parallelComponents = [...Object.keys(officialClients), ...blockedComponents, ...readOnlyComponents];

describe("PMAV5-009 parallel component subordination", () => {
  it.each(Object.entries(officialClients))("%s consumes only its official command boundary", (path, boundaries) => {
    const component = source(path);
    for (const boundary of boundaries) expect(component).toContain(boundary);
  });

  it.each(blockedComponents)("%s fails closed before legacy authority", (path) => {
    expect(source(path)).toContain("PARALLEL_COMPONENT_DISABLED");
  });

  it("coupon route delegates search and draft persistence without owning transport", () => {
    const component = source("src/app/api/scraper/coupons/route.ts");
    expect(component).toContain("fetchMarketplaceCoupons");
    expect(component).toContain("persistCouponDrafts");
    expect(component).not.toContain("PARALLEL_COMPONENT_DISABLED");
  });

  it.each(parallelComponents)("%s cannot write offer or post state or create posts", (path) => {
    const component = source(path);
    expect(component).not.toMatch(/\.from\(["']offers["']\)[\s\S]*?\.update\([\s\S]*?status\s*:/);
    expect(component).not.toMatch(/\.from\(["']posts["']\)[\s\S]*?\.(?:update|insert)\(/);
    expect(component).not.toMatch(/status\s*:\s*["'](?:selected|approved|posted|published|deleted)["']/);
  });

  it.each(parallelComponents)("%s cannot call AI providers directly", (path) => {
    const component = source(path);
    expect(component).not.toMatch(/api\.groq\.com|api\.cerebras\.ai|chat\/completions|LLMFactory|generateOfferAnalysis|callLLM/);
    expect(component).not.toMatch(/core\/ai\/providers\/|core\/llm\//);
  });

  it.each(parallelComponents)("%s cannot call publication transports directly", (path) => {
    const component = source(path);
    expect(component).not.toMatch(/sendTelegram(?:Message|Photo)|whatsappService|sendMedia\(|await\s+publish(?:Video)?To(?:Instagram|Facebook)|from\s+["'][^"']*(?:telegram|instagram|facebook)\/(?:client|index)/);
    expect(component).not.toMatch(/api\.telegram\.org|graph\.facebook\.com|media_publish/);
  });

  it("GitHub Actions delegates without content, media, database or transport authority", () => {
    const workflow = source(".github/workflows/publish-reel.yml");
    expect(workflow).toContain("scripts/github-publish.ts");
    expect(workflow).not.toMatch(/caption|imageUrl|productName|INSTAGRAM_ACCESS_TOKEN/);
  });

  it("keeps technical transports behind the official publication composition", () => {
    const composition = source("src/lib/publication/official/create-official-publication-service.ts");
    expect(composition).toMatch(/sendTelegramMessage/);
    expect(composition).toMatch(/whatsappService/);
    expect(composition).toMatch(/publishToInstagram/);
    expect(composition).toMatch(/publishToFacebook/);
  });

  it("removes Next.js and auxiliary jobs from Discovery authority", () => {
    for (const path of [
      "src/app/api/scraper/cron/route.ts",
      "src/app/api/scraper/trends/route.ts",
      "src/app/api/scraper/coupons/route.ts",
      "src/app/api/scraper/import/route.ts",
      "src/lib/inngest/functions.ts"
    ]) {
      expect(source(path)).not.toMatch(/discoverAndIngest|scrapeProductDetails|fetchShopeeCandidates|rankOffersBatch/);
    }
  });
});

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const containsRuntimeFile = (path: string) => {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return false;
  if (!statSync(absolute).isDirectory()) return true;
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .some((entry) => entry.isFile());
};

const REMOVED_RUNTIME_PATHS = [
  "scripts/ai-processor.cjs",
  "scripts/local-scraper.cjs",
  "scripts/crawlee_groq_test.cjs",
  "scripts/diagnose-cerebras-fallback.cjs",
  "scripts/test-extract.cjs",
  "scripts/backfill-approved-posts.cjs",
  "scripts/sanitize-posts-integrity.cjs",
  "scripts/panel-cleanup-apply.cjs",
  "scripts/create_drive_structure.gs",
  "scripts/legacy_tests",
  "scripts/archive",
  "tests/cerebras",
  "src/core/llm",
  "src/lib/publisher/index.ts",
  "src/lib/publish/automated.ts",
  "src/lib/publish/router.ts",
  "scripts/test-router.ts",
  "src/lib/ai/groq.ts",
  "src/lib/affiliates/scraper.ts",
  "src/lib/publish/scraper.ts",
  "src/lib/offers/curation-engine.ts",
  "src/lib/offers/score-v2.ts",
  "src/lib/offers/flags.ts",
  "src/tests/scraper.test.ts",
  "src/tests/publish-scraper.test.ts",
  "src/tests/score-v2.test.ts",
  "src/tests/score-v2-rank.test.ts",
  "scripts/validate-token-optimization.cjs",
  "scripts/test-marketplace-data-contracts.cjs",
  "scripts/test-amazon-discovery-v2.cjs",
  "scripts/test_new_scraper.ts",
  "scripts/fix_prompts.js",
  "scripts/test-mercadolivre-v5-runtime-cleanup.cjs",
  "scripts/check-images.cjs",
  "scripts/clear.ts",
  "scripts/crawlee_test.cjs",
  "scripts/diagnose-amazon-403.cjs",
  "scripts/diagnostico-final.js",
  "scripts/discovery-reporter.cjs",
  "scripts/fetch-posts.ts",
  "scripts/query.ts",
  "scripts/scraper-adapter.cjs",
  "scripts/test-ab.cjs",
  "scripts/test-amazon-groq.js",
  "scripts/test-amazon.js",
  "scripts/test-amz-mag.js",
  "scripts/test-api.js",
  "scripts/test-db.cjs",
  "scripts/test-evidence.js",
  "scripts/test-final-button.ts",
  "scripts/test-final.cjs",
  "scripts/test-ig-comment.mjs",
  "scripts/test-images.cjs",
  "scripts/test-instagram-reels.ts",
  "scripts/test-join.cjs",
  "scripts/test-links.cjs",
  "scripts/test-magalu.js",
  "scripts/test-ml.js",
  "scripts/test-regex.cjs",
  "scripts/test-shopee-identity-contract.cjs",
  "scripts/test-stealth.cjs",
  "scripts/test-token.mjs",
  "scripts/test-wa-image.cjs",
  "scripts/trigger-polling.js",
  "scripts/validate-http.ts",
  "scripts/validate-premium.ts",
] as const;

describe("PMAV5-010 legacy runtime removal", () => {
  it.each(REMOVED_RUNTIME_PATHS)("remove o runtime desconectado %s", (path) => {
    expect(containsRuntimeFile(path)).toBe(false);
  });

  it("mantém o Oracle Worker apenas com Discovery Native V5", () => {
    const worker = source("scripts/oracle-scraper.cjs");
    expect(worker).toContain("runDiscoveryOnlyCycle");
    expect(worker).toContain("executeShopeeNativeDiscoveryV5");
    expect(worker).toContain("runMercadoLivreNativeTop20");
    expect(worker).toContain("runAmazonNativeTop20");
    expect(worker).not.toMatch(/processTopOffers|pendingDrafts|cleanupOldDrafts|runScrapingCycleLegacy/);
    expect(worker).not.toMatch(/generateOfferAnalysis|callLLM|Groq|Cerebras/);
    expect(worker).not.toMatch(/runShopeeOfficialPipeline|fetchShopeeOfficialDiscovery|EPIC.?09/);
    expect(worker).not.toMatch(/runMarketplaceSelectionEngine|createMarketplaceCandidateQueue/);
    expect(worker).not.toMatch(/fetchAmazonDiscoveryV3|fetchShopeeDiscoveryV4|runShopeeV4DryRun/);
  });

  it("mantém tendência Shopee legada fail-closed e expõe apenas a consulta oficial por SKU", () => {
    const oracleApi = source("scripts/oracle-api.cjs");
    expect(oracleApi).not.toContain("runShopeeOfficialPipeline");
    expect(oracleApi).toMatch(/\/api\/shopee\/trends[\s\S]*LEGACY_ENDPOINT_DISABLED/);
    expect(oracleApi).toContain("lookupShopeeAffiliateProduct");
    expect(oracleApi).toContain("SHOPEE_PRODUCT_NOT_FOUND");
  });

  it("não mantém referências de entrypoint para runtimes removidos", () => {
    const entrypoints = [
      source("package.json"),
      source("vercel.json"),
      source(".github/workflows/publish-reel.yml"),
    ].join("\n");
    for (const path of REMOVED_RUNTIME_PATHS) expect(entrypoints).not.toContain(path);
  });
});

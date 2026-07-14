import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("publication legacy and parallel boundaries", () => {
  it("blocks the generic publisher fail-closed before every transport", () => {
    const publisher = source("src/lib/publisher/index.ts");
    expect(publisher).toContain("LEGACY_PUBLISHER_DISABLED");
    expect(publisher).not.toMatch(/sendTelegram|whatsappService|instagramService|facebookService|tiktokService/);
  });

  it("keeps quick publication actions fail-closed", () => {
    const actions = source("src/lib/publish/actions.ts");
    for (const route of ["/api/telegram/publish", "/api/whatsapp/publish", "/api/instagram/publish"]) {
      expect(actions).toContain(route);
    }
    expect(actions).not.toMatch(/from\s+["'][^"']*telegram\/client|whatsappService\.|publishToInstagram\(/);
  });

  it("keeps forbidden parallel executors outside all official routes", () => {
    const routes = ["telegram", "whatsapp", "instagram", "facebook"]
      .map((channel) => source(`src/app/api/${channel}/publish/route.ts`)).join("\n");
    expect(routes).not.toMatch(/@\/lib\/publisher|inngest|github-publish|repository_dispatch|publish-reel/);
  });

  it("keeps Official AI, Oracle Worker and Discovery outside publication authority", () => {
    expect(source("src/core/ai/official-ai-service.ts")).not.toMatch(/publishOfficialPost|PublicationTransport|\/publication\//);
    expect(source("scripts/oracle-worker-discovery-only.cjs")).not.toMatch(/publishOfficialPost|PublicationTransport/);
    expect(source("src/core/scraper/product-validator.ts")).not.toMatch(/publishOfficialPost|PublicationTransport/);
  });

  it("does not use processing as official business state", () => {
    const official = [
      "src/core/publication/types.ts",
      "src/core/publication/official-publication-service.ts",
      "src/lib/publication/official/supabase-official-publication-adapter.ts"
    ].map(source).join("\n");
    expect(official).not.toMatch(/state:\s*["']processing["']|status:\s*["']processing["']/);
  });
});

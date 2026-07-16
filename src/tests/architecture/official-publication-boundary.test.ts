import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const routePaths = ["telegram", "whatsapp", "instagram", "facebook"].map(
  (channel) => `src/app/api/${channel}/publish/route.ts`
);

describe("official publication architectural boundary", () => {
  it("approves through State Service and Official AI before any channel publication route", () => {
    const routePath = "src/app/api/publication/approve/route.ts";
    const compositionPath = "src/lib/publication/official/create-official-publication-approval.ts";
    expect(existsSync(resolve(process.cwd(), routePath))).toBe(true);
    expect(existsSync(resolve(process.cwd(), compositionPath))).toBe(true);
    const route = source(routePath);
    const composition = source(compositionPath);
    expect(route).toContain("approveOfficialOfferForPublication(");
    expect(route).not.toContain("publishOfficialPost(");
    expect(composition).toContain("transitionOfficialOfferState(");
    expect(composition).toContain("generateOfficialAI(");
  });

  it.each(routePaths)("%s calls only the Official Publication Service", (path) => {
    const route = source(path);
    expect(route).toContain("publishOfficialPost(");
    expect(route).toContain("createOfficialPublicationServiceDependencies");
    expect(route).not.toMatch(/completeOfficialPublication|sendTelegram|whatsappService|publishToInstagram|publishToFacebook|PublicationTransport/);
    expect(route).not.toMatch(/\.from\(|\.update\(|\.insert\(|prepareOfferForPublication/);
    expect(route).not.toMatch(/\bcontent\b|auto.?select|auto.?approve|processing/i);
  });

  it("keeps asynchronous Instagram and GitHub execution outside the official route", () => {
    const route = source("src/app/api/instagram/publish/route.ts");
    expect(route).not.toMatch(/github|workflow|repository_dispatch|processing|inngest/i);
  });

  it("keeps concrete official transports importable only by the server composition", () => {
    const productionFiles = [
      ...routePaths,
      "src/lib/publication/official/supabase-official-publication-adapter.ts",
      "src/core/publication/official-publication-service.ts"
    ];
    for (const path of productionFiles) {
      expect(source(path)).not.toMatch(/core\/publication\/transports\//);
    }
  });

  it.each([
    "src/components/telegram/telegram-actions.tsx",
    "src/components/whatsapp/whatsapp-actions.tsx",
    "src/components/instagram/instagram-actions.tsx"
  ])("%s sends identity but never arbitrary publication content", (path) => {
    const caller = source(path);
    expect(caller).toContain("offerId: post.offers.id");
    expect(caller).not.toMatch(/postId:\s*post\.id,\s*content:/);
  });

  it("has no production caller of the transitional PMAV5-006 completion service", () => {
    const routes = routePaths.map(source).join("\n");
    expect(routes).not.toContain("@/lib/state/official-publication-service");
    expect(routes).not.toContain("completeOfficialPublication");
  });

  it("removes the transitional completion service so publishOfficialPost is the only public orchestrator", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/state/official-publication-service.ts"))).toBe(false);
  });
});

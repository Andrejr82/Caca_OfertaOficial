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
  it.each(officialCallers)("contains no direct promotional status write in %s", (path) => {
    expect(source(path)).not.toMatch(/\.from\(["'](?:offers|posts)["']\)\s*\.update\(\s*\{[^}]*status\s*:\s*["'](?:selected|approved|posted|published)["']/);
    expect(source(path)).not.toMatch(/\.from\(["'](?:offers|posts)["']\)\s*\.insert\(\s*\{[^}]*status\s*:\s*["'](?:selected|approved|posted|published)["']/);
  });

  it("keeps panel rejection as the historical post-only soft delete", () => {
    for (const path of ["src/app/api/posts/reject/route.ts", "src/app/api/posts/bulk-reject/route.ts"]) {
      const route = source(path);
      expect(route).toMatch(/\.from\(["']posts["']\)\s*\.update\(\s*\{[^}]*status\s*:\s*["']deleted["']/);
      expect(route).not.toContain("publishOfficialPost");
      expect(route).not.toContain("transitionOfficialPostState");
    }
  });

  it.each(["whatsapp", "telegram", "instagram"])("keeps deleted posts out of the %s panel query", (channel) => {
    const page = source(`src/app/(dashboard)/${channel}/page.tsx`);
    expect(page).toContain(`.eq("channel", "${channel}")`);
    expect(page).toContain('.eq("status", "draft")');
  });

  it("routes curation, approval and publication through the official service", () => {
    expect(source("src/lib/offers/actions.ts")).toContain("transitionOfficialOfferState");
    expect(source("src/app/api/ai/generate/route.ts")).toContain("generateOfficialAI");
    expect(source("src/lib/ai/official/supabase-official-ai-adapter.ts")).toContain("transitionOfficialOfferState");

    for (const path of officialCallers.filter((item) => item.includes("/publish/") && item.includes("/api/"))) {
      expect(source(path)).toContain("publishOfficialPost");
    }
    const publicationStateAdapter = source("src/lib/publication/official/supabase-official-publication-adapter.ts");
    expect(publicationStateAdapter).toContain("transitionOfficialPostState");
    expect(publicationStateAdapter).toContain("transitionOfficialOfferState");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Instagram Story Engine V5 integration", () => {
  it("routes Story PNG generation through the V5 plan and renderer", () => {
    const route = source("src/app/api/images/instagram-story/route.ts");
    expect(route).toContain("buildStoryV5Plan");
    expect(route).toContain("buildStoryV5FrameModel");
    expect(route).toContain("renderStoryV5Frame");
    expect(route).not.toContain("parseFrame(");
  });

  it("renders only the frame buttons declared by the V5 plan", () => {
    const page = source("src/app/(dashboard)/instagram/page.tsx");
    expect(page).toContain("Array.from({ length: plan.frameCount }");
    expect(page).toContain("plan.template");
    expect(page).not.toContain("{[1, 2, 3].map");
  });

  it("keeps the real tracked link as the manual Instagram sticker destination", () => {
    const page = source("src/app/(dashboard)/instagram/page.tsx");
    expect(page).toContain("post.affiliate_links?.tracked_url");
    expect(page).toContain("No último Story, adicione o sticker");
  });
});

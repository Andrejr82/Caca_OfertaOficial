import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stories manual direct publishing architecture", () => {
  it("usa seletor único e não renderiza a grade legada de drafts", () => {
    const page = read("src/app/(dashboard)/stories/page.tsx");
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    expect(page).toContain("getBrazilVideoOfferCutoff");
    expect(page).toContain("<StoriesClient");
    expect(client).toContain("selectedOfferId");
    expect(client).toContain("Produto do dia");
    expect(page).not.toContain("drafts.map");
  });

  it("publica somente após ação explícita do operador", () => {
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    expect(client).toContain('fetch("/api/stories/publish"');
    expect(client).toContain("onClick={publish}");
    expect(client).not.toMatch(/useEffect\([^)]*publish/isu);
  });

  it("endpoint exige autenticação, draft do usuário, link rastreado e recibo anti-duplicidade", () => {
    const route = read("src/app/api/stories/publish/route.ts");
    expect(route).toContain("auth.getUser");
    expect(route).toContain('.eq("user_id", user.id)');
    expect(route).toContain('.eq("status", "draft")');
    expect(route).toContain("tracked_url");
    expect(route).toContain("STORY_ALREADY_PUBLISHED");
    expect(route).toContain("app_settings");
  });

  it("mantém download como fallback e fornece JPEG público para ingestão Meta", () => {
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    const image = read("src/app/api/images/story-creative/route.ts");
    expect(client).toContain("download=1");
    expect(image).toContain('searchParams.get("meta") === "1"');
    expect(image).toContain("image/jpeg");
    expect(image).toContain("public, max-age=300");
  });
});

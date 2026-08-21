import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stories manual direct publishing architecture", () => {
  it("usa seletor único de ofertas do ciclo e não depende de drafts por canal", () => {
    const page = read("src/app/(dashboard)/stories/page.tsx");
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    expect(page).toContain("getBrazilVideoOfferCutoff");
    expect(page).toContain("affiliate_links");
    expect(page).not.toContain('.from("posts")');
    expect(client).toContain("selectedOfferId");
    expect(client).toContain("Produto do dia");
    expect(client).not.toContain("drafts:");
  });

  it("publica somente após ação explícita do operador e envia offerId", () => {
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    expect(client).toContain('fetch("/api/stories/publish"');
    expect(client).toContain("offerId: selected.offerId");
    expect(client).toContain("onClick={publish}");
    expect(client).not.toMatch(/useEffect\([^)]*publish/isu);
  });

  it("endpoint exige autenticação, ownership da oferta, link rastreado e recibo por oferta/canal", () => {
    const route = read("src/app/api/stories/publish/route.ts");
    expect(route).toContain("auth.getUser");
    expect(route).toContain('.from("offers")');
    expect(route).toContain('.from("affiliate_links")');
    expect(route).toContain('.eq("user_id", user.id)');
    expect(route).toContain("tracked_url");
    expect(route).toContain("receiptKey(offerId, channel, frame)");
    expect(route).toContain("STORY_ALREADY_PUBLISHED");
    expect(route).not.toContain('.eq("status", "draft")');
  });

  it("mantém download como fallback e fornece JPEG público para ingestão Meta", () => {
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    const image = read("src/app/api/images/story-creative/route.ts");
    expect(client).toContain("download=1");
    expect(image).toContain('searchParams.get("offerId")');
    expect(image).toContain('searchParams.get("channel")');
    expect(image).toContain('searchParams.get("meta") === "1"');
    expect(image).toContain("image/jpeg");
    expect(image).toContain("public, max-age=300");
  });
});

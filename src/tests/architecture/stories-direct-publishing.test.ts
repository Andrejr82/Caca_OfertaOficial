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

  it("normaliza imagens remotas inclusive WebP antes do ImageResponse", () => {
    const image = read("src/app/api/images/story-creative/route.ts");
    expect(image).toContain("normalizeRemoteImageForStory");
    expect(image).toContain("sharp(source)");
    expect(image).toContain(".jpeg({ quality: 92, mozjpeg: true })");
    expect(image).toContain("data:image/jpeg;base64");
    expect(image).toContain("STORY_IMAGE_NORMALIZATION_FAILED");
    expect(image).toContain("MAX_REMOTE_IMAGE_BYTES");
  });

  it("mantém download como fallback, fornece JPEG à Meta e mostra erro de preview ao operador", () => {
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    const image = read("src/app/api/images/story-creative/route.ts");
    expect(client).toContain("download=1");
    expect(client).toContain("previewError");
    expect(client).toContain("explainPreviewFailure");
    expect(client).toContain("Falha ao gerar preview");
    expect(client).toContain("onError={() => void explainPreviewFailure()}");
    expect(image).toContain('searchParams.get("offerId")');
    expect(image).toContain('searchParams.get("channel")');
    expect(image).toContain('searchParams.get("meta") === "1"');
    expect(image).toContain("image/jpeg");
    expect(image).toContain("public, max-age=300");
  });
});

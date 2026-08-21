import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stories showcase conversion", () => {
  it("remove CTA morto e usa conversão pelo perfil", () => {
    const renderer = read("src/lib/social/story-commercial-renderer.ts");
    expect(renderer).toContain("ACHADINHO DO DIA");
    expect(renderer).toContain("OFERTA NO LINK DA BIO");
    expect(renderer).toContain("OFERTA NO LINK DO PERFIL");
    expect(renderer).not.toContain("VER OFERTA 👇");
  });

  it("mantém hierarquia comercial De/Por em linhas independentes", () => {
    const renderer = read("src/lib/social/story-commercial-renderer.ts");
    expect(renderer).toContain("`De ${model.originalPrice}`");
    expect(renderer).toContain("`Por ${model.price}`");
  });

  it("faz Story publicado no Instagram entrar automaticamente na vitrine", () => {
    const bio = read("src/app/bio/page.tsx");
    expect(bio).toContain('stories.publication.receipt.instagram.%');
    expect(bio).toContain("receiptMap");
    expect(bio).toContain("dedupeByOffer");
    expect(bio).toContain('.eq("channel", "instagram")');
  });

  it("não consome o draft do feed apenas para alimentar a vitrine", () => {
    const route = read("src/app/api/stories/publish/route.ts");
    expect(route).toContain("stories.publication.receipt.");
    expect(route).not.toContain('.update({ status: "published"');
  });

  it("informa no painel que a vitrine é sincronizada após publicação", () => {
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    expect(client).toContain("entra na vitrine automaticamente");
  });
});

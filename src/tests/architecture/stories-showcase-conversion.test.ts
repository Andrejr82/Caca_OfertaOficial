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

  it("faz Story publicado no Instagram entrar na vitrine diretamente pelo receipt da oferta", () => {
    const bio = read("src/app/bio/page.tsx");
    expect(bio).toContain('stories.publication.receipt.instagram.%');
    expect(bio).toContain("affiliateLinkId");
    expect(bio).toContain("offerId");
    expect(bio).toContain("dedupeByOffer");
    expect(bio).toContain('.from("offers")');
    expect(bio).toContain('.from("affiliate_links")');
  });

  it("não altera status de draft/feed ao publicar Story", () => {
    const route = read("src/app/api/stories/publish/route.ts");
    expect(route).toContain("stories.publication.receipt.");
    expect(route).not.toContain('.from("posts")');
    expect(route).not.toContain('.update({ status: "published"');
  });

  it("mantém a oferta disponível para publicar nas duas redes de forma independente", () => {
    const page = read("src/app/(dashboard)/stories/page.tsx");
    const client = read("src/app/(dashboard)/stories/StoriesClient.tsx");
    expect(page).not.toContain('.eq("status", "draft")');
    expect(client).toContain("cada rede de forma independente");
    expect(client).toContain("A oferta continua disponível para publicar também no Instagram");
  });
});

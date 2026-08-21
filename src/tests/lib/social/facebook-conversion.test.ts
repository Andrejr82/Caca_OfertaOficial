import { describe, expect, it } from "vitest";
import { buildFacebookConversionV4, FACEBOOK_CONVERSION_V4_MAX_FEED_BLOCKS } from "@/lib/social/facebook-conversion";

const jiesipote = {
  productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  category: "Calçados, Roupas e Bolsas",
  currentPrice: 88,
  originalPrice: 269,
  freeShipping: null,
  evidence: {
    mercadolivre_highlights: "BEST_SELLER pos #14",
  },
};

describe("Facebook conversion — V5 authority", () => {
  it("mantém preço, atributos e prova no feed e deixa o tracked URL apenas no primeiro comentário", () => {
    const url = "https://caca-oferta-oficial.vercel.app/go/fb_jiesipote";
    const result = buildFacebookConversionV4(jiesipote, url);

    const offer = result.feed.indexOf("R$ 88,00");
    const attributes = result.feed.indexOf("À prova d'água");
    const proof = result.feed.indexOf("Top #14");

    expect(offer).toBeGreaterThan(-1);
    expect(attributes).toBeGreaterThan(offer);
    expect(proof).toBeGreaterThan(attributes);
    expect(result.feed).toContain("Link da oferta no primeiro comentário");
    expect(result.feed).not.toContain("https://");
    expect(result.firstComment).toBe(`👉 Link da oferta: ${url}`);
    expect(result.firstComment.match(/https:\/\//gu)).toHaveLength(1);
  });

  it("mantém feed curto, factual e com uma única orientação de ação", () => {
    const result = buildFacebookConversionV4(jiesipote, "https://caca-oferta-oficial.vercel.app/go/fb_jiesipote");
    const blocks = result.feed.split("\n\n");

    expect(blocks.length).toBeLessThanOrEqual(FACEBOOK_CONVERSION_V4_MAX_FEED_BLOCKS);
    expect(result.feed.match(/primeiro comentário/giu)).toHaveLength(1);
    expect(result.feed).not.toMatch(/link na bio|link abaixo/iu);
    expect(result.feed).not.toMatch(/últimas unidades|só hoje|corre que|antes que o preço suba/iu);
  });

  it("não inventa prova quando há pouca evidência", () => {
    const result = buildFacebookConversionV4({
      productName: "Fone Bluetooth Recarregável",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    }, "https://caca-oferta-oficial.vercel.app/go/fb_fone");

    expect(result.feed).toContain("R$ 59,90");
    expect(result.feed).not.toMatch(/Top #|mais vendidos|Loja oficial|Mall/iu);
    expect(result.firstComment).toContain("👉 Link da oferta:");
  });

  it("inclui frete somente quando confirmado", () => {
    const withShipping = buildFacebookConversionV4({ ...jiesipote, freeShipping: true }, "https://caca-oferta-oficial.vercel.app/go/fb_ship");
    const withoutShipping = buildFacebookConversionV4({ ...jiesipote, freeShipping: null }, "https://caca-oferta-oficial.vercel.app/go/fb_no_ship");

    expect(withShipping.feed).toContain("📦 Frete grátis");
    expect(withoutShipping.feed).not.toContain("Frete grátis");
  });

  it("falha fechado para tracked URL inválido ou não HTTPS", () => {
    expect(() => buildFacebookConversionV4(jiesipote, "http://example.com/go/x")).toThrow(/HTTPS/iu);
    expect(() => buildFacebookConversionV4(jiesipote, "nao-e-url")).toThrow(/valid tracked URL/iu);
  });
});

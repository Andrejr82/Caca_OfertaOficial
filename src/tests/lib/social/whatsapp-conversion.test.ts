import { describe, expect, it } from "vitest";
import { buildWhatsAppConversionV4, WHATSAPP_CONVERSION_V4_MAX_BLOCKS } from "@/lib/social/whatsapp-conversion";

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

describe("WhatsApp conversion — V5 authority", () => {
  it("coloca produto com preço, atributos, prova e CTA com link direto", () => {
    const url = "https://caca-oferta-oficial.vercel.app/go/wp_jiesipote";
    const copy = buildWhatsAppConversionV4(jiesipote, url);

    const offer = copy.indexOf("R$ 88,00");
    const attributes = copy.indexOf("À prova d'água");
    const proof = copy.indexOf("Top #14");

    expect(offer).toBeGreaterThan(-1);
    expect(attributes).toBeGreaterThan(offer);
    expect(proof).toBeGreaterThan(attributes);
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
    expect(copy).toContain(`👉 Ver no Mercado Livre:\n${url}`);
  });

  it("mantém mensagem curta, sem hashtags, catálogo ou falsa urgência", () => {
    const copy = buildWhatsAppConversionV4(jiesipote, "https://caca-oferta-oficial.vercel.app/go/wp_jiesipote");
    const blocks = copy.split("\n\n");

    expect(blocks.length).toBeLessThanOrEqual(WHATSAPP_CONVERSION_V4_MAX_BLOCKS);
    expect(copy).not.toMatch(/#\p{L}[\p{L}\p{N}_]*/u);
    expect(copy).not.toMatch(/oferta em destaque|link abaixo/iu);
    expect(copy).not.toMatch(/últimas unidades|só hoje|corre que|antes que o preço suba/iu);
  });

  it("não inventa prova quando não existe e mantém preço + ação como núcleo", () => {
    const copy = buildWhatsAppConversionV4({
      productName: "Fone Bluetooth Recarregável",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    }, "https://caca-oferta-oficial.vercel.app/go/wp_fone");

    expect(copy).toContain("R$ 59,90");
    expect(copy).toContain("👉 Ver na Shopee:");
    expect(copy).not.toMatch(/mais vendidos|Top #|Loja oficial|Mall/iu);
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
  });

  it("falha fechado para link rastreado inválido ou não HTTPS", () => {
    expect(() => buildWhatsAppConversionV4(jiesipote, "http://example.com/go/x")).toThrow(/HTTPS/iu);
    expect(() => buildWhatsAppConversionV4(jiesipote, "nao-e-url")).toThrow(/valid tracked URL/iu);
  });
});

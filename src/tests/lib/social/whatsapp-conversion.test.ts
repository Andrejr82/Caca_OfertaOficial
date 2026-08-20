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

describe("Task 3 — WhatsApp Conversion V4", () => {
  it("coloca prova e preço antes do benefício e termina em CTA único com link direto", () => {
    const url = "https://caca-oferta-oficial.vercel.app/go/wp_jiesipote";
    const copy = buildWhatsAppConversionV4(jiesipote, url);

    const proof = copy.indexOf("Top #14");
    const offer = copy.indexOf("R$ 88,00");
    const benefit = copy.indexOf("Proteção contra água");

    expect(proof).toBeGreaterThan(-1);
    expect(offer).toBeGreaterThan(proof);
    expect(benefit).toBeGreaterThan(offer);
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
    expect(copy.match(/Conferir o preço atual/gu)).toHaveLength(1);
    expect(copy).toContain(`👉 Conferir o preço atual: ${url}`);
  });

  it("mantém mensagem curta, sem hashtags, catálogo ou falsa urgência", () => {
    const copy = buildWhatsAppConversionV4(jiesipote, "https://caca-oferta-oficial.vercel.app/go/wp_jiesipote");
    const blocks = copy.split("\n\n");

    expect(blocks.length).toBeLessThanOrEqual(WHATSAPP_CONVERSION_V4_MAX_BLOCKS);
    expect(copy).not.toMatch(/#\w+/u);
    expect(copy).not.toMatch(/Veja a oferta|oferta em destaque|link abaixo/iu);
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
    expect(copy).toContain("Conferir o preço atual");
    expect(copy).not.toMatch(/mais vendidos|Top #|Loja oficial|Mall/iu);
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
  });

  it("falha fechado para link rastreado inválido ou não HTTPS", () => {
    expect(() => buildWhatsAppConversionV4(jiesipote, "http://example.com/go/x")).toThrow(/HTTPS/iu);
    expect(() => buildWhatsAppConversionV4(jiesipote, "nao-e-url")).toThrow(/valid tracked URL/iu);
  });
});

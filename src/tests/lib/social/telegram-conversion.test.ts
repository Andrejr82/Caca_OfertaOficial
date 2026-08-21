import { describe, expect, it } from "vitest";
import { buildTelegramConversionV4, TELEGRAM_CONVERSION_V4_MAX_BLOCKS } from "@/lib/social/telegram-conversion";

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

describe("Task 5 — Telegram Conversion V4", () => {
  it("renderiza alerta curto com preço na abertura, atributos, prova e CTA", () => {
    const url = "https://caca-oferta-oficial.vercel.app/go/tg_jiesipote";
    const copy = buildTelegramConversionV4(jiesipote, url);

    const offer = copy.indexOf("R$ 88,00");
    const attributes = copy.indexOf("À prova d'água");
    const proof = copy.indexOf("Top #14");

    expect(offer).toBeGreaterThan(-1);
    expect(attributes).toBeGreaterThan(offer);
    expect(proof).toBeGreaterThan(attributes);
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
    expect(copy).toContain(`👉 Achado no Mercado Livre:\n${url}`);
  });

  it("mantém formato escaneável e sem ruído de catálogo", () => {
    const copy = buildTelegramConversionV4(jiesipote, "https://caca-oferta-oficial.vercel.app/go/tg_jiesipote");
    const blocks = copy.split("\n\n");

    expect(blocks.length).toBeLessThanOrEqual(TELEGRAM_CONVERSION_V4_MAX_BLOCKS);
    expect(copy).not.toMatch(/#\p{L}[\p{L}\p{N}_]*/u);
    expect(copy).not.toMatch(/Veja a oferta|link abaixo|oferta em destaque/iu);
    expect(copy).not.toMatch(/últimas unidades|só hoje|corre que|antes que o preço suba/iu);
  });

  it("não inventa prova e mantém preço + ação quando há pouca evidência", () => {
    const copy = buildTelegramConversionV4({
      productName: "Fone Bluetooth Recarregável",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    }, "https://caca-oferta-oficial.vercel.app/go/tg_fone");

    expect(copy).toContain("R$ 59,90");
    expect(copy).toContain("👉 Achado na Shopee:");
    expect(copy).not.toMatch(/Top #|mais vendidos|Loja oficial|Mall/iu);
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
  });

  it("inclui frete somente quando confirmado", () => {
    const withShipping = buildTelegramConversionV4({ ...jiesipote, freeShipping: true }, "https://caca-oferta-oficial.vercel.app/go/tg_ship");
    const withoutShipping = buildTelegramConversionV4({ ...jiesipote, freeShipping: null }, "https://caca-oferta-oficial.vercel.app/go/tg_no_ship");

    expect(withShipping).toContain("📦 Frete grátis");
    expect(withoutShipping).not.toContain("Frete grátis");
  });

  it("falha fechado para tracked URL inválido ou não HTTPS", () => {
    expect(() => buildTelegramConversionV4(jiesipote, "http://example.com/go/x")).toThrow(/HTTPS/iu);
    expect(() => buildTelegramConversionV4(jiesipote, "nao-e-url")).toThrow(/valid tracked URL/iu);
  });
});

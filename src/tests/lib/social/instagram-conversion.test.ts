import { describe, expect, it } from "vitest";
import { buildInstagramConversionV4Plan, buildInstagramConversionV5Plan } from "@/lib/social/instagram-conversion";

const jiesipote = {
  productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  category: "Calçados, Roupas e Bolsas",
  currentPrice: 88,
  originalPrice: 269,
  evidence: {
    mercadolivre_highlights: "BEST_SELLER pos #14",
  },
};

describe("Instagram V5 conversion plan", () => {
  it("monta Reel de 13s com beats factuais e sem URL direta", () => {
    const plan = buildInstagramConversionV5Plan(jiesipote);

    expect(plan.reelBeats).toEqual([
      expect.objectContaining({ startSecond: 0, endSecond: 2, purpose: "hook" }),
      expect.objectContaining({ startSecond: 2, endSecond: 6, purpose: "proof_benefit" }),
      expect.objectContaining({ startSecond: 6, endSecond: 10, purpose: "offer" }),
      expect.objectContaining({ startSecond: 10, endSecond: 13, purpose: "action" }),
    ]);
    expect(plan.reelBeats[2].text).toContain("De R$ 269,00\nPor R$ 88,00");
    expect(plan.reelBeats[2].text).not.toMatch(/De\s+R\$[^\n]+\s+por\s+R\$/iu);
    expect(plan.reelBeats[3].text).toBe("Confira a oferta no link do perfil.");
    expect(plan.reelBeats.map((beat) => beat.text).join(" ")).not.toMatch(/https?:\/\//u);
  });

  it("usa apenas atributos/prova factuais e não inventa urgência", () => {
    const plan = buildInstagramConversionV5Plan({
      productName: "Fone Bluetooth Recarregável",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    });

    expect(plan.reelBeats[1].text).toMatch(/Bluetooth|recarregável|Fone/iu);
    expect(plan.reelBeats.map((beat) => beat.text).join(" ")).not.toMatch(/últimas unidades|só hoje|corre que|estoque acabando/iu);
  });

  it("mantém alias V4 somente por compatibilidade, delegando integralmente à V5", () => {
    expect(buildInstagramConversionV4Plan(jiesipote)).toEqual(buildInstagramConversionV5Plan(jiesipote));
  });

  it("não mantém contrato de cards estáticos de Stories", () => {
    const plan = buildInstagramConversionV5Plan(jiesipote) as unknown as Record<string, unknown>;
    expect(plan).not.toHaveProperty("storyFrames");
    expect(JSON.stringify(plan)).not.toMatch(/sticker|TELA [123]\/3|STORIES V4/iu);
  });
});

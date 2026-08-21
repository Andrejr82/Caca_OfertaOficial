import { describe, expect, it } from "vitest";
import { buildInstagramConversionV4Plan } from "@/lib/social/instagram-conversion";

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

describe("Instagram Reels conversion plan", () => {
  it("monta Reel de 13s com hook, prova, oferta e ação sem URL direta", () => {
    const plan = buildInstagramConversionV4Plan(jiesipote);

    expect(plan.reelBeats).toEqual([
      expect.objectContaining({ startSecond: 0, endSecond: 2, purpose: "hook" }),
      expect.objectContaining({ startSecond: 2, endSecond: 6, purpose: "proof_benefit" }),
      expect.objectContaining({ startSecond: 6, endSecond: 10, purpose: "offer" }),
      expect.objectContaining({ startSecond: 10, endSecond: 13, purpose: "action" }),
    ]);
    expect(plan.reelBeats[1].text).toContain("Top #14");
    expect(plan.reelBeats[2].text).toContain("R$ 88,00");
    expect(plan.reelBeats[3].text).toBe("Confira a oferta no link do perfil.");
    expect(plan.reelBeats.map((beat) => beat.text).join(" ")).not.toMatch(/https?:\/\//u);
  });

  it("usa benefício factual quando não há prova social e não inventa urgência", () => {
    const plan = buildInstagramConversionV4Plan({
      productName: "Fone Bluetooth Recarregável",
      marketplace: "Shopee",
      category: "Eletrônicos",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    });

    expect(plan.reelBeats[1].text).toMatch(/Bluetooth|recarregável/iu);
    expect(plan.reelBeats.map((beat) => beat.text).join(" ")).not.toMatch(/últimas unidades|só hoje|corre que|antes que o preço suba/iu);
  });

  it("não mantém contrato de cards estáticos de Stories", () => {
    const plan = buildInstagramConversionV4Plan(jiesipote) as unknown as Record<string, unknown>;
    expect(plan).not.toHaveProperty("storyFrames");
    expect(JSON.stringify(plan)).not.toMatch(/sticker|TELA [123]\/3|STORIES V4/iu);
  });
});

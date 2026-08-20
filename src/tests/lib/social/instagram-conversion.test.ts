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

describe("Task 4 — Instagram Stories + Reels", () => {
  it("monta Stories em 3 telas: hook, prova+preço e ação única com link rastreado", () => {
    const url = "https://caca-oferta-oficial.vercel.app/go/ig_story_jiesipote";
    const plan = buildInstagramConversionV4Plan(jiesipote, url);

    expect(plan.storyFrames).toHaveLength(3);
    expect(plan.storyFrames[0]).toMatchObject({ frame: 1, purpose: "hook" });
    expect(plan.storyFrames[1].text).toContain("Top #14");
    expect(plan.storyFrames[1].text).toContain("R$ 88,00");
    expect(plan.storyFrames[2]).toMatchObject({
      frame: 3,
      purpose: "action",
      text: "Conferir o preço atual",
      linkStickerLabel: "Ver preço atual",
      trackedUrl: url,
    });
    expect(plan.storyFrames.filter((frame) => frame.trackedUrl)).toHaveLength(1);
  });

  it("monta Reel de 13s com hook em 0-2s, prova, oferta e uma ação sem URL direta", () => {
    const plan = buildInstagramConversionV4Plan(jiesipote, "https://caca-oferta-oficial.vercel.app/go/ig_story_jiesipote");

    expect(plan.reelBeats).toEqual([
      expect.objectContaining({ startSecond: 0, endSecond: 2, purpose: "hook" }),
      expect.objectContaining({ startSecond: 2, endSecond: 6, purpose: "proof_benefit" }),
      expect.objectContaining({ startSecond: 6, endSecond: 10, purpose: "offer" }),
      expect.objectContaining({ startSecond: 10, endSecond: 13, purpose: "action" }),
    ]);
    expect(plan.reelBeats[1].text).toContain("Top #14");
    expect(plan.reelBeats[2].text).toContain("R$ 88,00");
    expect(plan.reelBeats[3].text).toBe("Conferir o preço atual nos Stories.");
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
    }, "https://caca-oferta-oficial.vercel.app/go/ig_story_fone");

    expect(plan.reelBeats[1].text).toMatch(/Bluetooth|recarregável/iu);
    expect(plan.reelBeats.map((beat) => beat.text).join(" ")).not.toMatch(/últimas unidades|só hoje|corre que|antes que o preço suba/iu);
    expect(plan.storyFrames.map((frame) => frame.text).join(" ")).not.toMatch(/mais vendidos|Top #|Loja oficial|Mall/iu);
  });

  it("falha fechado para destino de Story inválido ou não HTTPS", () => {
    expect(() => buildInstagramConversionV4Plan(jiesipote, "http://example.com/go/x")).toThrow(/HTTPS/iu);
    expect(() => buildInstagramConversionV4Plan(jiesipote, "nao-e-url")).toThrow(/valid tracked URL/iu);
  });
});

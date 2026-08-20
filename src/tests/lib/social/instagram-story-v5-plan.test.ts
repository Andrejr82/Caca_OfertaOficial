import { describe, expect, it } from "vitest";
import { buildStoryV5Plan } from "@/lib/social/instagram-story-v5";

describe("Instagram Story Engine V5 plan", () => {
  it("classifies a strong verified discount as DISCOUNT_HERO", () => {
    const plan = buildStoryV5Plan({
      productName: "Mochila Jiesipote À Prova D’água Reforçada Expansível Cor Preto",
      shortName: "Mochila Jiesipote impermeável",
      marketplace: "Mercado Livre",
      category: "Mochilas",
      currentPrice: 79.9,
      originalPrice: 269,
      freeShipping: null,
      evidence: {},
    });

    expect(plan.template).toBe("DISCOUNT_HERO");
    expect(plan.commercialTitle).toBe("Mochila Jiesipote impermeável");
    expect(plan.discountPercent).toBe(70);
    expect(plan.savings).toBeCloseTo(189.1, 2);
    expect(plan.frameCount).toBe(2);
    expect(plan.reinforcements).toEqual(["discount"]);
  });

  it("prefers PROOF_HERO when there is strong proof but no strong discount", () => {
    const plan = buildStoryV5Plan({
      productName: "Fone Bluetooth sem fio",
      marketplace: "Shopee",
      category: "Áudio",
      currentPrice: 129.9,
      originalPrice: 139.9,
      freeShipping: false,
      evidence: { rating: 4.8, official_store: true },
    });

    expect(plan.template).toBe("PROOF_HERO");
    expect(plan.proof).not.toBeNull();
    expect(plan.reinforcements).toEqual(["proof"]);
    expect(plan.frameCount).toBe(2);
  });

  it("uses PRICE_HERO and one frame when price is the only usable commercial fact", () => {
    const plan = buildStoryV5Plan({
      productName: "Mesa de Jantar Bellagio Freijó Retangular para 4 Lugares Tampo MDF - Blue Moby",
      marketplace: "Shopee",
      category: "Casa",
      currentPrice: 231.54,
      originalPrice: null,
      freeShipping: null,
      evidence: {},
    });

    expect(plan.template).toBe("PRICE_HERO");
    expect(plan.frameCount).toBe(1);
    expect(plan.reinforcements).toEqual([]);
    expect(plan.commercialTitle.length).toBeLessThanOrEqual(52);
  });

  it("uses three frames only when at least two distinct reinforcements exist", () => {
    const plan = buildStoryV5Plan({
      productName: "Smartwatch AMOLED",
      marketplace: "Mercado Livre",
      category: "Wearables",
      currentPrice: 199.9,
      originalPrice: 299.9,
      freeShipping: true,
      evidence: { rating: 4.8 },
    });

    expect(plan.template).toBe("DISCOUNT_HERO");
    expect(plan.reinforcements).toEqual(["discount", "proof", "free_shipping"]);
    expect(plan.frameCount).toBe(3);
  });

  it("does not invent discount from invalid previous price", () => {
    const plan = buildStoryV5Plan({
      productName: "Produto",
      marketplace: "Shopee",
      category: null,
      currentPrice: 100,
      originalPrice: 90,
      freeShipping: null,
      evidence: {},
    });

    expect(plan.template).toBe("PRICE_HERO");
    expect(plan.discountPercent).toBeNull();
    expect(plan.savings).toBeNull();
    expect(plan.reinforcements).toEqual([]);
  });

  it("ignores weak rating evidence below the proof threshold", () => {
    const plan = buildStoryV5Plan({
      productName: "Produto",
      marketplace: "Shopee",
      category: null,
      currentPrice: 89.9,
      originalPrice: null,
      freeShipping: null,
      evidence: { rating: 3.7 },
    });

    expect(plan.proof).toBeNull();
    expect(plan.template).toBe("PRICE_HERO");
    expect(plan.frameCount).toBe(1);
  });
});

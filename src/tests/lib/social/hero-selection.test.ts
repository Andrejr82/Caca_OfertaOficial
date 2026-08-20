import { describe, expect, it } from "vitest";
import { classifySocialOffer, selectSocialHeroOffers } from "@/lib/social/hero-selection";

const backpack = {
  id: "mlb-jiesipote",
  productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  currentPrice: 88,
  originalPrice: 269,
  url: "https://www.mercadolivre.com.br/mochila-jiesipote/p/MLB74678961",
  category: "Calçados, Roupas e Bolsas",
  evidence: {
    marketplace_highlights: "BEST_SELLER pos #14",
    official_highlight: "Mais Vendido Top #14",
  },
};

describe("Task 2 — seleção de ofertas-herói", () => {
  it("classifica a mochila de impulso com desconto e bestseller como HERO", () => {
    const decision = classifySocialOffer(backpack);
    expect(decision.classification).toBe("HERO");
    expect(decision.score).toBeGreaterThanOrEqual(65);
    expect(decision.reasons).toEqual(expect.arrayContaining([
      "impulse_price_under_100",
      "verified_discount_50_plus",
      "marketplace_bestseller",
    ]));
    expect(decision.penalties).not.toContain("missing_commission");
  });

  it("não usa ausência de comissão como veto ou penalidade", () => {
    const decision = classifySocialOffer({ ...backpack, evidence: { marketplace_highlights: "BEST_SELLER pos #14", commission: null } });
    expect(decision.classification).toBe("HERO");
    expect(decision.penalties.join(" ")).not.toMatch(/commission|comiss/iu);
  });

  it("mantém produto válido caro e sem prova como NORMAL em vez de rejeitá-lo", () => {
    const decision = classifySocialOffer({
      id: "expensive-standard",
      productName: "Notebook 15 Polegadas",
      marketplace: "Mercado Livre",
      currentPrice: 1899,
      originalPrice: null,
      url: "https://www.mercadolivre.com.br/notebook/p/MLB123",
      category: "Informática",
      evidence: {},
    });
    expect(decision.classification).toBe("NORMAL");
    expect(decision.score).toBeGreaterThan(0);
  });

  it("marca como SKIP_SOCIAL apenas quando preço ou link básico é inválido", () => {
    expect(classifySocialOffer({ ...backpack, id: "bad-price", currentPrice: 0 }).classification).toBe("SKIP_SOCIAL");
    expect(classifySocialOffer({ ...backpack, id: "bad-link", url: "http://example.com" }).classification).toBe("SKIP_SOCIAL");
  });

  it("penaliza exposição recente sem apagar a oportunidade do sistema", () => {
    const decision = classifySocialOffer({ ...backpack, id: "recent", publishedRecently: true });
    expect(decision.penalties).toContain("recent_social_exposure");
    expect(decision.classification).not.toBe("SKIP_SOCIAL");
  });

  it("limita HERO e impede dois HERO do mesmo cluster", () => {
    const selected = selectSocialHeroOffers([
      { ...backpack, id: "a", clusterKey: "mochila-jiesipote" },
      { ...backpack, id: "b", clusterKey: "mochila-jiesipote", currentPrice: 89 },
      { ...backpack, id: "c", clusterKey: "microfone-hollyland", productName: "Microfone Hollyland Lark M2", currentPrice: 95 },
      { ...backpack, id: "d", clusterKey: "aspirador-wap", productName: "Aspirador WAP GTW 10", currentPrice: 99 },
      { ...backpack, id: "e", clusterKey: "creatina", productName: "Creatina Growth 250g", currentPrice: 79 },
    ], 3);

    expect(selected.filter((item) => item.classification === "HERO")).toHaveLength(3);
    const duplicate = selected.find((item) => item.id === "b");
    expect(duplicate?.classification).toBe("TEST");
    expect(duplicate?.penalties).toContain("duplicate_hero_cluster");
    expect(selected.some((item) => item.penalties.includes("hero_quota_reached"))).toBe(true);
  });
});

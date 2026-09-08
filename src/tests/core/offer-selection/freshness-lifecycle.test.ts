import { describe, it, expect } from "vitest";
import {
  evaluateCandidateFreshness,
  isMateriallyBetter,
  hasPublicationEvidence,
} from "../../../../scripts/offer-freshness-gate.cjs";

describe("Sprint 5 — Freshness, Revalidação e Ciclo de Vida", () => {
  it("classifica produto inédito como 'new' e elegível", () => {
    const product = {
      marketplace: "Amazon",
      sourceItemId: "B09NOVEL01",
      title: "Monitor Gamer 24",
      currentPrice: 800,
    };

    const freshness = evaluateCandidateFreshness("Amazon", product, []);

    expect(freshness.state).toBe("new");
    expect(freshness.eligible).toBe(true);
    expect(freshness.reason).toBe("novel_candidate");
  });

  it("classifica produto conhecido não publicado como 'known_unpublished' e elegível", () => {
    const product = {
      marketplace: "Mercado Livre",
      sourceItemId: "MLB12345",
      title: "Teclado Mecânico",
      currentPrice: 150,
    };
    const history = [
      {
        item_id: "MLB12345",
        product_name: "Teclado Mecânico",
        current_price: 150,
        status: "pending_manual_review",
        created_at: new Date().toISOString(),
      },
    ];

    const freshness = evaluateCandidateFreshness("Mercado Livre", product, history);

    expect(freshness.state).toBe("known_unpublished");
    expect(freshness.eligible).toBe(true);
    expect(freshness.reason).toBe("known_unpublished_revalidated");
  });

  it("bloqueia publicação repetida durante o cooldown sem melhoria material ('published_cooldown')", () => {
    const product = {
      marketplace: "Shopee",
      sourceItemId: "100",
      title: "Fone Bluetooth",
      currentPrice: 95, // menos de 10% de queda (preço anterior era 100)
      marketplaceMetrics: { itemId: "100", shopId: "200" },
    };
    const history = [
      {
        shopee_item_id: "100",
        shopee_shop_id: "200",
        product_name: "Fone Bluetooth",
        current_price: 100,
        status: "posted",
        created_at: new Date().toISOString(),
      },
    ];

    const freshness = evaluateCandidateFreshness("Shopee", product, history);

    expect(freshness.state).toBe("published_cooldown");
    expect(freshness.eligible).toBe(false);
    expect(freshness.reason).toBe("published_in_cooldown");
  });

  it("permite republicação quando há mudança material de preço ('material_change')", () => {
    const product = {
      marketplace: "Shopee",
      sourceItemId: "100",
      title: "Fone Bluetooth",
      currentPrice: 80, // queda de 20% (>= 10%)
      marketplaceMetrics: { itemId: "100", shopId: "200" },
    };
    const history = [
      {
        shopee_item_id: "100",
        shopee_shop_id: "200",
        product_name: "Fone Bluetooth",
        current_price: 100,
        status: "posted",
        created_at: new Date().toISOString(),
      },
    ];

    const freshness = evaluateCandidateFreshness("Shopee", product, history);

    expect(freshness.state).toBe("material_change");
    expect(freshness.eligible).toBe(true);
    expect(freshness.reason).toBe("material_price_drop");
  });
});

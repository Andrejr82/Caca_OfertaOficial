import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { scoreMercadoLivreOpportunityV1, selectMercadoLivreOpportunitiesV1 } = require("../../../scripts/mercadolivre-opportunity-v1.cjs");

const candidate = (overrides: Record<string, unknown> = {}) => ({
  marketplace: "Mercado Livre", itemId: "MLB-1", productId: "MLB-P1", productName: "Mouse sem fio", category: "Mouses", currentPrice: 79, oldPrice: 119, discountPercent: 33.61, sales: null, rating: null, commissionPercent: 0, permalink: "https://www.mercadolivre.com.br/p/MLB-P1", imageUrl: "https://http2.mlstatic.com/mouse.jpg", provenance: "mercadolivre_official_intent", sourceIntent: "mouse sem fio", macroGroup: "informatica", domainId: "MLB-COMPUTER_MICE", categoryId: "MLB1714", sourcePosition: 1, ...overrides,
});

describe("Mercado Livre Opportunity Gate V1", () => {
  it("rewards a real old-price discount over an otherwise equal regular price", () => {
    const offer = scoreMercadoLivreOpportunityV1(candidate());
    const regular = scoreMercadoLivreOpportunityV1(candidate({ itemId: "MLB-2", oldPrice: null, discountPercent: 40 }));
    expect(offer.offerScore).toBeGreaterThan(0);
    expect(regular.offerScore).toBe(0);
    expect(offer.finalScore).toBeGreaterThan(regular.finalScore);
    expect(offer.passesGate).toBe(true);
  });

  it("keeps absent sales and history neutral instead of fabricating demand", () => {
    const row = scoreMercadoLivreOpportunityV1(candidate({ sales: null, velocityInfo: { velocity_status: "insufficient_history" } }));
    expect(row.demandScore).toBe(0);
    expect(row.sales).toBeNull();
    expect(row.velocityStatus).toBe("insufficient_history");
  });

  it("does not let commission influence the Mercado Livre score", () => {
    const zero = scoreMercadoLivreOpportunityV1(candidate({ commissionPercent: 0 }));
    const fake = scoreMercadoLivreOpportunityV1(candidate({ commissionPercent: 99 }));
    expect(fake.finalScore).toBe(zero.finalScore);
  });

  it("allows a strong verified offer without sales", () => {
    const row = scoreMercadoLivreOpportunityV1(candidate({ sales: null, oldPrice: 160, currentPrice: 80, sourcePosition: 3 }));
    expect(row.passesGate).toBe(true);
    expect(row.sales).toBeNull();
  });

  it("deduplicates native items and limits equivalent products to two", () => {
    const rows = [
      candidate({ itemId: "MLB-1", productId: "P1", productName: "Mouse sem fio A", oldPrice: 150, currentPrice: 75, sourcePosition: 1 }),
      candidate({ itemId: "MLB-1", productId: "P1B", productName: "Duplicado nativo", oldPrice: 150, currentPrice: 70, sourcePosition: 1 }),
      candidate({ itemId: "MLB-2", productId: "P2", productName: "Mouse sem fio B", oldPrice: 140, currentPrice: 80, sourcePosition: 2 }),
      candidate({ itemId: "MLB-3", productId: "P3", productName: "Mouse sem fio C", oldPrice: 130, currentPrice: 85, sourcePosition: 3 }),
      candidate({ itemId: "MLB-4", productId: "P4", productName: "Lixeira inox pedal", sourceIntent: "lixeira inox pedal", macroGroup: "casa", oldPrice: 180, currentPrice: 100, sourcePosition: 1 }),
    ];
    const selected = selectMercadoLivreOpportunitiesV1(rows, { maxProducts: 10 });
    expect(selected.filter((row: any) => row.equivalenceKey === "mouse sem fio")).toHaveLength(2);
    expect(selected.filter((row: any) => row.candidate.itemId === "MLB-1")).toHaveLength(1);
    expect(selected.some((row: any) => row.candidate.itemId === "MLB-4")).toBe(true);
  });

  it("does not admit a common product with no real offer evidence", () => {
    const row = scoreMercadoLivreOpportunityV1(candidate({ oldPrice: null, discountPercent: 0, sourcePosition: 8, currentPrice: 1299 }));
    expect(row.offerScore).toBe(0);
    expect(row.passesGate).toBe(false);
  });
});

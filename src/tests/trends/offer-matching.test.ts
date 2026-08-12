import { describe, expect, it } from "vitest";
import type { TrendSignalClassification } from "@/core/trends/types";
import { matchTrendClassification } from "@/core/trends/offer-matching";
import { toTrendOpportunityRows } from "@/lib/trends/matching";

const classification: TrendSignalClassification = {
  id: "classification-1",
  signalId: "signal-1",
  commercialRelevance: 80,
  isProductIntent: true,
  normalizedProductTerm: "Galaxy S26 FE",
  categoryHint: "celulares",
  decision: "eligible",
  reason: "Produto identificável.",
  aiModel: "test",
  strategyVersion: "trend-commercial-v1",
  classifiedAt: "2026-08-10T18:30:00.000Z"
};

const offer = (overrides: Record<string, unknown> = {}) => ({
  id: "offer-valid",
  marketplace: "Shopee",
  productName: "Samsung Galaxy S26 FE 5G 256GB",
  category: "Celulares",
  currentPrice: 2499,
  oldPrice: 2999,
  itemId: "123",
  productId: null,
  shopeeItemId: "123",
  marketplaceMetrics: { itemId: "123", brand: "Samsung", model: "Galaxy S26 FE" },
  ...overrides
});

describe("trend offer matching", () => {
  it("matches only the exact product identity and ignores accessories/wrong models", () => {
    const result = matchTrendClassification(classification, [
      offer({ id: "accessory", productName: "Capa para Samsung Galaxy S26 FE", category: "Acessórios" }),
      offer({ id: "wrong-model", productName: "Samsung Galaxy S25 FE 5G", marketplaceMetrics: { brand: "Samsung", model: "Galaxy S25 FE" } }),
      offer({ id: "valid-ml", marketplace: "Mercado Livre", productName: "Samsung Galaxy S26 FE 5G 256GB", productId: "MLB123", itemId: "MLB123", shopeeItemId: null, marketplaceMetrics: { itemId: "MLB123", brand: "Samsung", model: "Galaxy S26 FE" } })
    ]);

    expect(result).toMatchObject({ status: "matched", offerId: "valid-ml", marketplace: "Mercado Livre", confidence: 100 });
    expect(result.rejectedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ offerId: "accessory" }),
      expect.objectContaining({ offerId: "wrong-model" })
    ]));
  });

  it("fails closed when only an accessory exists", () => {
    const result = matchTrendClassification(classification, [offer({ productName: "Película para Galaxy S26 FE", category: "Acessórios" })]);
    expect(result).toMatchObject({ status: "no_match", offerId: null, confidence: 0 });
  });

  it("does not match Amazon or offers without native identity evidence", () => {
    const result = matchTrendClassification(classification, [
      offer({ id: "amazon", marketplace: "Amazon", productId: "ASIN123" }),
      offer({ id: "no-id", shopeeItemId: null, itemId: null, productId: null, marketplaceMetrics: {} })
    ]);
    expect(result.status).toBe("no_match");
  });

  it("maps only validated offers to explicit opportunity rows", () => {
    const result = matchTrendClassification(classification, [offer()]);
    expect(toTrendOpportunityRows("user-1", classification, result)).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        signal_id: "signal-1",
        classification_id: "classification-1",
        offer_id: "offer-valid",
        marketplace: "Shopee",
        normalized_product_term: "Galaxy S26 FE",
        match_status: "matched",
        match_confidence: 100,
        score: null,
        experiment_id: null
      })
    ]);
  });
});

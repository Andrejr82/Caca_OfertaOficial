import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { calculateConversionScore } from "@/lib/offers/conversion-engine";
import { calculateOfferScoreV2 } from "@/lib/offers/score-v2";
import { curateOfferScore, rankOffersBatch } from "@/lib/offers/curation-engine";
import type { Offer } from "@/types/domain";

describe("Curation V2 Engine - Forensic Verification", () => {
  const mockOffer: Offer = {
    id: "off-123",
    user_id: "usr-999",
    platform: "Amazon",
    product_name: "Panela de Pressão Inox Tramontina",
    category: "Cozinha",
    original_url: "https://amazon.com.br/123",
    image_url: null,
    current_price: 120.0,
    old_price: 200.0,
    coupon: "PANELA10",
    rating: 4.8,
    estimated_commission: 12.0,
    commission_rate: 0.1,
    score: 0.0,
    status: "draft",
    notes: null,
    seasonality: 1,
    created_at: "",
    updated_at: ""
  };

  describe("1. Conversion Engine", () => {
    it("calculates deterministic conversion sub-scores and final score without AI", () => {
      const result = calculateConversionScore(mockOffer);

      expect(result.purchase_probability).toBeGreaterThan(0);
      expect(result.conversion_potential).toBeGreaterThan(0);
      expect(result.commercial_intent).toBeGreaterThan(0);
      expect(result.final_conversion_score).toBeGreaterThan(0);
      expect(result.final_conversion_score).toBeLessThanOrEqual(10);
    });
  });

  describe("2. Score V2 splits Impulse & Purchase Potential", () => {
    it("calculates independent impulse and purchase potential scores with distinct weights", () => {
      const result = calculateOfferScoreV2({
        current_price: 50.0,
        old_price: 100.0,
        coupon: "TEST",
        rating: 4.9,
        category: "Casa"
      });

      expect(result.explainability.impulse_score).toBe(10); // ticket < 80
      expect(result.explainability.purchase_potential_score).toBe(10); // category priority + rating >= 4.5
      expect(result.explainability.final_score).toBeGreaterThan(5);
    });
  });

  describe("3. Feature Flags & Pipeline Integration", () => {
    beforeEach(() => {
      vi.stubEnv("ENABLE_CURATION_ENGINE", "true");
      vi.stubEnv("ENABLE_CONVERSION_ENGINE", "true");
      vi.stubEnv("ENABLE_SHADOW_SCORING", "true");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("uses conversion engine when ENABLE_CONVERSION_ENGINE is true", () => {
      const result = calculateOfferScoreV2({
        current_price: 120.0,
        old_price: 200.0,
        coupon: "PANELA10",
        rating: 4.8,
        category: "Cozinha"
      });
      
      expect(result.explainability.conversion_score).toBeDefined();
    });

    it("runs curateOfferScore returning V2 score when ENABLE_CURATION_ENGINE is true", () => {
      const curation = curateOfferScore({
        current_price: 120.0,
        old_price: 200.0,
        coupon: "PANELA10",
        rating: 4.8,
        category: "Cozinha"
      });

      expect(curation.new_score).toBeDefined();
      expect(curation.legacy_score).toBeDefined();
      expect(curation.score).toBe(curation.new_score);
    });
  });

  describe("4. Batch Ranking & Curation Governance (Top 3 Limit)", () => {
    it("filters cold ranking >= 5 and slices top 3 for AI evaluation", async () => {
      // 5 mock offers, 3 with score >= 5.0, 2 with score < 5.0
      const offersList: Offer[] = [
        { ...mockOffer, id: "1", score: 9.0 },
        { ...mockOffer, id: "2", score: 8.0 },
        { ...mockOffer, id: "3", score: 7.0 },
        { ...mockOffer, id: "4", score: 4.0 }, // filtered out
        { ...mockOffer, id: "5", score: 3.5 }  // filtered out
      ];

      vi.stubEnv("ENABLE_AI_CURATION", "true");

      const ranked = await rankOffersBatch(offersList, { minColdScore: 5.0 });

      // Should contain only the 3 offers that are >= 5.0
      expect(ranked.length).toBe(3);
      expect(ranked.some(o => o.id === "4")).toBe(false);
      expect(ranked.some(o => o.id === "5")).toBe(false);
    });
  });
});

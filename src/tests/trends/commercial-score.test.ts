import { describe, expect, it } from "vitest";
import { calculateCommercialScore } from "@/core/trends/commercial-score";

describe("commercial score", () => {
  it("scores commercial evidence independently from trend interest", () => {
    const result = calculateCommercialScore({
      id: "S-1", marketplace: "Shopee", productName: "Air Fryer 4L", shopeeItemId: "S-1", currentPrice: 299,
      marketplaceMetrics: { discount: 20, commissionRate: 8, rating: 4.8, sales: 500, sellerReputation: { level: "green" } }
    });

    expect(result.commercialScore).toBeGreaterThan(40);
    expect(result.minimumEvidenceMet).toBe(true);
    expect(result.queueEligible).toBe(true);
    expect(result.exclusionReason).toBeNull();
  });

  it("penalizes missing fields and excludes candidates without minimum evidence", () => {
    const result = calculateCommercialScore({ id: "S-2", marketplace: "Shopee", productName: "Air Fryer", shopeeItemId: "S-2", currentPrice: 299, marketplaceMetrics: {} });

    expect(result.evidenceCount).toBe(0);
    expect(result.breakdown.missingDataPenalty).toBe(10);
    expect(result.queueEligible).toBe(false);
    expect(result.exclusionReason).toBe("evidencia_comercial_minima_insuficiente");
  });
});

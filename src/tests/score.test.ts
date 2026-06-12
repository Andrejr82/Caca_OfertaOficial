import { describe, expect, it } from "vitest";
import { calculateOfferScore } from "@/lib/offers/score";

describe("calculateOfferScore", () => {
  it("scores a strong discounted offer near the top", () => {
    const score = calculateOfferScore({
      current_price: 79,
      old_price: 199,
      coupon: "OFERTA10",
      rating: 4.8,
      estimated_commission: 18,
      category: "Eletrônicos",
      seasonality: 1
    });

    expect(score).toBeGreaterThanOrEqual(8);
    expect(score).toBeLessThanOrEqual(10);
  });
});

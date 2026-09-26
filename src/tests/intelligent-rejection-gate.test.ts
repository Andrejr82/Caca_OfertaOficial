import { describe, it, expect } from "vitest";

describe("Intelligent Rejection & Price-Drop Gate", () => {
  function evaluateRejectionMemory(input: {
    isDeleted: boolean;
    previousPrice: number | null;
    currentPrice: number;
  }) {
    if (!input.isDeleted) {
      return { allow: true, reason: "novel_product" };
    }
    if (
      input.previousPrice !== null &&
      Number.isFinite(input.previousPrice) &&
      input.previousPrice > 0 &&
      input.currentPrice < input.previousPrice * 0.95
    ) {
      const discountPercent = Math.round(((input.previousPrice - input.currentPrice) / input.previousPrice) * 100);
      return { allow: true, reason: "price_dropped_promotion", discountPercent };
    }
    return { allow: false, reason: "user_previously_deleted_same_price" };
  }

  it("allows brand new products that were never deleted", () => {
    const decision = evaluateRejectionMemory({
      isDeleted: false,
      previousPrice: null,
      currentPrice: 99.90,
    });
    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe("novel_product");
  });

  it("blocks previously deleted products when price is the same or higher", () => {
    const decision = evaluateRejectionMemory({
      isDeleted: true,
      previousPrice: 100.0,
      currentPrice: 100.0,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("user_previously_deleted_same_price");

    const decisionHigher = evaluateRejectionMemory({
      isDeleted: true,
      previousPrice: 100.0,
      currentPrice: 110.0,
    });
    expect(decisionHigher.allow).toBe(false);
  });

  it("allows previously deleted products when price drops by 5% or more", () => {
    const decision = evaluateRejectionMemory({
      isDeleted: true,
      previousPrice: 100.0,
      currentPrice: 89.90,
    });
    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe("price_dropped_promotion");
    expect(decision.discountPercent).toBe(10);
  });
});

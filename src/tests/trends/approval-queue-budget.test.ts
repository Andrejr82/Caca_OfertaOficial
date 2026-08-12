import { describe, expect, it } from "vitest";
import { selectApprovalQueueProducts } from "@/lib/trends/approval-queue-budget";

describe("approval queue budget", () => {
  it("limits the marketplace lookup to the five highest-priority current trends", () => {
    const products = Array.from({ length: 20 }, (_, index) => ({
      id: `product-${index}`,
      priority: index + 1,
      product_term: `term-${index}`,
      normalized_product_term: `term-${index}`,
      category: null,
      evidence_status: "partial" as const,
      commercial_score: 20,
      confidence: 60,
    }));

    expect(selectApprovalQueueProducts(products)).toHaveLength(5);
    expect(selectApprovalQueueProducts(products).map((product) => product.id)).toEqual([
      "product-0",
      "product-1",
      "product-2",
      "product-3",
      "product-4",
    ]);
  });
});

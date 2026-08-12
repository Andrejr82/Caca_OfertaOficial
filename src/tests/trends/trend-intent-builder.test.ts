import { describe, expect, it } from "vitest";
import { buildEligibleTrendMarketplaceIntents } from "@/lib/trends/trend-intent-builder";

describe("trend intent builder", () => {
  it("keeps complete terms, controlled variants and distributes categories", () => {
    const result = buildEligibleTrendMarketplaceIntents([
      { decision: "eligible", isProductIntent: true, normalizedProductTerm: "Air Fryer 4L", categoryHint: "Casa" },
      { decision: "eligible", isProductIntent: true, normalizedProductTerm: "Smartphone Galaxy A17", categoryHint: "Eletrônicos" },
      { decision: "eligible", isProductIntent: true, normalizedProductTerm: "Notebook 15", categoryHint: "Eletrônicos" }
    ], { maxTotalIntents: 2 });

    expect(result.intents).toHaveLength(2);
    expect(result.intents.map((intent) => intent.category)).toEqual(["Casa", "Eletrônicos"]);
    expect(result.intents[0]).toMatchObject({
      normalizedProductTerm: "Air Fryer 4L",
      productIdentity: "Air Fryer 4L",
      queryVariants: ["Air Fryer 4L", "4L"]
    });
    expect(result.categoryCounts).toEqual({ Casa: 1, Eletrônicos: 1 });
  });

  it("rejects non-product or rejected classifications and deduplicates terms", () => {
    const result = buildEligibleTrendMarketplaceIntents([
      { decision: "rejected", isProductIntent: true, normalizedProductTerm: "Arma", categoryHint: "Outros" },
      { decision: "eligible", isProductIntent: false, normalizedProductTerm: "Black Friday", categoryHint: "Outros" },
      { decision: "eligible", isProductIntent: true, normalizedProductTerm: "Air Fryer", categoryHint: "Casa" },
      { decision: "eligible", isProductIntent: true, normalizedProductTerm: " air   fryer ", categoryHint: "Casa" }
    ]);

    expect(result.intents).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });
});

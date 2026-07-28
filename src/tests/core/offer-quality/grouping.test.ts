import { describe, expect, it } from "vitest";
import { getGroupKey, validateCandidateBasics, validateNativeIdentity } from "@/core/offer-quality/grouping";
import { createOfferQualityCandidate } from "@/core/offer-quality/types";

const base = {
  title: "Produto principal",
  sourceUrl: "https://marketplace.example/item/1",
  imageUrl: "https://cdn.example/image.jpg",
  currentPrice: 99,
  originalPrice: 149,
  marketplaceMetrics: {},
  currentFlowStatus: "pending_manual_review",
} as const;

describe("offer quality grouping", () => {
  it("accepts Mercado Livre item identity and catalog evidence", () => {
    const candidate = createOfferQualityCandidate({
      ...base,
      marketplace: "Mercado Livre",
      nativeIdentity: "MLB1234567890",
      sourceItemId: "MLB1234567890",
      sourceUrl: "https://www.mercadolivre.com.br/p/MLB1234567890",
    });
    expect(validateNativeIdentity(candidate).valid).toBe(true);
    expect(getGroupKey(candidate)).toMatchObject({ key: "ml:catalog:/p/mlb1234567890" });
  });

  it("groups Amazon by valid ASIN", () => {
    const candidate = createOfferQualityCandidate({
      ...base,
      marketplace: "Amazon",
      nativeIdentity: "B0ABC12345",
      sourceItemId: "B0ABC12345",
      marketplaceMetrics: { asin: "B0ABC12345" },
    });
    expect(validateNativeIdentity(candidate).valid).toBe(true);
    expect(getGroupKey(candidate).key).toBe("amazon:asin:B0ABC12345");
  });

  it("keeps Shopee sellers separate", () => {
    const candidate = createOfferQualityCandidate({
      ...base,
      marketplace: "Shopee",
      nativeIdentity: "12345",
      sourceItemId: "12345",
      marketplaceMetrics: { itemId: "12345", shopId: "777" },
    });
    expect(validateNativeIdentity(candidate).valid).toBe(true);
    expect(getGroupKey(candidate).key).toBe("shopee:item:12345:shop:777");
  });

  it("rejects invalid identity, image and price before ranking", () => {
    const candidate = createOfferQualityCandidate({
      ...base,
      marketplace: "Amazon",
      nativeIdentity: "bad",
      sourceItemId: "bad",
      imageUrl: "http://insecure.example/image.jpg",
      currentPrice: 0,
    });
    const result = validateCandidateBasics(candidate);
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["invalid_image_url", "invalid_price"]));
    expect(validateNativeIdentity(candidate).valid).toBe(false);
  });
});

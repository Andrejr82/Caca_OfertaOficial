import { describe, it, expect } from "vitest";

const {
  buildProductOfferPayload,
  sanitizeProduct,
  calculateObjectiveScore,
} = require("../../scripts/shopee-native-discovery-v5.cjs");

describe("Shopee Dynamic GraphQL Discovery V5", () => {
  it("buildProductOfferPayload supports dynamic page and sortType", () => {
    const payload = buildProductOfferPayload("panela eletrica", 100041, 2, 20, 5);
    expect(payload.variables.keyword).toBe("panela eletrica");
    expect(payload.variables.productCatId).toBe(100041);
    expect(payload.variables.page).toBe(2);
    expect(payload.variables.limit).toBe(20);
    expect(payload.variables.sortType).toBe(5);
  });

  it("sanitizeProduct accepts official/preferred shops (shopType 1, 2, 3)", () => {
    const mockNode = {
      itemId: "123456",
      productName: "Air Fryer 4L Inox",
      productLink: "https://shopee.com.br/product/1/123456",
      priceMin: "199.90",
      priceMax: "299.90",
      priceDiscountRate: "33",
      sales: "1500",
      ratingStar: "4.8",
      commissionRate: "12",
      shopType: [3],
    };
    const sanitized = sanitizeProduct(mockNode, { productCatId: 100041, name: "Eletro", order: 1 });
    expect(sanitized).not.toBeNull();
    expect(sanitized.productName).toBe("Air Fryer 4L Inox");
    expect(sanitized.price).toBe(199.9);
    expect(sanitized.discount).toBe(33);
  });

  it("sanitizeProduct accepts trusted sellers (rating >= 4.5 and sales >= 50) even without shopType", () => {
    const mockNode = {
      itemId: "789101",
      productName: "Mop Giratório Balde 14L",
      productLink: "https://shopee.com.br/product/2/789101",
      priceMin: "49.90",
      priceMax: "79.90",
      priceDiscountRate: "37",
      sales: "320",
      ratingStar: "4.7",
      commissionRate: "10",
      shopType: [],
    };
    const sanitized = sanitizeProduct(mockNode, { productCatId: 100010, name: "Casa", order: 1 });
    expect(sanitized).not.toBeNull();
    expect(sanitized.productName).toBe("Mop Giratório Balde 14L");
  });

  it("sanitizeProduct rejects untrusted low-rated sellers without sales", () => {
    const mockNode = {
      itemId: "999999",
      productName: "Produto Suspeito",
      productLink: "https://shopee.com.br/product/3/999999",
      priceMin: "10.00",
      sales: "2",
      ratingStar: "3.2",
      shopType: [],
    };
    const sanitized = sanitizeProduct(mockNode, { productCatId: 100010, name: "Casa", order: 1 });
    expect(sanitized).toBeNull();
  });
});

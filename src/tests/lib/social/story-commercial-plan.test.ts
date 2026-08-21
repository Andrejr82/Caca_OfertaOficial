import { describe, expect, it } from "vitest";
import { buildStoryCommercialPlan } from "@/lib/social/story-commercial-plan";
import { buildStoryCommercialFrameModel } from "@/lib/social/story-commercial-renderer";

describe("Stories comerciais Instagram/Facebook", () => {
  it("usa uma única arte de desconto quando desconto é o único argumento forte", () => {
    const plan = buildStoryCommercialPlan({
      productName: "Electrolux Ar-condicionado Split",
      marketplace: "Amazon",
      category: "Casa",
      currentPrice: 1799,
      originalPrice: 2049,
      freeShipping: false,
      evidence: {},
    });

    expect(plan.template).toBe("DISCOUNT_HERO");
    expect(plan.discountPercent).toBe(12);
    expect(plan.savings).toBe(250);
    expect(plan.frameCount).toBe(1);

    const frame = buildStoryCommercialFrameModel(plan, {
      marketplace: "Amazon",
      imageUrl: "https://images.example.com/electrolux.jpg",
    }, 1);
    expect(frame?.hero).toBe("12% OFF");
    expect(frame?.originalPrice).toContain("2.049,00");
    expect(frame?.price).toContain("1.799,00");
  });

  it("só cria segunda arte quando existe reforço factual adicional", () => {
    const plan = buildStoryCommercialPlan({
      productName: "Produto",
      marketplace: "Shopee",
      category: null,
      currentPrice: 99.9,
      originalPrice: 149.9,
      freeShipping: true,
      evidence: {},
    });

    expect(plan.frameCount).toBe(2);
    expect(buildStoryCommercialFrameModel(plan, { marketplace: "Shopee", imageUrl: "https://images.example.com/x.jpg" }, 2)).not.toBeNull();
  });

  it("não inventa desconto quando preço anterior é inválido", () => {
    const plan = buildStoryCommercialPlan({
      productName: "Produto",
      marketplace: "Mercado Livre",
      category: null,
      currentPrice: 120,
      originalPrice: 100,
      freeShipping: false,
      evidence: {},
    });

    expect(plan.template).toBe("PRICE_HERO");
    expect(plan.discountPercent).toBeNull();
    expect(plan.savings).toBeNull();
    expect(plan.frameCount).toBe(1);
  });
});

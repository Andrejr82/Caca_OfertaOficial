import { describe, expect, it } from "vitest";
import { offerInputSchema } from "@/lib/validators/offer";

describe("offerInputSchema", () => {
  it("accepts a valid offer", () => {
    const result = offerInputSchema.safeParse({
      platform: "Shopee",
      product_name: "Produto bom",
      original_url: "https://example.com/produto",
      current_price: "49.90",
      image_url: ""
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid URL", () => {
    const result = offerInputSchema.safeParse({
      platform: "Shopee",
      product_name: "Produto bom",
      original_url: "sem-url",
      current_price: "49.90"
    });

    expect(result.success).toBe(false);
  });
});

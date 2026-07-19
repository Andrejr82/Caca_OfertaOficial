import { describe, expect, it } from "vitest";
import { addAmazonAffiliateTag, classifyCouponCode } from "@/lib/affiliates/coupon-scraper";

describe("Coupon scraper contract", () => {
  it("never treats a generated Shopee digest as an official coupon code", () => {
    expect(classifyCouponCode("SHOPEE-8CCBE181")).toBe("RESGATE DIRETO");
  });

  it("preserves a real coupon code returned by an official source", () => {
    expect(classifyCouponCode("PROMO10")).toBe("PROMO10");
  });

  it("adds the configured Amazon Associates tag without removing existing parameters", () => {
    expect(addAmazonAffiliateTag("https://www.amazon.com.br/dp/B001?psc=1", "caca-20"))
      .toBe("https://www.amazon.com.br/dp/B001?psc=1&tag=caca-20");
  });


});

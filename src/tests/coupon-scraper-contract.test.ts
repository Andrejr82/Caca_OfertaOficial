import { describe, expect, it } from "vitest";
import { addAmazonAffiliateTag, buildShopeeCouponVariables, classifyCouponCode } from "@/lib/affiliates/coupon-scraper";

describe("Coupon scraper contract", () => {
  it("rotates Shopee official pagination instead of always requesting page one", () => {
    expect(buildShopeeCouponVariables(3, 20)).toMatchObject({
      keyword: "",
      page: 3,
      limit: 20,
      sortType: 2,
      isAMSOffer: true
    });
  });

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

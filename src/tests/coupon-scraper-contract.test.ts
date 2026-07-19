import { describe, expect, it } from "vitest";
import { addAmazonAffiliateTag, classifyCouponCode, sanitizeCouponForTest } from "@/lib/affiliates/coupon-scraper";

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

  it("rejects expired coupons from public marketplace pages", () => {
    expect(sanitizeCouponForTest({ discount: "R$ 35 OFF", rules: "Cupom expirado" }, "Mercado Livre", "https://www.mercadolivre.com.br/ofertas/cupons"))
      .toBeNull();
  });

  it("rejects placeholder links returned by an extractor", () => {
    expect(sanitizeCouponForTest({ discount: "R$ 20 OFF", link: "https://www.amazon.com.br/ExemploDeCupom1" }, "Amazon", "https://www.amazon.com.br/coupons"))
      .toBeNull();
  });
});

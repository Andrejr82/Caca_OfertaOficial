import { describe, expect, it } from "vitest";
import { persistCouponDrafts } from "@/lib/coupons/persist-coupon-drafts";

describe("Coupon draft persistence contract", () => {
  it("does not create posts outside Official AI", async () => {
    const result = await persistCouponDrafts([{
      marketplace: "Mercado Livre",
      discount: "12% OFF",
      code: "CACAO26",
      rules: "Compras selecionadas",
      link: "https://www.mercadolivre.com.br/ofertas/cupons"
    }]);

    expect(result.status).toBe("error");
    expect(result.drafts).toBe(0);
    expect(result.message).toContain("Official AI");
  });
});

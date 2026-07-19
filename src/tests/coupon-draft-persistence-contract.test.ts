import { describe, expect, it } from "vitest";
import { buildCouponDraftContent } from "@/lib/coupons/persist-coupon-drafts";

describe("Coupon draft persistence contract", () => {
  it("builds post content with the tracked link and direct redemption wording", () => {
    const content = buildCouponDraftContent({
      marketplace: "Mercado Livre",
      discount: "R$ 30 OFF",
      code: "RESGATE DIRETO",
      rules: "Compras selecionadas",
      link: "https://www.mercadolivre.com.br/ofertas/cupons"
    }, "https://caca-oferta-oficial.vercel.app/go/ig_123");

    expect(content).toContain("R$ 30 OFF");
    expect(content).toContain("Resgate direto no marketplace");
    expect(content).toContain("https://caca-oferta-oficial.vercel.app/go/ig_123");
  });
});

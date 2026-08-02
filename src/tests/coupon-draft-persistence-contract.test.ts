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
    expect(content).toContain("Resgate no Mercado Livre");
    expect(content).toContain("https://caca-oferta-oficial.vercel.app/go/ig_123");
  });

  it("publishes registered rules and validity without generic marketplace instructions", () => {
    const content = buildCouponDraftContent({
      marketplace: "Mercado Livre",
      discount: "12% OFF",
      code: "#CACAO26CACAO26",
      rules: "Compras acima de R$ 100 | Validade: até 31/08/2026",
      link: "https://www.mercadolivre.com.br/ofertas/cupons"
    }, "https://caca-oferta-oficial.vercel.app/go/tg_123");

    expect(content).toContain("Código: #CACAO26");
    expect(content).toContain("Regras: Compras acima de R$ 100");
    expect(content).toContain("Validade: até 31/08/2026");
    expect(content).not.toContain("Consulte condições e validade no marketplace");
    expect(content).not.toContain("#CACAO26CACAO26");
  });

  it("recognizes an explicit validity field without requiring the word até", () => {
    const content = buildCouponDraftContent({
      marketplace: "Mercado Livre",
      discount: "12% OFF",
      code: "CACAO26",
      rules: "Compras selecionadas | Validade: 31/08/2026",
      link: "https://www.mercadolivre.com.br/ofertas/cupons"
    }, "https://caca-oferta-oficial.vercel.app/go/tg_456");

    expect(content).toContain("📅 Validade: 31/08/2026");
  });

  it("removes the known legacy R$ hundert artifact from displayed rules", () => {
    const content = buildCouponDraftContent({
      marketplace: "Mercado Livre",
      discount: "12% OFF",
      code: "CACAO26",
      rules: "válido para compras acima de R$ hundert, limitado a um uso por cliente | Validade: 18/08/2026",
      link: "https://www.mercadolivre.com.br/ofertas/cupons"
    }, "https://caca-oferta-oficial.vercel.app/go/tg_789");

    expect(content).toContain("Regras: válido para compras acima de R$ 100");
    expect(content).not.toContain("hundert");
  });
});

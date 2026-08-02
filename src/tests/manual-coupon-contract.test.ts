import { describe, expect, it } from "vitest";
import { normalizeManualCouponInput, validateManualCouponInput } from "@/lib/coupons/manual-coupon";

describe("Manual coupon contract", () => {
  it("accepts a real marketplace coupon and normalizes whitespace", () => {
    const input = normalizeManualCouponInput({
      marketplace: " Mercado Livre ",
      code: "  CACAO10 ",
      discount: "10% OFF",
      rules: "Compra mínima de R$ 100",
      validity: "31/08/2026",
      link: "https://www.mercadolivre.com.br/ofertas/cupons"
    });

    expect(validateManualCouponInput(input)).toEqual({ ok: true, errors: [] });
    expect(input.code).toBe("CACAO10");
    expect(input.marketplace).toBe("Mercado Livre");
  });

  it("rejects unsupported marketplace and non-marketplace URL", () => {
    const result = validateManualCouponInput(normalizeManualCouponInput({
      marketplace: "Outro",
      code: "X",
      discount: "10%",
      rules: "Regra",
      validity: "Hoje",
      link: "https://example.com/cupom"
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Marketplace inválido.");
    expect(result.errors).toContain("Link deve pertencer ao marketplace selecionado.");
  });

  it("requires code, benefit, rule, validity and link", () => {
    const result = validateManualCouponInput(normalizeManualCouponInput({
      marketplace: "Amazon",
      code: "",
      discount: "",
      rules: "",
      validity: "",
      link: ""
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(5);
  });

  it("rejects a URL in the code field and accepts direct redemption", () => {
    const invalid = validateManualCouponInput(normalizeManualCouponInput({
      marketplace: "Shopee",
      code: "https://s.shopee.com.br/19GNkcgpL",
      discount: "R$ 19,90",
      rules: "praia",
      validity: "31/12/2026",
      link: "https://s.shopee.com.br/19GNkcgpL"
    }));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors[0]).toContain("Código não aceita links");

    const direct = validateManualCouponInput(normalizeManualCouponInput({
      marketplace: "Shopee",
      code: "RESGATE DIRETO",
      discount: "R$ 19,90",
      rules: "praia",
      validity: "31/12/2026",
      link: "https://s.shopee.com.br/19GNkcgpL"
    }));
    expect(direct).toEqual({ ok: true, errors: [] });
  });

  it("rejects an affiliate or product page as the image URL", () => {
    const result = validateManualCouponInput(normalizeManualCouponInput({
      marketplace: "Shopee",
      code: "RESGATE DIRETO",
      discount: "R$ 19,90",
      rules: "praia",
      validity: "31/12/2026",
      link: "https://affiliate.shopee.com.br/offer/product_offer/58253103407",
      imageUrl: "https://affiliate.shopee.com.br/offer/product_offer/58253103407"
    }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Imagem deve ser uma URL direta de imagem, não um link de produto ou afiliado.");
  });
});

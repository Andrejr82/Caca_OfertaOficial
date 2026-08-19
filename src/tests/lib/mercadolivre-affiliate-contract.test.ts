import { describe, expect, it } from "vitest";
import { classifyMLAffiliateInput } from "@/lib/platforms/mercadolivre-affiliate";

describe("classifyMLAffiliateInput", () => {
  it("aprova e preserva shortlink oficial meli.la", () => {
    const input = "https://meli.la/12hoKT9";
    const result = classifyMLAffiliateInput(input);

    expect(result.kind).toBe("official_meli_shortlink");
    expect(result.monetized).toBe(true);
    expect(result.affiliateUrl).toBe(input);
    expect(result.reasonCode).toBe("OFFICIAL_MELI_SHORTLINK");
  });

  it("aprova e preserva URL completa oficial com matt_tool + ua", () => {
    const input = "https://www.mercadolivre.com.br/produto/p/MLBU1993483730?pdp_filters=item_id%3AMLB6037755720&matt_tool=38524122&ua=IDMyaTIBHsT9wgf8c7gIgU_uOp6LXQ7a2IrbCILWcmr1jPs#origin=share";
    const result = classifyMLAffiliateInput(input);

    expect(result.kind).toBe("official_affiliate_full_url");
    expect(result.monetized).toBe(true);
    expect(result.affiliateUrl).toBe(input);
    expect(result.reasonCode).toBe("OFFICIAL_AFFILIATE_FULL_URL");
  });

  it("não trata URL comum do produto como monetizada", () => {
    const result = classifyMLAffiliateInput("https://www.mercadolivre.com.br/p/MLB47592025");

    expect(result.kind).toBe("plain_product_url");
    expect(result.monetized).toBe(false);
    expect(result.affiliateUrl).toBeUndefined();
    expect(result.reasonCode).toBe("PLAIN_PRODUCT_URL_NOT_MONETIZED");
  });

  it("identifica partner_id legado sem aprová-lo como autoridade de monetização", () => {
    const result = classifyMLAffiliateInput(
      "https://www.mercadolivre.com.br/p/MLB47592025?partner_id=CACAOFERTA123&utm_source=caca_oferta",
    );

    expect(result.kind).toBe("internally_generated_affiliate_url");
    expect(result.monetized).toBe(false);
    expect(result.affiliateUrl).toBeUndefined();
    expect(result.reasonCode).toBe("LEGACY_INTERNAL_LINK_REQUIRES_VALIDATION");
  });

  it("falha fechado para URL inválida", () => {
    const result = classifyMLAffiliateInput("nao-e-url");

    expect(result.kind).toBe("unknown");
    expect(result.monetized).toBe(false);
    expect(result.reasonCode).toBe("UNKNOWN_OR_INVALID_URL");
  });

  it("falha fechado para domínio externo", () => {
    const result = classifyMLAffiliateInput("https://example.com/produto?matt_tool=123&ua=abc");

    expect(result.kind).toBe("unknown");
    expect(result.monetized).toBe(false);
    expect(result.reasonCode).toBe("UNKNOWN_OR_INVALID_URL");
  });
});

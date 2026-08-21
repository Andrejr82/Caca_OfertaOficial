import { describe, expect, it } from "vitest";
import {
  buildMercadoLivreAffiliateUrl,
  resolveTrendMonetizedDestination,
} from "@/lib/trends/monetization";

describe("Trends monetization guard", () => {
  it("materializes a Mercado Livre affiliate destination with partner_id", () => {
    const result = buildMercadoLivreAffiliateUrl(
      "https://www.mercadolivre.com.br/produto/p/MLB123456",
      "cacaofertaoficial",
    );

    expect(result).toContain("partner_id=cacaofertaoficial");
    expect(result).toContain("utm_campaign=trend_publication");
  });

  it("rejects non Mercado Livre URLs in the ML builder", () => {
    expect(buildMercadoLivreAffiliateUrl("https://example.com/product", "affiliate")).toBeNull();
  });

  it("fails closed for plain Mercado Livre URLs without affiliate evidence", () => {
    expect(resolveTrendMonetizedDestination({
      platform: "Mercado Livre",
      originalUrl: "https://www.mercadolivre.com.br/produto/p/MLB123456",
      affiliateUrl: null,
    })).toBeNull();
  });

  it("accepts a monetized Mercado Livre affiliate URL", () => {
    const affiliateUrl = "https://www.mercadolivre.com.br/produto/p/MLB123456?partner_id=cacaofertaoficial";
    expect(resolveTrendMonetizedDestination({
      platform: "Mercado Livre",
      originalUrl: "https://www.mercadolivre.com.br/produto/p/MLB123456",
      affiliateUrl,
    })).toBe(affiliateUrl);
  });
});

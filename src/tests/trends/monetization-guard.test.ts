import { describe, expect, it } from "vitest";
import {
  buildAmazonAffiliateUrl,
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

  it("materializes an Amazon Brazil affiliate destination with partner tag", () => {
    const result = buildAmazonAffiliateUrl(
      "https://www.amazon.com.br/dp/B0D8RHX3C6",
      "cacaoferta-20",
    );
    expect(result).toContain("amazon.com.br/dp/B0D8RHX3C6");
    expect(result).toContain("tag=cacaoferta-20");
  });

  it("rejects non Amazon Brazil URLs in the Amazon builder", () => {
    expect(buildAmazonAffiliateUrl("https://example.com/dp/B0D8RHX3C6", "cacaoferta-20")).toBeNull();
  });

  it("fails closed for plain Amazon URLs without affiliate evidence", () => {
    expect(resolveTrendMonetizedDestination({
      platform: "Amazon",
      originalUrl: "https://www.amazon.com.br/dp/B0D8RHX3C6",
      affiliateUrl: null,
    })).toBeNull();
  });

  it("accepts a monetized Amazon URL with tag", () => {
    const affiliateUrl = "https://www.amazon.com.br/dp/B0D8RHX3C6?tag=cacaoferta-20";
    expect(resolveTrendMonetizedDestination({
      platform: "Amazon",
      originalUrl: "https://www.amazon.com.br/dp/B0D8RHX3C6",
      affiliateUrl,
    })).toBe(affiliateUrl);
  });
});

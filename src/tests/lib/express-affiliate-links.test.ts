import { describe, expect, it } from "vitest";
import {
  buildExpressAffiliateLinks,
  ExpressAffiliateDestinationError,
  isAmazonAffiliateInput,
  isShopeeAffiliateInput,
  selectExpressAffiliateDestination,
} from "@/lib/publish/express-affiliate-links";

describe("buildExpressAffiliateLinks", () => {
  it("gera exatamente um link persistível por canal com UUID completo", () => {
    const offerId = "45e2fca7-6100-4fb5-8f1a-021e6b84a86e";
    const rows = buildExpressAffiliateLinks({
      offerId,
      userId: "user-1",
      originalUrl: "https://www.amazon.com.br/dp/B000000000",
      appUrl: "https://caca-oferta-oficial.vercel.app/",
    });

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.channel)).toEqual(["telegram", "whatsapp", "facebook", "instagram"]);
    expect(rows.map((row) => row.tracked_url)).toEqual([
      `https://caca-oferta-oficial.vercel.app/go/tg_${offerId}`,
      `https://caca-oferta-oficial.vercel.app/go/wp_${offerId}`,
      `https://caca-oferta-oficial.vercel.app/go/fb_${offerId}`,
      `https://caca-oferta-oficial.vercel.app/go/ig_${offerId}`,
    ]);
    expect(new Set(rows.map((row) => row.sub_id)).size).toBe(4);
  });

  it("usa a URL afiliada monetizada como destino do redirecionamento", () => {
    const affiliateUrl = "https://s.shopee.com.br/3B69PxdvEv";
    const rows = buildExpressAffiliateLinks({
      offerId: "45e2fca7-6100-4fb5-8f1a-021e6b84a86e",
      userId: "user-1",
      originalUrl: "https://shopee.com.br/produto-i.123.456",
      affiliateUrl,
      appUrl: "https://caca-oferta-oficial.vercel.app",
    });

    expect(rows.every((row) => row.original_url === affiliateUrl)).toBe(true);
  });

  it("preserva meli.la oficial como destino mesmo quando recebe URL reconstruída", () => {
    const officialUrl = "https://meli.la/12hoKT9";
    const rows = buildExpressAffiliateLinks({
      offerId: "45e2fca7-6100-4fb5-8f1a-021e6b84a86e",
      userId: "user-1",
      originalUrl: officialUrl,
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB123?partner_id=LEGACY",
      appUrl: "https://caca-oferta-oficial.vercel.app",
    });

    expect(rows.every((row) => row.original_url === officialUrl)).toBe(true);
  });

  it("preserva URL completa oficial da Central com matt_tool + ua", () => {
    const officialUrl = "https://www.mercadolivre.com.br/produto/p/MLB123?matt_tool=38524122&ua=ABC123&wid=MLB456";
    const rows = buildExpressAffiliateLinks({
      offerId: "45e2fca7-6100-4fb5-8f1a-021e6b84a86e",
      userId: "user-1",
      originalUrl: officialUrl,
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB123?partner_id=LEGACY",
      appUrl: "https://caca-oferta-oficial.vercel.app",
    });

    expect(rows.every((row) => row.original_url === officialUrl)).toBe(true);
  });

  it("falha fechado para URL comum do ML quando só existe partner_id legado", () => {
    expect(() => buildExpressAffiliateLinks({
      offerId: "45e2fca7-6100-4fb5-8f1a-021e6b84a86e",
      userId: "user-1",
      originalUrl: "https://www.mercadolivre.com.br/p/MLB123",
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB123?partner_id=LEGACY",
      appUrl: "https://caca-oferta-oficial.vercel.app",
    })).toThrow(ExpressAffiliateDestinationError);
  });
});

describe("selectExpressAffiliateDestination", () => {
  it("mantém exatamente o shortlink oficial fornecido pelo afiliado", () => {
    expect(selectExpressAffiliateDestination({
      originalUrl: "https://meli.la/12hoKT9",
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB123?partner_id=LEGACY",
    })).toBe("https://meli.la/12hoKT9");
  });

  it("não promove partner_id legado a monetização aprovada", () => {
    expect(() => selectExpressAffiliateDestination({
      originalUrl: "https://www.mercadolivre.com.br/p/MLB123",
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB123?partner_id=LEGACY",
    })).toThrowError("Destino afiliado do Mercado Livre não aprovado.");
  });
});

describe("isAmazonAffiliateInput", () => {
  it("preserva shortlinks Amazon afiliados e rejeita URL comum sem assinatura", () => {
    expect(isAmazonAffiliateInput("https://link.amazon/B0ABC12345")).toBe(true);
    expect(isAmazonAffiliateInput("https://amzn.to/abc123")).toBe(true);
    expect(isAmazonAffiliateInput("https://www.amazon.com.br/dp/B0ABC12345?tag=loja-20")).toBe(true);
    expect(isAmazonAffiliateInput("https://www.amazon.com.br/dp/B0ABC12345")).toBe(false);
  });
});

describe("isShopeeAffiliateInput", () => {
  it("reconhece shortlinks e assinaturas oficiais, mas não URL comum", () => {
    expect(isShopeeAffiliateInput("https://s.shopee.com.br/abc")).toBe(true);
    expect(isShopeeAffiliateInput("https://shope.ee/abc")).toBe(true);
    expect(isShopeeAffiliateInput("https://shopee.com.br/product/1/2?aff_click=1")).toBe(true);
    expect(isShopeeAffiliateInput("https://shopee.com.br/product/1/2")).toBe(false);
  });
});

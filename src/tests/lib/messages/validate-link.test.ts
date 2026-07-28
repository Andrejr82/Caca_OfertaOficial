import { describe, expect, it } from "vitest";
import { validateLinkMarketplace } from "@/lib/messages/generate";
import type { Offer, AffiliateLink } from "@/types/domain";

describe("validateLinkMarketplace", () => {
  const baseOffer = {
    id: "offer-1",
    user_id: "user-1",
    product_name: "Test",
    current_price: 10,
    old_price: 20,
    status: "selected" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Offer;

  it("aceita Amazon com affiliate_url válida + tracked_url /go/...", () => {
    const offer = {
      ...baseOffer,
      platform: "Amazon" as const,
      original_url: "https://www.amazon.com.br/dp/123",
      explainability: { affiliate_url: "https://www.amazon.com.br/dp/123?tag=foo-20" }
    };
    expect(() => validateLinkMarketplace(offer, { tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_123" })).not.toThrow();
  });

  it("aceita Mercado Livre com affiliate_url válida + tracked_url /go/...", () => {
    const offer = {
      ...baseOffer,
      platform: "Mercado Livre" as const,
      original_url: "https://produto.mercadolivre.com.br/MLB-123",
      explainability: { affiliate_url: "https://mercadolivre.com/sec/123?partner_id=foo" }
    };
    expect(() => validateLinkMarketplace(offer, { tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_123" })).not.toThrow();
  });

  it("aceita Mercado Livre quando a Expressa guarda o link afiliado em discovery_evidence", () => {
    const offer = {
      ...baseOffer,
      platform: "Mercado Livre" as const,
      original_url: "https://www.mercadolivre.com.br/produto/MLB-123",
      explainability: {
        discovery_evidence: {
          affiliate_url: "https://www.mercadolivre.com.br/produto/MLB-123?partner_id=foo"
        }
      }
    };
    expect(() => validateLinkMarketplace(offer, { tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_123" })).not.toThrow();
  });

  it("aceita Shopee com affiliate_url válida + tracked_url /go/...", () => {
    const offer = {
      ...baseOffer,
      platform: "Shopee" as const,
      original_url: "https://shopee.com.br/product/123",
      explainability: { affiliate_url: "https://shope.ee/123" }
    };
    expect(() => validateLinkMarketplace(offer, { tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_123" })).not.toThrow();
  });

  it("rejeita URL comum sem monetização", () => {
    const offer = {
      ...baseOffer,
      platform: "Amazon" as const,
      original_url: "https://www.amazon.com.br/dp/123",
      // sem explainability.affiliate_url
    };
    expect(() => validateLinkMarketplace(offer, { tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_123" }))
      .toThrow("Link incompatível com o marketplace");
  });

  it("rejeita marketplace incompatível", () => {
    const offer = {
      ...baseOffer,
      platform: "Amazon" as const,
      original_url: "https://produto.mercadolivre.com.br/MLB-123",
      explainability: { affiliate_url: "https://mercadolivre.com/sec/123?partner_id=foo" }
    };
    expect(() => validateLinkMarketplace(offer, { tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_123" }))
      .toThrow("Link incompatível com o marketplace");
  });
});

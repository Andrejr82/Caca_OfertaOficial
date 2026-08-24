import { describe, expect, it } from "vitest";
import {
  isMercadoLivreMarketplace,
  resolveOfficialAIAffiliateDestination
} from "@/lib/ai/official/official-ai-affiliate-destination";
import type { OfficialAIOffer } from "@/core/ai";

describe("resolveOfficialAIAffiliateDestination", () => {
  const baseOffer: OfficialAIOffer = {
    id: "offer-1",
    tenantId: "tenant-1",
    state: "pending_manual_review",
    version: 1,
    marketplace: "Mercado Livre",
    productName: "Smartphone Galaxy S23",
    originalUrl: "https://www.mercadolivre.com.br/p/MLB21473210",
    imageUrl: "https://http2.mlstatic.com/D_123.jpg",
    currentPrice: 2999,
    originalPrice: 3499,
    category: "Celulares",
    explainability: {},
    createdAt: "2026-08-18T12:00:00.000Z",
  };

  it("identifica Mercado Livre corretamente independentemente de maiúsculas/espaços", () => {
    expect(isMercadoLivreMarketplace("Mercado Livre")).toBe(true);
    expect(isMercadoLivreMarketplace("mercadolivre")).toBe(true);
    expect(isMercadoLivreMarketplace("mercadolibre")).toBe(true);
    expect(isMercadoLivreMarketplace("Shopee")).toBe(false);
    expect(isMercadoLivreMarketplace("Amazon")).toBe(false);
    expect(isMercadoLivreMarketplace(null)).toBe(false);
  });

  it("cenário 1a: Mercado Livre + plain product URL SEM env => fail-closed", () => {
    const originalEnv = process.env.MERCADO_LIVRE_AFFILIATE_ID;
    try {
      delete process.env.MERCADO_LIVRE_AFFILIATE_ID;
      const result = resolveOfficialAIAffiliateDestination(baseOffer, "telegram");
      expect(result).toEqual({
        ok: false,
        reasonCode: "ML_AFFILIATE_DESTINATION_NOT_CONFIRMED",
      });
    } finally {
      if (originalEnv !== undefined) {
        process.env.MERCADO_LIVRE_AFFILIATE_ID = originalEnv;
      }
    }
  });

  it("cenário 1b: Mercado Livre + plain product URL COM env válida => gera destino com partner_id", () => {
    const originalEnv = process.env.MERCADO_LIVRE_AFFILIATE_ID;
    try {
      process.env.MERCADO_LIVRE_AFFILIATE_ID = "cacaofertaoficial";
      const result = resolveOfficialAIAffiliateDestination(baseOffer, "telegram");
      expect(result).toEqual({
        ok: true,
        affiliateUrl: "https://www.mercadolivre.com.br/p/MLB21473210?partner_id=cacaofertaoficial&utm_source=caca_oferta&utm_medium=afiliado&utm_campaign=express_publication",
        source: "official_input",
      });
    } finally {
      if (originalEnv !== undefined) {
        process.env.MERCADO_LIVRE_AFFILIATE_ID = originalEnv;
      } else {
        delete process.env.MERCADO_LIVRE_AFFILIATE_ID;
      }
    }
  });

  it("cenário 1c: Mercado Livre + URL externa ou inválida => fail-closed", () => {
    const invalidOffer = { ...baseOffer, originalUrl: "https://example.com/not-ml-product" };
    const result = resolveOfficialAIAffiliateDestination(invalidOffer, "telegram");
    expect(result).toEqual({
      ok: false,
      reasonCode: "ML_AFFILIATE_DESTINATION_NOT_CONFIRMED",
    });
  });

  it("cenário 2: Mercado Livre + originalUrl meli.la oficial => aprova com source official_input", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      originalUrl: "https://meli.la/12hoKT9",
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "telegram");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://meli.la/12hoKT9",
      source: "official_input",
    });
  });

  it("cenário 3: Mercado Livre + URL completa oficial com matt_tool + ua => preserva URL integral", () => {
    const fullOfficialUrl = "https://www.mercadolivre.com.br/produto/p/MLBU1993483730?matt_tool=38524122&ua=IDMyaTIBHsT9wgf8c7gIgU_uOp6LXQ7a2IrbCILWcmr1jPs#origin=share";
    const offer: OfficialAIOffer = {
      ...baseOffer,
      originalUrl: fullOfficialUrl,
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "whatsapp");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: fullOfficialUrl,
      source: "official_input",
    });
  });

  it("cenário 4: Mercado Livre + link com partner_id => aprova e preserva partner_id", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      originalUrl: "https://www.mercadolivre.com.br/p/MLB21473210?partner_id=CACAOFERTA123",
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "telegram");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://www.mercadolivre.com.br/p/MLB21473210?partner_id=CACAOFERTA123",
      source: "official_input",
    });
  });

  it("cenário 5: Mercado Livre + affiliate link existente válido => reutiliza com source existing_affiliate_link", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      affiliateLinks: [
        {
          channel: "telegram",
          trackedUrl: "https://cacaoferta.com.br/go/tg_offer1",
          subId: "tg_offer1",
          originalUrl: "https://meli.la/12hoKT9",
        },
      ],
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "telegram");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://meli.la/12hoKT9",
      source: "existing_affiliate_link",
    });
  });

  it("cenário 5b: Mercado Livre + affiliate link existente NÃO monetizado => ignora link inválido e avalia próximas fontes", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      affiliateLinks: [
        {
          channel: "telegram",
          trackedUrl: "https://cacaoferta.com.br/go/tg_offer1",
          subId: "tg_offer1",
          originalUrl: "https://www.mercadolivre.com.br/p/MLB21473210", // comum, não monetizado
        },
      ],
      explainability: {
        manual_resolution: {
          affiliate_url: "https://meli.la/ValidMeliShortlink",
        },
      },
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "telegram");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://meli.la/ValidMeliShortlink",
      source: "offer_explainability",
    });
  });

  it("cenário 6: Mercado Livre + explainability.manual_resolution.affiliate_url válido => usa esse destino", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      explainability: {
        manual_resolution: {
          affiliate_url: "https://meli.la/99ExpressLink",
        },
      },
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "facebook");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://meli.la/99ExpressLink",
      source: "offer_explainability",
    });
  });

  it("cenário 7: Shopee => preserva comportamento atual sem fail-closed de ML", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      marketplace: "Shopee",
      originalUrl: "https://shopee.com.br/product/123/456",
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "telegram");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://shopee.com.br/product/123/456",
      source: "official_input",
    });
  });

  it("cenário 8: Amazon => preserva comportamento atual", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      marketplace: "Amazon",
      originalUrl: "https://www.amazon.com.br/dp/B000123",
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "whatsapp");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://www.amazon.com.br/dp/B000123",
      source: "official_input",
    });
  });

  it("cenário 9: Shein => preserva comportamento atual", () => {
    const offer: OfficialAIOffer = {
      ...baseOffer,
      marketplace: "Shein",
      originalUrl: "https://br.shein.com/goods-p-12345.html",
    };
    const result = resolveOfficialAIAffiliateDestination(offer, "instagram");
    expect(result).toEqual({
      ok: true,
      affiliateUrl: "https://br.shein.com/goods-p-12345.html",
      source: "official_input",
    });
  });
});

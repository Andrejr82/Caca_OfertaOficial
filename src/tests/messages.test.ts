import { describe, expect, it } from "vitest";
import { generateInstagramMessage, generateTelegramMessage, generateWhatsAppMessage, generateFacebookMessage } from "@/lib/messages/generate";
import type { AffiliateLink, Offer } from "@/types/domain";

const baseOffer: Offer = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  platform: "Shopee",
  product_name: "Cadeira Gamer",
  category: "Móveis",
  original_url: "https://example.com",
  image_url: null,
  current_price: 99,
  old_price: 149,
  coupon: "CACA10",
  rating: 4.7,
  estimated_commission: 12,
  commission_rate: 8,
  score: 8.5,
  status: "approved",
  notes: null,
  seasonality: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const link: AffiliateLink = {
  id: "33333333-3333-3333-3333-333333333333",
  user_id: baseOffer.user_id,
  offer_id: baseOffer.id,
  channel: "telegram",
  original_url: baseOffer.original_url,
  tracked_url: "https://shopee.com.br/123",
  sub_id: "telegram_fone",
  clicks: 0,
  created_at: new Date().toISOString()
};

describe("message generation commercial copies", () => {
  it("copy com Pix, parcela e cupom", () => {
    const offer = {
      ...baseOffer,
      explainability: {
        pix_price: 89,
        installment_count: 10,
        installment_value: 9.90,
        installment_interest_free: true
      }
    };
    const message = generateTelegramMessage(offer, link);
    expect(message).toContain("❌ De: R$ 149,00");
    expect(message).toContain("✅ Por: R$ 99,00");
    expect(message).toContain("💰 No Pix: R$ 89,00");
    expect(message).toContain("💳 Ou 10x de R$ 9,90 sem juros");
    expect(message).toContain("🎟️ Cupom: CACA10");
  });

  it("copy sem campos opcionais", () => {
    const offer = {
      ...baseOffer,
      old_price: null,
      current_price: 99,
      coupon: null,
      explainability: null,
      marketplace_metrics: null
    };
    const message = generateTelegramMessage(offer, link);
    expect(message).toContain("✅ Por: R$ 99,00");
    expect(message).not.toContain("❌ De:");
    expect(message).not.toContain("💰 No Pix:");
    expect(message).not.toContain("💳 Ou");
    expect(message).not.toContain("🎟️ Cupom:");
    expect(message).not.toContain("🔄 Recorrência:");
    expect(message).not.toContain("📦");
    expect(message).not.toContain("⚠️");
  });

  it("recorrência Amazon", () => {
    const offer = {
      ...baseOffer,
      platform: "Amazon" as const,
      explainability: {
        subscription_price: 89.10
      }
    };
    const amzLink = { ...link, tracked_url: "https://amzn.to/abc" };
    const message = generateTelegramMessage(offer, amzLink);
    expect(message).toContain("🔄 Recorrência: R$ 89,10");
  });

  it("cupom no carrinho", () => {
    const offer = {
      ...baseOffer,
      explainability: {
        coupon_application_stage: "no carrinho"
      }
    };
    const message = generateTelegramMessage(offer, link);
    expect(message).toContain("📌 Aplique no carrinho");
  });

  it("cupom na finalização", () => {
    const offer = {
      ...baseOffer,
      explainability: {
        checkout_discount: true,
        coupon_application_stage: "na finalização"
      }
    };
    const message = generateTelegramMessage(offer, link);
    expect(message).toContain("📌 Aplique na finalização");
  });

  it("condição de variação", () => {
    const offer = {
      ...baseOffer,
      explainability: {
        variation_condition: "Apenas na cor Preta"
      }
    };
    const message = generateTelegramMessage(offer, link);
    expect(message).toContain("⚠️ Apenas na cor Preta");
  });

  it("ausência de informação inventada", () => {
    const offer = {
      ...baseOffer,
      coupon: null,
      explainability: {
        pix_price: 89
      }
    };
    const message = generateTelegramMessage(offer, link);
    expect(message).not.toContain("🎟️ Cupom:");
    expect(message).not.toContain("💳 Ou");
    expect(message).not.toContain("📦");
  });

  it("hashtags Facebook", () => {
    const message = generateFacebookMessage(baseOffer, link);
    const tagsMatches = message.match(/#\w+/g) || [];
    expect(tagsMatches.length).toBeGreaterThanOrEqual(3);
    expect(tagsMatches.length).toBeLessThanOrEqual(6);
    expect(message).toContain("#CacaOfertasOficial");
    expect(message).toContain("#Shopee");
  });

  it("hashtags Telegram", () => {
    const message = generateTelegramMessage(baseOffer, link);
    const tagsMatches = message.match(/#\w+/g) || [];
    expect(tagsMatches.length).toBeGreaterThanOrEqual(2);
    expect(tagsMatches.length).toBeLessThanOrEqual(4);
    expect(message).toContain("#Shopee");
  });

  it("ausência de hashtags no WhatsApp", () => {
    const message = generateWhatsAppMessage(baseOffer, link);
    const tagsMatches = message.match(/#\w+/g) || [];
    expect(tagsMatches.length).toBe(0);
  });
});

describe("message generation fixes", () => {
  it("valida bloqueio Shopee com link Amazon", () => {
    const amzLink = { ...link, tracked_url: "https://amazon.com.br/123" };
    expect(() => generateTelegramMessage(baseOffer, amzLink)).toThrow("Link incompatível");
  });

  it("valida Amazon com amzn.to", () => {
    const offer = { ...baseOffer, platform: "Amazon" as const };
    const amzLink = { ...link, tracked_url: "https://amzn.to/123" };
    expect(() => generateTelegramMessage(offer, amzLink)).not.toThrow();
  });

  it("valida ML com meli.la", () => {
    const offer = { ...baseOffer, platform: "Mercado Livre" as const };
    const mlLink = { ...link, tracked_url: "https://meli.la/123" };
    expect(() => generateTelegramMessage(offer, mlLink)).not.toThrow();
  });

  it("valida hashtags normais e compostas", () => {
    const message = generateTelegramMessage(baseOffer, link);
    expect(message).toContain("#CadeiraGamer");
    expect(message).toContain("#Moveis");
    expect(message).not.toContain("#Mveis");
  });

  it("omite Prime fora da Amazon", () => {
    const offer = { ...baseOffer, explainability: { prime_only: true } };
    const message = generateTelegramMessage(offer, link);
    expect(message).not.toContain("Exclusivo Prime");
  });

  it("omite recorrência fora da Amazon", () => {
    const offer = { ...baseOffer, explainability: { subscription_price: 50 } };
    const message = generateTelegramMessage(offer, link);
    expect(message).not.toContain("Recorrência");
  });

  it("frete grátis preservado com Prime", () => {
    const offer = { ...baseOffer, platform: "Amazon" as const, explainability: { prime_only: true, free_shipping: true } };
    const amzLink = { ...link, tracked_url: "https://amzn.to/123" };
    const message = generateTelegramMessage(offer, amzLink);
    expect(message).toContain("📦 Frete Grátis");
    expect(message).toContain("⭐ Exclusivo Prime");
  });

  it("Instagram sem #cupom quando não tem cupom", () => {
    const offer = { ...baseOffer, coupon: null };
    const message = generateInstagramMessage(offer, link);
    expect(message.feed).not.toContain("#cupom");
  });

  it("chamadas condicionais corretas", () => {
    // Preço caiu
    let msg = generateTelegramMessage(baseOffer, link);
    expect(msg).toContain("💥 Preço caiu!");
    
    // Cupom disponível
    const couponOffer = { ...baseOffer, old_price: null };
    msg = generateTelegramMessage(couponOffer, link);
    expect(msg).toContain("🎟️ Cupom disponível!");

    // Mais vendido
    const bestOffer = { ...baseOffer, old_price: null, coupon: null, explainability: { best_seller: true } };
    msg = generateTelegramMessage(bestOffer, link);
    expect(msg).toContain("⭐ Mais vendido em oferta!");

    // Por tempo limitado
    const flashOffer = { ...baseOffer, old_price: null, coupon: null, explainability: { flash_sale: true } };
    msg = generateTelegramMessage(flashOffer, link);
    expect(msg).toContain("⚡ Oferta por tempo limitado!");

    // Fallback
    const fallbackOffer = { ...baseOffer, old_price: null, coupon: null };
    msg = generateTelegramMessage(fallbackOffer, link);
    expect(msg).toContain("🔥 Achado do dia!");
  });
});

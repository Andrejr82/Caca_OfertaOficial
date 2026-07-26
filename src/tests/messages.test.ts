import { describe, expect, it } from "vitest";
import { generateInstagramMessage, generateTelegramMessage, generateWhatsAppMessage, generateFacebookMessage } from "@/lib/messages/generate";
import type { AffiliateLink, Offer } from "@/types/domain";

const baseOffer: Offer = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  platform: "Shopee",
  product_name: "Fone Bluetooth Sem Fio",
  category: "Eletrônicos",
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
  tracked_url: "https://example.com?sub_id=telegram_fone",
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
    const message = generateTelegramMessage(offer, link);
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
    // 3 a 6 hashtags, com #CacaOfertasOficial, marketplace
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

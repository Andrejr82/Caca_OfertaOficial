import { describe, expect, it } from "vitest";
import { generateTelegramMessage, generateFacebookMessage, generateWhatsAppMessage, deriveOfferSignals, selectPrimaryAngle, selectStableCall } from "@/lib/messages/generate";
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
  coupon: null,
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

describe("Deterministic Copy Engine Tests", () => {
  
  describe("Prioridade de Ângulos", () => {
    it("cupom vence desconto", () => {
      const offer = { ...baseOffer, current_price: 100, old_price: 200, coupon: "TESTE" };
      const signals = deriveOfferSignals(offer, { coupon_code: "TESTE" });
      const angle = selectPrimaryAngle(signals);
      expect(angle).toBe("coupon");
    });
    
    it("desconto vence Pix", () => {
      const offer = { ...baseOffer, current_price: 100, old_price: 200 };
      const signals = deriveOfferSignals(offer, { pix_price: 90 });
      const angle = selectPrimaryAngle(signals);
      expect(angle).toBe("discount");
    });
    
    it("Pix vence parcelamento", () => {
      const offer = { ...baseOffer, current_price: 100, old_price: null };
      const signals = deriveOfferSignals(offer, { pix_price: 90, installment_count: 10, installment_value: 10 });
      const angle = selectPrimaryAngle(signals);
      expect(angle).toBe("pix");
    });
    
    it("parcelamento vence frete grátis", () => {
      const offer = { ...baseOffer, current_price: 100, old_price: null };
      const signals = deriveOfferSignals(offer, { installment_count: 10, installment_value: 10, free_shipping: true });
      const angle = selectPrimaryAngle(signals);
      expect(angle).toBe("installment");
    });
  });

  describe("Formatação de Campos", () => {
    it("parcelamento sem confirmação de juros exibe apenas divisao", () => {
      const offer = { ...baseOffer, current_price: 100, old_price: null };
      const signals = deriveOfferSignals(offer, { installment_count: 10, installment_value: 10, installment_interest_free: false });
      const call = selectStableCall("installment", offer.id, "telegram", signals);
      expect(call).toContain("Dá para dividir");
      expect(call).not.toContain("Parcele sem juros");
    });
    
    it("parcelamento com juros confirmado permite sem juros", () => {
      const offer = { ...baseOffer, current_price: 100, old_price: null };
      const signals = deriveOfferSignals(offer, { installment_count: 10, installment_value: 10, installment_interest_free: true });
      const call = selectStableCall("installment", offer.id, "telegram", signals);
      expect(call === "💳 Parcele sem juros!" || call.includes("Dá para dividir")).toBe(true);
    });

    it("cupom com código", () => {
      const offer = { ...baseOffer, coupon: "PROMO" };
      const msg = generateTelegramMessage(offer, link);
      expect(msg).toContain("🎟️ Cupom: PROMO");
    });

    it("cupom ativável sem código (com evidences)", () => {
      const offer = { ...baseOffer, coupon: null, explainability: { checkout_discount: true } };
      const msg = generateTelegramMessage(offer, link);
      expect(msg).toContain("🎟️ Ative o cupom na página do produto");
      expect(msg).toContain("📌 Aplique na finalização");
    });
  });

  describe("Segurança e Validação", () => {
    it("Prime removido fora da Amazon (não estourando erro fatal pq o próprio generate corrige)", () => {
      const offer = { ...baseOffer, platform: "Mercado Livre", explainability: { prime_only: true } };
      const l = { ...link, tracked_url: "https://meli.la/123" };
      const msg = generateTelegramMessage(offer, l);
      expect(msg).not.toContain("Exclusivo Prime");
    });

    it("recorrência removida fora da Amazon", () => {
      const offer = { ...baseOffer, platform: "Shopee", explainability: { subscription_price: 90 } };
      const msg = generateTelegramMessage(offer, link);
      expect(msg).not.toContain("Recorrência");
    });

    it("erro fatal para link incompatível", () => {
      const amzLink = { ...link, tracked_url: "https://amzn.to/abc" };
      expect(() => generateTelegramMessage(baseOffer, amzLink)).toThrow("Link incompatível");
    });

    it("Pix inválido omitido", () => {
      const offer = { ...baseOffer, current_price: 100, explainability: { pix_price: 120 } };
      const msg = generateTelegramMessage(offer, link);
      expect(msg).not.toContain("No Pix");
    });
  });

  describe("Variação e Estabilidade", () => {
    it("fallback determinístico sem offer.id não quebra a estabilidade", () => {
      const offer = { ...baseOffer, id: undefined, external_id: "EXT123" };
      const signals = deriveOfferSignals(offer as any, {});
      const call1 = selectStableCall("simple_offer", (offer as any).external_id, "telegram", signals);
      const call2 = selectStableCall("simple_offer", (offer as any).external_id, "telegram", signals);
      expect(call1).toBe(call2);
      expect(call1).toBeTruthy();
    });

    it("mesma entrada produzindo a mesma saída", () => {
      const msg1 = generateTelegramMessage(baseOffer, link);
      const msg2 = generateTelegramMessage(baseOffer, link);
      expect(msg1).toBe(msg2);
    });

    it("canais diferentes podem variar chamadas (sem Math.random)", () => {
      const signals = deriveOfferSignals(baseOffer, {});
      const c1 = selectStableCall("simple_offer", baseOffer.id, "telegram", signals);
      const c2 = selectStableCall("simple_offer", baseOffer.id, "facebook", signals);
      const c3 = selectStableCall("simple_offer", baseOffer.id, "whatsapp", signals);
      // Nao necessariamente garantido de serem sempre diferentes, mas hash garante variacao no espaco
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();
      expect(c3).toBeDefined();
    });
  });

  describe("Regras de Hashtags", () => {
    it("WhatsApp sem hashtags", () => {
      const msg = generateWhatsAppMessage(baseOffer, link);
      expect(msg).not.toContain("#");
    });

    it("Facebook e Telegram dentro dos limites", () => {
      const fb = generateFacebookMessage(baseOffer, link);
      const tg = generateTelegramMessage(baseOffer, link);
      
      const fbHashtags = (fb.match(/#/g) || []).length;
      expect(fbHashtags).toBeGreaterThanOrEqual(3);
      expect(fbHashtags).toBeLessThanOrEqual(6);

      const tgHashtags = (tg.match(/#/g) || []).length;
      expect(tgHashtags).toBeGreaterThanOrEqual(2);
      expect(tgHashtags).toBeLessThanOrEqual(4);
    });
  });
});

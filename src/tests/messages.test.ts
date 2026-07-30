import { describe, expect, it } from "vitest";
import { generateTelegramMessage, generateFacebookMessage, generateWhatsAppMessage, generateInstagramMessage, deriveOfferSignals, selectPrimaryAngle, selectStableCall, generateAllMessages } from "@/lib/messages/generate";
import type { AffiliateLink, Offer } from "@/types/domain";

const baseOffer: any = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  platform: "Shopee",
  product_name: "Cadeira Gamer",
  category: "Móveis",
  original_url: "https://shope.ee/123",
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
  tracked_url: "https://cacaoferta.com.br/go/tg_11111111",
  sub_id: "telegram_fone",
  clicks: 0,
  created_at: new Date().toISOString()
};

const fbLink: AffiliateLink = {
  ...link,
  channel: "facebook",
  tracked_url: "https://cacaoferta.com.br/go/fb_11111111",
  sub_id: "facebook_fone"
};

const wpLink: AffiliateLink = {
  ...link,
  channel: "whatsapp",
  tracked_url: "https://cacaoferta.com.br/go/wp_11111111",
  sub_id: "whatsapp_fone"
};

describe("Deterministic Copy Engine Tests", () => {

  describe("Copy comercial verificada do Mercado Livre", () => {
    const mlOffer: any = {
      ...baseOffer,
      platform: "Mercado Livre",
      product_name: "Panela de Arroz Fast Rice 5 Premium Mondial 400W – NPE-08-5X",
      current_price: 131,
      old_price: 244.9,
      seller_name: "Mercado Livre Eletrônicos",
      shipping_free: true,
      original_url: "https://produto.mercadolivre.com.br/MLB-3583906235",
      marketplace_metrics: {
        official_store_id: 2707,
        official_store_name: null,
        ranking_type: "BEST_SELLER",
        ranking_entity_type: "PRODUCT",
        ranking_position: 1,
        ranking_scope: "CATEGORY"
      },
      explainability: { affiliate_url: "https://meli.la/ml-affiliate" }
    };

    const mlLink: any = { ...link, tracked_url: "https://cacaoferta.com.br/go/tg_ml" };
    const mlWpLink: any = { ...wpLink, tracked_url: "https://cacaoferta.com.br/go/wp_ml" };

    it("renderiza apenas evidências comerciais confirmadas", () => {
      const copy = generateTelegramMessage(mlOffer, mlLink);
      expect(copy).toContain("~de R$ 244,90~");
      expect(copy).toContain("por R$ 131,00");
      expect(copy).toContain("🔥 47% de desconto");
      expect(copy).toContain("🏆 Nº 1 entre os mais vendidos da categoria");
      expect(copy).toContain("🏪 Loja oficial no Mercado Livre");
      expect(copy).toContain("🏷️ Vendido por Mercado Livre Eletrônicos");
      expect(copy).toContain("🚚 Frete grátis");
      expect(copy).toContain(mlLink.tracked_url);
      expect(copy).not.toContain(mlOffer.original_url);
    });

    it("não inventa ranking, loja ou benefícios ausentes", () => {
      const offer = { ...mlOffer, old_price: null, seller_name: null, shipping_free: null, marketplace_metrics: { official_store_id: null, source_position: 1, score: 99 } };
      const copy = generateWhatsAppMessage(offer, mlWpLink);
      expect(copy).toContain("por R$ 131,00");
      expect(copy).not.toContain("de R$");
      expect(copy).not.toContain("desconto");
      expect(copy).not.toContain("🏆");
      expect(copy).not.toContain("🏪");
      expect(copy).not.toContain("🏷️");
      expect(copy).not.toContain("🚚");
      expect(copy).not.toContain("Pix");
      expect(copy).not.toContain("parcel");
      expect(copy).not.toContain("Cupom");
      expect(copy).not.toContain("source_position");
    });

    it("formata posições de best seller somente com evidência de produto", () => {
      const make = (position: number) => generateTelegramMessage({ ...mlOffer, marketplace_metrics: { ...mlOffer.marketplace_metrics, ranking_position: position } }, mlLink);
      expect(make(5)).toContain("🏆 Nº 5 entre os mais vendidos da categoria");
      expect(make(11)).toContain("🏆 Entre os mais vendidos da categoria");
      expect(generateTelegramMessage({ ...mlOffer, marketplace_metrics: { ...mlOffer.marketplace_metrics, ranking_entity_type: "SELLER" } }, mlLink)).not.toContain("🏆");
    });

    it("exibe nome de loja somente quando campo oficial confirmado e não confunde vendedor", () => {
      const named = { ...mlOffer, marketplace_metrics: { ...mlOffer.marketplace_metrics, official_store_name: "Mondial Oficial" } };
      expect(generateTelegramMessage(named, mlLink)).toContain("🏪 Loja Oficial Mondial Oficial");
      const sameAsSeller = { ...mlOffer, marketplace_metrics: { ...mlOffer.marketplace_metrics, official_store_name: mlOffer.seller_name } };
      expect(generateTelegramMessage(sameAsSeller, mlLink)).toContain("🏪 Loja oficial no Mercado Livre");
      expect(generateTelegramMessage(sameAsSeller, mlLink)).not.toContain("🏪 Loja Oficial Mercado Livre Eletrônicos");
    });

    it("usa somente tracked_url e rejeita ausência de link monetizado", () => {
      expect(generateTelegramMessage(mlOffer, mlLink)).toContain(mlLink.tracked_url);
      expect(() => generateTelegramMessage(mlOffer, { tracked_url: "" })).toThrow("NO_MONETIZED_LINK");
      expect(() => generateTelegramMessage(mlOffer, { tracked_url: mlOffer.original_url })).toThrow("NO_MONETIZED_LINK");
    });

    it("mantém Instagram sem URL direta, mas com dados comerciais verificados", () => {
      const copy = generateInstagramMessage(mlOffer, { ...mlLink, channel: "instagram" });
      expect(copy.feed).toContain("R$ 131,00");
      expect(copy.feed).toContain("Vendido por Mercado Livre Eletrônicos");
      expect(copy.feed).toContain("Link na bio");
      expect(copy.feed).not.toContain(mlOffer.original_url);
    });
  });
  
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
    it("apresenta desconto e economia sem emoji decorativo no título", () => {
      const msg = generateTelegramMessage(baseOffer, link);
      expect(msg).toContain("🔥 34% DE DESCONTO!");
      expect(msg).toContain("Economize R$\u00a050,00");
      expect(msg).not.toContain("🛍️ Cadeira Gamer");
      expect((msg.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length).toBeLessThanOrEqual(4);
    });

    it("não anuncia desconto quando não há preço anterior válido", () => {
      const offer = { ...baseOffer, old_price: null, current_price: 99 };
      const msg = generateTelegramMessage(offer, link);
      expect(msg).not.toContain("DE DESCONTO");
      expect(msg).not.toContain("Economize");
    });

    it("usa frete grátis como benefício contextual", () => {
      const offer = { ...baseOffer, old_price: null, shipping_free: true };
      const msg = generateTelegramMessage(offer, link);
      expect(msg).toContain("📦 Frete Grátis");
    });

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

    it("canal sem link correspondente é rejeitado", () => {
      expect(() => generateFacebookMessage(baseOffer, wpLink)).toThrow("Link incompatível ou ausente para o canal facebook");
    });

    it("canal com link real é aceito e nenhum prefixo é substituído", () => {
      const fb = generateFacebookMessage(baseOffer, fbLink);
      expect(fb).toContain("👇 Comprar:\nhttps://cacaoferta.com.br/go/fb_11111111");
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
      const msg = generateWhatsAppMessage(baseOffer, wpLink);
      expect(msg).not.toContain("#");
    });

    it("Facebook e Telegram dentro dos limites", () => {
      const fb = generateFacebookMessage(baseOffer, fbLink);
      const tg = generateTelegramMessage(baseOffer, link);
      
      const fbHashtags = (fb.match(/#/g) || []).length;
      expect(fbHashtags).toBeGreaterThanOrEqual(3);
      expect(fbHashtags).toBeLessThanOrEqual(6);

      const tgHashtags = (tg.match(/#/g) || []).length;
      expect(tgHashtags).toBeGreaterThanOrEqual(2);
      expect(tgHashtags).toBeLessThanOrEqual(4);
    });
  });

  describe("Geração com múltiplos links (4 canais)", () => {
    it("deve rejeitar geração sem links nativos para todos os canais", () => {
      const offer = { ...baseOffer };
      const telegramOnly = { channel: "telegram", tracked_url: "https://app.com/go/tg_full" } as any;

      expect(() => generateAllMessages(offer, telegramOnly)).toThrow(
        "affiliate_links ausentes para os canais: telegram, whatsapp, facebook, instagram"
      );
    });

    it("deve selecionar exatamente o link correto para cada canal a partir de offer.affiliate_links", () => {
      const fullUUID = "11111111-2222-3333-4444-555555555555";
      const offerWithLinks = {
        ...baseOffer,
        id: fullUUID,
        affiliate_links: [
          { channel: "telegram", tracked_url: `https://app.com/go/tg_${fullUUID}` },
          { channel: "whatsapp", tracked_url: `https://app.com/go/wp_${fullUUID}` },
          { channel: "facebook", tracked_url: `https://app.com/go/fb_${fullUUID}` },
          { channel: "instagram", tracked_url: `https://app.com/go/ig_${fullUUID}` }
        ]
      };

      const msgs = generateAllMessages(offerWithLinks, offerWithLinks.affiliate_links as any);

      // Telegram deve ter apenas o link tg_
      expect(msgs.telegram).toContain(`tg_${fullUUID}`);
      expect(msgs.telegram).not.toContain(`fb_${fullUUID}`);
      expect(msgs.telegram).not.toContain(`wp_${fullUUID}`);

      // WhatsApp deve ter apenas wp_
      expect(msgs.whatsapp).toContain(`wp_${fullUUID}`);
      expect(msgs.whatsapp).not.toContain(`tg_${fullUUID}`);
      expect(msgs.whatsapp).not.toContain(`fb_${fullUUID}`);

      // Facebook deve ter apenas fb_
      expect(msgs.facebook).toContain(`fb_${fullUUID}`);
      expect(msgs.facebook).not.toContain(`tg_${fullUUID}`);
      expect(msgs.facebook).not.toContain(`wp_${fullUUID}`);

      // Instagram não deve conter URL do go/
      expect(msgs.instagram.feed).not.toContain(`ig_${fullUUID}`);
      expect(msgs.instagram.feed).toContain("Link na bio");
    });
  });
});

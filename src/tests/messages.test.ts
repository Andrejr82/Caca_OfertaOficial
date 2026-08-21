import { describe, expect, it } from "vitest";
import {
  deriveOfferSignals,
  generateAllMessages,
  generateFacebookMessage,
  generateInstagramMessage,
  generateTelegramMessage,
  generateWhatsAppMessage,
  selectPrimaryAngle,
  selectStableCall,
} from "@/lib/messages/generate";
import type { AffiliateLink, Offer } from "@/types/domain";

const offer = {
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
  updated_at: new Date().toISOString(),
  explainability: {},
} as Offer;

function link(channel: AffiliateLink["channel"], suffix: string): AffiliateLink {
  return {
    id: `33333333-3333-1111-1111-${suffix.padEnd(12, "0")}`,
    user_id: offer.user_id,
    offer_id: offer.id,
    channel,
    original_url: offer.original_url,
    tracked_url: `https://cacaoferta.com.br/go/${suffix}`,
    sub_id: suffix,
    clicks: 0,
    created_at: new Date().toISOString(),
  } as AffiliateLink;
}

const telegram = link("telegram", "tg_offer1");
const whatsapp = link("whatsapp", "wa_offer1");
const facebook = link("facebook", "fb_offer1");
const instagram = link("instagram", "ig_offer1");

describe("Messages compatibility façade on Copy V5", () => {
  it("Telegram usa renderer V5, preço em linhas separadas e uma URL tracked", () => {
    const copy = generateTelegramMessage(offer, telegram);
    expect(copy).toContain("De R$ 149,00\nPor R$ 99,00");
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
    expect(copy).toContain(telegram.tracked_url);
    expect(copy).not.toContain("De R$ 149,00 por R$ 99,00");
  });

  it("WhatsApp usa renderer V5 e uma única ação/URL", () => {
    const copy = generateWhatsAppMessage(offer, whatsapp);
    expect(copy).toContain("De R$ 149,00\nPor R$ 99,00");
    expect(copy.match(/https:\/\//gu)).toHaveLength(1);
    expect(copy).toContain(whatsapp.tracked_url);
  });

  it("Facebook mantém body sem URL direta", () => {
    const copy = generateFacebookMessage(offer, facebook);
    expect(copy).toContain("Link da oferta no primeiro comentário");
    expect(copy).not.toContain("https://");
  });

  it("Instagram mantém feed sem URL direta", () => {
    const copy = generateInstagramMessage(offer, instagram);
    expect(copy.feed).toContain("Link da oferta na bio");
    expect(copy.feed).not.toContain("https://");
    expect(copy.stories).toEqual([]);
    expect(copy.reels).toEqual([]);
    expect(copy.carousel).toEqual([]);
  });

  it("generateAllMessages delega todos os canais existentes à V5", () => {
    const result = generateAllMessages(offer, [telegram, whatsapp, facebook, instagram]);
    expect(result.telegram).toContain(telegram.tracked_url);
    expect(result.whatsapp).toContain(whatsapp.tracked_url);
    expect(result.facebook).not.toContain("https://");
    expect(result.instagram?.feed).not.toContain("https://");
  });

  it("rejeita link ausente ou não HTTPS", () => {
    expect(() => generateTelegramMessage(offer, { tracked_url: "" })).toThrow("NO_MONETIZED_LINK");
    expect(() => generateWhatsAppMessage(offer, { tracked_url: "http://example.com" })).toThrow("NO_MONETIZED_LINK");
  });

  it("mantém helpers de sinais apenas como compatibilidade, sem renderer paralelo", () => {
    const signals = deriveOfferSignals(offer, { coupon_code: "PROMO", pix_price: 90 });
    expect(selectPrimaryAngle(signals)).toBe("coupon");
    expect(selectStableCall("coupon", offer.id, "telegram", signals)).toBe("🎟️ Cupom: PROMO");
  });
});

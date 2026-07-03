import { describe, expect, it } from "vitest";
import { generateInstagramMessage, generateTelegramMessage, generateWhatsAppMessage } from "@/lib/messages/generate";
import type { AffiliateLink, Offer } from "@/types/domain";

const offer: Offer = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  platform: "Shopee",
  product_name: "Fone Bluetooth",
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
  user_id: offer.user_id,
  offer_id: offer.id,
  channel: "telegram",
  original_url: offer.original_url,
  tracked_url: "https://example.com?sub_id=telegram_fone_11111111",
  sub_id: "telegram_fone_11111111",
  clicks: 0,
  created_at: new Date().toISOString()
};

describe("message generation", () => {
  it("generates Telegram copy with disclosure and tracked link", () => {
    const message = generateTelegramMessage(offer, link);
    expect(message).toContain("Fone Bluetooth");
    expect(message).toContain(link.tracked_url);
    // As novas mensagens usam hashtags e emojis, a comissão não é mais obrigatória
  });

  it("generates Instagram workflow content", () => {
    const message = generateInstagramMessage(offer, link);
    expect(message.feed).toContain("caca.ofertaoficial");
    expect(message.stories.length).toBeGreaterThan(1);
    // Novo formato de reels não usa obrigatoriamente a palavra Abertura
  });

  it("generates concise WhatsApp copy", () => {
    const message = generateWhatsAppMessage(offer, link);
    expect(message).toContain(link.tracked_url);
    expect(message).toContain("💰 *PREÇO*");
    expect(message).toContain("🏷 *MARKETPLACE*");
    expect(message).toContain("🎟 *CUPOM*");
    expect(message).toContain("🔗 *LINK DA OFERTA*");
    expect(message).toContain("👇 *CTA*");
  });
});

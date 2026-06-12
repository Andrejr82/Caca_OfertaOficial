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
    expect(message).toContain("comissão");
    expect(message).toContain("Preço e disponibilidade");
  });

  it("generates Instagram workflow content", () => {
    const message = generateInstagramMessage(offer, link);
    expect(message.feed).toContain("caca.ofertaoficial");
    expect(message.stories.length).toBeGreaterThan(1);
    expect(message.reels.join(" ")).toContain("Abertura");
    expect(message.carousel.join(" ")).toContain("Slide");
  });

  it("generates concise WhatsApp copy", () => {
    const message = generateWhatsAppMessage(offer, link);
    expect(message).toContain("Link:");
    expect(message).toContain("sem custo extra");
  });
});

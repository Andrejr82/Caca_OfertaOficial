import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import type { Offer } from "@/types/domain";

describe("Groq AI Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GROQ_API_KEY = "test-key";
  });

  it("sends request and parses Groq JSON response correctly", async () => {
    const mockOffer = {
      id: "offer-1",
      user_id: "user-1",
      platform: "Mercado Livre",
      product_name: "Fone Bluetooth ANC",
      current_price: 150,
      old_price: 250,
      coupon: "ANC50",
      rating: 4.7,
      category: "Eletrônicos",
      notes: "Promoção relâmpago"
    } as unknown as Offer;

    const mockLinks = {
      telegram: "https://t.me/caca/test-tel",
      instagram: "https://caca.bio/test-inst",
      whatsapp: "https://wa.me/caca/test-wa"
    };

    const mockGroqResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 9.2,
              telegram: "<b>🔥 Fone com ANC na promoção!</b>",
              instagram_feed: "Legenda de feed incrível...",
              instagram_stories: ["Stories 1", "Stories 2"],
              instagram_reels: ["Hook", "CTA"],
              instagram_carousel: ["Slide 1", "Slide 2"],
              whatsapp: "WhatsApp text..."
            })
          }
        }
      ]
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockGroqResponse
    } as Response);

    const result = await generateOfferAnalysis(mockOffer, mockLinks);
    
    expect(result.score).toBe(9.2);
    expect(result.telegram).toContain("<b>🔥 Fone com ANC na promoção!</b>");
    expect(result.instagram_feed).toBe("Legenda de feed incrível...");
    expect(result.instagram_stories).toHaveLength(2);
    expect(result.instagram_reels).toHaveLength(2);
    expect(result.instagram_carousel).toHaveLength(2);
    expect(result.whatsapp).toBe("WhatsApp text...");
  });

  it("falls back to standard template generator when Groq fails", async () => {
    // Apaga a chave API para forçar o fallback
    delete process.env.GROQ_API_KEY;

    const mockOffer = {
      id: "offer-1",
      user_id: "user-1",
      platform: "Mercado Livre",
      product_name: "Fone Bluetooth ANC",
      current_price: 150,
      old_price: 250,
      coupon: "ANC50",
      rating: 4.7,
      category: "Eletrônicos",
      notes: "Promoção relâmpago"
    } as unknown as Offer;

    const mockLinks = {
      telegram: "https://t.me/caca/test-tel",
      instagram: "https://caca.bio/test-inst",
      whatsapp: "https://wa.me/caca/test-wa"
    };

    const result = await generateOfferAnalysis(mockOffer, mockLinks);
    
    expect(result.score).toBeGreaterThanOrEqual(5.0);
    expect(result.telegram).toContain("Fone Bluetooth ANC");
    expect(result.telegram).toContain("https://t.me/caca/test-tel");
    expect(result.instagram_feed).toContain("Fone Bluetooth ANC");
  });
});

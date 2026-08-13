import { describe, expect, it } from "vitest";
import { selectEditorialTop30TelegramSelection } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

describe("Telegram editorial runtime relation shape", () => {
  it("does not throw when Supabase returns the related offer as a one-item array", () => {
    const offer = {
      id: "offer-1",
      user_id: "tenant-1",
      platform: "Shopee" as const,
      product_name: "Organizador de gaveta",
      category: "Casa",
      original_url: "https://example.test/offer-1",
      image_url: "https://example.test/offer-1.jpg",
      current_price: 20,
      old_price: 30,
      coupon: null,
      rating: 4.8,
      estimated_commission: null,
      commission_rate: null,
      score: 80,
      status: "pending_manual_review" as const,
      notes: null,
      seasonality: null,
      created_at: "2026-08-13T20:00:00.000Z",
      updated_at: "2026-08-13T20:00:00.000Z",
      marketplace_metrics: { sales: 100, rating: 4.8 },
      explainability: {
        correlation_id: "cycle-current",
        discovery_evidence: { discoveredAt: "2026-08-13T20:00:00.000Z" },
      },
    };

    expect(() => selectEditorialTop30TelegramSelection([{
      id: "post-1",
      offer_id: "offer-1",
      channel: "telegram",
      status: "draft",
      content: "Oferta editorial",
      created_at: offer.created_at,
      posted_at: null,
      external_id: null,
      offers: [offer] as never,
    }], new Date("2026-08-13T21:00:00.000Z"))).not.toThrow();
  });
});

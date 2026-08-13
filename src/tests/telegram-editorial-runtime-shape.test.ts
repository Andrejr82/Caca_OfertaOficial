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

  it("selects the real approved offer that backs the current draft cohort", () => {
    const offer = {
      id: "c78c4acd-09ee-486d-9645-6e8649da8faf",
      user_id: "7a9ca7b7-f464-46e0-a9de-9b322c73628a",
      platform: "Shopee" as const,
      product_name: "Jogo De Talheres inox Faqueiro",
      category: "casa_cozinha_editorial",
      original_url: "https://s.shopee.com.br/6fgSGE3mbX",
      image_url: "https://cf.shopee.com.br/file/br-11134207-81z1k-mfsj1bzkfk7916",
      current_price: 19.9,
      old_price: null,
      coupon: null,
      rating: null,
      estimated_commission: null,
      commission_rate: null,
      score: 6.1,
      status: "approved" as const,
      notes: null,
      seasonality: null,
      created_at: "2026-08-13T20:59:19.213434+00:00",
      updated_at: "2026-08-13T21:11:07.585+00:00",
      marketplace_metrics: {},
      explainability: {
        correlation_id: "38743d23-96df-41d6-863c-667ec9567ad4",
        scenarioId: "casa_cozinha_editorial",
        discovery_evidence: { discoveredAt: "2026-08-13T20:59:06.357Z" },
      },
    };

    const selection = selectEditorialTop30TelegramSelection([{
      id: "844cfd5d-c0af-4035-9ebb-c8dd1734da4e",
      offer_id: offer.id,
      user_id: offer.user_id,
      channel: "telegram",
      status: "draft",
      content: "Oferta editorial",
      created_at: "2026-08-13T21:00:00.022767+00:00",
      posted_at: null,
      external_id: null,
      offers: offer,
    }], new Date("2026-08-13T22:49:00.000Z"));

    expect(selection.offerIds).toEqual([offer.id]);
  });
});

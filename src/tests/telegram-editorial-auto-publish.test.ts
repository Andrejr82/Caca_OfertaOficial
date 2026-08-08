import { describe, expect, it } from "vitest";
import type { Offer } from "@/types/domain";
import { selectEditorialTop30TelegramOfferIds, type TelegramEditorialDraftRow } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

const NOW = new Date("2026-08-08T12:00:00.000Z");

function offer(id: string, createdAt: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    user_id: "user-1",
    platform: "Shopee",
    product_name: `Organizador de gaveta modelo ${id}`,
    category: "Casa",
    original_url: `https://shopee.test/${id}`,
    image_url: `https://images.test/${id}.jpg`,
    current_price: 39,
    old_price: 59,
    coupon: null,
    rating: 4.8,
    estimated_commission: null,
    commission_rate: null,
    score: 80,
    status: "pending_manual_review",
    notes: null,
    seasonality: null,
    created_at: createdAt,
    updated_at: "2026-08-08T12:00:00.000Z",
    marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 },
    explainability: { correlation_id: "cycle-current", discovery_evidence: { discoveredAt: "2026-08-08T10:00:00.000Z" } },
    ...overrides,
  };
}

function draft(offerRow: Offer, overrides: Partial<TelegramEditorialDraftRow> = {}): TelegramEditorialDraftRow {
  return {
    id: `post-${offerRow.id}`,
    offer_id: offerRow.id,
    channel: "telegram",
    status: "draft",
    content: "Oferta editorial",
    created_at: offerRow.created_at,
    posted_at: null,
    external_id: null,
    offers: offerRow,
    ...overrides,
  };
}

describe("Telegram editorial auto-publish selection", () => {
  it("selects only the current editorial Top30 from 582 drafts", () => {
    const rows = [
      ...Array.from({ length: 552 }, (_, index) => draft(offer(`historical-${index}`, "2026-08-07T10:00:00.000Z"))),
      ...Array.from({ length: 30 }, (_, index) => draft(offer(`current-${index}`, "2026-08-08T10:00:01.000Z"))),
    ];

    const selected = selectEditorialTop30TelegramOfferIds(rows, NOW);

    expect(rows).toHaveLength(582);
    expect(selected).toHaveLength(30);
    expect(selected.every((id) => id.startsWith("current-"))).toBe(true);
  });

  it("keeps manual express outside editorial publication and blocks old/outside drafts", () => {
    const current = Array.from({ length: 30 }, (_, index) => draft(offer(`current-${index}`, "2026-08-08T10:00:01.000Z")));
    const manual = draft(offer("manual", "2026-08-08T11:00:00.000Z", { explainability: { manual_source: true } }));
    const old = draft(offer("old", "2026-08-07T10:00:00.000Z"));
    const alreadyPublished = draft(offer("published", "2026-08-08T10:00:01.000Z"), { status: "published", external_id: "tg-1" });

    const selected = selectEditorialTop30TelegramOfferIds([...current, manual, old, alreadyPublished], NOW);

    expect(selected).toHaveLength(30);
    expect(selected).not.toContain("manual");
    expect(selected).not.toContain("old");
    expect(selected).not.toContain("published");
  });

  it("returns no candidates when no current editorial draft exists", () => {
    expect(selectEditorialTop30TelegramOfferIds([draft(offer("old", "2026-08-07T10:00:00.000Z"))], NOW)).toEqual([]);
  });
});

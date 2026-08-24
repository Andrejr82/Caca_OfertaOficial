import { describe, expect, it } from "vitest";
import type { Offer } from "@/types/domain";
import { selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";
import { mergePanelDrafts } from "@/lib/offers/panel-draft-selection";

const TODAY_START = new Date("2026-08-09T03:00:00.000Z");

function editorialOffer(id: string, overrides: Partial<Offer> = {}): Offer {
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
    created_at: "2026-08-09T10:00:01.000Z",
    updated_at: "2026-08-09T12:00:00.000Z",
    marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 },
    explainability: {
      correlation_id: "cycle-editorial",
      discovery_evidence: { discoveredAt: "2026-08-08T10:00:00.000Z" },
    },
    ...overrides,
  };
}

function draft(offer: Offer) {
  return {
    id: `post-${offer.id}`,
    offer_id: offer.id,
    status: "draft",
    created_at: offer.created_at,
    posted_at: null,
    external_id: null,
    offers: offer,
  };
}

describe("editorial Top30 channel separation", () => {
  it("selects at most 30 editorial offers and excludes manual express from ranking", () => {
    const editorial = Array.from({ length: 582 }, (_, index) => editorialOffer(`editorial-${index}`));
    const manual = editorialOffer("manual-express", {
      product_name: "Link manual express",
      explainability: { manual_source: true },
    });

    const now = new Date("2026-08-09T12:00:00.000Z");
    const selected = selectEditorialTop30([...editorial, manual], 30, now);

    expect(selected).toHaveLength(30);
    expect(selected.every((candidate) => candidate.id !== manual.id)).toBe(true);
    expect(selected.every((candidate) => candidate.id.startsWith("editorial-"))).toBe(true);
  });

  it("unions 30 editorial drafts with manual WhatsApp and Telegram drafts", () => {
    const editorial = Array.from({ length: 30 }, (_, index) => editorialOffer(`selected-${index}`));
    const selectedIds = new Set(editorial.map((offer) => offer.id));
    const manual = editorialOffer("manual-express", {
      product_name: "Link manual express",
      explainability: { manual_source: true },
      created_at: "2026-08-09T11:00:00.000Z",
      updated_at: "2026-08-09T11:00:00.000Z",
    });
    const visible = mergePanelDrafts(
      [...editorial.map(draft), draft(manual)],
      selectedIds,
      TODAY_START,
    );

    expect(visible).toHaveLength(31);
    expect(visible.filter((post) => post.offers?.explainability?.manual_source === true)).toHaveLength(1);
  });

  it("keeps historical editorial rows out even when updated today", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const historical = editorialOffer("historical", {
      created_at: "2026-08-07T10:00:00.000Z",
      updated_at: "2026-08-08T12:00:00.000Z",
    });
    expect(selectEditorialTop30([historical], 30, now)).toHaveLength(0);
  });
});

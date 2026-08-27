import { describe, expect, it } from "vitest";
import { loadWhatsappDashboardDrafts, type PostWithOffer } from "@/lib/offers/whatsapp-dashboard-loader";

const TODAY_START = new Date("2026-08-25T03:00:00.000Z");

function baseDraft(overrides: Partial<PostWithOffer["offers"]> = {}): PostWithOffer {
  return {
    id: "post-1",
    offer_id: "offer-1",
    content: "Draft WhatsApp",
    status: "draft",
    external_id: null,
    posted_at: null,
    created_at: "2026-08-25T14:05:00.000Z",
    offers: {
      id: "offer-1",
      product_name: "Produto",
      platform: "Shopee",
      current_price: 99.9,
      old_price: null,
      image_url: "https://images.test/item.jpg",
      original_url: "https://s.shopee.com.br/test",
      coupon: null,
      notes: null,
      status: "approved",
      created_at: "2026-08-25T14:02:00.000Z",
      explainability: {},
      ...overrides,
    },
  };
}

function readOnlyClient(row: PostWithOffer) {
  let postsCall = 0;
  const query = (data: unknown[]) => ({
    select() { return this; },
    eq() { return this; },
    gte() { return this; },
    contains() { return this; },
    in() { return this; },
    order() { return this; },
    limit() { return this; },
    then(resolve: (value: unknown) => unknown) { return resolve({ data, error: null }); },
  });
  return {
    from(table: string) {
      if (table === "offers") return query([]);
      if (table === "posts") {
        postsCall += 1;
        return query(postsCall === 1 ? [row] : []);
      }
      return query([]);
    },
  } as any;
}

describe("WhatsApp: drafts fora do Top30", () => {
  it("mantém draft de oferta approved visível mesmo fora do Top30", async () => {
    const drafts = await loadWhatsappDashboardDrafts({
      supabase: readOnlyClient(baseDraft()),
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(drafts.map((item) => item.offer_id)).toEqual(["offer-1"]);
  });

  it("mostra draft Trends quando a oferta está selected pela aprovação humana", async () => {
    const row = baseDraft({
      status: "selected",
      explainability: { trend_execution: { origin: "trend", radar_product_id: "trend-1" } },
    });
    const drafts = await loadWhatsappDashboardDrafts({
      supabase: readOnlyClient(row),
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(drafts.map((item) => item.offer_id)).toEqual(["offer-1"]);
  });

  it("não abre o WhatsApp para uma oferta selected comum fora do Top30", async () => {
    const row = baseDraft({ status: "selected", explainability: {} });
    const drafts = await loadWhatsappDashboardDrafts({
      supabase: readOnlyClient(row),
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(drafts).toEqual([]);
  });
});

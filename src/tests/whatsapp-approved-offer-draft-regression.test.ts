import { describe, expect, it } from "vitest";
import { loadWhatsappDashboardDrafts, type PostWithOffer } from "@/lib/offers/whatsapp-dashboard-loader";

const TODAY_START = new Date("2026-08-25T03:00:00.000Z");

function approvedDraft(): PostWithOffer {
  return {
    id: "post-approved-1",
    offer_id: "offer-approved-1",
    content: "Draft WhatsApp",
    status: "draft",
    external_id: null,
    posted_at: null,
    created_at: "2026-08-25T14:05:00.000Z",
    offers: {
      id: "offer-approved-1",
      product_name: "Produto aprovado em outra rede",
      platform: "Mercado Livre",
      current_price: 99.9,
      old_price: null,
      image_url: "https://images.test/item.jpg",
      original_url: "https://mercadolivre.test/item",
      coupon: null,
      notes: null,
      status: "approved",
      created_at: "2026-08-25T14:02:00.000Z",
      explainability: {},
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

describe("WhatsApp: draft de canal após aprovação global", () => {
  it("mantém o draft visível mesmo fora do Top30 selecionado", async () => {
    const drafts = await loadWhatsappDashboardDrafts({
      supabase: readOnlyClient(approvedDraft()),
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(drafts.map((item) => item.offer_id)).toEqual(["offer-approved-1"]);
  });
});

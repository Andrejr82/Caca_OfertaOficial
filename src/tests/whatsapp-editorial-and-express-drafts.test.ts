import { describe, expect, it, vi } from "vitest";
import { loadWhatsappDashboardDrafts, type PostWithOffer } from "@/lib/offers/whatsapp-dashboard-loader";
import { isManualExpressOffer, selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";

const TODAY_START = new Date("2026-08-25T03:00:00.000Z");

function offer(id: string, options: { manual?: boolean; status?: string } = {}) {
  return {
    id,
    product_name: `Produto ${id}`,
    platform: "Shopee",
    current_price: 69.91,
    old_price: null,
    image_url: "https://images.test/item.jpg",
    original_url: "https://shopee.test/item",
    coupon: null,
    notes: null,
    status: options.status || "approved",
    created_at: "2026-08-25T13:39:21.000Z",
    explainability: options.manual ? { manual_source: true, manual_resolution: { source: "quick-publication" } } : {},
  };
}

function post(id: string, item: ReturnType<typeof offer>): PostWithOffer {
  return {
    id,
    offer_id: item.id,
    content: `Draft ${id}`,
    status: "draft",
    external_id: null,
    posted_at: null,
    created_at: "2026-08-25T13:39:24.000Z",
    offers: item,
  };
}

function readOnlyClient(options: {
  expressOffers?: Array<{ id: string }>;
  postsByCall?: PostWithOffer[][];
}) {
  let postCall = 0;
  const writes = {
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };

  const query = (data: unknown[]) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
    ...writes,
  });

  const from = vi.fn((table: string) => {
    if (table === "offers") return query(options.expressOffers || []);
    if (table === "posts") {
      const data = options.postsByCall?.[postCall] || [];
      postCall += 1;
      return query(data);
    }
    return query([]);
  });

  return { client: { from } as any, writes };
}

describe("WhatsApp: Express separado do Top30 editorial", () => {
  it("exibe draft Express mesmo quando o Top30 editorial está vazio", async () => {
    const express = offer("4a759a1f-2029-422f-8049-9782b3109552", { manual: true });
    const { client } = readOnlyClient({
      expressOffers: [{ id: express.id }],
      postsByCall: [[], [post("whatsapp-express", express)]],
    });

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: client,
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(drafts.map((item) => item.offer_id)).toEqual([express.id]);
  });

  it("mantém o filtro Top30 para drafts editoriais", async () => {
    const editorial = offer("editorial-1");
    const { client } = readOnlyClient({
      expressOffers: [],
      postsByCall: [[post("whatsapp-editorial", editorial)], []],
    });

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: client,
      userId: "user-1",
      selectedOfferIds: new Set([editorial.id]),
      todayStart: TODAY_START,
    });

    expect(drafts.map((item) => item.offer_id)).toContain(editorial.id);
  });

  it("não exibe draft comum fora do Top30 como se fosse Express", async () => {
    const comum = offer("comum-1", { status: "pending_manual_review" });
    const { client } = readOnlyClient({ expressOffers: [], postsByCall: [[post("comum", comum)]] });

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: client,
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(drafts).toEqual([]);
  });

  it("prioriza Express sem duplicar offer_id", async () => {
    const express = offer("express-1", { manual: true });
    const editorial = offer("editorial-1");
    const { client } = readOnlyClient({
      expressOffers: [{ id: express.id }],
      postsByCall: [
        [post("editorial", editorial)],
        [],
        [post("express", express)],
      ],
    });

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: client,
      userId: "user-1",
      selectedOfferIds: new Set([editorial.id]),
      todayStart: TODAY_START,
    });

    expect(drafts.map((item) => item.offer_id)).toEqual([express.id, editorial.id]);
  });

  it("mantém Express fora do Top30 e não faz writes ao renderizar", async () => {
    const express = offer("express-1", { manual: true });
    expect(isManualExpressOffer(express as any)).toBe(true);
    expect(selectEditorialTop30([express as any], 30, new Date("2026-08-25T14:00:00.000Z"))).toEqual([]);

    const { client, writes } = readOnlyClient({
      expressOffers: [{ id: express.id }],
      postsByCall: [[], [post("express", express)]],
    });

    await loadWhatsappDashboardDrafts({
      supabase: client,
      userId: "user-1",
      selectedOfferIds: new Set(),
      todayStart: TODAY_START,
    });

    expect(writes.insert).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.upsert).not.toHaveBeenCalled();
    expect(writes.delete).not.toHaveBeenCalled();
  });
});

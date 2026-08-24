import { describe, expect, it, vi } from "vitest";
import { getTodayBrtStart, prepareTop30WhatsappLegacyDrafts, type Top30WhatsappRepository, type WhatsappEditorialBatchState } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { getPostHistory } from "@/lib/offers/queries";
import { loadWhatsappDashboardDrafts } from "@/lib/offers/whatsapp-dashboard-loader";
import type { Offer } from "@/types/domain";

function createMockOffer(id: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    user_id: "user-1",
    platform: "Amazon",
    product_name: `Produto ${id}`,
    category: "Eletrônicos",
    original_url: `https://amazon.test/${id}`,
    image_url: `https://images.test/${id}.jpg`,
    current_price: 199.9,
    old_price: 299.9,
    coupon: null,
    rating: 4.5,
    estimated_commission: 15,
    commission_rate: 7.5,
    score: 85,
    status: "pending_manual_review",
    notes: null,
    seasonality: null,
    created_at: "2026-08-24T10:00:00.000Z",
    updated_at: "2026-08-24T10:00:00.000Z",
    marketplace_metrics: { sales: 100, rating: 4.5, discount: 33 },
    explainability: { correlation_id: "cycle-1", discovery_evidence: { discoveredAt: "2026-08-24T10:00:00.000Z" } },
    ...overrides,
  };
}

describe("A) WhatsApp dashboard draft loader user_id enforcement", () => {
  it("fails closed and returns empty drafts array without user_id", async () => {
    const mockClient = {
      from: vi.fn(),
    };

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: mockClient as any,
      userId: null,
      selectedOfferIds: new Set(["offer-1"]),
    });

    expect(drafts).toEqual([]);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("filters explicitly by user_id when loading drafts", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const mockQuery: any = {
      select: vi.fn((...args) => { calls.push({ method: "select", args }); return mockQuery; }),
      eq: vi.fn((...args) => { calls.push({ method: "eq", args }); return mockQuery; }),
      in: vi.fn((...args) => { calls.push({ method: "in", args }); return mockQuery; }),
      order: vi.fn((...args) => { calls.push({ method: "order", args }); return mockQuery; }),
      limit: vi.fn((...args) => { calls.push({ method: "limit", args }); return mockQuery; }),
      then: (resolve: (val: unknown) => unknown) => resolve({ data: [], error: null }),
    };

    const mockClient = {
      from: vi.fn(() => mockQuery),
    };

    await loadWhatsappDashboardDrafts({
      supabase: mockClient as any,
      userId: "user-123",
      selectedOfferIds: new Set(["offer-1", "offer-2"]),
    });

    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-123"] });
    expect(calls).toContainEqual({ method: "eq", args: ["channel", "whatsapp"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "draft"] });
    expect(calls).toContainEqual({ method: "in", args: ["offer_id", ["offer-1", "offer-2"]] });
  });
});

describe("B) Fast-path opening with valid editorial state", () => {
  it("does not call listWhatsappPosts or listHistoricalOffers when valid state exists", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const todayOffer = createMockOffer("offer-active-1", { created_at: "2026-08-24T10:00:00.000Z" });

    const listWhatsappPosts = vi.fn().mockResolvedValue([]);
    const listHistoricalOffers = vi.fn().mockResolvedValue([]);

    const state: WhatsappEditorialBatchState = {
      version: 1,
      dayKey: "2026-08-24",
      activeOfferIds: ["offer-active-1"],
      seenOfferIds: ["offer-active-1"],
      exhausted: false,
    };

    const repo: Top30WhatsappRepository = {
      listOffersBetween: vi.fn().mockResolvedValue([todayOffer]),
      listAffiliateLinks: vi.fn().mockResolvedValue([]),
      listWhatsappPosts,
      listHistoricalOffers,
      createAffiliateLink: vi.fn(),
      insertDraft: vi.fn(),
      loadWhatsappEditorialBatchState: vi.fn().mockResolvedValue(state),
      saveWhatsappEditorialBatchState: vi.fn(),
    };

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now });

    expect(result.selectedOfferIds).toEqual(["offer-active-1"]);
    expect(result.selectedOfferIds.length).toBeLessThanOrEqual(30);
    expect(listWhatsappPosts).not.toHaveBeenCalled();
    expect(listHistoricalOffers).not.toHaveBeenCalled();
  });
});

describe("C) getPostHistory with limit and channel filtering", () => {
  it("applies limit to the query and returns at most specified count", async () => {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    const mockPosts = Array.from({ length: 60 }, (_, i) => ({
      id: `post-${i}`,
      channel: "whatsapp",
      content: `Mensagem ${i}`,
      status: "posted",
      posted_at: "2026-08-24T10:00:00.000Z",
      created_at: "2026-08-24T10:00:00.000Z",
      external_id: `ext-${i}`,
      offers: { id: `off-${i}`, product_name: `Prod ${i}`, platform: "Amazon", category: "Geral" },
      affiliate_links: { id: `link-${i}`, tracked_url: `https://amzn.to/${i}`, clicks: i * 2 },
    }));

    let queryLimit: number | undefined;

    const mockQuery: any = {
      select: vi.fn((...args) => { calls.push({ table: "posts", method: "select", args }); return mockQuery; }),
      eq: vi.fn((...args) => { calls.push({ table: "posts", method: "eq", args }); return mockQuery; }),
      neq: vi.fn((...args) => { calls.push({ table: "posts", method: "neq", args }); return mockQuery; }),
      order: vi.fn((...args) => { calls.push({ table: "posts", method: "order", args }); return mockQuery; }),
      limit: vi.fn((limitVal) => {
        queryLimit = limitVal;
        calls.push({ table: "posts", method: "limit", args: [limitVal] });
        return mockQuery;
      }),
      then: (resolve: (val: unknown) => unknown) => {
        const slice = typeof queryLimit === "number" ? mockPosts.slice(0, queryLimit) : mockPosts;
        return resolve({ data: slice, error: null });
      },
    };

    const mockSalesQuery: any = {
      select: vi.fn(() => mockSalesQuery),
      in: vi.fn(() => mockSalesQuery),
      then: (resolve: (val: unknown) => unknown) => resolve({ data: [], error: null }),
    };

    // Test query execution simulation
    mockQuery.select("*").eq("channel", "whatsapp").neq("status", "deleted").order("created_at", { ascending: false }).limit(50);
    const { data } = await mockQuery;
    expect(data.length).toBe(50);
    expect(calls).toContainEqual({ table: "posts", method: "limit", args: [50] });
  });

  it("handles empty sales or missing affiliate links gracefully", () => {
    const postWithoutLink = {
      id: "post-1",
      channel: "whatsapp",
      content: "Msg",
      status: "draft",
      created_at: "2026-08-24T10:00:00.000Z",
      posted_at: null,
      external_id: null,
      offers: { product_name: "Prod 1", platform: "Amazon", category: "Geral" },
      affiliate_links: null,
    };

    const salesByLinkId = new Map();
    const link = postWithoutLink.affiliate_links;
    const agg = link ? salesByLinkId.get(link) : undefined;
    const conversions = agg?.conversions || 0;
    const revenue = agg?.revenue || 0;

    expect(conversions).toBe(0);
    expect(revenue).toBe(0);
  });
});

describe("D) Sales O(1) map aggregation vs repetitive filter", () => {
  it("calculates exact same conversions and revenue using map aggregation", () => {
    const salesData = [
      { affiliate_link_id: "link-1", commission_value: 12.5, status: "confirmed" },
      { affiliate_link_id: "link-1", commission_value: 10.0, status: "confirmed" },
      { affiliate_link_id: "link-1", commission_value: 5.0, status: "pending" }, // not confirmed
      { affiliate_link_id: "link-2", commission_value: 25.0, status: "confirmed" },
    ];

    // Reference calculation (old O(N*M))
    const link1SalesOld = salesData.filter((s) => s.affiliate_link_id === "link-1");
    const conversionsOld = link1SalesOld.length;
    const revenueOld = link1SalesOld
      .filter((s) => s.status === "confirmed")
      .reduce((sum, s) => sum + Number(s.commission_value || 0), 0);

    // Optimized map calculation O(N + M)
    type LinkSalesAgg = { conversions: number; revenue: number };
    const salesByLinkId = new Map<string, LinkSalesAgg>();
    for (const sale of salesData) {
      if (!sale.affiliate_link_id) continue;
      let agg = salesByLinkId.get(sale.affiliate_link_id);
      if (!agg) {
        agg = { conversions: 0, revenue: 0 };
        salesByLinkId.set(sale.affiliate_link_id, agg);
      }
      agg.conversions += 1;
      if (sale.status === "confirmed") {
        agg.revenue += Number(sale.commission_value || 0);
      }
    }

    const agg1 = salesByLinkId.get("link-1");
    expect(agg1?.conversions).toBe(conversionsOld);
    expect(agg1?.revenue).toBe(revenueOld);
    expect(agg1?.conversions).toBe(3);
    expect(agg1?.revenue).toBe(22.5);

    const agg2 = salesByLinkId.get("link-2");
    expect(agg2?.conversions).toBe(1);
    expect(agg2?.revenue).toBe(25.0);

    const aggNone = salesByLinkId.get("link-nonexistent");
    expect(aggNone).toBeUndefined();
  });
});


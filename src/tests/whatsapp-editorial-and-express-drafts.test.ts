import { describe, expect, it, vi } from "vitest";
import type { Offer } from "@/types/domain";
import { loadWhatsappDashboardDrafts, type PostWithOffer } from "@/lib/offers/whatsapp-dashboard-loader";
import { isManualExpressOffer, selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";

const TODAY_START = new Date("2026-08-25T03:00:00.000Z");

function mockOffer(id: string, createdAt: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    user_id: "user-1",
    platform: "Amazon",
    product_name: `Produto ${id}`,
    category: "Cozinha",
    original_url: `https://amazon.test/${id}`,
    image_url: `https://images.test/${id}.jpg`,
    current_price: 150,
    old_price: 200,
    coupon: null,
    rating: 4.8,
    estimated_commission: null,
    commission_rate: null,
    score: 85,
    status: "pending_manual_review",
    notes: null,
    seasonality: null,
    created_at: createdAt,
    updated_at: createdAt,
    marketplace_metrics: {},
    explainability: {},
    ...overrides,
  };
}

function mockPost(id: string, offer: Offer, createdAt: string): PostWithOffer {
  return {
    id,
    offer_id: offer.id,
    content: `Draft ${id}`,
    status: "draft",
    external_id: null,
    posted_at: null,
    created_at: createdAt,
    offers: offer as PostWithOffer["offers"],
  };
}

function createReadOnlyClient(options: {
  editorialPosts?: PostWithOffer[];
  expressOffers?: Array<{ id: string }>;
  expressPosts?: PostWithOffer[];
}) {
  let postsCall = 0;
  const writes = { insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn() };

  const makeQuery = (data: unknown[]) => {
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
      ...writes,
    };
    return query;
  };

  const from = vi.fn((table: string) => {
    if (table === "offers") return makeQuery(options.expressOffers || []);
    if (table === "posts") {
      postsCall += 1;
      return makeQuery(postsCall === 1 ? (options.editorialPosts || []) : (options.expressPosts || []));
    }
    return makeQuery([]);
  });

  return { client: { from } as any, writes };
}

describe("WhatsApp dashboard: ciclos editoriais + Express", () => {
  it("exibe draft editorial approved já existente", async () => {
    const offer = mockOffer("approved-1", "2026-08-25T10:00:00.000Z", { status: "approved" });
    const post = mockPost("post-approved-1", offer, "2026-08-25T10:01:00.000Z");
    const { client } = createReadOnlyClient({ editorialPosts: [post] });

    const drafts = await loadWhatsappDashboardDrafts({ supabase: client, userId: "user-1", todayStart: TODAY_START });

    expect(drafts.map((item) => item.offer_id)).toContain("approved-1");
  });

  it("exibe drafts de ciclos diferentes do mesmo dia, sem depender do último cohort", async () => {
    const cycleA = mockOffer("cycle-a", "2026-08-25T06:00:00.000Z", {
      status: "approved",
      explainability: { correlation_id: "cycle-a" },
    });
    const cycleB = mockOffer("cycle-b", "2026-08-25T10:00:00.000Z", {
      status: "approved",
      explainability: { correlation_id: "cycle-b" },
    });
    const { client } = createReadOnlyClient({
      editorialPosts: [
        mockPost("post-b", cycleB, "2026-08-25T10:01:00.000Z"),
        mockPost("post-a", cycleA, "2026-08-25T06:01:00.000Z"),
      ],
    });

    const drafts = await loadWhatsappDashboardDrafts({ supabase: client, userId: "user-1", todayStart: TODAY_START });

    expect(drafts.map((item) => item.offer_id)).toEqual(expect.arrayContaining(["cycle-a", "cycle-b"]));
  });

  it("não cria nem atualiza estado ao renderizar a aba", async () => {
    const offer = mockOffer("readonly-1", "2026-08-25T08:00:00.000Z", { status: "approved" });
    const { client, writes } = createReadOnlyClient({ editorialPosts: [mockPost("post-readonly", offer, "2026-08-25T08:01:00.000Z")] });

    await loadWhatsappDashboardDrafts({ supabase: client, userId: "user-1", todayStart: TODAY_START });

    expect(writes.insert).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.upsert).not.toHaveBeenCalled();
    expect(writes.delete).not.toHaveBeenCalled();
  });

  it("prioriza Express e evita duplicação por offer_id", async () => {
    const expressOffer = mockOffer("express-1", "2026-08-24T20:00:00.000Z", {
      explainability: { manual_source: true, manual_resolution: { source: "quick-publication" } },
    });
    const editorialOffer = mockOffer("editorial-1", "2026-08-25T09:00:00.000Z", { status: "approved" });
    const { client } = createReadOnlyClient({
      editorialPosts: [
        mockPost("post-express-duplicate", expressOffer, "2026-08-25T09:30:00.000Z"),
        mockPost("post-editorial", editorialOffer, "2026-08-25T09:01:00.000Z"),
      ],
      expressOffers: [{ id: expressOffer.id }],
      expressPosts: [mockPost("post-express", expressOffer, "2026-08-24T20:01:00.000Z")],
    });

    const drafts = await loadWhatsappDashboardDrafts({ supabase: client, userId: "user-1", todayStart: TODAY_START });

    expect(drafts[0].offer_id).toBe("express-1");
    expect(drafts.filter((item) => item.offer_id === "express-1")).toHaveLength(1);
    expect(drafts.map((item) => item.offer_id)).toContain("editorial-1");
  });

  it("mantém ofertas Express fora do Top30 editorial", () => {
    const express = mockOffer("express-1", "2026-08-25T10:00:00.000Z", { explainability: { manual_source: true } });
    const regular = mockOffer("regular-1", "2026-08-25T10:00:00.000Z");

    expect(isManualExpressOffer(express)).toBe(true);
    expect(selectEditorialTop30([express, regular], 30, new Date("2026-08-25T12:00:00.000Z")).some((item) => item.id === express.id)).toBe(false);
  });
});

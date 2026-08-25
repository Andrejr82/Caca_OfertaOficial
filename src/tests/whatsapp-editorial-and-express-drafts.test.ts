import { describe, expect, it, vi } from "vitest";
import type { Offer } from "@/types/domain";
import {
  prepareTop30WhatsappLegacyDrafts,
  type Top30WhatsappRepository,
  type WhatsappEditorialBatchState,
} from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { loadWhatsappDashboardDrafts, type PostWithOffer } from "@/lib/offers/whatsapp-dashboard-loader";
import { isManualExpressOffer, selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";

const NOW = new Date("2026-08-25T12:00:00.000Z");
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
    explainability: {
      correlation_id: "cycle-current-1",
      discovery_evidence: { discoveredAt: createdAt },
    },
    ...overrides,
  };
}

describe("WhatsApp Tab Functional Verification (5 Exact Cases)", () => {
  // CASO 1: offer approved + whatsapp draft + pertence ao currentCohortOfferIds => APARECE
  it("Caso 1: offer approved + whatsapp draft + pertence ao currentCohortOfferIds => APARECE", async () => {
    const approvedCycleOffer = mockOffer("offer-approved-1", "2026-08-25T10:00:00.000Z", {
      status: "approved",
    });

    const repo: Top30WhatsappRepository = {
      listOffersBetween: vi.fn().mockResolvedValue([approvedCycleOffer]),
      listAffiliateLinks: vi.fn().mockResolvedValue([]),
      listWhatsappPosts: vi.fn().mockResolvedValue([]),
      listHistoricalOffers: vi.fn().mockResolvedValue([]),
      createAffiliateLink: vi.fn(),
      insertDraft: vi.fn(),
      loadWhatsappEditorialBatchState: vi.fn().mockResolvedValue(null),
      saveWhatsappEditorialBatchState: vi.fn(),
    };

    const top30 = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    // Oferta approved não entra em selectedOfferIds (protegendo o ranking)
    expect(top30.selectedOfferIds).toEqual([]);
    // Mas pertence ao currentCohortOfferIds
    expect(top30.currentCohortOfferIds).toContain("offer-approved-1");

    // Conjunto de exibição (selectedOfferIds + currentCohortOfferIds)
    const displayOfferIds = new Set<string>([
      ...(top30.selectedOfferIds || []),
      ...(top30.currentCohortOfferIds || []),
    ]);

    const mockPost: PostWithOffer & { offer_id: string } = {
      id: "post-approved-1",
      offer_id: "offer-approved-1",
      content: "Draft WhatsApp de Oferta Aprovada",
      status: "draft",
      external_id: null,
      posted_at: null,
      created_at: "2026-08-25T10:05:00.000Z",
      offers: approvedCycleOffer,
    };

    const mockClient = {
      from: vi.fn(() => {
        const query: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: (resolve: (val: unknown) => unknown) => resolve({ data: [mockPost], error: null }),
        };
        return query;
      }),
    };

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: mockClient as any,
      userId: "user-1",
      selectedOfferIds: displayOfferIds,
      todayStart: TODAY_START,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].offers.id).toBe("offer-approved-1");
    expect(drafts[0].offers.status).toBe("approved");
  });

  // CASO 2: offer approved sem whatsapp draft => NÃO APARECE
  it("Caso 2: offer approved sem whatsapp draft => NÃO APARECE", async () => {
    const approvedCycleOffer = mockOffer("offer-approved-no-draft", "2026-08-25T10:00:00.000Z", {
      status: "approved",
    });

    const displayOfferIds = new Set<string>(["offer-approved-no-draft"]);

    const mockClient = {
      from: vi.fn(() => {
        const query: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: (resolve: (val: unknown) => unknown) => resolve({ data: [], error: null }),
        };
        return query;
      }),
    };

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: mockClient as any,
      userId: "user-1",
      selectedOfferIds: displayOfferIds,
      todayStart: TODAY_START,
    });

    expect(drafts).toHaveLength(0);
  });

  // CASO 3: offer fora do ciclo atual => NÃO aparece como draft editorial atual
  it("Caso 3: offer fora do ciclo atual => NÃO aparece como draft editorial atual", async () => {
    const freshCycleOffer = mockOffer("fresh-offer-1", "2026-08-25T11:00:00.000Z", {
      explainability: { correlation_id: "cycle-new", discovery_evidence: { discoveredAt: "2026-08-25T11:00:00.000Z" } },
    });
    const oldCycleOffer = mockOffer("old-offer-1", "2026-08-25T08:00:00.000Z", {
      explainability: { correlation_id: "cycle-old", discovery_evidence: { discoveredAt: "2026-08-25T08:00:00.000Z" } },
    });

    const repo: Top30WhatsappRepository = {
      listOffersBetween: vi.fn().mockResolvedValue([freshCycleOffer, oldCycleOffer]),
      listAffiliateLinks: vi.fn().mockResolvedValue([]),
      listWhatsappPosts: vi.fn().mockResolvedValue([]),
      listHistoricalOffers: vi.fn().mockResolvedValue([]),
      createAffiliateLink: vi.fn(),
      insertDraft: vi.fn(),
      loadWhatsappEditorialBatchState: vi.fn().mockResolvedValue(null),
      saveWhatsappEditorialBatchState: vi.fn(),
    };

    const top30 = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(top30.currentCohortOfferIds).toContain("fresh-offer-1");
    expect(top30.currentCohortOfferIds).not.toContain("old-offer-1");

    const displayOfferIds = new Set<string>([
      ...(top30.selectedOfferIds || []),
      ...(top30.currentCohortOfferIds || []),
    ]);

    // O loader não carrega a oferta do ciclo antigo
    expect(displayOfferIds.has("old-offer-1")).toBe(false);
  });

  // CASO 4: Express draft => APARECE na seção Express
  it("Caso 4: Express draft => APARECE na seção Express", async () => {
    const expressOffer = mockOffer("express-offer-1", "2026-08-25T11:30:00.000Z", {
      explainability: {
        manual_source: true,
        manual_resolution: { source: "quick-publication" },
      },
    });

    const expressPost: PostWithOffer = {
      id: "post-express-1",
      content: "🔥 Oferta Express Exclusiva!",
      status: "draft",
      external_id: null,
      posted_at: null,
      created_at: "2026-08-25T11:31:00.000Z",
      offers: expressOffer,
    };

    const mockClient = {
      from: vi.fn(() => {
        const query: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: (resolve: (val: unknown) => unknown) => resolve({ data: [expressPost], error: null }),
        };
        return query;
      }),
    };

    const drafts = await loadWhatsappDashboardDrafts({
      supabase: mockClient as any,
      userId: "user-1",
      selectedOfferIds: new Set<string>(),
      todayStart: TODAY_START,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe("post-express-1");
    expect(drafts[0].offers.explainability?.manual_source).toBe(true);
  });

  // CASO 5: Express continua fora do Top30 editorial
  it("Caso 5: Express continua fora do Top30 editorial", async () => {
    const expressOffer = mockOffer("express-offer-1", "2026-08-25T10:00:00.000Z", {
      explainability: { manual_source: true },
    });
    const regularOffer = mockOffer("regular-offer-1", "2026-08-25T10:00:00.000Z");

    expect(isManualExpressOffer(expressOffer)).toBe(true);
    expect(isManualExpressOffer(regularOffer)).toBe(false);

    const repo: Top30WhatsappRepository = {
      listOffersBetween: vi.fn().mockResolvedValue([expressOffer, regularOffer]),
      listAffiliateLinks: vi.fn().mockResolvedValue([]),
      listWhatsappPosts: vi.fn().mockResolvedValue([]),
      listHistoricalOffers: vi.fn().mockResolvedValue([]),
      createAffiliateLink: vi.fn(),
      insertDraft: vi.fn(),
      loadWhatsappEditorialBatchState: vi.fn().mockResolvedValue(null),
      saveWhatsappEditorialBatchState: vi.fn(),
    };

    const top30 = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });
    expect(top30.selectedOfferIds).not.toContain("express-offer-1");
    expect(top30.selectedOfferIds).toContain("regular-offer-1");
    expect(top30.reasons.manual_express_excluded_from_editorial).toBeGreaterThanOrEqual(1);

    const editorialTop30 = selectEditorialTop30([expressOffer, regularOffer], 30, NOW);
    expect(editorialTop30.some((c) => c.id === "express-offer-1")).toBe(false);
    expect(editorialTop30.some((c) => c.id === "regular-offer-1")).toBe(true);
  });
});

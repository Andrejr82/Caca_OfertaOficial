import { describe, expect, it } from "vitest";
import { routeCommercialCandidate, routeCommercialCandidates, selectOperationalPanelTop30, selectOperationalTopCandidates } from "@/lib/offers/commercial-channel-router";
import { filterOperationalPanelOffers } from "@/lib/offers/commercial-curation-queue";

const candidate = (overrides: any = {}) => ({
  id: "offer-1", platform: "Shopee", product_name: "Organizador de gaveta", category: "Casa", subcategory: "Organização", original_url: "https://example.test", current_price: 39, image_url: "https://example.test/image", commercialIntent: "casa_organizada_antes_depois", achadinhoScore: 80, automaticEligible: true, manualReviewRequired: false, commercialReasons: ["preço na faixa"], commercialRiskFlags: [], suggestedCopy: "copy", rejected: false, ...overrides,
});

describe("commercial channel router", () => {
  it("routes high-score automatic offers to Telegram without publishing", () => {
    expect(routeCommercialCandidate(candidate()).targetQueue).toBe("telegram");
  });
  it("routes good manual offers to WhatsApp and visual offers to Reels", () => {
    expect(routeCommercialCandidate(candidate({ achadinhoScore: 60, automaticEligible: false, manualReviewRequired: true, commercialIntent: "oferta_real_do_dia" })).targetQueue).toBe("manual_whatsapp");
    expect(routeCommercialCandidate(candidate({ achadinhoScore: 60, commercialIntent: "audio_e_gadget_visual", automaticEligible: false, manualReviewRequired: true })).targetQueue).toBe("reels_manual");
  });
  it("sends critical risk and Amazon outside the main queues", () => {
    expect(routeCommercialCandidate(candidate({ commercialRiskFlags: ["security_camera_manual"] })).targetQueue).toBe("panel_only");
    expect(routeCommercialCandidate(candidate({ platform: "Amazon" })).targetQueue).toBe("panel_only");
  });
  it("orders by priority without a low artificial limit", () => {
    const routed = routeCommercialCandidates(Array.from({ length: 120 }, (_, index) => candidate({ id: `offer-${index}`, achadinhoScore: 40 + (index % 50) })));
    expect(routed).toHaveLength(120);
  });
  it("selects an operational top 30 with family/category diversity", () => {
    const pool = Array.from({ length: 60 }, (_, index) => routeCommercialCandidate(candidate({ id: `same-${index}`, product_name: `Organizador gaveta modelo ${index}`, category: "Casa", achadinhoScore: 90 - index / 10 })));
    const selected = selectOperationalTopCandidates(pool, { channel: "telegram", limit: 30, diversity: true });
    expect(selected).toHaveLength(30);
    expect(new Set(selected.map((item) => item.product_name)).size).toBeGreaterThan(3);
  });

  it("contains a broad new cohort to 30 unique operational panel slots", () => {
    const cycle = "cycle-panel";
    const discovery = { correlation_id: cycle, discovery_evidence: { discoveredAt: "2026-08-08T10:00:00.000Z" } };
    const offers = Array.from({ length: 430 }, (_, index) => ({
      ...candidate({ id: `panel-${index}`, product_name: `Organizador de gaveta modelo ${index}`, category: index % 5 === 0 ? "Casa" : "Tech", achadinhoScore: 90 - index / 100 }),
      user_id: "u1", status: "pending_manual_review", score: 50, old_price: 49, rating: 4.8, marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 }, created_at: "2026-08-08T10:00:01.000Z", updated_at: "2026-08-08T10:00:02.000Z", explainability: discovery,
      shopee_item_id: `item-${index}`,
    }));
    const selected = selectOperationalPanelTop30(offers as any);
    expect(selected).toHaveLength(30);
    expect(new Set(selected.map((item) => item.id)).size).toBe(30);
  });

  it("blocks protected history and old rows updated during the current cycle", () => {
    const discovery = { correlation_id: "cycle-current", discovery_evidence: { discoveredAt: "2026-08-08T10:00:00.000Z" } };
    const make = (id: string, status: string, created_at: string, item: string) => ({ ...candidate({ id, shopee_item_id: item }), user_id: "u1", status, created_at, updated_at: "2026-08-08T10:05:00.000Z", explainability: discovery });
    const offers = [
      make("old-updated", "pending_manual_review", "2026-08-07T10:00:00.000Z", "old"),
      make("posted", "posted", "2026-08-08T10:00:01.000Z", "posted"),
      make("approved", "approved", "2026-08-08T10:00:02.000Z", "approved"),
      make("rejected", "rejected", "2026-08-08T10:00:03.000Z", "rejected"),
      make("deferred", "deferred", "2026-08-08T10:00:04.000Z", "deferred"),
      make("deleted", "deleted", "2026-08-08T10:00:05.000Z", "deleted"),
      make("new", "pending_manual_review", "2026-08-08T10:00:06.000Z", "new"),
    ];
    const selected = selectOperationalPanelTop30(offers as any);
    expect(selected.map((item) => item.id)).toEqual(["new"]);
  });

  it("does not publish or invoke Telegram while selecting the panel top 30", () => {
    const offer = { ...candidate({ id: "panel-only", shopee_item_id: "panel-only" }), user_id: "u1", status: "pending_manual_review", created_at: "2026-08-08T10:00:01.000Z", updated_at: "2026-08-08T10:05:00.000Z", explainability: { correlation_id: "cycle", discovery_evidence: { discoveredAt: "2026-08-08T10:00:00.000Z" } } };
    expect(selectOperationalPanelTop30([offer] as any)).toHaveLength(1);
  });

  it("keeps valid latest-cycle offers when freshness evidence is partial", () => {
    const make = (id: string, created_at: string, explainability: Record<string, unknown>, overrides: any = {}) => ({
      ...candidate({ id, product_name: `Organizador de gaveta ${id}`, shopee_item_id: id }),
      user_id: "u1", status: "pending_manual_review", score: 50, old_price: 49, rating: 4.8,
      marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 }, created_at, updated_at: "2026-08-08T12:00:00.000Z", explainability, ...overrides,
    });
    const cases = [
      [make("correlation-new", "2026-08-08T10:00:00.000Z", { correlation_id: "cycle-partial" }), make("correlation-old", "2026-08-07T10:00:00.000Z", { correlation_id: "cycle-old" })],
      [make("discovered-new", "2026-08-08T10:00:00.000Z", { discovery_evidence: { discoveredAt: "2026-08-08T09:00:00.000Z" } }), make("discovered-old", "2026-08-07T10:00:00.000Z", { discovery_evidence: { discoveredAt: "2026-08-07T09:00:00.000Z" } })],
      [make("created-new", "2026-08-08T10:00:00.000Z", {}), make("created-old", "2026-08-07T10:00:00.000Z", {})],
      [make("created-brt-new", "2026-08-08T03:30:00.000Z", {}), make("created-brt-old", "2026-08-08T02:59:00.000Z", {})],
    ];
    for (const [newOffer, oldOffer] of cases) {
      const eligible = filterOperationalPanelOffers([newOffer, oldOffer] as any);
      expect(eligible.map((offer) => offer.id)).toEqual([newOffer.id]);
      expect(selectOperationalPanelTop30([newOffer] as any)).toHaveLength(1);
    }
  });

  it("blocks an old offer updated today and returns zero only when no new offer exists", () => {
    const make = (id: string, status = "pending_manual_review", overrides: any = {}) => ({
      ...candidate({ id, product_name: `Organizador de gaveta ${id}`, shopee_item_id: id }),
      user_id: "u1", status, score: 50, old_price: 49, rating: 4.8, marketplace_metrics: { sales: 500 },
      created_at: "2026-08-07T10:00:00.000Z", updated_at: "2026-08-08T12:00:00.000Z", explainability: {}, ...overrides,
    });
    expect(filterOperationalPanelOffers([make("old-updated")] as any)).toHaveLength(0);
    expect(filterOperationalPanelOffers([make("protected", "posted")] as any)).toHaveLength(0);
  });
});

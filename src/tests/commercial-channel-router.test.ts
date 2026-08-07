import { describe, expect, it } from "vitest";
import { routeCommercialCandidate, routeCommercialCandidates, selectOperationalTopCandidates } from "@/lib/offers/commercial-channel-router";

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
});

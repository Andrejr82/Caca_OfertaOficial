import { describe, expect, it } from "vitest";
import {
  buildRadarOrigin,
  buildRadarOfferRow,
  buildRadarOpportunityRow,
  type RadarPersistenceCandidate
} from "@/lib/trends/radar-persistence";

const radar = {
  radar_date: "2026-08-10",
  product_term: "Escova Secadora Britânia BELLA01",
  normalized_product_term: "Escova Secadora Britânia BELLA01",
  evidence_status: "verified" as const,
  strategy_version: "daily-commercial-radar-v1",
  source_urls: ["https://example.com/evidence"],
  direct_evidence: [{ claim: "Ranking observado", source_url: "https://example.com/evidence" }],
  observed_at: "2026-08-10T12:00:00.000Z",
  category: "Beleza",
  marketplaces: ["Shopee"],
  source_types: ["external"],
  source_count: 1,
  confidence: 100
};

const candidate: RadarPersistenceCandidate = {
  id: "23098702974",
  marketplace: "Shopee",
  productName: "Escova Secadora Britânia 4 em 1 1300W BELLA01",
  currentPrice: 94.9,
  oldPrice: null,
  shopeeItemId: "23098702974",
  itemId: "23098702974",
  permalink: "https://s.shopee.com.br/example"
};

describe("radar persistence", () => {
  it("builds an idempotent external TrendSignal origin", () => {
    expect(buildRadarOrigin("user-1", radar)).toMatchObject({
      user_id: "user-1", source_type: "external", source_name: "external_radar", source: "external_radar",
      external_id: "2026-08-10:escova secadora britânia bella01", title: radar.product_term
    });
  });

  it("materializes only complete canonical offer data and isolates it from editorial", () => {
    expect(buildRadarOfferRow("user-1", radar, candidate)).toMatchObject({
      user_id: "user-1", platform: "Shopee", shopee_item_id: candidate.shopeeItemId,
      product_name: candidate.productName, current_price: 94.9, status: "deferred"
    });
    expect(() => buildRadarOfferRow("user-1", radar, { ...candidate, permalink: null })).toThrow(/original_url/i);
  });

  it("links only canonical origin and offer ids into an opportunity", () => {
    expect(buildRadarOpportunityRow({
      userId: "user-1", signalId: "signal-1", offerId: "offer-1", radar, candidate,
      discoveryQueries: ["BELLA01"], discoverySource: "shopee_v1_official",
      matchReason: "Identidade nativa compatível."
    })).toMatchObject({
      user_id: "user-1", signal_id: "signal-1", offer_id: "offer-1", marketplace: "Shopee",
      match_status: "matched", status: "matched", experiment_id: null
    });
  });
});

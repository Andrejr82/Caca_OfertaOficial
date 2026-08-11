import { describe, expect, it } from "vitest";
import {
  filterMateriallyChangedTrendSignals,
  trendSignalMaterialFingerprint
} from "@/lib/trends/trend-evidence-deduplication";
import type { PersistedTrendDirectEvidence, TrendSignal } from "@/core/trends/types";

function signal(overrides: Partial<TrendSignal> = {}): TrendSignal {
  return {
    id: "mercado_livre_best_seller:MLB:MLB432825:PRODUCT:MLB70334862",
    sourceType: "external",
    sourceName: "mercado_livre_best_seller",
    source: "mercado_livre_best_seller",
    region: "BR",
    externalId: "MLB:MLB432825:PRODUCT:MLB70334862",
    term: "Mini Geladeira",
    title: "Mini Geladeira",
    evidence: {
      direct_evidence: [{
        claim: "Produto ocupa a posição 1 no ranking oficial.",
        evidence_type: "mercado_livre_best_seller",
        source_url: "https://api.mercadolibre.com/highlights/MLB/category/MLB432825",
        observed_at: "2026-08-11T00:30:00.000Z",
        rank_position: 1,
        best_seller_flag: true,
        trending_flag: null,
        sold_quantity: null,
        price: null,
        old_price: null,
        discount_percent: null,
        rating: null,
        review_count: null,
        shipping: null,
        marketplace_identity: {
          marketplace: "mercado_livre",
          entity_type: "PRODUCT",
          item_id: null,
          product_id: "MLB70334862",
          category_id: "MLB432825"
        }
      }]
    },
    observedAt: "2026-08-11T00:30:00.000Z",
    capturedAt: "2026-08-11T00:30:00.000Z",
    trendStrength: null,
    trendDirection: null,
    offerId: null,
    ...overrides
  };
}

function snapshotExternalId(value: TrendSignal): string {
  if (!value.externalId) throw new Error("Fixture requer externalId.");
  return value.externalId;
}

function commercialEvidence(overrides: Partial<PersistedTrendDirectEvidence> = {}): PersistedTrendDirectEvidence {
  return {
    claim: "Oferta observada via API oficial.",
    evidence_type: "mercado_livre_offer",
    source_url: "https://api.mercadolibre.com/items?ids=MLB123456789",
    observed_at: "2026-08-11T00:30:00.000Z",
    rank_position: null,
    best_seller_flag: null,
    trending_flag: null,
    sold_quantity: null,
    price: 199.9,
    old_price: null,
    discount_percent: null,
    rating: null,
    review_count: null,
    shipping: null,
    marketplace_identity: {
      marketplace: "mercado_livre",
      entity_type: "ITEM",
      item_id: "MLB123456789",
      product_id: "MLB70334862"
    },
    ...overrides
  };
}

describe("Trend evidence deduplication", () => {
  it("ignora somente timestamps ao comparar a mesma evidência", () => {
    const before = signal();
    const after = signal({
      observedAt: "2026-08-11T01:30:00.000Z",
      capturedAt: "2026-08-11T01:30:00.000Z",
      evidence: {
        ...before.evidence,
        direct_evidence: before.evidence.direct_evidence?.map((entry) => ({
          ...entry,
          observed_at: "2026-08-11T01:30:00.000Z"
        }))
      }
    });

    expect(trendSignalMaterialFingerprint(after)).toBe(trendSignalMaterialFingerprint(before));
    expect(filterMateriallyChangedTrendSignals([after], [{
      source_name: before.sourceName,
      external_id: snapshotExternalId(before),
      source_type: before.sourceType,
      source: before.source,
      region: before.region,
      term: before.term,
      title: before.title,
      evidence: before.evidence,
      trend_strength: before.trendStrength,
      trend_direction: before.trendDirection
    }])).toEqual([]);
  });

  it("preserva observação quando rank muda", () => {
    const before = signal();
    const after = signal({
      evidence: {
        direct_evidence: before.evidence.direct_evidence?.map((entry) => ({ ...entry, rank_position: 2 }))
      },
      observedAt: "2026-08-11T01:30:00.000Z",
      capturedAt: "2026-08-11T01:30:00.000Z"
    });

    expect(filterMateriallyChangedTrendSignals([after], [{
      source_name: before.sourceName,
      external_id: snapshotExternalId(before),
      source_type: before.sourceType,
      source: before.source,
      region: before.region,
      term: before.term,
      title: before.title,
      evidence: before.evidence,
      trend_strength: before.trendStrength,
      trend_direction: before.trendDirection
    }])).toEqual([after]);
  });

  it("preserva observação quando preço muda", () => {
    const before = signal({
      evidence: {
        direct_evidence: [commercialEvidence()]
      }
    });
    const after = signal({
      evidence: {
        direct_evidence: [commercialEvidence({
          observed_at: "2026-08-11T01:30:00.000Z",
          price: 179.9
        })]
      },
      observedAt: "2026-08-11T01:30:00.000Z",
      capturedAt: "2026-08-11T01:30:00.000Z"
    });

    expect(filterMateriallyChangedTrendSignals([after], [{
      source_name: before.sourceName,
      external_id: snapshotExternalId(before),
      source_type: before.sourceType,
      source: before.source,
      region: before.region,
      term: before.term,
      title: before.title,
      evidence: before.evidence,
      trend_strength: before.trendStrength,
      trend_direction: before.trendDirection
    }])).toEqual([after]);
  });

  it("deduplica entradas repetidas no mesmo lote pela identidade da fonte", () => {
    const first = signal();
    const repeated = signal({
      observedAt: "2026-08-11T01:30:00.000Z",
      capturedAt: "2026-08-11T01:30:00.000Z"
    });

    expect(filterMateriallyChangedTrendSignals([first, repeated], [])).toEqual([first]);
  });

  it("preserva sinais sem externalId porque não há identidade segura para deduplicar", () => {
    const first = signal({ id: "anonymous-1", externalId: null });
    const repeated = signal({
      id: "anonymous-2",
      externalId: null,
      observedAt: "2026-08-11T01:30:00.000Z",
      capturedAt: "2026-08-11T01:30:00.000Z"
    });

    expect(filterMateriallyChangedTrendSignals([first, repeated], [])).toEqual([first, repeated]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { persistTrendSignals } from "@/lib/trends/persistence";
import type { TrendSignal } from "@/core/trends/types";

function signal(rank: number, observedAt: string): TrendSignal {
  return {
    id: "ml-best-seller-1",
    sourceType: "external",
    sourceName: "mercado_livre_best_seller",
    source: "mercado_livre_best_seller",
    region: "BR",
    externalId: "MLB:MLB432825:PRODUCT:MLB70334862",
    term: "Mini Geladeira",
    title: "Mini Geladeira",
    evidence: {
      direct_evidence: [{
        claim: "Produto observado no ranking oficial.",
        evidence_type: "mercado_livre_best_seller",
        source_url: "https://api.mercadolibre.com/highlights/MLB/category/MLB432825",
        observed_at: observedAt,
        rank_position: rank,
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
    observedAt,
    capturedAt: observedAt,
    trendStrength: null,
    trendDirection: null,
    offerId: null
  };
}

function existingRow(rank: number, observedAt: string) {
  const existing = signal(rank, observedAt);
  return {
    source_name: existing.sourceName,
    external_id: existing.externalId,
    source_type: existing.sourceType,
    source: existing.source,
    region: existing.region,
    term: existing.term,
    title: existing.title,
    evidence: existing.evidence,
    trend_strength: existing.trendStrength,
    trend_direction: existing.trendDirection
  };
}

function clientWithExisting(rows: ReturnType<typeof existingRow>[]) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const inQuery = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn(() => ({ in: inQuery }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ upsert, select }));
  return { client: { from }, upsert, select, eq, inQuery };
}

describe("Trend persistence deduplication", () => {
  it("não regrava evidência idêntica apenas porque o timestamp mudou", async () => {
    const database = clientWithExisting([existingRow(1, "2026-08-11T00:30:00.000Z")]);

    const persisted = await persistTrendSignals(
      database.client,
      "user-1",
      [signal(1, "2026-08-11T01:30:00.000Z")]
    );

    expect(persisted).toBe(0);
    expect(database.upsert).not.toHaveBeenCalled();
    expect(database.select).toHaveBeenCalledOnce();
  });

  it("atualiza a mesma identidade quando a evidência muda materialmente", async () => {
    const database = clientWithExisting([existingRow(1, "2026-08-11T00:30:00.000Z")]);

    const persisted = await persistTrendSignals(
      database.client,
      "user-1",
      [signal(2, "2026-08-11T01:30:00.000Z")]
    );

    expect(persisted).toBe(1);
    expect(database.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: "user-1",
        source_name: "mercado_livre_best_seller",
        external_id: "MLB:MLB432825:PRODUCT:MLB70334862",
        observed_at: "2026-08-11T01:30:00.000Z"
      })
    ], { onConflict: "user_id,source_name,external_id" });
  });
});

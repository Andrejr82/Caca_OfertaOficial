import { describe, expect, it } from "vitest";
import {
  createOfferQualityCandidate,
  createEmptyOfferQualityReport,
  type OfferQualityCandidate,
} from "@/core/offer-quality/types";

describe("offer quality contracts", () => {
  it("creates a normalized candidate with native identity and commercial fields", () => {
    const candidate: OfferQualityCandidate = createOfferQualityCandidate({
      marketplace: "Mercado Livre",
      nativeIdentity: "MLB1234567890",
      sourceItemId: "MLB1234567890",
      title: "Tênis esportivo",
      sourceUrl: "https://www.mercadolivre.com.br/item/MLB1234567890",
      imageUrl: "https://http2.mlstatic.com/image.jpg",
      currentPrice: 99.9,
      originalPrice: 149.9,
      marketplaceMetrics: { item_id: "MLB1234567890" },
      currentFlowStatus: "pending_manual_review",
    });

    expect(candidate.marketplace).toBe("Mercado Livre");
    expect(candidate.currentPrice).toBe(99.9);
    expect(candidate.nativeIdentity).toBe("MLB1234567890");
  });

  it("starts every empty dry-run report with zero persistence attempts", () => {
    const report = createEmptyOfferQualityReport({
      runId: "dry-run-test",
      generatedAt: "2026-07-28T00:00:00.000Z",
    });

    expect(report.recordCount).toBe(0);
    expect(report.persistAttemptCount).toBe(0);
    expect(report.decisions).toEqual([]);
  });
});

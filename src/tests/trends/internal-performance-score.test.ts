import { describe, expect, it } from "vitest";
import { buildVerifiedInternalPerformance } from "@/core/trends/internal-performance-score";

function signal(clicks: number, overrides: Record<string, unknown> = {}) {
  return {
    source: "click_events" as const,
    offerId: "offer-1",
    marketplace: "Shopee",
    productName: "Produto A",
    normalizedProductTerm: "produto a",
    category: "Categoria",
    normalizedCategory: "categoria",
    windowStart: "2026-08-04T00:00:00.000Z",
    windowEnd: "2026-08-11T00:00:00.000Z",
    totalClicks: clicks,
    distinctEventCount: clicks,
    duplicateEventCount: 0,
    clicksByChannel: { whatsapp: clicks },
    clicksByPublication: [],
    unattributedPublicationClicks: clicks,
    ...overrides,
  };
}

describe("internal performance score", () => {
  it("returns unverified zero below the minimum sample", () => {
    expect(buildVerifiedInternalPerformance(signal(4))).toEqual({ verified: false, score: 0 });
  });

  it("scores only distinct audited clicks and caps at 15", () => {
    expect(buildVerifiedInternalPerformance(signal(5))).toEqual({ verified: true, score: 5 });
    expect(buildVerifiedInternalPerformance(signal(12))).toEqual({ verified: true, score: 10 });
    expect(buildVerifiedInternalPerformance(signal(25))).toEqual({ verified: true, score: 15 });
    expect(buildVerifiedInternalPerformance(signal(100))).toEqual({ verified: true, score: 15 });
  });

  it("does not reward duplicated events", () => {
    expect(buildVerifiedInternalPerformance(signal(25, { distinctEventCount: 4, duplicateEventCount: 21 }))).toEqual({ verified: false, score: 0 });
  });
});

import { describe, expect, it } from "vitest";
import { evaluateCandidates } from "@/core/offer-quality/common-evaluator";
import { createOfferQualityCandidate } from "@/core/offer-quality/types";

const links = [
  { channel: "telegram" as const, trackedUrl: "https://caca-oferta-oficial.vercel.app/go/tg_123e4567-e89b-12d3-a456-426614174000" },
  { channel: "whatsapp" as const, trackedUrl: "https://caca-oferta-oficial.vercel.app/go/wp_123e4567-e89b-12d3-a456-426614174000" },
  { channel: "facebook" as const, trackedUrl: "https://caca-oferta-oficial.vercel.app/go/fb_123e4567-e89b-12d3-a456-426614174000" },
  { channel: "instagram" as const, trackedUrl: "https://caca-oferta-oficial.vercel.app/go/ig_123e4567-e89b-12d3-a456-426614174000" },
];

const candidate = (id: string, price: number, complete = true) => createOfferQualityCandidate({
  marketplace: "Amazon",
  nativeIdentity: id,
  sourceItemId: id,
  title: "Produto principal com qualidade",
  sourceUrl: `https://www.amazon.com.br/dp/${id}`,
  imageUrl: "https://images.example/image.jpg",
  currentPrice: price,
  originalPrice: 100,
  marketplaceMetrics: { asin: id, rating: 4.8, sales: 1000, shippingFree: true },
  currentFlowStatus: "pending_manual_review",
  affiliateLinks: complete ? links : links.slice(0, 1),
});

describe("common offer quality evaluator", () => {
  it("selects one winner and marks another equivalent candidate duplicate", () => {
    const report = evaluateCandidates([
      candidate("B0ABC12345", 40),
      candidate("B0ABC12346", 60),
    ], { runId: "test", generatedAt: "2026-07-28T00:00:00Z" });

    expect(report.winners).toHaveLength(1);
    expect(report.decisions.filter((d) => d.decision === "duplicate")).toHaveLength(1);
    expect(report.persistAttemptCount).toBe(0);
  });

  it("does not call persistence and reports incomplete channels", () => {
    const report = evaluateCandidates(
      [candidate("B0ABC12345", 40, false)],
      { runId: "test", generatedAt: "2026-07-28T00:00:00Z" },
    );
    expect(report.winners).toHaveLength(0);
    expect(report.decisions[0].monetizationStatus).toBe("incomplete");
    expect(report.decisions[0].decision).toBe("missing_data");
  });
});

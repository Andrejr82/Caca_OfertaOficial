import { describe, expect, it } from "vitest";
import { evaluateCandidates } from "@/core/offer-quality/common-evaluator";
import { serializeNdjson, serializeReport } from "@/core/offer-quality/report";
import { createOfferQualityCandidate } from "@/core/offer-quality/types";

const candidate = createOfferQualityCandidate({
  marketplace: "Amazon",
  nativeIdentity: "B0ABC12345",
  sourceItemId: "B0ABC12345",
  title: "Produto principal com qualidade",
  sourceUrl: "https://www.amazon.com.br/dp/B0ABC12345?tag=secret",
  imageUrl: "https://images.example/image.jpg?token=secret",
  currentPrice: 50,
  originalPrice: 100,
  marketplaceMetrics: { asin: "B0ABC12345" },
  currentFlowStatus: "pending_manual_review",
});

describe("quality report serialization", () => {
  it("removes query strings and never reports persistence attempts", () => {
    const report = evaluateCandidates([candidate], {
      runId: "report-test",
      generatedAt: "2026-07-28T00:00:00Z",
    });
    const json = serializeReport(report);
    const ndjson = serializeNdjson(report);
    expect(json).not.toContain("tag=secret");
    expect(json).not.toContain("token=secret");
    expect(json).toContain('"persistAttemptCount": 0');
    expect(ndjson.split("\n").filter(Boolean)).toHaveLength(2);
  });
});

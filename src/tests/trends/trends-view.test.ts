import { describe, expect, it } from "vitest";
import type { TrendSignalListItem } from "@/core/trends/types";
import { partitionTrendSignalsForView } from "@/core/trends/view";

const signal = (decision: "eligible" | "rejected", strategyVersion = "trend-commercial-v1"): TrendSignalListItem => ({
  id: decision,
  sourceType: "external",
  sourceName: "google_trends",
  source: "google_trends",
  region: "BR",
  externalId: decision,
  term: decision,
  title: decision,
  evidence: {},
  observedAt: "2026-08-10T00:00:00.000Z",
  capturedAt: "2026-08-10T00:00:00.000Z",
  trendStrength: 100,
  trendDirection: "rising",
  offerId: null,
  classification: {
    id: `classification-${decision}`,
    signalId: decision,
    commercialRelevance: decision === "eligible" ? 80 : 0,
    isProductIntent: decision === "eligible",
    normalizedProductTerm: decision === "eligible" ? "produto" : null,
    categoryHint: null,
    decision,
    reason: "reason",
    aiModel: "model",
    strategyVersion,
    classifiedAt: "2026-08-10T00:00:00.000Z"
  }
});

describe("trends operational view", () => {
  it("keeps rejected signals out of the main operational view", () => {
    const result = partitionTrendSignalsForView([signal("eligible"), signal("rejected")], "trend-commercial-v1");
    expect(result.operational.map((item) => item.term)).toEqual(["eligible"]);
    expect(result.audit.map((item) => item.term)).toEqual(["rejected"]);
  });

  it("sends missing, invalid and stale classifications to pending", () => {
    const pending = { ...signal("eligible"), id: "missing", term: "missing", classification: null };
    const stale = { ...signal("eligible", "old-strategy"), id: "stale", term: "stale" };
    const result = partitionTrendSignalsForView([pending, stale], "trend-commercial-v1");
    expect(result.operational).toHaveLength(0);
    expect(result.audit).toHaveLength(0);
    expect(result.pending.map((item) => item.term)).toEqual(["missing", "stale"]);
  });
});

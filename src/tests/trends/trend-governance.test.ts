import { describe, expect, it } from "vitest";
import {
  buildTrendGovernanceAssessment,
  TREND_EVIDENCE_CONTRACT_VERSION,
  TREND_SCORE_VERSION,
} from "@/core/trends/trend-governance";

describe("trend continuous governance", () => {
  it("versions score and evidence contracts explicitly", () => {
    const result = buildTrendGovernanceAssessment({ sourceHealth: [], experimentFeedback: [] });
    expect(result.scoreVersion).toBe(TREND_SCORE_VERSION);
    expect(result.evidenceContractVersion).toBe(TREND_EVIDENCE_CONTRACT_VERSION);
  });

  it("blocks degraded and untrusted sources from contributing", () => {
    const result = buildTrendGovernanceAssessment({
      sourceHealth: [
        { source: "Google Trends", status: "healthy", trusted: true },
        { source: "External Radar", status: "degraded", trusted: true },
        { source: "Unknown Feed", status: "healthy", trusted: false },
      ],
      experimentFeedback: [],
    });
    expect(result.allowedSources).toEqual(["Google Trends"]);
    expect(result.blockedSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "External Radar", reason: "degraded" }),
      expect.objectContaining({ source: "Unknown Feed", reason: "untrusted" }),
    ]));
  });

  it("detects source drift without fabricating a recovery decision", () => {
    const result = buildTrendGovernanceAssessment({
      sourceHealth: [{ source: "Shopee", status: "healthy", trusted: true, drift: { observed: 40, baseline: 100 } }],
      experimentFeedback: [],
    });
    expect(result.sourceDrift[0]).toEqual(expect.objectContaining({ source: "Shopee", status: "drifted" }));
    expect(result.allowedSources).not.toContain("Shopee");
  });

  it("does not recommend weight review without completed experiment evidence", () => {
    const result = buildTrendGovernanceAssessment({
      sourceHealth: [],
      experimentFeedback: [{ action: "none", decision: null }],
    });
    expect(result.weightReview.status).toBe("insufficient_evidence");
    expect(result.weightReview.autoApply).toBe(false);
  });

  it("recommends manual weight review only after repeated actionable experiment evidence", () => {
    const result = buildTrendGovernanceAssessment({
      sourceHealth: [],
      experimentFeedback: [
        { action: "boost", decision: "SCALE" },
        { action: "boost", decision: "SCALE" },
        { action: "adjust", decision: "ADJUST" },
      ],
    });
    expect(result.weightReview.status).toBe("review_recommended");
    expect(result.weightReview.autoApply).toBe(false);
    expect(result.weightReview.actionableExperiments).toBe(3);
  });

  it("preserves historical snapshots as immutable evidence references", () => {
    const result = buildTrendGovernanceAssessment({
      sourceHealth: [],
      experimentFeedback: [],
      snapshots: [
        { radarRunId: "run-1", strategyVersion: "daily-commercial-radar-v1", generatedAt: "2026-08-10T00:00:00Z" },
      ],
    });
    expect(result.snapshots).toEqual([
      { radarRunId: "run-1", strategyVersion: "daily-commercial-radar-v1", generatedAt: "2026-08-10T00:00:00Z" },
    ]);
  });
});

export const TREND_SCORE_VERSION = "commercial-opportunity-score-v2";
export const TREND_EVIDENCE_CONTRACT_VERSION = "trend-direct-evidence-v1";

export type GovernanceSourceStatus = "healthy" | "degraded" | "failed" | "unknown";

export interface GovernanceSourceHealth {
  source: string;
  status: GovernanceSourceStatus;
  trusted: boolean;
  drift?: {
    observed: number;
    baseline: number;
  } | null;
}

export interface GovernanceExperimentFeedback {
  action: "boost" | "adjust" | "suppress" | "none";
  decision: "SCALE" | "ADJUST" | "ABORT" | null;
}

export interface GovernanceSnapshotReference {
  radarRunId: string;
  strategyVersion: string;
  generatedAt: string;
}

function driftStatus(input: GovernanceSourceHealth): "stable" | "drifted" | "unmeasured" {
  const observed = Number(input.drift?.observed);
  const baseline = Number(input.drift?.baseline);
  if (!Number.isFinite(observed) || !Number.isFinite(baseline) || baseline <= 0) return "unmeasured";
  const ratio = observed / baseline;
  return ratio < 0.5 || ratio > 1.5 ? "drifted" : "stable";
}

export function buildTrendGovernanceAssessment({
  sourceHealth = [],
  experimentFeedback = [],
  snapshots = [],
}: {
  sourceHealth?: GovernanceSourceHealth[];
  experimentFeedback?: GovernanceExperimentFeedback[];
  snapshots?: GovernanceSnapshotReference[];
}) {
  const sourceDrift = sourceHealth.map((source) => ({
    source: source.source,
    status: driftStatus(source),
  }));

  const driftBySource = new Map(sourceDrift.map((item) => [item.source, item.status]));
  const blockedSources = sourceHealth
    .filter((source) => source.status !== "healthy" || source.trusted !== true || driftBySource.get(source.source) === "drifted")
    .map((source) => ({
      source: source.source,
      reason: source.trusted !== true
        ? "untrusted"
        : driftBySource.get(source.source) === "drifted"
          ? "drifted"
          : source.status,
    }));

  const blockedNames = new Set(blockedSources.map((item) => item.source));
  const allowedSources = sourceHealth
    .filter((source) => !blockedNames.has(source.source))
    .map((source) => source.source);

  const actionableExperiments = experimentFeedback.filter((feedback) =>
    feedback.decision !== null && feedback.action !== "none"
  ).length;

  const weightReview = {
    status: actionableExperiments >= 3 ? "review_recommended" : "insufficient_evidence",
    actionableExperiments,
    autoApply: false,
  } as const;

  return Object.freeze({
    scoreVersion: TREND_SCORE_VERSION,
    evidenceContractVersion: TREND_EVIDENCE_CONTRACT_VERSION,
    allowedSources: Object.freeze([...allowedSources]),
    blockedSources: Object.freeze(blockedSources.map((item) => Object.freeze({ ...item }))),
    sourceDrift: Object.freeze(sourceDrift.map((item) => Object.freeze({ ...item }))),
    weightReview: Object.freeze(weightReview),
    snapshots: Object.freeze(snapshots.map((snapshot) => Object.freeze({ ...snapshot }))),
  });
}

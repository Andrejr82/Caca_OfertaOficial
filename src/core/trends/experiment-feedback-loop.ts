export type ExperimentFinalDecision = "SCALE" | "ADJUST" | "ABORT";
export type NextRadarAction = "boost" | "adjust" | "suppress" | "none";

export interface ExperimentFeedbackInput {
  experimentId: string;
  opportunityId?: string | null;
  recommendationId?: string | null;
  offerId?: string | null;
  marketplace?: string | null;
  channel?: string | null;
  format?: string | null;
  status?: string | null;
  finalDecision?: string | null;
  decisionReason?: string | null;
  salesAttributionVerified?: boolean;
  metrics?: Record<string, unknown> | null;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDecision(value: unknown): ExperimentFinalDecision | null {
  const decision = String(value ?? "").trim().toUpperCase();
  return decision === "SCALE" || decision === "ADJUST" || decision === "ABORT" ? decision : null;
}

function nextAction(decision: ExperimentFinalDecision | null): NextRadarAction {
  if (decision === "SCALE") return "boost";
  if (decision === "ADJUST") return "adjust";
  if (decision === "ABORT") return "suppress";
  return "none";
}

export function buildExperimentFeedback(input: ExperimentFeedbackInput) {
  const decision = normalizeDecision(input.finalDecision);
  const completed = String(input.status ?? "").trim().toLowerCase() === "completed";
  const actionable = completed && decision !== null;
  const rawMetrics = input.metrics ?? {};
  const salesVerified = input.salesAttributionVerified === true;

  return Object.freeze({
    contractVersion: "trend-executive.experiment-feedback/v1",
    actionable,
    finalDecision: actionable ? decision : null,
    decisionReason: actionable ? input.decisionReason ?? null : null,
    nextRadarAction: actionable ? nextAction(decision) : "none" as const,
    opportunityId: input.opportunityId ?? null,
    marketplace: input.marketplace ?? null,
    channel: input.channel ?? null,
    format: input.format ?? null,
    provenance: Object.freeze({
      experimentId: input.experimentId,
      recommendationId: input.recommendationId ?? null,
      offerId: input.offerId ?? null,
    }),
    metrics: Object.freeze({
      clicks: finiteNumber(rawMetrics.clicks),
      clicksPerPublication: finiteNumber(rawMetrics.clicksPerPublication),
      salesCount: salesVerified ? finiteNumber(rawMetrics.salesCount) : null,
      clickToSaleConversion: salesVerified ? finiteNumber(rawMetrics.clickToSaleConversion) : null,
      commissionValue: salesVerified ? finiteNumber(rawMetrics.commissionValue) : null,
      commissionPerClick: salesVerified ? finiteNumber(rawMetrics.commissionPerClick) : null,
    }),
    salesAttributionVerified: salesVerified,
  });
}

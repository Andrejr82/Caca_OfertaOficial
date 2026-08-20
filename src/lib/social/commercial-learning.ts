import type { CopyV4CommercialAngle } from "@/core/ai/copy-v4";
import type { SocialCadenceResult } from "@/lib/social/cadence-fatigue";
import type { SocialCommercialTelemetrySnapshot } from "@/lib/social/commercial-telemetry";
import type { SocialCopyExperimentEvaluation } from "@/lib/social/copy-experiments";

export type CommercialLearningDecision =
  | "LEARN_MORE"
  | "TEST_ANGLE"
  | "PREFER_ANGLE"
  | "INVESTIGATE_OFFER"
  | "WAIT_CADENCE";

export interface CommercialLearningInput {
  experiment: SocialCopyExperimentEvaluation;
  cadence?: SocialCadenceResult | null;
}

export interface CommercialLearningRecommendation {
  offerId: string;
  channel: SocialCommercialTelemetrySnapshot["channel"];
  decision: CommercialLearningDecision;
  preferredAngle: CopyV4CommercialAngle | null;
  reasons: string[];
  autoApply: false;
}

function totalPurchases(experiment: SocialCopyExperimentEvaluation) {
  return experiment.variants.reduce((sum, variant) => sum + variant.purchases, 0);
}

function totalClicks(experiment: SocialCopyExperimentEvaluation) {
  return experiment.variants.reduce((sum, variant) => sum + variant.clicks, 0);
}

/**
 * Task 10 — aprendizado comercial conservador.
 *
 * Converte telemetria + experimento + cadência em uma recomendação auditável.
 * Nunca aplica a recomendação automaticamente e nunca altera fatos, Radar ou
 * publicação. Liderança por CTR gera apenas TEST_ANGLE; preferência de ângulo
 * exige liderança por conversão com compra real observada.
 */
export function buildCommercialLearningRecommendation(
  input: CommercialLearningInput,
): CommercialLearningRecommendation {
  const { experiment, cadence } = input;

  if (cadence?.decision === "DEFER") {
    return {
      offerId: experiment.offerId,
      channel: experiment.channel,
      decision: "WAIT_CADENCE",
      preferredAngle: null,
      reasons: ["cadence_guardrail_active", ...cadence.reasons],
      autoApply: false,
    };
  }

  if (experiment.status === "insufficient_data" || experiment.status === "learning") {
    return {
      offerId: experiment.offerId,
      channel: experiment.channel,
      decision: "LEARN_MORE",
      preferredAngle: null,
      reasons: [...experiment.reasons],
      autoApply: false,
    };
  }

  const purchases = totalPurchases(experiment);
  const clicks = totalClicks(experiment);

  if (experiment.metric === "conversion_rate" && purchases === 0 && clicks > 0) {
    return {
      offerId: experiment.offerId,
      channel: experiment.channel,
      decision: "INVESTIGATE_OFFER",
      preferredAngle: null,
      reasons: ["clicks_without_purchase_across_experiment"],
      autoApply: false,
    };
  }

  if (experiment.metric === "conversion_rate" && experiment.leaderAngle && purchases > 0) {
    return {
      offerId: experiment.offerId,
      channel: experiment.channel,
      decision: "PREFER_ANGLE",
      preferredAngle: experiment.leaderAngle,
      reasons: ["conversion_leader_with_real_purchase", ...experiment.reasons],
      autoApply: false,
    };
  }

  if (experiment.metric === "ctr" && experiment.leaderAngle) {
    return {
      offerId: experiment.offerId,
      channel: experiment.channel,
      decision: "TEST_ANGLE",
      preferredAngle: experiment.leaderAngle,
      reasons: ["ctr_leader_requires_purchase_validation", ...experiment.reasons],
      autoApply: false,
    };
  }

  return {
    offerId: experiment.offerId,
    channel: experiment.channel,
    decision: "LEARN_MORE",
    preferredAngle: null,
    reasons: ["no_mature_commercial_signal"],
    autoApply: false,
  };
}

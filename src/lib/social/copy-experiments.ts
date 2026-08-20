import type { CopyV4CommercialAngle } from "@/core/ai/copy-v4";
import type { SocialCommercialTelemetrySnapshot } from "@/lib/social/commercial-telemetry";

export type SocialCopyExperimentStatus = "insufficient_data" | "learning" | "leader";
export type SocialCopyExperimentMetric = "conversion_rate" | "ctr";

export interface SocialCopyExperimentVariant {
  variantId: string;
  angle: CopyV4CommercialAngle;
  telemetry: SocialCommercialTelemetrySnapshot;
}

export interface SocialCopyExperimentEvaluation {
  experimentKey: string;
  offerId: string;
  channel: SocialCommercialTelemetrySnapshot["channel"];
  status: SocialCopyExperimentStatus;
  metric: SocialCopyExperimentMetric | null;
  leaderVariantId: string | null;
  leaderAngle: CopyV4CommercialAngle | null;
  reasons: string[];
  variants: Array<{
    variantId: string;
    angle: CopyV4CommercialAngle;
    impressions: number | null;
    clicks: number;
    purchases: number;
    ctrPct: number | null;
    conversionRatePct: number | null;
    epcBRL: number | null;
  }>;
}

export const SOCIAL_COPY_EXPERIMENT_MIN_VARIANTS = 2;
export const SOCIAL_COPY_EXPERIMENT_MIN_IMPRESSIONS_PER_VARIANT = 200;
export const SOCIAL_COPY_EXPERIMENT_MIN_CLICKS_PER_VARIANT = 20;
export const SOCIAL_COPY_EXPERIMENT_MIN_RELATIVE_LEAD = 0.1;

function assertExperimentInput(experimentKey: string, variants: readonly SocialCopyExperimentVariant[]) {
  if (!experimentKey.trim()) throw new Error("Social copy experiment requires experimentKey");
  if (variants.length < SOCIAL_COPY_EXPERIMENT_MIN_VARIANTS) {
    throw new Error("Social copy experiment requires at least two variants");
  }

  const first = variants[0];
  const angles = new Set<CopyV4CommercialAngle>();
  const variantIds = new Set<string>();

  for (const variant of variants) {
    if (!variant.variantId.trim()) throw new Error("Social copy experiment requires variantId");
    if (variant.telemetry.offerId !== first.telemetry.offerId || variant.telemetry.channel !== first.telemetry.channel) {
      throw new Error("Social copy experiment variants must share the same offer and channel");
    }
    if (variantIds.has(variant.variantId)) throw new Error(`Duplicate social copy experiment variantId: ${variant.variantId}`);
    if (angles.has(variant.angle)) throw new Error(`Duplicate social copy experiment angle: ${variant.angle}`);
    variantIds.add(variant.variantId);
    angles.add(variant.angle);
  }
}

function relativeLead(best: number, second: number) {
  if (best <= 0) return 0;
  if (second <= 0) return 1;
  return (best - second) / second;
}

/**
 * Task 8 — avaliação determinística de experimentos de copy.
 *
 * O experimento só compara ângulos da MESMA oferta e do MESMO canal para reduzir
 * confusão entre produto, canal e copy. "leader" significa líder observacional,
 * nunca significância estatística nem garantia de causalidade.
 */
export function evaluateSocialCopyExperiment(
  experimentKey: string,
  variants: readonly SocialCopyExperimentVariant[],
): SocialCopyExperimentEvaluation {
  assertExperimentInput(experimentKey, variants);

  const first = variants[0];
  const compactVariants = variants.map((variant) => ({
    variantId: variant.variantId,
    angle: variant.angle,
    impressions: variant.telemetry.impressions,
    clicks: variant.telemetry.clicks,
    purchases: variant.telemetry.purchases,
    ctrPct: variant.telemetry.ctrPct,
    conversionRatePct: variant.telemetry.conversionRatePct,
    epcBRL: variant.telemetry.epcBRL,
  }));

  if (variants.some((variant) => !variant.telemetry.published)) {
    return {
      experimentKey,
      offerId: first.telemetry.offerId,
      channel: first.telemetry.channel,
      status: "insufficient_data",
      metric: null,
      leaderVariantId: null,
      leaderAngle: null,
      reasons: ["all_variants_must_be_published"],
      variants: compactVariants,
    };
  }

  const conversionComparable = variants.every(
    (variant) => variant.telemetry.clicks >= SOCIAL_COPY_EXPERIMENT_MIN_CLICKS_PER_VARIANT
      && variant.telemetry.conversionRatePct != null,
  );

  const ctrComparable = variants.every(
    (variant) => (variant.telemetry.impressions ?? 0) >= SOCIAL_COPY_EXPERIMENT_MIN_IMPRESSIONS_PER_VARIANT
      && variant.telemetry.ctrPct != null,
  );

  const metric: SocialCopyExperimentMetric | null = conversionComparable
    ? "conversion_rate"
    : ctrComparable
      ? "ctr"
      : null;

  if (!metric) {
    return {
      experimentKey,
      offerId: first.telemetry.offerId,
      channel: first.telemetry.channel,
      status: "learning",
      metric: null,
      leaderVariantId: null,
      leaderAngle: null,
      reasons: ["minimum_exposure_not_reached"],
      variants: compactVariants,
    };
  }

  const ranked = [...variants].sort((a, b) => {
    const aValue = metric === "conversion_rate" ? (a.telemetry.conversionRatePct ?? 0) : (a.telemetry.ctrPct ?? 0);
    const bValue = metric === "conversion_rate" ? (b.telemetry.conversionRatePct ?? 0) : (b.telemetry.ctrPct ?? 0);
    if (bValue !== aValue) return bValue - aValue;
    if (b.telemetry.purchases !== a.telemetry.purchases) return b.telemetry.purchases - a.telemetry.purchases;
    if (b.telemetry.clicks !== a.telemetry.clicks) return b.telemetry.clicks - a.telemetry.clicks;
    return a.variantId.localeCompare(b.variantId);
  });

  const bestValue = metric === "conversion_rate"
    ? (ranked[0].telemetry.conversionRatePct ?? 0)
    : (ranked[0].telemetry.ctrPct ?? 0);
  const secondValue = metric === "conversion_rate"
    ? (ranked[1].telemetry.conversionRatePct ?? 0)
    : (ranked[1].telemetry.ctrPct ?? 0);

  if (bestValue === secondValue || relativeLead(bestValue, secondValue) < SOCIAL_COPY_EXPERIMENT_MIN_RELATIVE_LEAD) {
    return {
      experimentKey,
      offerId: first.telemetry.offerId,
      channel: first.telemetry.channel,
      status: "learning",
      metric,
      leaderVariantId: null,
      leaderAngle: null,
      reasons: ["no_clear_observational_lead"],
      variants: compactVariants,
    };
  }

  return {
    experimentKey,
    offerId: first.telemetry.offerId,
    channel: first.telemetry.channel,
    status: "leader",
    metric,
    leaderVariantId: ranked[0].variantId,
    leaderAngle: ranked[0].angle,
    reasons: [metric === "conversion_rate" ? "conversion_rate_observational_lead" : "ctr_observational_lead"],
    variants: compactVariants,
  };
}

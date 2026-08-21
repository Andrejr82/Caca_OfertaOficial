import { buildDeterministicFallbackPlan } from "@/core/ai/copy-v5-planner";
import { polishCopyV5Facts, polishCopyV5Plan } from "@/core/ai/copy-v5-polish";
import { renderPriceBlock } from "@/core/ai/copy-v5-renderer";
import type { CopyV5CommercialAngle, CopyV5Facts } from "@/core/ai/copy-v5-types";

export interface InstagramReelBeatV5 {
  startSecond: number;
  endSecond: number;
  purpose: "hook" | "proof_benefit" | "offer" | "action";
  text: string;
}

export interface InstagramConversionV5Plan {
  commercialAngle: CopyV5CommercialAngle;
  reelBeats: readonly InstagramReelBeatV5[];
}

/** @deprecated Compatibilidade de tipo. O conteúdo é gerado exclusivamente pela Copy V5. */
export type InstagramReelBeatV4 = InstagramReelBeatV5;
/** @deprecated Compatibilidade de tipo. O conteúdo é gerado exclusivamente pela Copy V5. */
export type InstagramConversionV4Plan = InstagramConversionV5Plan;

function compact(value: string, max = 110) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) return normalized;
  const cut = normalized.lastIndexOf(" ", max);
  return `${normalized.slice(0, cut > 30 ? cut : max).replace(/[\s,;:–—-]+$/gu, "")}…`;
}

/**
 * Plano audiovisual de conversão do Instagram derivado exclusivamente da Copy V5.
 * Stories estáticos permanecem fora deste módulo; aqui só há beats factuais para vídeo.
 */
export function buildInstagramConversionV5Plan(facts: CopyV5Facts): InstagramConversionV5Plan {
  const polishedFacts = polishCopyV5Facts(facts);
  const plan = polishCopyV5Plan(buildDeterministicFallbackPlan(polishedFacts), polishedFacts);
  const hook = compact(plan.hook, 90);
  const proofOrBenefit = plan.optionalProofAngle
    ? compact(plan.optionalProofAngle, 90)
    : plan.selectedAttributes.length > 0
      ? compact(plan.selectedAttributes.join(" • "), 90)
      : compact(plan.shortProductName, 90);
  const priceBlock = renderPriceBlock(polishedFacts);

  const reelBeats: InstagramReelBeatV5[] = [
    { startSecond: 0, endSecond: 2, purpose: "hook", text: hook },
    { startSecond: 2, endSecond: 6, purpose: "proof_benefit", text: proofOrBenefit },
    { startSecond: 6, endSecond: 10, purpose: "offer", text: priceBlock ? `💰 ${priceBlock}` : "Confira as condições atuais no anúncio." },
    { startSecond: 10, endSecond: 13, purpose: "action", text: "Confira a oferta no link do perfil." },
  ];

  return { commercialAngle: plan.commercialAngle, reelBeats };
}

/** @deprecated Use buildInstagramConversionV5Plan. Mantido apenas para compatibilidade de chamadas existentes. */
export const buildInstagramConversionV4Plan = buildInstagramConversionV5Plan;

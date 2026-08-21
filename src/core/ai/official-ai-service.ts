import {
  buildConversionCopyV4Contract,
  getMarketplaceCtaPrefix as getMarketplaceCtaPrefixV4,
  type CopyV4Facts,
} from "./copy-v4";
import {
  type CopyV5Facts,
  type CopyV5Plan,
} from "./copy-v5-types";
import { validateCopyV5Plan } from "./copy-v5-validator";
import {
  renderCopyV5ChannelCopy,
  getMarketplaceCtaPrefix as getMarketplaceCtaPrefixV5,
} from "./copy-v5-renderer";
import {
  generateOfficialAI as generateOfficialAIEngine,
  OFFICIAL_AI_PAGE_CONCURRENCY,
} from "./official-ai-service-engine";
import type { OfficialAIServiceDependencies } from "./ports";
import type {
  OfficialAIChannel,
  OfficialAICommand,
  OfficialAIContent,
  OfficialAIOffer,
  OfficialAIResult,
} from "./types";

export { OFFICIAL_AI_PAGE_CONCURRENCY };
export const getMarketplaceCtaPrefix = getMarketplaceCtaPrefixV5;

export function copyV5FactsFromOffer(offer: OfficialAIOffer): CopyV5Facts {
  const explainabilityMetrics = offer.explainability?.marketplace_metrics;
  const freeShipping = [
    offer.shippingFree,
    offer.explainability?.free_shipping,
    offer.explainability?.shipping_free,
    (offer.marketplaceMetrics as Record<string, unknown> | undefined)?.free_shipping,
    (offer.marketplaceMetrics as Record<string, unknown> | undefined)?.shipping_free,
    (offer.marketplaceMetrics as Record<string, unknown> | undefined)?.shippingFree,
  ].find((v): v is boolean => typeof v === "boolean") ?? null;

  return {
    productName: offer.productName,
    shortName: offer.shortName,
    marketplace: offer.marketplace,
    category: offer.category,
    currentPrice: offer.currentPrice,
    originalPrice: offer.originalPrice,
    evidence: {
      ...offer.explainability,
      marketplace_metrics: {
        ...(explainabilityMetrics && typeof explainabilityMetrics === "object"
          ? explainabilityMetrics as Record<string, unknown>
          : {}),
        ...(offer.marketplaceMetrics ?? {}),
      },
    },
    freeShipping,
  };
}

function normalizeLine(value: string | null) {
  return value?.trim() || null;
}

function decisionBlocksV4(facts: CopyV4Facts) {
  const contract = buildConversionCopyV4Contract(facts, "whatsapp");
  return {
    contract,
    blocks: [
      normalizeLine(contract.hook),
      normalizeLine(contract.priceBlock),
      normalizeLine(contract.couponLine),
      normalizeLine(contract.shippingLine),
      normalizeLine(contract.officialStoreLine),
      normalizeLine(contract.attributesLine),
      normalizeLine(contract.proofLine),
    ].filter((value): value is string => Boolean(value)),
  };
}

/**
 * Copy V4 canônica antes da materialização do tracked URL.
 */
export function buildCanonicalCopyV4ChannelDraft(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const { blocks } = decisionBlocksV4(facts);

  if (channel === "facebook") {
    return [...blocks, "👉 Link da oferta no primeiro comentário. 👇"].join("\n\n");
  }
  if (channel === "instagram") {
    return [...blocks, "🔎 Link da oferta na bio. 👇"].join("\n\n");
  }
  const ctaPrefix = getMarketplaceCtaPrefixV4(facts.marketplace);
  return [...blocks, ctaPrefix, "👉"].join("\n\n");
}

/**
 * Copy V5 canônica híbrida com suporte ao plano comercial aprovado.
 */
export function buildCanonicalCopyV5ChannelDraft(
  facts: CopyV5Facts,
  channel: OfficialAIChannel,
  plan?: CopyV5Plan | null
): string {
  const validatedPlan = validateCopyV5Plan(plan, facts);
  const rendered = renderCopyV5ChannelCopy(validatedPlan, facts, channel);
  return rendered.feed;
}

export function buildCanonicalCopyV5Content(
  previous: OfficialAIContent,
  offer: OfficialAIOffer,
  channels: readonly OfficialAIChannel[],
): OfficialAIContent {
  const facts = copyV5FactsFromOffer(offer);
  const planCandidate: Partial<CopyV5Plan> = {
    shortProductName: previous.shortName,
    hook: previous.shortCopy,
    selectedAttributes: previous.highlights,
  };
  const plan = validateCopyV5Plan(planCandidate, facts);

  return {
    ...previous,
    shortCopy: plan.hook,
    shortName: plan.shortProductName,
    longCopy: `${plan.hook} ${plan.selectedAttributes.join(" • ")}`.trim(),
    hashtags: [],
    callToAction: "Ver oferta",
    highlights: plan.selectedAttributes,
    explanation: "Copy V5 híbrida: LLM commercial planner + factual validator + deterministic renderer.",
    channelCopies: {
      ...previous.channelCopies,
      ...Object.fromEntries(channels.map((channel) => [
        channel,
        buildCanonicalCopyV5ChannelDraft(facts, channel, plan),
      ])),
    },
  };
}

export async function generateOfficialAI(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies,
): Promise<OfficialAIResult> {
  let latestContent: OfficialAIContent | null = null;

  const wrappedDependencies: OfficialAIServiceDependencies = {
    ...dependencies,
    content: {
      persistDrafts: async (input) => {
        if (input.command.metadata?.copyV2 === true) {
          latestContent = input.content;
          return dependencies.content.persistDrafts(input);
        }
        const content = buildCanonicalCopyV5Content(input.content, input.offer, input.channels);
        latestContent = content;
        return dependencies.content.persistDrafts({ ...input, content });
      },
    },
  };

  const result = await generateOfficialAIEngine(command, wrappedDependencies);
  if (latestContent && result.status !== "rejected" && command.offerId !== "ALL_PENDING" && !command.batch) {
    return { ...result, content: latestContent };
  }
  return result;
}
